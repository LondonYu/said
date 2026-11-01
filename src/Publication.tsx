import { useEffect, useRef, useState } from 'react';
import type { GuestbookMessage } from './history';
import type { Labels } from './i18n';
import {
  type ConfirmedPublication,
  type PreparedPublication,
  type PublicationCheck,
  type PublicationReceipt,
  type PublicationStatus,
  type Publisher,
  type SignedPublication,
} from './publisher';
import type { WalletSigningSession } from './wallet';
import { devnetExplorerUrl } from './explorer';

export type PublicationPhase =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'signing'
  | 'submitting'
  | 'confirming'
  | 'pending'
  | 'unknown'
  | 'confirmed'
  | 'failed';

export type PublicationErrorKind =
  | 'connect'
  | 'signing'
  | 'prepare'
  | 'sign'
  | 'submit'
  | 'confirm'
  | 'readback'
  | 'recovery';

export type PublicationError = {
  readonly kind: PublicationErrorKind;
  readonly message: string;
};

type PublicationReadback = {
  readonly phase: 'idle' | 'loading' | 'ready' | 'unavailable';
  readonly message: GuestbookMessage | null;
  readonly reason: string | null;
};

type RecoveryEntry = {
  readonly receipt: PublicationReceipt;
  readonly storedStatus: PublicationStatus;
  readonly check: PublicationCheck;
};

type RecoveryState = {
  readonly phase: 'idle' | 'loading' | 'ready' | 'error';
  readonly entries: readonly RecoveryEntry[];
  readonly error: string | null;
};

export type PublicationFlowState = {
  readonly phase: PublicationPhase;
  readonly prepared: PreparedPublication | null;
  readonly published: { readonly author: string; readonly text: string } | null;
  readonly signature: string | null;
  readonly receipt: PublicationReceipt | null;
  readonly check: PublicationCheck | null;
  readonly error: PublicationError | null;
  readonly readback: PublicationReadback;
  readonly recovery: RecoveryState;
  readonly querying: boolean;
};

export type PublicationFlow = {
  readonly state: PublicationFlowState;
  readonly locked: boolean;
  prepare(text: string): void;
  signAndSend(): void;
  queryCurrent(): void;
  retryReadback(): void;
  recoverPending(): void;
};

const EMPTY_READBACK: PublicationReadback = { phase: 'idle', message: null, reason: null };
const EMPTY_RECOVERY: RecoveryState = { phase: 'idle', entries: [], error: null };

function initialState(): PublicationFlowState {
  return {
    phase: 'idle',
    prepared: null,
    published: null,
    signature: null,
    receipt: null,
    check: null,
    error: null,
    readback: EMPTY_READBACK,
    recovery: EMPTY_RECOVERY,
    querying: false,
  };
}

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return '未知错误，请重试。';
}

function settledReceipt(check: PublicationCheck): PublicationReceipt {
  return check.persistence.receipt;
}

