import { describe, expect, it } from 'vitest';
import { AccountRole } from '@solana/kit';
import {
  COMPUTE_UNIT_LIMIT,
  COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
  MARKER_ADDRESS,
  MEMO_PROGRAM_ADDRESS,
  MAX_TRANSACTION_BYTES,
  SYSTEM_PROGRAM_ADDRESS,
  buildUnsignedGuestbookTransaction,
  encodeMessageText,
  validateMessageText,
  TEXT_BYTES_LIMIT,
  TEXT_GRAPHEME_LIMIT,
} from './message';

const COMPUTE_BUDGET_PROGRAM_ADDRESS = 'ComputeBudget111111111111111111111111111111';

const FEE_PAYER = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const LIFETIME = { blockhash: 'B'.repeat(43), lastValidBlockHeight: 900000n };

describe('留言正文校验', () => {
  it('空白正文失败', () => {
    expect(validateMessageText('   ').ok).toBe(false);
    expect(validateMessageText('').ok).toBe(false);
  });

  it('中文和emoji通过并返回grapheme与字节数', () => {
    const result = validateMessageText('你好 👋');
    expect(result).toEqual({ ok: true, count: 4, bytes: 11 });
  });

  it('孤立高/低代理项被拒绝，合法代理对与 ZWJ 序列通过', () => {
    expect(validateMessageText(String.fromCharCode(0xd800))).toEqual({
      ok: false,
      reason: 'not_well_formed',
    });
    expect(validateMessageText(`abc${String.fromCharCode(0xdc00)}`)).toEqual({
      ok: false,
      reason: 'not_well_formed',
    });
    expect(validateMessageText('👋')).toMatchObject({ ok: true, count: 1, bytes: 4 });
    expect(validateMessageText('👨‍👩‍👧‍👦')).toMatchObject({ ok: true, count: 1 });
  });

  it('140个grapheme恰好通过，超过则失败', () => {
    const boundary = '你'.repeat(TEXT_GRAPHEME_LIMIT);
    expect(validateMessageText(boundary).ok).toBe(true);
    expect(validateMessageText(`${boundary}你`).ok).toBe(false);
  });

  it('ZWJ序列按1个grapheme计数，UTF-8字节超出560时失败', () => {
    const one = '👨‍👩‍👧‍👦';
    const text = one.repeat(TEXT_GRAPHEME_LIMIT);
    const bytes = new TextEncoder().encode(text).length;
    expect(bytes).toBeGreaterThan(TEXT_BYTES_LIMIT);
    expect(validateMessageText(text)).toEqual({ ok: false, reason: 'too_many_bytes' });
  });

  it('协议JSON字段和顺序固定，不修改正文', () => {
    const text = '你好\n第二行';
    const encoded = encodeMessageText(text);
    expect(encoded).toBe(JSON.stringify({ app: 'cyber-guestbook', v: 1, board: 'public-devnet-v1', text }));
    const parsed = JSON.parse(encoded);
    expect(parsed).toEqual({ app: 'cyber-guestbook', v: 1, board: 'public-devnet-v1', text });
  });
});

