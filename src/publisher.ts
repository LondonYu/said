import {
  getBase58Decoder,
  getBase58Encoder,
  getCompiledTransactionMessageDecoder,
  getPublicKeyFromAddress,
  getTransactionDecoder,
  getTransactionEncoder,
  isAddress,
  signatureBytes as toSignatureBytes,
  verifySignature,
} from '@solana/kit';
import type { Address } from '@solana/kit';
import {
  buildUnsignedGuestbookTransaction,
  describeMessageTextError,
  MAX_TRANSACTION_BYTES,
  validateMessageText,
} from './message';
import type { GuestbookMessage } from './history';
import type { SimulationClient } from './simulation';
import { SOLANA_CHAIN, SOLANA_NETWORK_CONFIG } from './network';
import type { WalletSigningSession } from './wallet';

export const PUBLICATION_RECEIPT_STORAGE_KEY = SOLANA_NETWORK_CONFIG.receiptStorageKey;
export const MAX_PUBLICATION_RECEIPTS = 10;

const RECEIPT_VERSION = 1 as const;
const PREPARED_VERSION = 1 as const;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_SIGNING_TIMEOUT_MS = 60_000;

export type PublicationStatus =
  | 'submitting'
  | 'uncertain'
  | 'not_sent'
  | 'preflight_rejected'
  | 'confirmed'
  | 'finalized'
  | 'failed';

const PUBLICATION_STATUSES: readonly PublicationStatus[] = [
  'submitting',
  'uncertain',
  'not_sent',
  'preflight_rejected',
  'confirmed',
  'finalized',
  'failed',
];

const TERMINAL_STATUSES: readonly PublicationStatus[] = [
  'not_sent',
  'preflight_rejected',
  'confirmed',
  'finalized',
  'failed',
];

/** 只保存重建/核对交易所需的最小字段，不保存正文或完整交易。 */
export type PublicationReceipt = {
  readonly version: typeof RECEIPT_VERSION;
  readonly chain: typeof SOLANA_CHAIN;
  readonly author: string;
  readonly signature: string;
  readonly blockhash: string;
  readonly lastValidBlockHeight: string;
  readonly createdAt: number;
  readonly status: PublicationStatus;
};

export type PreparedPublication = {
  readonly version: typeof PREPARED_VERSION;
  readonly chain: typeof SOLANA_CHAIN;
  readonly sessionRevision: number;
  readonly walletName: string;
  readonly author: string;
  readonly text: string;
  readonly feeLamports: bigint;
  readonly balanceLamports: bigint;
  readonly blockhash: string;
  readonly lastValidBlockHeight: bigint;
  readonly transactionSizeBytes: number;
  readonly unsignedTransactionBase64: string;
  readonly messageBase64: string;
  readonly checkedAt: number;
};

export type SignedPublication = {
  readonly author: string;
  readonly signature: string;
  readonly sessionRevision: number;
  readonly signedTransactionBase64: string;
};

/**
 * 可靠终态必须在发布核心内结算到同一原签名回执。
 * 写盘失败不掩盖链上查询结果，但明确告诉调用者本地仍未持久化。
 */
export type ReceiptPersistence =
  | { readonly kind: 'not_terminal'; readonly receipt: PublicationReceipt }
  | { readonly kind: 'persisted'; readonly receipt: PublicationReceipt }
  | {
      readonly kind: 'failed';
      readonly receipt: PublicationReceipt;
      readonly reason: string;
    };

export type PublicationCheck = {
  readonly kind: 'pending' | 'confirmed' | 'finalized' | 'failed' | 'expired';
  readonly signature: string;
  readonly confirmationStatus: 'processed' | 'confirmed' | 'finalized' | null;
  readonly err: unknown | null;
  readonly reason: string | null;
  readonly persistence: ReceiptPersistence;
};

export type ConfirmedPublication = PublicationCheck & { readonly rounds: number };

export type PublicationSubmitResult = {
  readonly kind: 'accepted' | 'duplicate' | 'uncertain' | 'preflight_rejected';
  readonly signature: string;
  readonly receipt: PublicationReceipt;
};

export type PublicationReadBack =
  | { readonly kind: 'ready'; readonly message: GuestbookMessage }
  | { readonly kind: 'unavailable'; readonly reason: string };

export type PublicationReceiptStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type PublicationReceiptStore = {
  save(receipt: PublicationReceipt): void;
  list(): readonly PublicationReceipt[];
};

type PendingRpcRequest<TResponse> = {
  send(options?: Readonly<{ abortSignal?: AbortSignal }>): Promise<TResponse>;
};

export type SignatureStatusResult = {
  readonly confirmationStatus?: 'processed' | 'confirmed' | 'finalized' | null;
  readonly err?: unknown;
  readonly confirmations?: bigint | null;
  readonly slot?: bigint;
};

export type PublisherRpc = {
  getGenesisHash(): PendingRpcRequest<string>;
  getBlockHeight(
    config?: Readonly<{ commitment?: 'confirmed' | 'finalized' | 'processed' }>,
  ): PendingRpcRequest<bigint>;
  getFeeForMessage(
    messageBase64: string,
    config?: Readonly<{ commitment?: 'confirmed' | 'finalized' | 'processed' }>,
  ): PendingRpcRequest<{ readonly value: bigint | null }>;
  getBalance(
    address: string,
    config?: Readonly<{ commitment?: 'confirmed' | 'finalized' | 'processed' }>,
  ): PendingRpcRequest<{ readonly value: bigint }>;
  sendTransaction(
    transactionBase64: string,
    config: Readonly<{
      encoding: 'base64';
      skipPreflight: false;
      preflightCommitment: 'confirmed';
      maxRetries: 2n;
    }>,
  ): PendingRpcRequest<string>;
  getSignatureStatuses(
    signatures: readonly string[],
    config: Readonly<{ searchTransactionHistory: true }>,
  ): PendingRpcRequest<{ readonly value: readonly (SignatureStatusResult | null)[] }>;
};

