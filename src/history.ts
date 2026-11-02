import { createSolanaRpc, getBase58Encoder, isAddress } from '@solana/kit';
import type { Address } from '@solana/kit';
import {
  LIGHTHOUSE_PROGRAM_ADDRESS,
  MARKER_ADDRESS,
  MEMO_PROGRAM_ADDRESS,
  PROTOCOL_APP,
  PROTOCOL_BOARD,
  PROTOCOL_VERSION,
  SYSTEM_PROGRAM_ADDRESS,
  validateMessageText,
} from './message';
import { SOLANA_NETWORK_CONFIG } from './network';

export const COMPUTE_BUDGET_PROGRAM_ADDRESS = 'ComputeBudget111111111111111111111111111111' as Address;

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 20;
export const MAX_RETRY_SIGNATURES = 20;
export const MAX_TRANSACTION_CONCURRENCY = 2;
export const RPC_TIMEOUT_MS = 10_000;
export const OPERATION_TIMEOUT_MS = 30_000;

type PendingRpcRequest<TResponse> = {
  send(options?: Readonly<{ abortSignal?: AbortSignal }>): Promise<TResponse>;
};

export type SignatureRow = Readonly<{
  signature: string;
  err: unknown;
}>;

export type HistoryRpc = {
  getGenesisHash(): PendingRpcRequest<string>;
  getSignaturesForAddress(
    address: Address,
    config?: Readonly<{
      limit?: number;
      before?: string;
      commitment?: 'confirmed' | 'finalized';
    }>,
  ): PendingRpcRequest<readonly unknown[]>;
  getTransaction(
    signature: string,
    config: Readonly<{
      encoding: 'json';
      commitment: 'confirmed' | 'finalized';
      maxSupportedTransactionVersion: 0;
    }>,
  ): PendingRpcRequest<unknown>;
};

export type GuestbookMessage = {
  readonly signature: string;
  readonly author: string;
  readonly text: string;
  readonly slot: bigint;
  readonly blockTime: number | null;
  readonly feeLamports: bigint;
};

export type UnavailableSignature = {
  readonly signature: string;
  readonly reason: string;
};

export type ReadPageResult = {
  readonly scope: 'board' | 'author';
  readonly author: string | null;
  readonly messages: readonly GuestbookMessage[];
  readonly scanned: number;
  readonly filtered: number;
  readonly unavailable: readonly UnavailableSignature[];
  readonly nextCursor: string | null;
  readonly sourceExhausted: boolean;
};

type ParseResult =
  | { readonly kind: 'message'; readonly message: GuestbookMessage }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'unavailable'; readonly reason: string };

const base58Encoder = getBase58Encoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeBigInt(value: unknown, label: string): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new Error(`${label}不能为负数。`);
    return value;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  throw new Error(`${label}格式无效。`);
}

function normalizeBlockTime(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint' && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  throw new Error('blockTime格式无效。');
}

function decodeBase58(value: unknown, label: string): Uint8Array {
  if (typeof value !== 'string') throw new Error(`${label}格式无效。`);
  try {
    return new Uint8Array(base58Encoder.encode(value));
  } catch {
    throw new Error(`${label}不是有效base58。`);
  }
}

function isValidSignature(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return base58Encoder.encode(value).length === 64;
  } catch {
    return false;
  }
}

/**

/**
 * 严格解析一条 getTransaction(json) 返回。返回三类结果：
 * - message：通过本板协议且查询签名一致。
 * - unavailable：null / meta 缺失等无法验证，但不是“没有留言”。
 * - invalid：明确不符合协议，可安全过滤。
 */
