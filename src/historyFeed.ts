import { useEffect, useRef, useState } from 'react';
import { MAX_RETRY_SIGNATURES } from './history';
import type { createHistoryClient, GuestbookMessage, UnavailableSignature } from './history';

export type HistoryClient = ReturnType<typeof createHistoryClient>;
export type HistoryScope = { readonly kind: 'board' } | { readonly kind: 'author'; readonly author: string };
export type FeedBusy = 'initial' | 'refresh' | 'more' | 'retry' | null;
export type FeedActionError = { readonly operation: 'refresh' | 'more' | 'retry'; readonly message: string };

export type HistoryFeedState = {
  readonly phase: 'disabled' | 'loading' | 'ready' | 'error';
  readonly messages: readonly GuestbookMessage[];
  readonly unavailable: readonly UnavailableSignature[];
  readonly nextCursor: string | null;
  readonly exhausted: boolean;
  readonly scanned: number | null;
  readonly busy: FeedBusy;
  readonly error: string | null;
  readonly actionError: FeedActionError | null;
  readonly loopStopped: boolean;
  readonly hasMore: boolean;
  refresh(): void;
  loadMore(): void;
  retryUnavailable(): void;
};

type InternalState = Omit<HistoryFeedState, 'hasMore' | 'refresh' | 'loadMore' | 'retryUnavailable'> & {
  readonly key: string;
};