describe('未签名交易构造', () => {
  it('生成四条指令（预算/价格/零转账/Memo），付款者为唯一占位签名者', () => {
    const unsigned = buildUnsignedGuestbookTransaction({ feePayer: FEE_PAYER, text: '测试', lifetime: LIFETIME });

    expect(unsigned.message.instructions).toHaveLength(4);
    expect(unsigned.message.instructions.map((instruction) => instruction.programAddress)).toEqual([
      COMPUTE_BUDGET_PROGRAM_ADDRESS,
      COMPUTE_BUDGET_PROGRAM_ADDRESS,
      SYSTEM_PROGRAM_ADDRESS,
      MEMO_PROGRAM_ADDRESS,
    ]);

    const limit = unsigned.message.instructions[0]!;
    const limitData = new Uint8Array(limit.data ?? new Uint8Array());
    const limitView = new DataView(limitData.buffer, limitData.byteOffset, limitData.byteLength);
    expect(limit.accounts ?? []).toHaveLength(0);
    expect(limitData).toHaveLength(5);
    expect(limitView.getUint8(0)).toBe(2);
    expect(limitView.getUint32(1, true)).toBe(COMPUTE_UNIT_LIMIT);

    const price = unsigned.message.instructions[1]!;
    const priceData = new Uint8Array(price.data ?? new Uint8Array());
    const priceView = new DataView(priceData.buffer, priceData.byteOffset, priceData.byteLength);
    expect(price.accounts ?? []).toHaveLength(0);
    expect(priceData).toHaveLength(9);
    expect(priceView.getUint8(0)).toBe(3);
    expect(priceView.getBigUint64(1, true)).toBe(COMPUTE_UNIT_PRICE_MICRO_LAMPORTS);

    const signers = Object.keys(unsigned.transaction.signatures);
    expect(signers).toEqual([FEE_PAYER]);
    expect(Object.values(unsigned.transaction.signatures)[0]).toBeNull();
  });

  it('系统指令为0 lamports转账且付款者为写签名账户', () => {
    const unsigned = buildUnsignedGuestbookTransaction({ feePayer: FEE_PAYER, text: '测试', lifetime: LIFETIME });
    const instruction = unsigned.message.instructions[2]!;
    const data = new Uint8Array(instruction.data ?? new Uint8Array());
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(view.getUint32(0, true)).toBe(2);
    expect(view.getBigUint64(4, true)).toBe(0n);
    expect(instruction.accounts).toHaveLength(2);
    expect(instruction.accounts![0]).toMatchObject({ address: FEE_PAYER });
    expect(instruction.accounts![1]!.address).toBe(MARKER_ADDRESS);
  });

  it('Memo指令包含付款作者签名账户，整笔仅一个签名槽', () => {
    const unsigned = buildUnsignedGuestbookTransaction({ feePayer: FEE_PAYER, text: '测试', lifetime: LIFETIME });
    const memo = unsigned.message.instructions[3]!;
    expect(memo.accounts).toHaveLength(1);
    expect(memo.accounts![0]).toMatchObject({ address: FEE_PAYER, role: AccountRole.READONLY_SIGNER });
    expect(Object.keys(unsigned.transaction.signatures)).toEqual([FEE_PAYER]);
    expect(Object.values(unsigned.transaction.signatures)[0]).toBeNull();
  });

  it('Memo指令写入协议JSON且大小与序列化消息一致', () => {
    const text = '中文 emoji 👋';
    const unsigned = buildUnsignedGuestbookTransaction({ feePayer: FEE_PAYER, text, lifetime: LIFETIME });
    const memo = unsigned.message.instructions[3]!;
    const decoded = new TextDecoder().decode(new Uint8Array(memo.data ?? new Uint8Array()));
    expect(JSON.parse(decoded)).toEqual({ app: 'cyber-guestbook', v: 1, board: 'public-devnet-v1', text });

    expect(unsigned.wireTransactionBase64.length).toBeGreaterThan(0);
    expect(unsigned.messageBase64.length).toBeGreaterThan(0);
    expect(unsigned.sizeBytes).toBe(unsigned.transaction.messageBytes.length + 65);
  });

  it('构造入口拒绝孤立代理项且不改写正文', () => {
    const text = String.fromCharCode(0xd800);
    expect(() =>
      buildUnsignedGuestbookTransaction({ feePayer: FEE_PAYER, text, lifetime: LIFETIME }),
    ).toThrow(/Unicode|代理项/);
  });

  it('构造入口拒绝空白、141 grapheme与超560字节正文', () => {
    expect(() => buildUnsignedGuestbookTransaction({ feePayer: FEE_PAYER, text: '   ', lifetime: LIFETIME })).toThrow(/不能为空白/);
    expect(() => buildUnsignedGuestbookTransaction({ feePayer: FEE_PAYER, text: '你'.repeat(141), lifetime: LIFETIME })).toThrow(/超过 140/);
    expect(() => buildUnsignedGuestbookTransaction({ feePayer: FEE_PAYER, text: '👨‍👩‍👧‍👦'.repeat(140), lifetime: LIFETIME })).toThrow(/超过 560/);
  });

  it('完整交易大小有上限防线，超限拒绝构造', () => {
    const unsigned = buildUnsignedGuestbookTransaction({ feePayer: FEE_PAYER, text: '你'.repeat(140), lifetime: LIFETIME });
    expect(unsigned.sizeBytes).toBeLessThanOrEqual(MAX_TRANSACTION_BYTES);
    expect(() =>
      buildUnsignedGuestbookTransaction({ feePayer: FEE_PAYER, text: '你'.repeat(140), lifetime: LIFETIME, maxTransactionBytes: unsigned.sizeBytes - 1 }),
    ).toThrow(/交易大小超过限制/);
  });
});