export function parseGuestbookTransaction(
  raw: unknown,
  expectedSignature: string,
  marker: Address = MARKER_ADDRESS,
): ParseResult {
  try {
    if (raw === null || raw === undefined) return { kind: 'unavailable', reason: 'transaction-null' };
  if (!isRecord(raw)) return { kind: 'invalid', reason: 'not-object' };
  if (raw.version !== 0) return { kind: 'invalid', reason: 'unsupported-version' };

  const meta = raw.meta;
  if (meta === null || meta === undefined) return { kind: 'unavailable', reason: 'meta-null' };
  if (!isRecord(meta) || meta.err !== null) return { kind: 'invalid', reason: 'meta-err-or-malformed' };

  const transaction = raw.transaction;
  if (!isRecord(transaction)) return { kind: 'invalid', reason: 'transaction-missing' };
  const signatures = transaction.signatures;
  if (!Array.isArray(signatures) || signatures.length !== 1) return { kind: 'invalid', reason: 'signature-count' };
  if (signatures[0] !== expectedSignature) return { kind: 'invalid', reason: 'signature-mismatch' };
  const signature = signatures[0] as string;
  const signatureBytes = decodeBase58(signature, '签名');
  if (signatureBytes.length !== 64 || signatureBytes.every((byte) => byte === 0)) {
    return { kind: 'invalid', reason: 'signature-bytes' };
  }

  const message = transaction.message;
  if (!isRecord(message)) return { kind: 'invalid', reason: 'message-missing' };
  const header = message.header;
  if (
    !isRecord(header) ||
    header.numRequiredSignatures !== 1 ||
    header.numReadonlySignedAccounts !== 0 ||
    typeof header.numReadonlyUnsignedAccounts !== 'number' ||
    !Number.isInteger(header.numReadonlyUnsignedAccounts) ||
    header.numReadonlyUnsignedAccounts < 0
  ) {
    return { kind: 'invalid', reason: 'signer-header' };
  }
  if (message.addressTableLookups !== undefined && !(Array.isArray(message.addressTableLookups) && message.addressTableLookups.length === 0)) {
    return { kind: 'invalid', reason: 'address-table-lookups' };
  }

  const accountKeys = message.accountKeys;
  if (!Array.isArray(accountKeys) || accountKeys.length < 4) return { kind: 'invalid', reason: 'account-keys' };
  for (const key of accountKeys) {
    if (typeof key !== 'string' || !isAddress(key)) return { kind: 'invalid', reason: 'account-key-invalid' };
  }
  const totalAccounts = accountKeys.length;
  const requiredSignatures = header.numRequiredSignatures as number;
  const readonlyUnsigned = header.numReadonlyUnsignedAccounts as number;
  if (readonlyUnsigned > totalAccounts - requiredSignatures) {
    return { kind: 'invalid', reason: 'signer-header-range' };
  }

  const instructions = message.instructions;
  if (!Array.isArray(instructions) || instructions.length < 2 || instructions.length > 8) {
    return { kind: 'invalid', reason: 'instruction-count' };
  }
  if (new Set(accountKeys).size !== accountKeys.length) return { kind: 'invalid', reason: 'duplicate-account-key' };

  for (const instruction of instructions) {
    if (!isRecord(instruction)) return { kind: 'invalid', reason: 'instruction-malformed' };
    if (
      typeof instruction.programIdIndex !== 'number' ||
      !Number.isInteger(instruction.programIdIndex) ||
      instruction.programIdIndex < 0 ||
      instruction.programIdIndex >= accountKeys.length
    ) {
      return { kind: 'invalid', reason: 'instruction-program-index' };
    }
    if (
      !Array.isArray(instruction.accounts) ||
      instruction.accounts.some(
        (accountIndex) =>
          typeof accountIndex !== 'number' || !Number.isInteger(accountIndex) || accountIndex < 0 || accountIndex >= accountKeys.length,
      )
    ) {
      return { kind: 'invalid', reason: 'instruction-account-index' };
    }
  }

  const hasLighthouse = accountKeys.includes(LIGHTHOUSE_PROGRAM_ADDRESS);
  const coreInstructions = instructions.filter(
    (instruction) =>
      accountKeys[instruction.programIdIndex as number] !== LIGHTHOUSE_PROGRAM_ADDRESS,
  );
  const lighthouseInstructions = instructions.filter(
    (instruction) =>
      accountKeys[instruction.programIdIndex as number] === LIGHTHOUSE_PROGRAM_ADDRESS,
  );
  if (coreInstructions.length < 2 || coreInstructions.length > 4) {
    return { kind: 'invalid', reason: 'core-instruction-count' };
  }
  if (hasLighthouse !== (lighthouseInstructions.length > 0)) {
    return { kind: 'invalid', reason: 'lighthouse-pairing' };
  }

  const author = accountKeys[0] as string;
  const budgetInstructions = coreInstructions.slice(0, -2);
  const expectedKeys = [
    author,
    marker,
    SYSTEM_PROGRAM_ADDRESS,
    MEMO_PROGRAM_ADDRESS,
    ...(budgetInstructions.length > 0 ? [COMPUTE_BUDGET_PROGRAM_ADDRESS] : []),
    ...(hasLighthouse ? [LIGHTHOUSE_PROGRAM_ADDRESS] : []),
  ];
  if (accountKeys.length !== expectedKeys.length) return { kind: 'invalid', reason: 'account-key-count' };
  for (const expected of expectedKeys) {
    if (!accountKeys.includes(expected)) return { kind: 'invalid', reason: 'account-key-set' };
  }

  const budgetKinds = new Set<number>();
  for (const instruction of budgetInstructions) {
    if (!isRecord(instruction)) return { kind: 'invalid', reason: 'budget-malformed' };
    if (accountKeys[instruction.programIdIndex as number] !== COMPUTE_BUDGET_PROGRAM_ADDRESS) {
      return { kind: 'invalid', reason: 'budget-program' };
    }
    if (!Array.isArray(instruction.accounts) || instruction.accounts.length !== 0) {
      return { kind: 'invalid', reason: 'budget-accounts' };
    }
    const data = decodeBase58(instruction.data, '预算数据');
    const kind = data[0];
    if (kind === undefined || budgetKinds.has(kind)) return { kind: 'invalid', reason: 'budget-kind' };
    budgetKinds.add(kind);
    if (kind === 2) {
      if (data.length !== 5) return { kind: 'invalid', reason: 'budget-unit-limit-len' };
      const units = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(1, true);
      if (units === 0 || units > 1_400_000) return { kind: 'invalid', reason: 'budget-unit-limit-range' };
    } else if (kind === 3) {
      if (data.length !== 9) return { kind: 'invalid', reason: 'budget-price-len' };
    } else {
      return { kind: 'invalid', reason: 'budget-unknown' };
    }
  }

  const transfer = coreInstructions.at(-2);
  const memo = coreInstructions.at(-1);
  if (!isRecord(transfer) || !isRecord(memo)) return { kind: 'invalid', reason: 'tail-instruction-malformed' };

  if (accountKeys[transfer.programIdIndex as number] !== SYSTEM_PROGRAM_ADDRESS) {
    return { kind: 'invalid', reason: 'transfer-program' };
  }
  if (!Array.isArray(transfer.accounts) || transfer.accounts.length !== 2 || transfer.accounts[0] !== 0) {
    return { kind: 'invalid', reason: 'transfer-accounts' };
  }
  const markerIndex = transfer.accounts[1] as number;
  const readonlyNonSignerStart = accountKeys.length - readonlyUnsigned;
  if (markerIndex < requiredSignatures || markerIndex >= readonlyNonSignerStart) {
    return { kind: 'invalid', reason: 'transfer-marker-role' };
  }
  if (accountKeys[markerIndex] !== marker) return { kind: 'invalid', reason: 'transfer-marker' };
  const transferData = decodeBase58(transfer.data, '转账数据');
  if (transferData.length !== 12 || transferData[0] !== 2 || transferData.slice(1).some((byte) => byte !== 0)) {
    return { kind: 'invalid', reason: 'transfer-amount' };
  }

  if (accountKeys[memo.programIdIndex as number] !== MEMO_PROGRAM_ADDRESS) {
    return { kind: 'invalid', reason: 'memo-program' };
  }
  if (!Array.isArray(memo.accounts) || memo.accounts.length !== 1 || memo.accounts[0] !== 0) {
    return { kind: 'invalid', reason: 'memo-author-signer' };
  }

  const memoRaw = decodeBase58(memo.data, 'Memo数据');
  if (memoRaw.length > 1024) return { kind: 'invalid', reason: 'memo-too-large' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Decoder.decode(memoRaw));
  } catch {
    return { kind: 'invalid', reason: 'memo-utf8-json' };
  }
  if (!isRecord(parsed) || Object.keys(parsed).sort().join(',') !== 'app,board,text,v') {
    return { kind: 'invalid', reason: 'memo-fields' };
  }
  if (parsed.app !== PROTOCOL_APP || parsed.v !== PROTOCOL_VERSION || parsed.board !== PROTOCOL_BOARD) {
    return { kind: 'invalid', reason: 'memo-protocol' };
  }
  if (typeof parsed.text !== 'string') return { kind: 'invalid', reason: 'memo-text-type' };
  if ((parsed.text as unknown as { isWellFormed?: () => boolean }).isWellFormed?.() !== true) {
    return { kind: 'invalid', reason: 'memo-text-wellformed' };
  }
  const textValidation = validateMessageText(parsed.text);
  if (!textValidation.ok) return { kind: 'invalid', reason: 'memo-text' };

  return {
    kind: 'message',
    message: {
      signature,
      author,
      text: parsed.text,
      slot: normalizeBigInt(raw.slot, 'slot'),
      blockTime: normalizeBlockTime(raw.blockTime),
      feeLamports: normalizeBigInt(meta.fee, 'fee'),
    },
  };
  } catch {
    return { kind: 'invalid', reason: 'malformed' };
  }
}