type PublisherHistoryClient = {
  retrySignatures(
    signatures: readonly unknown[],
    scope: Readonly<{ kind: 'author'; author: string }>,
    signal: AbortSignal,
  ): Promise<{
    readonly messages: readonly GuestbookMessage[];
    readonly unavailable: readonly { readonly signature: string; readonly reason: string }[];
  }>;
};

export type PublisherDependencies = {
  readonly simulationClient: Pick<SimulationClient, 'checkTransaction'>;
  readonly rpc: PublisherRpc;
  readonly receiptStore: PublicationReceiptStore;
  readonly historyClient: PublisherHistoryClient;
  readonly getCurrentSession: () => WalletSigningSession | null;
  readonly timeoutMs?: number;
  readonly signingTimeoutMs?: number;
  readonly confirm?: Readonly<{
    maxRounds?: number;
    intervalMs?: number;
    totalTimeoutMs?: number;
  }>;
  readonly now?: () => number;
};

export type Publisher = {
  prepare(
    input: {
      session: WalletSigningSession;
      text: string;
    },
    signal?: AbortSignal,
  ): Promise<PreparedPublication>;
  sign(
    prepared: PreparedPublication,
    session: WalletSigningSession,
    signal?: AbortSignal,
  ): Promise<SignedPublication>;
  submit(
    prepared: PreparedPublication,
    signed: SignedPublication,
    session: WalletSigningSession,
    signal?: AbortSignal,
  ): Promise<PublicationSubmitResult>;
  check(receipt: PublicationReceipt, signal?: AbortSignal): Promise<PublicationCheck>;
  confirm(receipt: PublicationReceipt, signal?: AbortSignal): Promise<ConfirmedPublication>;
  recover(signal?: AbortSignal): Promise<
    readonly {
      readonly receipt: PublicationReceipt;
      readonly storedStatus: PublicationStatus;
      readonly check: PublicationCheck;
    }[]
  >;
  readBack(
    receipt: PublicationReceipt,
    signal?: AbortSignal,
  ): Promise<PublicationReadBack>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bytesEqual(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function describeMessageMismatch(expected: ArrayLike<number>, actual: ArrayLike<number>): string {
  const firstDifference = Array.from({ length: Math.min(expected.length, actual.length) }).findIndex(
    (_value, index) => expected[index] !== actual[index],
  );
  try {
    const decoder = getCompiledTransactionMessageDecoder();
    const expectedMessage = decoder.decode(Uint8Array.from(expected));
    const actualMessage = decoder.decode(Uint8Array.from(actual));
    if (expectedMessage.version === 1 || actualMessage.version === 1) {
      throw new Error('暂不支持版本 1 的消息差异诊断。');
    }
    const programs = (message: typeof expectedMessage) =>
      message.instructions.map(
        (instruction) => message.staticAccounts[instruction.programAddressIndex] ?? `#${instruction.programAddressIndex}`,
      );
    return [
      '签名交易消息与准备快照不一致。',
      `准备：blockhash ${expectedMessage.lifetimeToken}，${expectedMessage.instructions.length} 条指令，${expectedMessage.staticAccounts.length} 个静态账户，程序 [${programs(expectedMessage).join(', ')}]。`,
      `钱包：blockhash ${actualMessage.lifetimeToken}，${actualMessage.instructions.length} 条指令，${actualMessage.staticAccounts.length} 个静态账户，程序 [${programs(actualMessage).join(', ')}]。`,
      `消息长度 ${expected.length}/${actual.length} 字节，首个差异字节位置 ${firstDifference < 0 ? '无' : firstDifference}。`,
    ].join(' ');
  } catch {
    return `签名交易消息与准备快照不一致（准备 ${expected.length} 字节，钱包 ${actual.length} 字节，首个差异字节位置 ${firstDifference < 0 ? '无' : firstDifference}）。`;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('交易字节不是有效 Base64。');
  }
}

function isBase58Bytes(value: unknown, length: number): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    return getBase58Encoder().encode(value).length === length;
  } catch {
    return false;
  }
}

function assertCurrentSession(
  session: WalletSigningSession,
  getCurrentSession: () => WalletSigningSession | null,
): void {
  if (
    session === null ||
    session.wallet === undefined ||
    session.account === undefined ||
    session.chain !== SOLANA_CHAIN ||
    getCurrentSession() !== session
  ) {
    throw new Error('签名会话已失效，请重新连接钱包。');
  }
}

function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  message = '操作已取消。',
): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error(message));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error(message));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

class OperationStopError extends Error {
  constructor(
    readonly kind: 'cancelled' | 'timeout',
    message: string,
  ) {
    super(message);
    this.name = 'OperationStopError';
  }
}

type OperationDeadline = {
  readonly signal: AbortSignal;
  readonly callerSignal: AbortSignal | undefined;
  readonly timedOut: () => boolean;
  readonly cleanup: () => void;
};