export function usePublicationFlow({
  publisher,
  getSession,
  draft,
  author,
  connected,
  signingReason,
  onConfirmed,
}: {
  publisher: Publisher;
  getSession: () => WalletSigningSession | null;
  draft: string;
  author: string | null;
  connected: boolean;
  signingReason: string | null;
  onConfirmed: (
    message: GuestbookMessage | null,
    publication: { readonly author: string; readonly text: string },
  ) => void;
}): PublicationFlow {
  const [state, setState] = useState<PublicationFlowState>(initialState);
  const stateRef = useRef(state);
  const optionsRef = useRef({ getSession, connected, signingReason, onConfirmed });
  optionsRef.current = { getSession, connected, signingReason, onConfirmed };

  const disposedRef = useRef(false);
  const busyRef = useRef(false);
  const queryingRef = useRef(false);
  const sequenceRef = useRef(0);
  const operationRef = useRef<AbortController | null>(null);
  const queryRef = useRef<AbortController | null>(null);
  const readbackRef = useRef<AbortController | null>(null);
  const recoveryRef = useRef<AbortController | null>(null);
  const previousContextRef = useRef({ draft, author });

  function apply(patch: Partial<PublicationFlowState>): void {
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    if (!disposedRef.current) setState(next);
  }

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      operationRef.current?.abort();
      queryRef.current?.abort();
      readbackRef.current?.abort();
      recoveryRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const previous = previousContextRef.current;
    previousContextRef.current = { draft, author };
    if (previous.draft === draft && previous.author === author) return;

    const phase = stateRef.current.phase;
    if (phase === 'preparing' || phase === 'signing') {
      sequenceRef.current += 1;
      operationRef.current?.abort();
      operationRef.current = null;
      busyRef.current = false;
      apply({
        phase: 'failed',
        prepared: null,
        published: null,
        error: { kind: 'prepare', message: '正文或账户已变化，旧准备已失效。' },
      });
      return;
    }
    if (stateRef.current.prepared !== null || phase === 'failed') {
      apply({ phase: 'idle', prepared: null, published: null, error: null });
    }
  }, [draft, author]);

  async function finishReadback(
    receipt: PublicationReceipt,
    signal: AbortSignal,
    publication: { readonly author: string; readonly text: string },
  ): Promise<void> {
    apply({ readback: { phase: 'loading', message: null, reason: null } });
    let result: Awaited<ReturnType<Publisher['readBack']>>;
    try {
      result = await publisher.readBack(receipt, signal);
    } catch (error) {
      if (disposedRef.current || signal.aborted) return;
      apply({
        readback: { phase: 'unavailable', message: null, reason: toMessage(error) },
        error: { kind: 'readback', message: toMessage(error) },
      });
      optionsRef.current.onConfirmed(null, publication);
      return;
    }
    if (disposedRef.current || signal.aborted) return;
    if (result.kind === 'ready') {
      apply({ readback: { phase: 'ready', message: result.message, reason: null }, error: null });
      optionsRef.current.onConfirmed(result.message, publication);
      return;
    }
    apply({
      readback: { phase: 'unavailable', message: null, reason: result.reason },
      error: { kind: 'readback', message: result.reason },
    });
    optionsRef.current.onConfirmed(null, publication);
  }

  function publicationOf(receipt: PublicationReceipt): { author: string; text: string } {
    return stateRef.current.published ?? { author: receipt.author, text: '' };
  }

  async function settlePublication(
    receipt: PublicationReceipt,
    signal: AbortSignal,
  ): Promise<void> {
    let checked: ConfirmedPublication;
    try {
      checked = await publisher.confirm(receipt, signal);
    } catch (error) {
      if (disposedRef.current || signal.aborted) return;
      apply({
        phase: 'unknown',
        receipt,
        error: { kind: 'confirm', message: toMessage(error) },
      });
      return;
    }
    if (disposedRef.current || signal.aborted) return;

    const stored = settledReceipt(checked);
    apply({ receipt: stored, check: checked });
    if (checked.kind === 'confirmed' || checked.kind === 'finalized') {
      apply({ phase: 'confirmed', prepared: null, error: null });
      await finishReadback(stored, signal, publicationOf(stored));
      return;
    }
    if (checked.kind === 'failed') {
      apply({
        phase: 'failed',
        prepared: null,
        error: { kind: 'confirm', message: checked.reason ?? '链上交易失败。' },
      });
      return;
    }
    if (checked.kind === 'expired') {
      apply({
        phase: 'unknown',
        prepared: null,
        error: { kind: 'confirm', message: checked.reason ?? '未查到交易，结果待查询。' },
      });
      return;
    }
    apply({ phase: 'pending', error: null });
  }


  function prepare(text: string): void {
    if (busyRef.current || queryingRef.current) return;
    const phase = stateRef.current.phase;
    if (phase === 'preparing' || phase === 'signing' || phase === 'submitting' ||
      phase === 'confirming' || phase === 'pending' || phase === 'unknown') return;

    const session = optionsRef.current.getSession();
    if (session === null) {
      const connectedNow = optionsRef.current.connected;
      apply({
        phase: 'failed',
        prepared: null,
        published: null,
        error: {
          kind: connectedNow ? 'signing' : 'connect',
          message: connectedNow
            ? optionsRef.current.signingReason ?? '当前钱包没有可用的签名会话。'
            : '请先连接钱包，再准备发布。',
        },
      });
      return;
    }

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    operationRef.current?.abort();
    const abort = new AbortController();
    operationRef.current = abort;
    busyRef.current = true;
    apply({
      phase: 'preparing',
      prepared: null,
      published: null,
      signature: null,
      receipt: null,
      check: null,
      error: null,
      readback: EMPTY_READBACK,
    });

    void (async () => {
      try {
        const prepared = await publisher.prepare({ session, text }, abort.signal);
        if (disposedRef.current || sequence !== sequenceRef.current) return;
        apply({ phase: 'ready', prepared, error: null });
      } catch (error) {
        if (disposedRef.current || sequence !== sequenceRef.current) return;
        apply({
          phase: 'failed',
          prepared: null,
          error: { kind: 'prepare', message: toMessage(error) },
        });
      } finally {
        if (sequence === sequenceRef.current) {
          busyRef.current = false;
          if (operationRef.current === abort) operationRef.current = null;
        }
      }
    })();
  }

  function signAndSend(): void {
    const current = stateRef.current;
    if (busyRef.current || current.phase !== 'ready' || current.prepared === null) return;
    const session = optionsRef.current.getSession();
    if (session === null) {
      apply({
        phase: 'failed',
        prepared: current.prepared,
        error: { kind: 'signing', message: '签名会话已不可用，请重新连接钱包。' },
      });
      return;
    }

    const prepared = current.prepared;
    const publication = { author: prepared.author, text: prepared.text };
    operationRef.current?.abort();
    const abort = new AbortController();
    operationRef.current = abort;
    busyRef.current = true;
    apply({
      phase: 'signing',
      prepared,
      published: publication,
      signature: null,
      receipt: null,
      check: null,
      error: null,
      readback: EMPTY_READBACK,
    });

    void (async () => {
      let signed: SignedPublication | null = null;
      try {
        signed = await publisher.sign(prepared, session, abort.signal);
        if (disposedRef.current || abort.signal.aborted) return;
        apply({ phase: 'submitting', prepared: null, signature: signed.signature });
        const submitted = await publisher.submit(prepared, signed, session, abort.signal);
        if (disposedRef.current || abort.signal.aborted) return;
        apply({ receipt: submitted.receipt, signature: submitted.signature });
        if (submitted.kind === 'uncertain') {
          apply({
            phase: 'unknown',
            prepared: null,
            error: {
              kind: 'submit',
              message: '发送结果不确定，只能查询原签名；不会自动重签或重发。',
            },
          });
          return;
        }
        if (submitted.kind === 'preflight_rejected') {
          apply({
            phase: 'failed',
            prepared: null,
            error: { kind: 'submit', message: '发送前检查拒绝，交易未广播。' },
          });
          return;
        }
        apply({ phase: 'confirming', prepared: null });
        await settlePublication(submitted.receipt, abort.signal);
      } catch (error) {
        // 正文/账户变化或卸载会先中止本次等待；旧请求不得覆盖新状态。
        if (disposedRef.current || abort.signal.aborted) return;
        if (signed === null) {
          apply({
            phase: 'failed',
            prepared,
            error: { kind: 'sign', message: toMessage(error) },
          });
        } else {
          // submit 抛错发生在派发成功路径之外；保留签名，但不把它包装成可重发。
          apply({
            phase: 'failed',
            prepared: null,
            signature: signed.signature,
            error: { kind: 'submit', message: toMessage(error) },
          });
        }
      } finally {
        if (operationRef.current === abort) {
          busyRef.current = false;
          operationRef.current = null;
        }
      }
    })();
  }


  function queryCurrent(): void {
    const current = stateRef.current;
    if (busyRef.current || queryingRef.current || current.receipt === null) return;
    queryingRef.current = true;
    const abort = new AbortController();
    queryRef.current = abort;
    apply({ querying: true, error: null });

    void (async () => {
      try {
        const checked = await publisher.check(current.receipt!, abort.signal);
        if (disposedRef.current || abort.signal.aborted) return;
        const stored = settledReceipt(checked);
        apply({ receipt: stored, check: checked });
        if (checked.kind === 'confirmed' || checked.kind === 'finalized') {
          apply({ phase: 'confirmed', prepared: null, error: null });
          await finishReadback(stored, abort.signal, publicationOf(stored));
        } else if (checked.kind === 'failed') {
          apply({
            phase: 'failed',
            prepared: null,
            error: { kind: 'confirm', message: checked.reason ?? '链上交易失败。' },
          });
        } else if (checked.kind === 'expired') {
          apply({
            phase: 'unknown',
            prepared: null,
            error: { kind: 'confirm', message: checked.reason ?? '未查到交易，结果待查询。' },
          });
        } else {
          apply({ phase: 'pending', error: null });
        }
      } catch (error) {
        if (disposedRef.current || abort.signal.aborted) return;
        apply({
          phase: 'unknown',
          error: { kind: 'confirm', message: toMessage(error) },
        });
      } finally {
        if (queryRef.current === abort) queryRef.current = null;
        queryingRef.current = false;
        apply({ querying: false });
      }
    })();
  }

  function retryReadback(): void {
    const current = stateRef.current;
    if (current.receipt === null || current.readback.phase === 'loading') return;
    readbackRef.current?.abort();
    const abort = new AbortController();
    readbackRef.current = abort;
    void finishReadback(current.receipt, abort.signal, publicationOf(current.receipt));
  }

  function recoverPending(): void {
    if (busyRef.current || stateRef.current.recovery.phase === 'loading') return;
    recoveryRef.current?.abort();
    const abort = new AbortController();
    recoveryRef.current = abort;
    apply({ recovery: { phase: 'loading', entries: [], error: null } });

    void (async () => {
      try {
        const entries = await publisher.recover(abort.signal);
        if (disposedRef.current || abort.signal.aborted) return;
        apply({ recovery: { phase: 'ready', entries, error: null } });
      } catch (error) {
        if (disposedRef.current || abort.signal.aborted) return;
        apply({ recovery: { phase: 'error', entries: [], error: toMessage(error) } });
      } finally {
        if (recoveryRef.current === abort) recoveryRef.current = null;
      }
    })();
  }

  return {
    state,
    locked: state.phase === 'preparing' || state.phase === 'signing' ||
      state.phase === 'submitting' || state.phase === 'confirming',
    prepare,
    signAndSend,
    queryCurrent,
    retryReadback,
    recoverPending,
  };
}