function scopeKey(scope: HistoryScope): string {
  return scope.kind === 'board' ? 'board' : `author:${scope.author}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return '操作失败，请重试。';
}

function initialState(key: string, enabled: boolean): InternalState {
  return {
    key,
    phase: enabled ? 'loading' : 'disabled',
    messages: [],
    unavailable: [],
    nextCursor: null,
    exhausted: false,
    scanned: null,
    busy: enabled ? 'initial' : null,
    error: null,
    actionError: null,
    loopStopped: false,
  };
}

/** 仅在签名不同时追加，保持先到记录的页面顺序。 */
function mergeMessages(
  current: readonly GuestbookMessage[],
  incoming: readonly GuestbookMessage[],
): GuestbookMessage[] {
  const seen = new Set(current.map((item) => item.signature));
  const next = [...current];
  for (const message of incoming) {
    if (seen.has(message.signature)) continue;
    seen.add(message.signature);
    next.push(message);
  }
  return next;
}

/** 不可得队列按签名去重，后到的原因覆盖旧原因，但顺序稳定。 */
function mergeUnavailable(
  current: readonly UnavailableSignature[],
  incoming: readonly UnavailableSignature[],
): UnavailableSignature[] {
  const next = [...current];
  const index = new Map(next.map((item, position) => [item.signature, position]));
  for (const item of incoming) {
    const position = index.get(item.signature);
    if (position === undefined) {
      index.set(item.signature, next.length);
      next.push(item);
    } else {
      next[position] = item;
    }
  }
  return next;
}

/**
 * 按 slot 从新到旧稳定合并分页/恢复记录；已显示的同 slot 条目保持原相对顺序，
 * 新页内同 slot 条目保持 RPC 返回顺序，不按正文或 blockTime 重排。
 */
function mergeBySlot(
  current: readonly GuestbookMessage[],
  incoming: readonly GuestbookMessage[],
): GuestbookMessage[] {
  const seen = new Set(current.map((item) => item.signature));
  const additions: GuestbookMessage[] = [];
  for (const message of incoming) {
    if (seen.has(message.signature)) continue;
    seen.add(message.signature);
    additions.push(message);
  }
  additions.sort((left, right) => (left.slot === right.slot ? 0 : left.slot > right.slot ? -1 : 1));
  const next = [...current];
  for (const message of additions) {
    const position = next.findIndex((item) => item.slot < message.slot);
    if (position === -1) next.push(message);
    else next.splice(position, 0, message);
  }
  return next;
}

/** 已验证消息统一核销对应不可得签名；只保留真正尚未解决的项。 */
function reconcileUnavailable(
  queue: readonly UnavailableSignature[],
  messages: readonly GuestbookMessage[],
  incoming: readonly UnavailableSignature[],
): UnavailableSignature[] {
  const verified = new Set(messages.map((item) => item.signature));
  const retained = queue.filter((item) => !verified.has(item.signature));
  const unresolved = incoming.filter((item) => !verified.has(item.signature));
  return mergeUnavailable(retained, unresolved);
}

function uniqueSignatures(items: readonly UnavailableSignature[]): string[] {
  const seen = new Set<string>();
  const signatures: string[] = [];
  for (const item of items) {
    if (seen.has(item.signature)) continue;
    seen.add(item.signature);
    signatures.push(item.signature);
  }
  return signatures;
}

export function useHistoryFeed({
  client,
  scope,
  enabled = true,
}: {
  client: HistoryClient;
  scope: HistoryScope;
  enabled?: boolean;
}): HistoryFeedState {
  const requestedKey = scopeKey(scope);
  const activeKey = enabled ? requestedKey : 'disabled';
  const [state, setState] = useState<InternalState>(() => initialState(activeKey, enabled));
  const stateRef = useRef(state);
  const keyRef = useRef(activeKey);
  const generationRef = useRef(0);
  const lockRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const seenCursorsRef = useRef(new Set<string>());

  // 状态归属按 key 派生：范围变化的同一帧就不再暴露旧作者内容。
  stateRef.current = state;
  if (keyRef.current !== activeKey) {
    keyRef.current = activeKey;
    generationRef.current += 1;
    lockRef.current = false;
    seenCursorsRef.current = new Set();
  }
  const visible = state.key === activeKey ? state : initialState(activeKey, enabled);

  useEffect(() => {
    const key = activeKey;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const abort = new AbortController();
    abortRef.current?.abort();
    abortRef.current = abort;
    seenCursorsRef.current = new Set();
    lockRef.current = enabled;

    if (!enabled) {
      setState(initialState(key, false));
      return () => {
        abort.abort();
        if (abortRef.current === abort) abortRef.current = null;
      };
    }

    setState(initialState(key, true));
    const isCurrent = () => keyRef.current === key && generationRef.current === generation;
    let finished = false;
    const release = () => {
      if (!isCurrent()) return;
      if (abortRef.current === abort) abortRef.current = null;
      lockRef.current = false;
    };

    void (async () => {
      try {
        const result = await client.readPage(scope, null, abort.signal);
        if (!isCurrent() || abort.signal.aborted) return;
        seenCursorsRef.current = new Set(result.nextCursor === null ? [] : [result.nextCursor]);
        setState({
          ...initialState(key, true),
          phase: 'ready',
          messages: mergeMessages([], result.messages),
          unavailable: mergeUnavailable([], result.unavailable),
          nextCursor: result.nextCursor,
          exhausted: result.sourceExhausted,
          scanned: result.scanned,
          busy: null,
        });
      } catch (error) {
        if (!isCurrent() || abort.signal.aborted) return;
        setState({ ...initialState(key, true), phase: 'error', error: errorMessage(error), busy: null });
      } finally {
        if (!finished) {
          finished = true;
          release();
        }
      }
    })();

    return () => {
      // effect 只负责本 hook 当前拥有的 controller：初次读取或用户最新手动操作。
      // cleanup 先于新 effect 执行，因此不会误取消新范围/新挂载的请求。
      const active = abortRef.current;
      if (active !== null) {
        abortRef.current = null;
        active.abort();
      }
      if (generationRef.current === generation) generationRef.current += 1;
      lockRef.current = false;
    };
    // scope 的内容由 activeKey 唯一决定；语言/主题变化不进入依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, activeKey, enabled]);

  function begin(operation: Exclude<FeedBusy, 'initial' | null>): {
    key: string;
    generation: number;
    abort: AbortController;
  } | null {
    if (!enabled || lockRef.current) return null;
    const current = stateRef.current;
    if (current.key !== activeKey) return null;
    if (current.phase !== 'ready' && !(operation === 'refresh' && current.phase === 'error')) return null;
    const key = activeKey;
    const generation = generationRef.current;
    const abort = new AbortController();
    abortRef.current?.abort();
    abortRef.current = abort;
    lockRef.current = true;
    setState((previous) => (
      previous.key === key ? { ...previous, busy: operation, actionError: null } : previous
    ));
    return { key, generation, abort };
  }

  function isCurrent(key: string, generation: number, abort: AbortController): boolean {
    return keyRef.current === key && generationRef.current === generation && !abort.signal.aborted;
  }

  function finish(
    key: string,
    generation: number,
    abort: AbortController,
    update: (previous: InternalState) => InternalState,
  ): void {
    if (!isCurrent(key, generation, abort)) return;
    setState((previous) => (previous.key === key ? update(previous) : previous));
    if (abortRef.current === abort) abortRef.current = null;
    lockRef.current = false;
  }


  function refresh(): void {
    const context = begin('refresh');
    if (context === null) return;
    const { key, generation, abort } = context;

    void (async () => {
      try {
        const result = await client.readPage(scope, null, abort.signal);
        if (!isCurrent(key, generation, abort)) return;
        seenCursorsRef.current = new Set(result.nextCursor === null ? [] : [result.nextCursor]);
        finish(key, generation, abort, (previous) => {
          const returned = mergeMessages([], result.messages);
          return {
            ...previous,
            phase: 'ready',
            messages: returned,
            unavailable: reconcileUnavailable(previous.unavailable, returned, result.unavailable),
            nextCursor: result.nextCursor,
            exhausted: result.sourceExhausted,
            scanned: result.scanned,
            busy: null,
            error: null,
            actionError: null,
            loopStopped: false,
          };
        });
      } catch (error) {
        finish(key, generation, abort, (previous) => (
          previous.phase === 'error'
            ? { ...previous, busy: null, error: errorMessage(error) }
            : { ...previous, busy: null, actionError: { operation: 'refresh', message: errorMessage(error) } }
        ));
      }
    })();
  }

  function loadMore(): void {
    const current = stateRef.current;
    if (current.nextCursor === null || current.exhausted || current.loopStopped) return;
    const before = current.nextCursor;
    const context = begin('more');
    if (context === null) return;
    const { key, generation, abort } = context;

    void (async () => {
      try {
        const result = await client.readPage(scope, before, abort.signal);
        if (!isCurrent(key, generation, abort)) return;
        const looped = result.nextCursor !== null && seenCursorsRef.current.has(result.nextCursor);
        if (result.nextCursor !== null && !looped) seenCursorsRef.current.add(result.nextCursor);
        finish(key, generation, abort, (previous) => {
          const messages = mergeBySlot(previous.messages, result.messages);
          return {
            ...previous,
            phase: 'ready',
            messages,
            unavailable: reconcileUnavailable(previous.unavailable, messages, result.unavailable),
            nextCursor: result.nextCursor,
            exhausted: result.sourceExhausted,
            // 跨页累计本次 feed 已扫描候选，避免末页为空时把“已扫描”显示成 0。
            scanned: previous.scanned === null ? result.scanned : previous.scanned + result.scanned,
            busy: null,
            error: null,
            actionError: null,
            loopStopped: looped,
          };
        });
      } catch (error) {
        finish(key, generation, abort, (previous) => ({
          ...previous,
          busy: null,
          actionError: { operation: 'more', message: errorMessage(error) },
        }));
      }
    })();
  }

  function retryUnavailable(): void {
    const current = stateRef.current;
    const batch = uniqueSignatures(current.unavailable).slice(0, MAX_RETRY_SIGNATURES);
    if (batch.length === 0) return;
    const context = begin('retry');
    if (context === null) return;
    const { key, generation, abort } = context;

    void (async () => {
      try {
        const result = await client.retrySignatures(batch, scope, abort.signal);
        if (!isCurrent(key, generation, abort)) return;
        finish(key, generation, abort, (previous) => {
          const batchSet = new Set(batch);
          const remaining = previous.unavailable.filter((item) => !batchSet.has(item.signature));
          const messages = mergeBySlot(previous.messages, result.messages);
          return {
            ...previous,
            messages,
            unavailable: reconcileUnavailable(remaining, messages, result.unavailable),
            busy: null,
            actionError: null,
            // 重试结果不是分页结果，绝不覆盖 nextCursor / exhausted。
          };
        });
      } catch (error) {
        finish(key, generation, abort, (previous) => ({
          ...previous,
          busy: null,
          actionError: { operation: 'retry', message: errorMessage(error) },
        }));
      }
    })();
  }

  return {
    ...visible,
    hasMore: !visible.exhausted && visible.nextCursor !== null && !visible.loopStopped,
    refresh,
    loadMore,
    retryUnavailable,
  };
}