function createDeadline(
  callerSignal: AbortSignal | undefined,
  totalTimeoutMs: number,
): OperationDeadline {
  const controller = new AbortController();
  let timedOut = false;
  let cleaned = false;
  const onCallerAbort = () => controller.abort();
  if (callerSignal?.aborted === true) {
    controller.abort();
  } else if (callerSignal !== undefined) {
    callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(0, totalTimeoutMs));

  return {
    signal: controller.signal,
    callerSignal,
    timedOut: () => timedOut,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

function deadlineStop(deadline: OperationDeadline, action: string): OperationStopError {
  if (deadline.callerSignal?.aborted === true) {
    return new OperationStopError('cancelled', '操作已取消。');
  }
  if (deadline.timedOut()) {
    return new OperationStopError('timeout', `${action}超时，已停止等待。`);
  }
  return new OperationStopError('cancelled', '操作已停止。');
}

function throwIfStopped(deadline: OperationDeadline, action: string): void {
  if (deadline.signal.aborted) throw deadlineStop(deadline, action);
}

/**
 * 单次 RPC/模拟同时受操作总截止、单次超时与调用者取消约束。
 * provider 即使忽略 abortSignal 并迟到返回，也不能把结果送入下一步。
 */
async function runWithTimeout<T>(
  deadline: OperationDeadline,
  timeoutMs: number,
  action: string,
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  throwIfStopped(deadline, action);
  const controller = new AbortController();
  let requestTimedOut = false;
  const onStop = () => controller.abort();
  deadline.signal.addEventListener('abort', onStop, { once: true });
  const timer = setTimeout(() => {
    requestTimedOut = true;
    controller.abort();
  }, Math.max(0, timeoutMs));

  try {
    const result = await raceWithAbort(
      Promise.resolve().then(() => request(controller.signal)),
      controller.signal,
      `${action}超时，已停止等待。`,
    );
    if (deadline.signal.aborted) throw deadlineStop(deadline, action);
    if (requestTimedOut || controller.signal.aborted) {
      throw new OperationStopError('timeout', `${action}超时，已停止等待。`);
    }
    return result;
  } catch (error) {
    if (error instanceof OperationStopError) throw error;
    if (deadline.signal.aborted) throw deadlineStop(deadline, action);
    if (requestTimedOut || controller.signal.aborted) {
      throw new OperationStopError('timeout', `${action}超时，已停止等待。`);
    }
    const detail = error instanceof Error && error.message.trim() !== '' ? error.message : '未知错误';
    throw new Error(`${action}失败：${detail}`);
  } finally {
    clearTimeout(timer);
    deadline.signal.removeEventListener('abort', onStop);
  }
}

async function sleepWithDeadline(
  sleepMs: number,
  deadline: OperationDeadline,
  action: string,
): Promise<void> {
  throwIfStopped(deadline, action);
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    await raceWithAbort(
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, Math.max(0, sleepMs));
      }),
      deadline.signal,
      `${action}超时，已停止等待。`,
    );
    throwIfStopped(deadline, action);
  } catch (error) {
    if (error instanceof OperationStopError) throw error;
    throw deadlineStop(deadline, action);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/** 签名前、钱包返回后和广播前都必须重新核对同一笔准备快照。 */
async function recheckPreparedState(
  rpc: PublisherRpc,
  prepared: PreparedPublication,
  deadline: OperationDeadline,
  timeoutMs: number,
): Promise<void> {
  const genesisHash = await runWithTimeout(deadline, timeoutMs, '网络复核', (signal) =>
    rpc.getGenesisHash().send({ abortSignal: signal }),
  );
  if (genesisHash !== SOLANA_NETWORK_CONFIG.genesisHash) {
    throw new Error(
      `网络复核失败：RPC 不是 ${SOLANA_NETWORK_CONFIG.displayName}，请重新准备后再试。`,
    );
  }

  const blockHeight = await runWithTimeout(deadline, timeoutMs, '区块高度复核', (signal) =>
    rpc.getBlockHeight({ commitment: 'confirmed' }).send({ abortSignal: signal }),
  );
  if (blockHeight > prepared.lastValidBlockHeight) {
    throw new Error('blockhash 已过期，请重新准备后再试。');
  }

  const fee = await runWithTimeout(deadline, timeoutMs, '费用复核', (signal) =>
    rpc
      .getFeeForMessage(prepared.messageBase64, { commitment: 'confirmed' })
      .send({ abortSignal: signal }),
  );
  if (fee.value !== prepared.feeLamports) {
    throw new Error('费用已变化，请重新准备后再试。');
  }

  const balance = await runWithTimeout(deadline, timeoutMs, '余额复核', (signal) =>
    rpc.getBalance(prepared.author, { commitment: 'confirmed' }).send({ abortSignal: signal }),
  );
  if (balance.value < prepared.feeLamports) {
    throw new Error('余额不足以支付交易费用，请重新准备后再试。');
  }
  throwIfStopped(deadline, '网络复核');
}

function validateReceipt(value: unknown): PublicationReceipt {
  if (!isRecord(value)) throw new Error('回执存储损坏：条目不是对象。');
  if (value.version !== RECEIPT_VERSION) throw new Error('回执存储损坏：版本不受支持。');
  if (value.chain !== SOLANA_CHAIN) throw new Error('回执存储损坏：链不一致。');
  if (typeof value.author !== 'string' || !isAddress(value.author)) {
    throw new Error('回执存储损坏：作者地址无效。');
  }
  if (!isBase58Bytes(value.signature, 64)) throw new Error('回执存储损坏：签名无效。');
  if (!isBase58Bytes(value.blockhash, 32)) throw new Error('回执存储损坏：blockhash 无效。');
  if (
    typeof value.lastValidBlockHeight !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(value.lastValidBlockHeight)
  ) {
    throw new Error('回执存储损坏：有效高度无效。');
  }
  if (
    typeof value.createdAt !== 'number' ||
    !Number.isSafeInteger(value.createdAt) ||
    value.createdAt < 0
  ) {
    throw new Error('回执存储损坏：创建时间无效。');
  }
  if (!PUBLICATION_STATUSES.includes(value.status as PublicationStatus)) {
    throw new Error('回执存储损坏：状态不受支持。');
  }
  return Object.freeze({
    version: RECEIPT_VERSION,
    chain: SOLANA_CHAIN,
    author: value.author,
    signature: value.signature,
    blockhash: value.blockhash,
    lastValidBlockHeight: value.lastValidBlockHeight,
    createdAt: value.createdAt,
    status: value.status as PublicationStatus,
  });
}

export function createBrowserPublicationReceiptStore(
  storage?: PublicationReceiptStorage,
): PublicationReceiptStore {
  function getStorage(): PublicationReceiptStorage {
    if (storage !== undefined) return storage;
    try {
      const available = globalThis.localStorage;
      if (available !== undefined && available !== null) return available;
    } catch {
      // 浏览器隐私模式可能连读取 localStorage 都抛错。
    }
    throw new Error('回执存储不可用：当前环境没有 localStorage。');
  }

  function readAll(): readonly PublicationReceipt[] {
    let raw: string | null;
    try {
      raw = getStorage().getItem(PUBLICATION_RECEIPT_STORAGE_KEY);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('回执存储不可用')) throw error;
      throw new Error('读取回执存储失败。');
    }
    if (raw === null) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('回执存储损坏：不是有效 JSON。');
    }
    if (!Array.isArray(parsed)) throw new Error('回执存储损坏：根节点不是数组。');
    return parsed.map(validateReceipt);
  }

  function writeAll(receipts: readonly PublicationReceipt[]): void {
    const target = getStorage();
    try {
      target.setItem(PUBLICATION_RECEIPT_STORAGE_KEY, JSON.stringify(receipts));
    } catch {
      throw new Error('写入回执失败，已中止发送。');
    }
  }

  return {
    list: readAll,
    save(input) {
      const receipt = validateReceipt(input);
      const existing = [...readAll()];
      const sameIndex = existing.findIndex((item) => item.signature === receipt.signature);
      if (sameIndex >= 0) {
        existing[sameIndex] = receipt;
        writeAll(existing);
        return;
      }

      if (existing.length >= MAX_PUBLICATION_RECEIPTS) {
        let oldestTerminalIndex = -1;
        for (let index = 0; index < existing.length; index += 1) {
          if (!TERMINAL_STATUSES.includes(existing[index]!.status)) continue;
          if (
            oldestTerminalIndex < 0 ||
            existing[index]!.createdAt < existing[oldestTerminalIndex]!.createdAt
          ) {
            oldestTerminalIndex = index;
          }
        }
        if (oldestTerminalIndex < 0) {
          throw new Error('未解决回执已达上限，拒绝覆盖旧记录。');
        }
        existing.splice(oldestTerminalIndex, 1);
      }

      writeAll([...existing, receipt]);
    },
  };
}