type ReadScope = { readonly kind: 'board' } | { readonly kind: 'author'; readonly author: string };

function describeOperationError(error: unknown, signal: AbortSignal, action: string): Error {
  if (signal.aborted) return new Error(`${action}已取消或超时。`);
  const detail = error instanceof Error && error.message.trim() !== '' ? error.message.trim() : '未知错误';
  return new Error(`${action}失败：${detail}`);
}

export function createHistoryClient(
  rpc: HistoryRpc = createSolanaRpc(SOLANA_NETWORK_CONFIG.rpcUrl) as unknown as HistoryRpc,
  options: Readonly<{ rpcTimeoutMs?: number; operationTimeoutMs?: number }> = {},
) {
  const rpcTimeoutMs = options.rpcTimeoutMs ?? RPC_TIMEOUT_MS;
  const operationTimeoutMs = options.operationTimeoutMs ?? OPERATION_TIMEOUT_MS;

  function createBaseSignal(callerSignal: AbortSignal): AbortSignal {
    return AbortSignal.any([callerSignal, AbortSignal.timeout(operationTimeoutMs)]);
  }

  async function verifyGenesis(baseSignal: AbortSignal): Promise<void> {
    const requestSignal = AbortSignal.any([baseSignal, AbortSignal.timeout(rpcTimeoutMs)]);
    if (baseSignal.aborted) throw new Error('操作已取消或超时。');
    let genesis: string;
    try {
      genesis = await rpc.getGenesisHash().send({ abortSignal: requestSignal });
    } catch (error) {
      if (baseSignal.aborted) throw new Error('操作已取消或超时。');
      if (requestSignal.aborted) throw new Error('网络校验超时，请重试。');
      throw describeOperationError(error, baseSignal, '网络校验');
    }
    if (baseSignal.aborted) throw new Error('操作已取消或超时。');
    if (requestSignal.aborted) throw new Error('网络校验超时，请重试。');
    if (genesis !== SOLANA_NETWORK_CONFIG.genesisHash) {
      throw new Error(
        `网络校验失败：应用查询的 RPC 不是 ${SOLANA_NETWORK_CONFIG.displayName}（genesis ${genesis}）。`,
      );
    }
  }

  function resolveScope(scope: ReadScope): { kind: 'board' | 'author'; author: string | null; address: Address } {
    if (scope.kind === 'board') return { kind: 'board', author: null, address: MARKER_ADDRESS };
    if (!isAddress(scope.author)) throw new Error('作者地址格式无效。');
    return { kind: 'author', author: scope.author, address: scope.author as Address };
  }

  function validateSignature(signature: unknown): string {
    if (!isValidSignature(signature)) throw new Error('签名格式无效。');
    return signature;
  }

  function validatePageSize(pageSize: number): number {
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new Error(`pageSize 必须在 1 到 ${MAX_PAGE_SIZE} 之间。`);
    }
    return pageSize;
  }

  function normalizeRows(rows: readonly unknown[]): { rows: SignatureRow[]; lastSignature: string | null } {
    const unique: SignatureRow[] = [];
    const seen = new Set<string>();
    let lastSignature: string | null = null;
    for (const row of rows) {
      if (!isRecord(row) || !isValidSignature(row.signature)) {
        throw new Error('签名列表返回了无效候选签名。');
      }
      const signature = row.signature;
      lastSignature = signature;
      if (seen.has(signature)) continue;
      seen.add(signature);
      unique.push({ signature, err: row.err ?? null });
    }
    return { rows: unique, lastSignature };
  }

  function describeUnavailable(error: unknown): string {
    return error instanceof Error && error.message.trim() !== '' ? error.message.trim() : 'RPC 请求失败。';
  }

  async function fetchTransaction(
    signature: string,
    operationSignal: AbortSignal,
    author: string | null,
  ): Promise<
    { type: 'message'; message: GuestbookMessage } | { type: 'unavailable'; reason: string } | { type: 'filtered' }
  > {
    const requestSignal = AbortSignal.any([operationSignal, AbortSignal.timeout(rpcTimeoutMs)]);
    let raw: unknown;
    try {
      raw = await rpc
        .getTransaction(signature, {
          encoding: 'json',
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        })
        .send({ abortSignal: requestSignal });
    } catch (error) {
      if (operationSignal.aborted) throw describeOperationError(error, operationSignal, '交易读取');
      if (requestSignal.aborted) return { type: 'unavailable', reason: '交易读取超时，可重试。' };
      return { type: 'unavailable', reason: describeUnavailable(error) };
    }

    if (operationSignal.aborted) throw describeOperationError(new Error('aborted'), operationSignal, '交易读取');
    if (requestSignal.aborted) return { type: 'unavailable', reason: '交易读取超时，可重试。' };
    const parsed = parseGuestbookTransaction(raw, signature, MARKER_ADDRESS);
    if (parsed.kind === 'unavailable') return { type: 'unavailable', reason: parsed.reason };
    if (parsed.kind === 'invalid') return { type: 'filtered' };
    if (author !== null && parsed.message.author !== author) return { type: 'filtered' };
    return { type: 'message', message: parsed.message };
  }

  async function runPool<T>(
    items: readonly T[],
    baseSignal: AbortSignal,
    worker: (item: T, signal: AbortSignal) => Promise<unknown>,
  ): Promise<void> {
    const poolController = new AbortController();
    const dispatchSignal = AbortSignal.any([poolController.signal, baseSignal]);
    let next = 0;
    let fatal: Error | null = null;
    async function runner() {
      while (fatal === null && !baseSignal.aborted) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        try {
          await worker(items[index]!, dispatchSignal);
        } catch (error) {
          if (fatal === null) {
            fatal = error instanceof Error ? error : new Error(describeUnavailable(error));
          }
          poolController.abort();
          return;
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_TRANSACTION_CONCURRENCY, items.length) }, runner));
    if (fatal !== null) throw fatal;
  }



  async function readPage(
    scope: ReadScope,
    before: string | null | undefined,
    callerSignal: AbortSignal = new AbortController().signal,
    pageSize: number = DEFAULT_PAGE_SIZE,
  ): Promise<ReadPageResult> {
    const resolved = resolveScope(scope);
    const limit = validatePageSize(pageSize);
    if (before !== null && before !== undefined) validateSignature(before);

    const baseSignal = createBaseSignal(callerSignal);
    if (baseSignal.aborted) throw new Error('操作已取消。');
    await verifyGenesis(baseSignal);
    if (baseSignal.aborted) throw new Error('操作已取消或超时。');

    const listSignal = AbortSignal.any([baseSignal, AbortSignal.timeout(rpcTimeoutMs)]);
    let rawRows: unknown;
    try {
      rawRows = await rpc
        .getSignaturesForAddress(resolved.address, {
          limit,
          commitment: 'confirmed',
          ...(before !== null && before !== undefined ? { before } : {}),
        })
        .send({ abortSignal: listSignal });
    } catch (error) {
      if (baseSignal.aborted) throw new Error('操作已取消或超时。');
      if (listSignal.aborted) throw new Error('签名列表超时，请重试。');
      throw describeOperationError(error, baseSignal, '签名列表');
    }
    if (baseSignal.aborted) throw new Error('操作已取消或超时。');
    if (listSignal.aborted) throw new Error('签名列表超时，请重试。');
    if (!Array.isArray(rawRows)) throw new Error('签名列表返回格式无效。');
    if (rawRows.length > limit) throw new Error(`签名列表返回超过请求上限（${rawRows.length} > ${limit}）。`);

    const { rows, lastSignature: rawTail } = normalizeRows(rawRows);
    const errRows = rows.filter((row) => row.err !== null);
    const transactionRows = rows.filter((row) => row.err === null);

    const messages: GuestbookMessage[] = [];
    const unavailable: UnavailableSignature[] = [];
    let filtered = errRows.length;
    const outcomes = new Map<
      string,
      { type: 'message'; message: GuestbookMessage } | { type: 'unavailable'; reason: string } | { type: 'filtered' }
    >();

    await runPool(transactionRows, baseSignal, async (row, signal) => {
      const outcome = await fetchTransaction(row.signature, signal, resolved.author);
      if (baseSignal.aborted || signal.aborted) return;
      outcomes.set(row.signature, outcome);
    });

    if (baseSignal.aborted) throw new Error('操作已取消或超时。');

    for (const row of rows) {
      if (row.err !== null) continue;
      const outcome = outcomes.get(row.signature);
      if (outcome === undefined) continue;
      if (outcome.type === 'message') messages.push(outcome.message);
      else if (outcome.type === 'unavailable') unavailable.push({ signature: row.signature, reason: outcome.reason });
      else filtered += 1;
    }

    const nextCursor = rawTail;
    if (before !== null && before !== undefined && nextCursor === before) {
      throw new Error('游标无进展：返回的候选页与请求边界相同。');
    }

    return {
      scope: resolved.kind,
      author: resolved.author,
      messages,
      scanned: rows.length,
      filtered,
      unavailable,
      nextCursor,
      sourceExhausted: rawRows.length === 0,
    };
  }

  async function retrySignatures(
    signatures: readonly unknown[],
    scope: ReadScope,
    callerSignal: AbortSignal = new AbortController().signal,
  ): Promise<ReadPageResult> {
    const resolved = resolveScope(scope);
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const signature of signatures) {
      const validated = validateSignature(signature);
      if (!seen.has(validated)) {
        seen.add(validated);
        unique.push(validated);
      }
    }
    if (unique.length > MAX_RETRY_SIGNATURES) {
      throw new Error(`显式重试最多支持 ${MAX_RETRY_SIGNATURES} 个唯一签名。`);
    }

    const baseSignal = createBaseSignal(callerSignal);
    if (baseSignal.aborted) throw new Error('操作已取消。');
    await verifyGenesis(baseSignal);
    if (baseSignal.aborted) throw new Error('操作已取消或超时。');

    const messages: GuestbookMessage[] = [];
    const unavailable: UnavailableSignature[] = [];
    let filtered = 0;
    const outcomes = new Map<
      string,
      { type: 'message'; message: GuestbookMessage } | { type: 'unavailable'; reason: string } | { type: 'filtered' }
    >();

    await runPool(unique, baseSignal, async (signature, signal) => {
      const outcome = await fetchTransaction(signature, signal, resolved.author);
      if (baseSignal.aborted || signal.aborted) return;
      outcomes.set(signature, outcome);
    });

    if (baseSignal.aborted) throw new Error('操作已取消或超时。');

    for (const signature of unique) {
      const outcome = outcomes.get(signature);
      if (outcome === undefined) continue;
      if (outcome.type === 'message') messages.push(outcome.message);
      else if (outcome.type === 'unavailable') unavailable.push({ signature, reason: outcome.reason });
      else filtered += 1;
    }

    return {
      scope: resolved.kind,
      author: resolved.author,
      messages,
      scanned: unique.length,
      filtered,
      unavailable,
      nextCursor: null,
      sourceExhausted: false,
    };
  }

  return { readPage, retrySignatures };
}