function formatSol(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction === '' ? whole.toString() : `${whole}.${fraction}`;
}

function phaseLabel(phase: PublicationPhase, labels: Labels): string {
  switch (phase) {
    case 'preparing': return labels.publishPreparing;
    case 'ready': return labels.publishReady;
    case 'signing': return labels.publishSigning;
    case 'submitting': return labels.publishSubmitting;
    case 'confirming': return labels.publishConfirming;
    case 'pending': return labels.publishPending;
    case 'unknown': return labels.publishUnknown;
    case 'confirmed': return labels.publishConfirmed;
    case 'failed': return labels.publishFailed;
    default: return labels.publishIdle;
  }
}

function errorHeading(error: PublicationError, labels: Labels): string {
  switch (error.kind) {
    case 'connect': return labels.publishConnectFirst;
    case 'signing': return labels.publishNoSession;
    case 'sign': return labels.publishSignFailed;
    case 'submit': return labels.publishFailed;
    case 'readback': return labels.publishReadbackUnavailable;
    case 'recovery': return labels.publishRecoveryError;
    default: return labels.publishPrepareFailed;
  }
}

export function PublicationPanel({
  labels,
  flow,
  draft,
  draftValid,
  connected,
  signingAvailable,
  signingReason,
}: {
  labels: Labels;
  flow: PublicationFlow;
  draft: string;
  draftValid: boolean;
  connected: boolean;
  signingAvailable: boolean;
  signingReason: string | null;
}) {
  const { state } = flow;
  const prepared = state.prepared;
  const canPrepare =
    !flow.locked &&
    draftValid &&
    connected &&
    signingAvailable &&
    (state.phase === 'idle' || state.phase === 'failed' || state.phase === 'confirmed');
  const canQuery =
    state.receipt !== null &&
    !flow.locked &&
    !state.querying &&
    (state.phase === 'pending' || state.phase === 'unknown' ||
      state.phase === 'confirmed' || state.phase === 'failed');
  const canRecover = !flow.locked && state.recovery.phase !== 'loading';

  return (
    <section className="publication-panel" aria-labelledby="publication-heading">
      <h3 id="publication-heading">{labels.publishSection}</h3>
      <p className="publish-status" role="status" aria-live="polite">
        {phaseLabel(state.phase, labels)}
      </p>

      {connected && !signingAvailable && (
        <p className="hint">
          {labels.publishNoSession}
          {signingReason !== null && signingReason.trim() !== '' ? ` ${signingReason}` : ''}
        </p>
      )}
      {!connected && state.phase === 'idle' && (
        <p className="hint">{labels.publishConnectFirst}</p>
      )}

      {prepared !== null && (
        <div className="publish-summary">
          <p className="section-label">{labels.publishSummary}</p>
          <dl className="tx-facts">
            <div><dt>{labels.publishNetwork}</dt><dd>Devnet</dd></div>
            <div><dt>{labels.publishFeePayer}</dt><dd><code>{prepared.author}</code></dd></div>
            <div><dt>{labels.publishBody}</dt><dd className="tx-body">{prepared.text}</dd></div>
            <div><dt>{labels.publishFee}</dt><dd>{formatSol(prepared.feeLamports)} SOL</dd></div>
          </dl>
        </div>
      )}

      {state.phase === 'ready' && (
        <>
          <p className="publish-warning">{labels.publishIrreversible}</p>
          <div className="preview-actions">
            <button type="button" className="button" onClick={flow.signAndSend}>
              {labels.publishSignAndSend}
            </button>
          </div>
          <p className="hint">{labels.publishPrepareHint}</p>
        </>
      )}

      {(state.phase === 'idle' || state.phase === 'failed' ||
        (state.phase === 'confirmed' && draftValid)) && (
        <>
          <div className="preview-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => flow.prepare(draft)}
              disabled={!canPrepare}
            >
              {state.phase === 'failed' ? labels.publishReprepare : labels.publishPrepare}
            </button>
          </div>
          <p className="hint">{labels.publishPrepareHint}</p>
        </>
      )}

      {state.signature !== null && (
        <div className="publish-signature">
          <p className="section-label">{labels.publishSignature}</p>
          <code>{state.signature}</code>
          <a
            className="button secondary"
            href={devnetExplorerUrl(state.signature)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {labels.publishOpenExplorer}
          </a>
        </div>
      )}

      {(state.phase === 'pending' || state.phase === 'unknown') && (
        <>
          <p className="notice">{labels.publishNoReplay}</p>
          {state.check?.reason !== null && state.check?.reason !== undefined && (
            <p className="hint">{state.check.reason}</p>
          )}
          <div className="preview-actions">
            <button
              type="button"
              className="button secondary"
              onClick={flow.queryCurrent}
              disabled={!canQuery}
            >
              {state.querying ? labels.publishQuerying : labels.publishQuerySignature}
            </button>
          </div>
        </>
      )}

      {state.phase === 'confirmed' && (
        <>
          <div className="publish-readback" aria-live="polite">
            <p className="section-label">{labels.publishReadback}</p>
            {state.readback.phase === 'loading' && <p className="hint">{labels.publishReadbackLoading}</p>}
            {state.readback.phase === 'ready' && (
              <>
                <p className="hint">{labels.publishReadbackReady}</p>
                {state.readback.message !== null && (
                  <p className="preview-post-text">{state.readback.message.text}</p>
                )}
              </>
            )}
            {state.readback.phase === 'unavailable' && (
              <>
                <p className="notice">{labels.publishReadbackUnavailable}</p>
                {state.readback.reason !== null && <p className="hint">{state.readback.reason}</p>}
                <div className="preview-actions">
                  <button type="button" className="button secondary" onClick={flow.retryReadback}>
                    {labels.publishRetryReadback}
                  </button>
                </div>
              </>
            )}
          </div>
          {canQuery && (
            <div className="preview-actions">
              <button type="button" className="button secondary" onClick={flow.queryCurrent}>
                {state.querying ? labels.publishQuerying : labels.publishQuerySignature}
              </button>
            </div>
          )}
        </>
      )}

      {state.error !== null && (
        <div className="error" role="alert">
          <p>{errorHeading(state.error, labels)}</p>
          <details>
            <summary>{labels.details}</summary>
            <p className="error-detail">{state.error.message}</p>
          </details>
        </div>
      )}

      <div className="publish-recovery">
        <button
          type="button"
          className="button secondary"
          onClick={flow.recoverPending}
          disabled={!canRecover}
        >
          {state.recovery.phase === 'loading' ? labels.publishRecovering : labels.publishRecovery}
        </button>
        <p className="hint">{labels.publishRecoveryNote}</p>
        {state.recovery.phase === 'ready' && state.recovery.entries.length === 0 && (
          <p className="hint">{labels.publishRecoveryEmpty}</p>
        )}
        {state.recovery.phase === 'error' && state.recovery.error !== null && (
          <div className="error" role="alert">
            <p>{labels.publishRecoveryError}</p>
            <details><summary>{labels.details}</summary><p className="error-detail">{state.recovery.error}</p></details>
          </div>
        )}
        {state.recovery.entries.map((entry) => (
          <article className="publish-recovery-entry" key={entry.receipt.signature}>
            <p>
              <span className="section-label">{labels.publishStoredStatus}</span>{' '}
              <code>{entry.storedStatus}</code>
            </p>
            <code className="publish-recovery-signature">{entry.receipt.signature}</code>
            <p className="hint">
              {labels.publishCheckedStatus}: {entry.check.kind}
              {entry.check.reason !== null ? ` · ${entry.check.reason}` : ''}
            </p>
            <a
              className="button secondary"
              href={devnetExplorerUrl(entry.receipt.signature)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {labels.publishOpenExplorer}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