type PreparedBytes = {
  readonly unsignedBytes: Uint8Array;
  readonly messageBytes: Uint8Array;
};

function validatePrepared(
  prepared: PreparedPublication,
  session: WalletSigningSession,
): PreparedBytes {
  if (!isRecord(prepared)) throw new Error('准备快照无效：不是对象。');
  if (prepared.version !== PREPARED_VERSION || prepared.chain !== SOLANA_CHAIN) {
    throw new Error('准备快照无效：版本或链不一致。');
  }
  if (prepared.author !== session.accountAddress || prepared.author !== session.account.address) {
    throw new Error('准备快照与当前账户不一致。');
  }
  if (
    prepared.sessionRevision !== session.revision ||
    prepared.walletName !== session.wallet.name
  ) {
    throw new Error('准备快照已过期，请重新准备。');
  }
  if (typeof prepared.text !== 'string' || !validateMessageText(prepared.text).ok) {
    throw new Error('准备快照的留言正文无效。');
  }
  if (
    typeof prepared.unsignedTransactionBase64 !== 'string' ||
    prepared.unsignedTransactionBase64 === '' ||
    typeof prepared.messageBase64 !== 'string' ||
    prepared.messageBase64 === ''
  ) {
    throw new Error('准备快照缺少可核对的交易字节。');
  }
  if (
    typeof prepared.feeLamports !== 'bigint' ||
    prepared.feeLamports < 0n ||
    typeof prepared.balanceLamports !== 'bigint' ||
    prepared.balanceLamports < 0n ||
    typeof prepared.lastValidBlockHeight !== 'bigint' ||
    prepared.lastValidBlockHeight < 0n ||
    typeof prepared.transactionSizeBytes !== 'number' ||
    !Number.isSafeInteger(prepared.transactionSizeBytes) ||
    prepared.transactionSizeBytes <= 0 ||
    !isBase58Bytes(prepared.blockhash, 32)
  ) {
    throw new Error('准备快照的数值或 blockhash 无效。');
  }

  const rebuilt = buildUnsignedGuestbookTransaction({
    feePayer: prepared.author,
    text: prepared.text,
    lifetime: {
      blockhash: prepared.blockhash,
      lastValidBlockHeight: prepared.lastValidBlockHeight,
    },
  });
  if (
    rebuilt.wireTransactionBase64 !== prepared.unsignedTransactionBase64 ||
    rebuilt.messageBase64 !== prepared.messageBase64 ||
    rebuilt.sizeBytes !== prepared.transactionSizeBytes
  ) {
    throw new Error('准备快照的交易字节与摘要不一致。');
  }

  const unsignedBytes = base64ToBytes(prepared.unsignedTransactionBase64);
  const messageBytes = base64ToBytes(prepared.messageBase64);
  if (unsignedBytes.length !== rebuilt.sizeBytes) {
    throw new Error('准备快照的交易长度不一致。');
  }

  const transaction = getTransactionDecoder().decode(unsignedBytes);
  if (!bytesEqual(transaction.messageBytes, messageBytes)) {
    throw new Error('准备快照的消息字节不一致。');
  }
  const signatureKeys = Object.keys(transaction.signatures);
  if (signatureKeys.length !== 1 || signatureKeys[0] !== prepared.author) {
    throw new Error('准备快照必须只有付款者一个签名槽。');
  }
  const placeholder = transaction.signatures[prepared.author as keyof typeof transaction.signatures];
  if (placeholder !== null && placeholder !== undefined) {
    if (placeholder.length !== 64 || placeholder.some((byte) => byte !== 0)) {
      throw new Error('准备快照的占位签名无效。');
    }
  }

  return { unsignedBytes, messageBytes };
}

