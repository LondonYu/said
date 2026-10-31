import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getU32Encoder,
  getU64Encoder,
  getUtf8Encoder,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type Transaction,
  type TransactionMessage,
} from '@solana/kit';

export const SYSTEM_PROGRAM_ADDRESS = '11111111111111111111111111111111' as Address;
export const MARKER_ADDRESS = 'CDiRbgJmeDfUwAYXuoxbr9gYjKetA1UwsCsVLhzFRgKN' as Address;
export const MEMO_PROGRAM_ADDRESS = 'Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH' as Address;

export const PROTOCOL_APP = 'cyber-guestbook';
export const PROTOCOL_VERSION = 1;
export const PROTOCOL_BOARD = 'public-devnet-v1';

export const TEXT_GRAPHEME_LIMIT = 140;
export const TEXT_BYTES_LIMIT = 560;
// 完整 v0 交易（含签名槽与消息体）的协议上限；超过则拒绝构造，不做后续 RPC。
export const MAX_TRANSACTION_BYTES = 1232;

export type MessageTextValidation =
  | { readonly ok: true; readonly count: number; readonly bytes: number }
  | { readonly ok: false; readonly reason: 'empty' | 'too_many_graphemes' | 'too_many_bytes' };

export type BlockhashLifetime = {
  readonly blockhash: string;
  readonly lastValidBlockHeight: bigint;
};

export type UnsignedGuestbookTransaction = {
  readonly message: TransactionMessage;
  readonly transaction: Transaction;
  readonly wireTransactionBase64: string;
  readonly messageBase64: string;
  readonly sizeBytes: number;
};

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function validateMessageText(text: string): MessageTextValidation {
  if (text.trim().length === 0) return { ok: false, reason: 'empty' };
  const count = [...segmenter.segment(text)].length;
  if (count > TEXT_GRAPHEME_LIMIT) return { ok: false, reason: 'too_many_graphemes' };
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > TEXT_BYTES_LIMIT) return { ok: false, reason: 'too_many_bytes' };
  return { ok: true, count, bytes };
}

export function describeMessageTextError(reason: 'empty' | 'too_many_graphemes' | 'too_many_bytes'): string {
  if (reason === 'empty') return '留言正文不能为空白。';
  if (reason === 'too_many_graphemes') return `留言正文超过 ${TEXT_GRAPHEME_LIMIT} 个字符。`;
  return `留言正文超过 ${TEXT_BYTES_LIMIT} UTF-8 字节。`;
}

export function encodeMessageText(text: string): string {
  // 严格协议字段与顺序；界面名 Said 不改变链上协议。
  return JSON.stringify({ app: PROTOCOL_APP, v: PROTOCOL_VERSION, board: PROTOCOL_BOARD, text });
}

export function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const byte0 = bytes[index]!;
    const byte1 = index + 1 < bytes.length ? bytes[index + 1]! : 0;
    const byte2 = index + 2 < bytes.length ? bytes[index + 2]! : 0;
    result += base64Alphabet[(byte0 >> 2) & 63];
    result += base64Alphabet[((byte0 & 3) << 4) | ((byte1 >> 4) & 15)];
    result += base64Alphabet[((byte1 & 15) << 2) | ((byte2 >> 6) & 3)];
    result += base64Alphabet[byte2 & 63];
  }
  const remainder = bytes.length % 3;
  if (remainder === 1) result = `${result.slice(0, -2)}==`;
  else if (remainder === 2) result = `${result.slice(0, -1)}=`;
  return result;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/=+$/, '');
  const result = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let writeIndex = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const byte0 = base64Alphabet.indexOf(clean[index] ?? '');
    const byte1 = base64Alphabet.indexOf(clean[index + 1] ?? '');
    const byte2 = base64Alphabet.indexOf(clean[index + 2] ?? '');
    const byte3 = base64Alphabet.indexOf(clean[index + 3] ?? '');
    result[writeIndex++] = (byte0 << 2) | (byte1 >> 4);
    if (byte2 >= 0) result[writeIndex++] = (byte1 << 4) | (byte2 >> 2);
    if (byte3 >= 0) result[writeIndex++] = (byte2 << 6) | byte3;
  }
  return result;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return combined;
}

function buildSystemTransferInstruction(feePayer: Address, marker: Address) {
  // System program transfer：u32(2) + u64(0 lamports)，付款者为唯一签名账户。
  const data = concatBytes(
    new Uint8Array(getU32Encoder().encode(2)),
    new Uint8Array(getU64Encoder().encode(0n)),
  );
  return {
    programAddress: address(SYSTEM_PROGRAM_ADDRESS),
    accounts: [
      { address: feePayer, role: AccountRole.WRITABLE_SIGNER },
      { address: marker, role: AccountRole.WRITABLE },
    ],
    data,
  };
}

function buildMemoInstruction(text: string, feePayer: Address) {
  return {
    programAddress: address(MEMO_PROGRAM_ADDRESS),
    accounts: [{ address: feePayer, role: AccountRole.READONLY_SIGNER }],
    data: new Uint8Array(getUtf8Encoder().encode(encodeMessageText(text))),
  };
}

/**
 * 构造 v0 未签名交易。签名槽保留为占位，不创建私钥或临时签名者；
 * 结果仅用于费用检查与 sigVerify=false 的 Devnet 模拟。
 */
export function buildUnsignedGuestbookTransaction({
  feePayer,
  text,
  lifetime,
  maxTransactionBytes = MAX_TRANSACTION_BYTES,
}: {
  feePayer: string;
  text: string;
  lifetime: BlockhashLifetime;
  maxTransactionBytes?: number;
}): UnsignedGuestbookTransaction {
  // 构造边界强制校验，不允许调用方绕过正文规则。
  const validation = validateMessageText(text);
  if (!validation.ok) throw new Error(describeMessageTextError(validation.reason));

  const feePayerAddress = address(feePayer);
  const message = createTransactionMessage({ version: 0 });
  const withFeePayer = setTransactionMessageFeePayer(feePayerAddress, message);
  const withLifetime = setTransactionMessageLifetimeUsingBlockhash(
    { blockhash: lifetime.blockhash as Blockhash, lastValidBlockHeight: lifetime.lastValidBlockHeight },
    withFeePayer,
  );
  const withInstructions = appendTransactionMessageInstructions(
    [
      buildSystemTransferInstruction(feePayerAddress, address(MARKER_ADDRESS)),
      buildMemoInstruction(text, feePayerAddress),
    ],
    withLifetime,
  );
  const transaction = compileTransaction(withInstructions);
  const wireTransactionBase64 = getBase64EncodedWireTransaction(transaction);
  const wireBytes = base64ToBytes(wireTransactionBase64);
  if (wireBytes.length > maxTransactionBytes) {
    throw new Error(`交易大小超过限制（${wireBytes.length} 字节 > ${maxTransactionBytes} 字节）。`);
  }
  const messageBase64 = bytesToBase64(new Uint8Array(transaction.messageBytes));
  return {
    message: withInstructions,
    transaction,
    wireTransactionBase64,
    messageBase64,
    sizeBytes: wireBytes.length,
  };
}