export async function verifySignedGuestbookTransaction({
  prepared,
  session,
  signedTransaction,
}: {
  prepared: PreparedPublication;
  session: WalletSigningSession;
  signedTransaction: unknown;
}): Promise<{ readonly signature: string; readonly signedBytes: Uint8Array }> {
  const preparedBytes = validatePrepared(prepared, session);
  if (!(signedTransaction instanceof Uint8Array)) {
    throw new Error('签名输出不是 Uint8Array。');
  }
  if (signedTransaction.length === 0 || signedTransaction.length > MAX_TRANSACTION_BYTES) {
    throw new Error('签名交易长度不在协议范围内。');
  }

  let transaction;
  try {
    transaction = getTransactionDecoder().decode(signedTransaction);
  } catch {
    throw new Error('签名交易无法解码。');
  }

  let reencoded: Uint8Array;
  try {
    reencoded = new Uint8Array(getTransactionEncoder().encode(transaction));
  } catch {
    throw new Error('签名交易无法重新编码。');
  }
  if (!bytesEqual(reencoded, signedTransaction)) {
    throw new Error('签名交易包含尾随字节或结构不一致。');
  }
  if (!bytesEqual(transaction.messageBytes, preparedBytes.messageBytes)) {
    throw new Error(describeMessageMismatch(preparedBytes.messageBytes, transaction.messageBytes));
  }

  const signatureKeys = Object.keys(transaction.signatures);
  if (signatureKeys.length !== 1 || signatureKeys[0] !== prepared.author) {
    throw new Error('签名交易必须只有付款者一个签名槽。');
  }
  const signatureBytes = transaction.signatures[prepared.author as keyof typeof transaction.signatures];
  if (signatureBytes === undefined || signatureBytes === null || signatureBytes.length !== 64) {
    throw new Error('签名长度无效。');
  }
  if (signatureBytes.every((byte) => byte === 0)) {
    throw new Error('签名不能全为零。');
  }

  let signatureValid = false;
  try {
    const publicKey = await getPublicKeyFromAddress(prepared.author as Address);
    signatureValid = await verifySignature(
      publicKey,
      toSignatureBytes(new Uint8Array(signatureBytes)),
      new Uint8Array(transaction.messageBytes),
    );
  } catch {
    throw new Error('签名校验失败：无法执行 Ed25519 验签。');
  }
  if (!signatureValid) throw new Error('签名校验失败：签名与当前账户不匹配。');

  return {
    signature: getBase58Decoder().decode(new Uint8Array(signatureBytes)),
    signedBytes: new Uint8Array(signedTransaction),
  };
}

export function createPublisher(dependencies: PublisherDependencies): Publisher {
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signingTimeoutMs = dependencies.signingTimeoutMs ?? DEFAULT_SIGNING_TIMEOUT_MS;
  const now = dependencies.now ?? Date.now;
  const confirmOptions = dependencies.confirm ?? {};
  const maxRounds = Math.max(1, confirmOptions.maxRounds ?? 10);
  const intervalMs = Math.max(0, confirmOptions.intervalMs ?? 3_000);
  const totalTimeoutMs = Math.max(0, confirmOptions.totalTimeoutMs ?? 45_000);
  const { rpc, receiptStore, historyClient, simulationClient, getCurrentSession } = dependencies;
  const submitInFlight = new Set<string>();
  // token 而非布尔值：旧请求的 finally 不得释放后来者的签名锁。
  let signingAttempt: object | null = null;

  async function prepare(
    {
      session,
      text,
    }: {
      session: WalletSigningSession;
      text: string;
    },
    signal?: AbortSignal,
  ): Promise<PreparedPublication> {
    const deadline = createDeadline(signal, timeoutMs);
    try {
      throwIfStopped(deadline, '准备');
      assertCurrentSession(session, getCurrentSession);
      const textValidation = validateMessageText(text);
      if (!textValidation.ok) throw new Error(describeMessageTextError(textValidation.reason));

      const result = await runWithTimeout(deadline, timeoutMs, '交易模拟', (requestSignal) =>
        simulationClient.checkTransaction({
          feePayer: session.accountAddress,
          text,
          signal: requestSignal,
        }),
      );

      throwIfStopped(deadline, '准备');
      assertCurrentSession(session, getCurrentSession);
      if (result.feePayer !== session.accountAddress) {
        throw new Error('模拟付款者与当前账户不一致。');
      }
      if (result.text !== text) throw new Error('模拟返回的留言与请求不一致。');
      if (result.feeLamports === null) throw new Error('无法确定交易费用，不能签名。');
      if (result.balanceLamports < result.feeLamports) {
        throw new Error('余额不足以支付交易费用，不能签名。');
      }
      if (result.simulationErr !== null) throw new Error('交易模拟失败，不能签名。');
      if (result.blockhashExpired) throw new Error('blockhash 已过期，不能签名。');
      if (result.blockHeight === null) {
        throw new Error('无法确认 blockhash 有效高度，不能签名。');
      }
      if (result.blockHeight > result.lastValidBlockHeight) {
        throw new Error('blockhash 已超过有效高度，不能签名。');
      }
      if (
        result.wireTransactionBase64 === '' ||
        result.messageBase64 === '' ||
        result.transactionSizeBytes <= 0
      ) {
        throw new Error('模拟结果缺少待签交易字节。');
      }

      const prepared: PreparedPublication = Object.freeze({
        version: PREPARED_VERSION,
        chain: SOLANA_CHAIN,
        sessionRevision: session.revision,
        walletName: session.wallet.name,
        author: session.accountAddress,
        text,
        feeLamports: result.feeLamports,
        balanceLamports: result.balanceLamports,
        blockhash: result.blockhash,
        lastValidBlockHeight: result.lastValidBlockHeight,
        transactionSizeBytes: result.transactionSizeBytes,
        unsignedTransactionBase64: result.wireTransactionBase64,
        messageBase64: result.messageBase64,
        checkedAt: now(),
      });
      // 重建并核对模拟返回的每一段字节，伪造/错位的模拟结果不能进入签名。
      validatePrepared(prepared, session);
      assertCurrentSession(session, getCurrentSession);
      throwIfStopped(deadline, '准备');
      return prepared;
    } finally {
      deadline.cleanup();
    }
  }

  async function sign(
    prepared: PreparedPublication,
    session: WalletSigningSession,
    signal?: AbortSignal,
  ): Promise<SignedPublication> {
    if (signingAttempt !== null) {
      throw new Error('已有签名请求正在钱包处理中，请等待结果。');
    }
    // 必须在第一次 await 之前同步占锁，否则同一帧连点会各自进入 RPC 复核并各弹一次钱包。
    const attempt = {};
    signingAttempt = attempt;
    // 网络复核仍使用单次 10 秒预算；钱包是人工交互，单独保留 60 秒确认窗口。
    const deadline = createDeadline(signal, timeoutMs + signingTimeoutMs + timeoutMs);
    let walletStarted = false;
    try {
      throwIfStopped(deadline, '签名');
      assertCurrentSession(session, getCurrentSession);
      const preparedBytes = validatePrepared(prepared, session);
      await recheckPreparedState(rpc, prepared, deadline, timeoutMs);
      throwIfStopped(deadline, '签名');
      assertCurrentSession(session, getCurrentSession);

      let walletPromise: Promise<readonly { readonly signedTransaction: Uint8Array }[]>;
      try {
        walletPromise = Promise.resolve(
          session.feature.signTransaction({
            account: session.account,
            transaction: new Uint8Array(preparedBytes.unsignedBytes),
            chain: session.chain,
          }),
        );
      } catch (error) {
        throw error;
      }
      walletStarted = true;
      // 钱包 Promise 尚未结束时保留锁；页面取消只停止等待，不释放底层弹窗的并发保护。
      const tracked = walletPromise.then(
        (value) => {
          if (signingAttempt === attempt) signingAttempt = null;
          return value;
        },
        (error: unknown) => {
          if (signingAttempt === attempt) signingAttempt = null;
          throw error;
        },
      );

      const outputs = await raceWithAbort(tracked, deadline.signal, '签名等待已取消或超时。');
      throwIfStopped(deadline, '签名');
      assertCurrentSession(session, getCurrentSession);
      if (!Array.isArray(outputs) || outputs.length !== 1) {
        throw new Error('钱包签名输出必须恰好一条。');
      }
      const signedTransaction = outputs[0]?.signedTransaction;
      const verified = await raceWithAbort(
        verifySignedGuestbookTransaction({
          prepared,
          session,
          signedTransaction,
        }),
        deadline.signal,
        '签名校验已取消或超时。',
      );
      throwIfStopped(deadline, '签名');
      assertCurrentSession(session, getCurrentSession);
      // 钱包返回后再次核对网络、原 blockhash 有效高度、费用与余额，过期结果直接丢弃。
      await recheckPreparedState(rpc, prepared, deadline, timeoutMs);
      throwIfStopped(deadline, '签名');
      assertCurrentSession(session, getCurrentSession);

      return Object.freeze({
        author: prepared.author,
        signature: verified.signature,
        sessionRevision: session.revision,
        signedTransactionBase64: bytesToBase64(verified.signedBytes),
      });
    } finally {
      if (!walletStarted && signingAttempt === attempt) signingAttempt = null;
      deadline.cleanup();
    }
  }


  function isPreflightRejected(error: unknown): boolean {
    if (!isRecord(error)) return false;
    const message = typeof error.message === 'string' ? error.message : '';
    const code = error.code;
    return (
      (code === -32002 || code === '-32002') &&
      /(simulation failed|preflight|program error|custom program error)/i.test(message)
    );
  }

  function updateReceipt(
    receipt: PublicationReceipt,
    status: PublicationStatus,
  ): PublicationReceipt {
    const next = Object.freeze({ ...receipt, status });
    receiptStore.save(next);
    return next;
  }

  async function submit(
    prepared: PreparedPublication,
    signed: SignedPublication,
    session: WalletSigningSession,
    signal?: AbortSignal,
  ): Promise<PublicationSubmitResult> {
    const deadline = createDeadline(signal, timeoutMs);
    try {
      throwIfStopped(deadline, '提交');
      assertCurrentSession(session, getCurrentSession);
      const verified = await raceWithAbort(
        verifySignedGuestbookTransaction({
          prepared,
          session,
          signedTransaction: base64ToBytes(signed.signedTransactionBase64),
        }),
        deadline.signal,
        '提交校验已取消或超时。',
      );
      if (signed.author !== prepared.author || signed.sessionRevision !== prepared.sessionRevision) {
        throw new Error('签名结果与准备快照不一致。');
      }
      throwIfStopped(deadline, '提交');

      const existing = receiptStore.list();
      const duplicate = existing.find((item) => item.signature === verified.signature);
      if (duplicate !== undefined) {
        return { kind: 'duplicate', signature: verified.signature, receipt: duplicate };
      }
      if (submitInFlight.has(verified.signature)) {
        throw new Error('同一签名正在提交，请勿重复发送。');
      }

      // 在任何异步复核前占住签名槽；否则并发点击可能各自通过检查后重复广播。
      submitInFlight.add(verified.signature);
      try {
        await recheckPreparedState(rpc, prepared, deadline, timeoutMs);
        throwIfStopped(deadline, '提交');
        assertCurrentSession(session, getCurrentSession);
      } catch (error) {
        submitInFlight.delete(verified.signature);
        throw error;
      }

      let receipt: PublicationReceipt = Object.freeze({
        version: RECEIPT_VERSION,
        chain: SOLANA_CHAIN,
        author: prepared.author,
        signature: verified.signature,
        blockhash: prepared.blockhash,
        lastValidBlockHeight: prepared.lastValidBlockHeight.toString(),
        createdAt: now(),
        status: 'submitting',
      });

      try {
        try {
          receiptStore.save(receipt);
        } catch {
          throw new Error('回执保存失败，已中止发送。');
        }

        try {
          throwIfStopped(deadline, '发送前复核');
          assertCurrentSession(session, getCurrentSession);
          await recheckPreparedState(rpc, prepared, deadline, timeoutMs);
          throwIfStopped(deadline, '发送前复核');
          assertCurrentSession(session, getCurrentSession);
        } catch (error) {
          try {
            receipt = updateReceipt(receipt, 'not_sent');
          } catch {
            // 原始仍未发送状态由本地 submitting 回执保留，供恢复时人工判断。
          }
          throw error;
        }

        let sentSignature: string;
        try {
          const sendPromise = Promise.resolve().then(() =>
            rpc
              .sendTransaction(signed.signedTransactionBase64, {
                encoding: 'base64',
                skipPreflight: false,
                preflightCommitment: 'confirmed',
                maxRetries: 2n,
              })
              .send({ abortSignal: deadline.signal }),
          );
          sentSignature = await raceWithAbort(
            sendPromise,
            deadline.signal,
            '发送等待已取消或超时。',
          );
          // 即使 provider 恰在截止后迟到返回，也不能把结果当作本次成功。
          throwIfStopped(deadline, '发送');
        } catch (error) {
          if (isPreflightRejected(error)) {
            try {
              receipt = updateReceipt(receipt, 'preflight_rejected');
            } catch {
              // 保留 submitting，恢复流程仍可查询同一签名。
            }
            return { kind: 'preflight_rejected', signature: verified.signature, receipt };
          }
          // 一旦派发过 send，任何超时/取消/传输错误都只表示不确定，绝不重签或重发。
          try {
            receipt = updateReceipt(receipt, 'uncertain');
          } catch {
            // 保留 submitting，绝不自动重发。
          }
          return { kind: 'uncertain', signature: verified.signature, receipt };
        }

        if (sentSignature !== verified.signature) {
          try {
            receipt = updateReceipt(receipt, 'uncertain');
          } catch {
            // 保留 submitting，等待链上查询。
          }
          return { kind: 'uncertain', signature: verified.signature, receipt };
        }
        return { kind: 'accepted', signature: verified.signature, receipt };
      } finally {
        submitInFlight.delete(verified.signature);
      }
    } finally {
      deadline.cleanup();
    }
  }

  /** 可靠终态在同一原签名回执上结算；写盘失败保留查询结果并显式返回。 */
  function settleCheck(
    check: Omit<PublicationCheck, 'persistence'>,
    receipt: PublicationReceipt,
  ): PublicationCheck {
    const status: PublicationStatus | null =
      check.kind === 'confirmed' || check.kind === 'finalized' || check.kind === 'failed'
        ? check.kind
        : null;
    if (status === null) {
      return { ...check, persistence: { kind: 'not_terminal', receipt } };
    }
    const settled = Object.freeze({ ...receipt, status });
    try {
      receiptStore.save(settled);
      return { ...check, persistence: { kind: 'persisted', receipt: settled } };
    } catch (error) {
      return {
        ...check,
        persistence: {
          kind: 'failed',
          receipt,
          reason: error instanceof Error ? error.message : '回执存储失败。',
        },
      };
    }
  }

  function pendingCheck(
    receipt: PublicationReceipt,
    reason: string,
    confirmationStatus: PublicationCheck['confirmationStatus'] = null,
    err: unknown | null = null,
  ): PublicationCheck {
    return settleCheck(
      {
        kind: 'pending',
        signature: receipt.signature,
        confirmationStatus,
        err,
        reason,
      },
      receipt,
    );
  }

  async function checkWithDeadline(
    receipt: PublicationReceipt,
    deadline: OperationDeadline,
  ): Promise<PublicationCheck> {
    let response: { readonly value: readonly (SignatureStatusResult | null)[] };
    try {
      response = await runWithTimeout(deadline, timeoutMs, '查询交易状态', (signal) =>
        rpc
          .getSignatureStatuses([receipt.signature], { searchTransactionHistory: true })
          .send({ abortSignal: signal }),
      );
    } catch (error) {
      if (error instanceof OperationStopError && error.kind === 'cancelled') throw error;
      const detail = error instanceof Error ? error.message : '未知错误';
      return pendingCheck(
        receipt,
        error instanceof OperationStopError
          ? `${detail}保持待确认。`
          : `查询交易状态失败：${detail}，保持待确认。`,
      );
    }

    const status = response.value[0] ?? null;
    if (status !== null) {
      const rawConfirmationStatus = status.confirmationStatus;
      const confirmationStatus: PublicationCheck['confirmationStatus'] =
        rawConfirmationStatus === 'processed' ||
        rawConfirmationStatus === 'confirmed' ||
        rawConfirmationStatus === 'finalized'
          ? rawConfirmationStatus
          : null;
      // processed 仍可能回滚，不能作为可靠失败或成功结算；未知级别同样保持待确认。
      if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
        if (status.err === null) {
          return settleCheck(
            {
              kind: confirmationStatus,
              signature: receipt.signature,
              confirmationStatus,
              err: null,
              reason: null,
            },
            receipt,
          );
        }
        if (status.err !== undefined && status.err !== null) {
          if (isRecord(status.err)) {
            return settleCheck(
              {
                kind: 'failed',
                signature: receipt.signature,
                confirmationStatus,
                err: status.err,
                reason: '链上交易失败。',
              },
              receipt,
            );
          }
          return pendingCheck(
            receipt,
            '交易已达到确认级别，但 err 字段格式异常，保持待确认。',
            confirmationStatus,
            status.err,
          );
        }
        // 缺失 err 不能伪造成功；保持未结算，等待下一次状态查询。
        return pendingCheck(
          receipt,
          '交易已达到确认级别，但状态缺少明确的 err 字段，保持待确认。',
          confirmationStatus,
        );
      }
      if (status.err !== null && status.err !== undefined) {
        return pendingCheck(
          receipt,
          confirmationStatus === 'processed'
            ? '交易在 processed 级别出现错误，尚未达到确认级别，保持待确认。'
            : '交易状态缺少可用确认级别，保持待确认。',
          confirmationStatus,
          status.err,
        );
      }
      return pendingCheck(receipt, '交易尚未确认，保持待确认。', confirmationStatus);
    }

    let blockHeight: bigint;
    try {
      blockHeight = await runWithTimeout(deadline, timeoutMs, '查询区块高度', (signal) =>
        rpc.getBlockHeight().send({ abortSignal: signal }),
      );
    } catch (error) {
      if (error instanceof OperationStopError && error.kind === 'cancelled') throw error;
      const detail = error instanceof Error ? error.message : '未知错误';
      return pendingCheck(
        receipt,
        error instanceof OperationStopError
          ? `${detail}保持待确认。`
          : `查询区块高度失败：${detail}，保持待确认。`,
      );
    }
    if (blockHeight > BigInt(receipt.lastValidBlockHeight)) {
      return settleCheck(
        {
          kind: 'expired',
          signature: receipt.signature,
          confirmationStatus: null,
          err: null,
          reason: '区块高度已超过该交易的有效高度，未找到交易。',
        },
        receipt,
      );
    }
    return pendingCheck(receipt, '尚未找到交易，blockhash 仍有效。');
  }

  async function check(
    input: PublicationReceipt,
    signal?: AbortSignal,
  ): Promise<PublicationCheck> {
    const receipt = validateReceipt(input);
    const deadline = createDeadline(signal, timeoutMs);
    try {
      return await checkWithDeadline(receipt, deadline);
    } finally {
      deadline.cleanup();
    }
  }

  async function confirm(
    input: PublicationReceipt,
    signal?: AbortSignal,
  ): Promise<ConfirmedPublication> {
    const receipt = validateReceipt(input);
    const deadline = createDeadline(signal, totalTimeoutMs);
    let rounds = 0;
    let last = pendingCheck(receipt, '尚未查询。');
    try {
      while (rounds < maxRounds) {
        rounds += 1;
        last = await checkWithDeadline(receipt, deadline);
        if (
          last.kind === 'confirmed' ||
          last.kind === 'finalized' ||
          last.kind === 'failed' ||
          last.kind === 'expired'
        ) {
          return { ...last, rounds };
        }
        if (deadline.signal.aborted) break;
        if (rounds < maxRounds && intervalMs > 0) {
          try {
            await sleepWithDeadline(intervalMs, deadline, '确认轮询');
          } catch (error) {
            if (error instanceof OperationStopError && error.kind === 'cancelled') throw error;
            break;
          }
        }
      }
      return { ...last, rounds };
    } finally {
      deadline.cleanup();
    }
  }

  async function recover(signal?: AbortSignal): Promise<
    readonly {
      readonly receipt: PublicationReceipt;
      readonly storedStatus: PublicationStatus;
      readonly check: PublicationCheck;
    }[]
  > {
    const receipts = receiptStore.list();
    const deadline = createDeadline(signal, totalTimeoutMs);
    const entries: {
      receipt: PublicationReceipt;
      storedStatus: PublicationStatus;
      check: PublicationCheck;
    }[] = [];
    try {
      for (const receipt of receipts) {
        if (deadline.signal.aborted) {
          if (deadline.callerSignal?.aborted === true) throw deadlineStop(deadline, '恢复');
          // 总截止后尚未查询的回执仍显式保留，不能静默当作终态或凭空成功。
          entries.push({
            receipt,
            storedStatus: receipt.status,
            check: pendingCheck(receipt, '恢复超时，尚未查询。'),
          });
          continue;
        }
        // 只做链上查询与分类；绝不因恢复流程重新签名或广播。
        entries.push({
          receipt,
          storedStatus: receipt.status,
          check: await checkWithDeadline(receipt, deadline),
        });
      }
      return entries;
    } finally {
      deadline.cleanup();
    }
  }

  async function readBack(
    input: PublicationReceipt,
    signal?: AbortSignal,
  ): Promise<PublicationReadBack> {
    const receipt = validateReceipt(input);
    const deadline = createDeadline(signal, timeoutMs);
    try {
      let result: Awaited<ReturnType<typeof historyClient.retrySignatures>>;
      try {
        result = await runWithTimeout(deadline, timeoutMs, '读回链上正文', (requestSignal) =>
          historyClient.retrySignatures(
            [receipt.signature],
            { kind: 'author', author: receipt.author },
            requestSignal,
          ),
        );
      } catch (error) {
        if (error instanceof OperationStopError && error.kind === 'cancelled') throw error;
        return {
          kind: 'unavailable',
          reason: error instanceof Error ? error.message : '读回失败。',
        };
      }
      const message = result.messages.find((item) => item.signature === receipt.signature);
      if (message !== undefined && message.author === receipt.author) {
        return { kind: 'ready', message };
      }
      const unavailable = result.unavailable.find(
        (item) => item.signature === receipt.signature,
      );
      return {
        kind: 'unavailable',
        reason:
          unavailable?.reason ??
          (message === undefined
            ? '链上尚未返回该留言。'
            : '链上返回的留言作者与回执不一致。'),
      };
    } finally {
      deadline.cleanup();
    }
  }

  return { prepare, sign, submit, check, confirm, recover, readBack };
}
