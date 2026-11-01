import { describe, expect, it } from 'vitest';
import { getBase58Decoder } from '@solana/kit';
import {
  MARKER_ADDRESS,
  MEMO_PROGRAM_ADDRESS,
  PROTOCOL_APP,
  PROTOCOL_BOARD,
  SYSTEM_PROGRAM_ADDRESS,
} from './message';
import {
  createHistoryClient,
  parseGuestbookTransaction,
  type HistoryRpc,
} from './history';
import { SOLANA_NETWORK_CONFIG } from './network';
import realWallet from './fixtures/real-wallet-transaction.json';

const decoder = getBase58Decoder();
const b58 = (bytes: Uint8Array) => decoder.decode(bytes);
const AUTHOR = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const AUTHOR2 = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const DEVNET_GENESIS_HASH = SOLANA_NETWORK_CONFIG.genesisHash;

function encodeMemo(text: string): string {
  return JSON.stringify({ app: PROTOCOL_APP, v: 1, board: PROTOCOL_BOARD, text });
}

function transferData(): Uint8Array {
  const data = new Uint8Array(12);
  data[0] = 2;
  return data;
}

function memoData(text: string): Uint8Array {
  return new TextEncoder().encode(encodeMemo(text));
}

function signature(fill = 1): string {
  return b58(new Uint8Array(64).fill(fill));
}

function fixture(text = '你好，链上见 🚀', sig = signature(1), author = AUTHOR): any {
  return {
    version: 0,
    slot: 516_639_135,
    blockTime: null,
    meta: { err: null, fee: 80_000 },
    transaction: {
      signatures: [sig],
      message: {
        header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
        accountKeys: [author, MARKER_ADDRESS, SYSTEM_PROGRAM_ADDRESS, MEMO_PROGRAM_ADDRESS],
        recentBlockhash: 'B'.repeat(43),
        instructions: [
          { programIdIndex: 2, accounts: [0, 1], data: b58(transferData()) },
          { programIdIndex: 3, accounts: [0], data: b58(memoData(text)) },
        ],
      },
    },
  };
}

describe('严格解析', () => {
  it('成功解析作者、正文、slot、费用，blockTime允许null', () => {
    const parsed = parseGuestbookTransaction(fixture(), signature(1));
    expect(parsed.kind).toBe('message');
    if (parsed.kind !== 'message') throw new Error('expected message');
    expect(parsed.message.author).toBe(AUTHOR);
    expect(parsed.message.text).toBe('你好，链上见 🚀');
    expect(parsed.message.slot).toBe(516_639_135n);
    expect(parsed.message.feeLamports).toBe(80_000n);
    expect(parsed.message.blockTime).toBeNull();
  });

  it('null与meta缺失属于不可验证，不是明确无效', () => {
    expect(parseGuestbookTransaction(null, signature(1)).kind).toBe('unavailable');
    const noMeta = fixture();
    delete (noMeta as Record<string, unknown>).meta;
    expect(parseGuestbookTransaction(noMeta, signature(1)).kind).toBe('unavailable');
  });

  it('拒绝失败交易、签名不一致、零签名、错误版本与ALT', () => {
    const failed = fixture();
    failed.meta.err = { InstructionError: [0, 'x'] };
    expect(parseGuestbookTransaction(failed, signature(1)).kind).toBe('invalid');

    expect(parseGuestbookTransaction(fixture(), signature(2)).kind).toBe('invalid');
    expect(parseGuestbookTransaction(fixture('x', b58(new Uint8Array(64))), b58(new Uint8Array(64))).kind).toBe('invalid');

    const wrongVersion = { ...fixture(), version: 1 };
    expect(parseGuestbookTransaction(wrongVersion, signature(1)).kind).toBe('invalid');

    const alt = fixture();
    (alt.transaction.message as Record<string, unknown>).addressTableLookups = [{ accountKey: AUTHOR }];
    expect(parseGuestbookTransaction(alt, signature(1)).kind).toBe('invalid');
  });

  it('拒绝错误程序、非零转账、缺少Memo作者签名、错误协议与额外字段', () => {
    const wrongProgram = fixture();
    wrongProgram.transaction.message.instructions[1]!.programIdIndex = 2;
    expect(parseGuestbookTransaction(wrongProgram, signature(1)).kind).toBe('invalid');

    const nonZero = fixture();
    const nonZeroData = new Uint8Array(12);
    nonZeroData[0] = 2;
    nonZeroData[4] = 1;
    nonZero.transaction.message.instructions[0]!.data = b58(nonZeroData);
    expect(parseGuestbookTransaction(nonZero, signature(1)).kind).toBe('invalid');

    const noMemoSigner = fixture();
    noMemoSigner.transaction.message.instructions[1]!.accounts = [];
    expect(parseGuestbookTransaction(noMemoSigner, signature(1)).kind).toBe('invalid');

    const wrongProtocol = fixture();
    wrongProtocol.transaction.message.instructions[1]!.data = b58(
      new TextEncoder().encode(JSON.stringify({ app: 'other', v: 1, board: PROTOCOL_BOARD, text: 'hello' })),
    );
    expect(parseGuestbookTransaction(wrongProtocol, signature(1)).kind).toBe('invalid');

    const extraField = fixture();
    extraField.transaction.message.instructions[1]!.data = b58(
      new TextEncoder().encode(JSON.stringify({ app: PROTOCOL_APP, v: 1, board: PROTOCOL_BOARD, text: 'hello', author: AUTHOR2 })),
    );
    expect(parseGuestbookTransaction(extraField, signature(1)).kind).toBe('invalid');
  });

  it('非法base58/UTF8/JSON与超限文本不崩溃且拒绝', () => {
    const invalidUtf8 = fixture();
    invalidUtf8.transaction.message.instructions[1]!.data = b58(new Uint8Array([255]));
    expect(parseGuestbookTransaction(invalidUtf8, signature(1)).kind).toBe('invalid');

    const invalidJson = fixture();
    invalidJson.transaction.message.instructions[1]!.data = b58(new TextEncoder().encode('{broken'));
    expect(parseGuestbookTransaction(invalidJson, signature(1)).kind).toBe('invalid');

    const tooLong = fixture('你'.repeat(141));
    expect(parseGuestbookTransaction(tooLong, signature(1)).kind).toBe('invalid');
  });
});

function createFakeHistoryRpc(options: {
  rows?: readonly unknown[];
  transactions?: Map<string, unknown>;
  genesis?: string;
  listError?: Error;
  transactionDelayMs?: number;
  transactionDelays?: Map<string, number>;
  genesisDelayMs?: number;
  listDelayMs?: number;
} = {}) {
  const rows = options.rows ?? [];
  const transactions = options.transactions ?? new Map<string, unknown>();
  const calls = { genesis: 0, list: 0, transactions: [] as string[] };
  let active = 0;
  let maxActive = 0;
  const rpc: HistoryRpc = {
    getGenesisHash: () => ({
      send: async () => {
        calls.genesis += 1;
        if (options.genesisDelayMs) await new Promise((resolve) => setTimeout(resolve, options.genesisDelayMs));
        return options.genesis ?? DEVNET_GENESIS_HASH;
      },
    }),
    getSignaturesForAddress: () => ({
      send: async () => {
        calls.list += 1;
        if (options.listDelayMs) await new Promise((resolve) => setTimeout(resolve, options.listDelayMs));
        if (options.listError) throw options.listError;
        return rows;
      },
    }),
    getTransaction: (signature) => ({
      send: async () => {
        calls.transactions.push(signature);
        active += 1;
        maxActive = Math.max(maxActive, active);
        const delay = options.transactionDelays?.get(signature) ?? options.transactionDelayMs ?? 0;
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        active -= 1;
        const value = transactions.get(signature);
        if (value instanceof Error) throw value;
        return value ?? null;
      },
    }),
  };
  return { rpc, calls, maxActive: () => maxActive };
}

describe('读取客户端', () => {
  it('readPage按RPC顺序返回公共留言，游标取原始尾签名', async () => {
    const sigA = signature(1);
    const sigB = signature(2);
    const rows = [{ signature: sigA, err: null }, { signature: sigB, err: null }];
    const transactions = new Map<string, unknown>([
      [sigA, fixture('A', sigA)],
      [sigB, fixture('B', sigB)],
    ]);
    const { rpc, calls } = createFakeHistoryRpc({ rows, transactions });
    const client = createHistoryClient(rpc);

    const result = await client.readPage({ kind: 'board' }, null);

    expect(calls.genesis).toBe(1);
    expect(calls.list).toBe(1);
    expect(result.messages.map((message) => message.text)).toEqual(['A', 'B']);
    expect(result.scanned).toBe(2);
    expect(result.nextCursor).toBe(sigB);
    expect(result.sourceExhausted).toBe(false);
  });

  it('同文不同签名是不同留言，不合并', async () => {
    const sigA = signature(1);
    const sigB = signature(2);
    const rows = [{ signature: sigA, err: null }, { signature: sigB, err: null }];
    const transactions = new Map<string, unknown>([
      [sigA, fixture('一样', sigA)],
      [sigB, fixture('一样', sigB)],
    ]);
    const client = createHistoryClient(createFakeHistoryRpc({ rows, transactions }).rpc);
    const result = await client.readPage({ kind: 'board' }, null);
    expect(result.messages).toHaveLength(2);
  });

  it('null交易进入unavailable，显式重试可恢复且不超过20个唯一签名', async () => {
    const sigA = signature(1);
    const rows = [{ signature: sigA, err: null }];
    const transactions = new Map<string, unknown>([[sigA, null]]);
    const { rpc } = createFakeHistoryRpc({ rows, transactions });
    const client = createHistoryClient(rpc);

    const first = await client.readPage({ kind: 'board' }, null);
    expect(first.messages).toHaveLength(0);
    expect(first.unavailable).toEqual([{ signature: sigA, reason: 'transaction-null' }]);

    transactions.set(sigA, fixture('恢复', sigA));
    const retried = await client.retrySignatures([sigA], { kind: 'board' });
    expect(retried.messages.map((message) => message.text)).toEqual(['恢复']);
    expect(retried.scanned).toBe(1);
  });

  it('签名列表RPC失败不伪装成空页', async () => {
    const client = createHistoryClient(createFakeHistoryRpc({ listError: new Error('429') }).rpc);
    await expect(client.readPage({ kind: 'board' }, null)).rejects.toThrow(/签名列表失败：429/);
  });

  it('非法作者地址在RPC前拒绝', async () => {
    const { rpc, calls } = createFakeHistoryRpc();
    const client = createHistoryClient(rpc);
    await expect(client.readPage({ kind: 'author', author: 'not-an-address' }, null)).rejects.toThrow(/作者地址格式无效/);
    expect(calls.genesis).toBe(0);
  });

  it('作者范围只保留请求作者的留言', async () => {
    const sigA = signature(1);
    const sigB = signature(2);
    const rows = [{ signature: sigA, err: null }, { signature: sigB, err: null }];
    const transactions = new Map<string, unknown>([
      [sigA, fixture('作者A', sigA, AUTHOR)],
      [sigB, fixture('作者B', sigB, AUTHOR2)],
    ]);
    const client = createHistoryClient(createFakeHistoryRpc({ rows, transactions }).rpc);
    const result = await client.readPage({ kind: 'author', author: AUTHOR }, null);
    expect(result.messages.map((message) => message.author)).toEqual([AUTHOR]);
    expect(result.filtered).toBe(1);
  });

  it('全无效页游标仍前进，不调用交易详情', async () => {
    const sigA = signature(1);
    const rows = [{ signature: sigA, err: { InstructionError: [0, 'x'] } }];
    const { rpc, calls } = createFakeHistoryRpc({ rows });
    const client = createHistoryClient(rpc);
    const result = await client.readPage({ kind: 'board' }, null);
    expect(result.messages).toHaveLength(0);
    expect(result.filtered).toBe(1);
    expect(result.nextCursor).toBe(sigA);
    expect(calls.transactions).toHaveLength(0);
  });

  it('空候选页标记sourceExhausted', async () => {
    const client = createHistoryClient(createFakeHistoryRpc({ rows: [] }).rpc);
    const result = await client.readPage({ kind: 'board' }, null);
    expect(result.sourceExhausted).toBe(true);
    expect(result.nextCursor).toBeNull();
  });

  it('交易详情并发不超过2', async () => {
    const sigs = [1, 2, 3, 4, 5].map((fill) => signature(fill));
    const rows = sigs.map((sig) => ({ signature: sig, err: null }));
    const transactions = new Map(sigs.map((sig) => [sig, fixture(`msg-${sig}`, sig)]));
    const { rpc, maxActive } = createFakeHistoryRpc({ rows, transactions, transactionDelayMs: 10 });
    const client = createHistoryClient(rpc);
    await client.readPage({ kind: 'board' }, null);
    expect(maxActive()).toBeLessThanOrEqual(2);
  });
});

describe('阶段0真实公开夹具', () => {
  it('真实Phantom交易带ComputeBudget仍能解析作者、正文与费用', async () => {
    const raw = realWallet as any;
    const expectedSignature = raw.transaction.signatures[0] as string;
    const parsed = parseGuestbookTransaction(raw, expectedSignature);
    expect(parsed.kind).toBe('message');
    if (parsed.kind !== 'message') throw new Error('expected message');
    expect(parsed.message.author).toBe('Hs1NxWYZdXE6opzTY1wR9XCbq2QtNwrGdkWgSMeWk31S');
    expect(parsed.message.text).toBe('阶段0验证：你好，Solana 🚀');
    expect(parsed.message.feeLamports).toBe(80_000n);
  });
});

describe('R1 取消/超时与单笔失败隔离', () => {
  it('调用前已取消时零RPC拒绝', async () => {
    const caller = new AbortController();
    caller.abort();
    const { rpc, calls } = createFakeHistoryRpc({ rows: [] });
    const client = createHistoryClient(rpc);
    await expect(client.readPage({ kind: 'board' }, null, caller.signal)).rejects.toThrow(/操作已取消/);
    expect(calls.genesis).toBe(0);
    expect(calls.list).toBe(0);
  });

  it('详情阶段调用方取消不返回迟到成功', async () => {
    const sigA = signature(1);
    const sigB = signature(2);
    const rows = [{ signature: sigA, err: null }, { signature: sigB, err: null }];
    const transactions = new Map<string, unknown>([
      [sigA, fixture('A', sigA)],
      [sigB, fixture('B', sigB)],
    ]);
    const { rpc } = createFakeHistoryRpc({ rows, transactions, transactionDelays: new Map([[sigA, 50], [sigB, 50]]) });
    const client = createHistoryClient(rpc);
    const caller = new AbortController();
    const pending = client.readPage({ kind: 'board' }, null, caller.signal, 2);
    setTimeout(() => caller.abort(), 10);
    await expect(pending).rejects.toThrow(/已取消或超时/);
  });

  it('详情阶段整操作超时不返回迟到成功', async () => {
    const sigA = signature(1);
    const rows = [{ signature: sigA, err: null }];
    const transactions = new Map<string, unknown>([[sigA, fixture('A', sigA)]]);
    const { rpc } = createFakeHistoryRpc({ rows, transactions, transactionDelays: new Map([[sigA, 50]]) });
    const client = createHistoryClient(rpc, { operationTimeoutMs: 20, rpcTimeoutMs: 1000 });
    await expect(client.readPage({ kind: 'board' }, null)).rejects.toThrow(/已取消或超时/);
  });

  it('单笔详情超时保留其他有效消息并进入不可得', async () => {
    const sigA = signature(1);
    const sigB = signature(2);
    const rows = [{ signature: sigA, err: null }, { signature: sigB, err: null }];
    const transactions = new Map<string, unknown>([
      [sigA, fixture('A', sigA)],
      [sigB, fixture('B', sigB)],
    ]);
    const { rpc } = createFakeHistoryRpc({ rows, transactions, transactionDelays: new Map([[sigA, 0], [sigB, 50]]) });
    const client = createHistoryClient(rpc, { rpcTimeoutMs: 10 });
    const result = await client.readPage({ kind: 'board' }, null);
    expect(result.messages.map((message) => message.text)).toEqual(['A']);
    expect(result.unavailable).toEqual([{ signature: sigB, reason: '交易读取超时，可重试。' }]);
  });

  it('重试入口取消同样终止', async () => {
    const sigA = signature(1);
    const transactions = new Map<string, unknown>([[sigA, fixture('A', sigA)]]);
    const { rpc } = createFakeHistoryRpc({ transactions, transactionDelays: new Map([[sigA, 50]]) });
    const client = createHistoryClient(rpc);
    const caller = new AbortController();
    const pending = client.retrySignatures([sigA], { kind: 'board' }, caller.signal);
    setTimeout(() => caller.abort(), 10);
    await expect(pending).rejects.toThrow(/已取消或超时/);
  });
});

describe('R2 畸形数据不崩溃且分类', () => {
  it('非法base58签名/预算/System/Memo数据返回invalid不throw', () => {
    const badSignature = fixture();
    badSignature.transaction.signatures = ['!notbase58'];
    expect(parseGuestbookTransaction(badSignature, '!notbase58').kind).toBe('invalid');

    for (const instructionIndex of [0, 1]) {
      const badData = fixture();
      badData.transaction.message.instructions[instructionIndex]!.data = '!';
      expect(parseGuestbookTransaction(badData, signature(1)).kind).toBe('invalid');
    }

    const badBudget = structuredClone(realWallet as any);
    badBudget.transaction.message.instructions[0].data = '!';
    expect(parseGuestbookTransaction(badBudget, badBudget.transaction.signatures[0]).kind).toBe('invalid');
  });

  it('header/索引/ALT/负bigint/孤立代理项被拒绝', () => {
    const noHeaderCount = fixture();
    delete noHeaderCount.transaction.message.header.numReadonlyUnsignedAccounts;
    expect(parseGuestbookTransaction(noHeaderCount, signature(1)).kind).toBe('invalid');

    const badProgramIndex = fixture();
    badProgramIndex.transaction.message.instructions[0]!.programIdIndex = '2';
    expect(parseGuestbookTransaction(badProgramIndex, signature(1)).kind).toBe('invalid');

    const altObject = fixture();
    altObject.transaction.message.addressTableLookups = {};
    expect(parseGuestbookTransaction(altObject, signature(1)).kind).toBe('invalid');

    const negativeSlot = fixture();
    negativeSlot.slot = -1n;
    expect(parseGuestbookTransaction(negativeSlot, signature(1)).kind).toBe('invalid');

    const loneSurrogate = fixture();
    loneSurrogate.transaction.message.instructions[1]!.data = b58(
      new TextEncoder().encode(JSON.stringify({ app: PROTOCOL_APP, v: 1, board: PROTOCOL_BOARD, text: '\uD800' })),
    );
    expect(parseGuestbookTransaction(loneSurrogate, signature(1)).kind).toBe('invalid');
  });

  it('同页混入畸形条目仍返回有效消息', async () => {
    const sigA = signature(1);
    const sigB = signature(2);
    const rows = [{ signature: sigA, err: null }, { signature: sigB, err: null }];
    const bad = fixture('bad', sigB);
    bad.transaction.message.instructions[1]!.data = '!';
    const transactions = new Map<string, unknown>([
      [sigA, fixture('好', sigA)],
      [sigB, bad],
    ]);
    const client = createHistoryClient(createFakeHistoryRpc({ rows, transactions }).rpc);
    const result = await client.readPage({ kind: 'board' }, null);
    expect(result.messages.map((message) => message.text)).toEqual(['好']);
    expect(result.filtered).toBe(1);
  });
});


describe('R3 游标/预算/列表防线', () => {
  it('超量响应在详情前失败', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({ signature: signature(index + 1), err: null }));
    const { rpc, calls } = createFakeHistoryRpc({ rows });
    const client = createHistoryClient(rpc);
    await expect(client.readPage({ kind: 'board' }, null, new AbortController().signal, 1)).rejects.toThrow(/超过请求上限/);
    expect(calls.transactions).toHaveLength(0);
  });

  it('before==nextCursor无进展报错', async () => {
    const sigA = signature(1);
    const rows = [{ signature: sigA, err: null }];
    const client = createHistoryClient(createFakeHistoryRpc({ rows }).rpc);
    await expect(client.readPage({ kind: 'board' }, sigA, new AbortController().signal, 1)).rejects.toThrow(/游标无进展/);
  });

  it('无效候选行不静默消失', async () => {
    const rows = [{ signature: 'not-a-signature', err: null }];
    const client = createHistoryClient(createFakeHistoryRpc({ rows }).rpc);
    await expect(client.readPage({ kind: 'board' }, null)).rejects.toThrow(/无效候选签名/);
  });

  it('重试签名超过20个拒绝且零RPC', async () => {
    const signatures = Array.from({ length: 21 }, (_, index) => signature(index + 1));
    const { rpc, calls } = createFakeHistoryRpc();
    const client = createHistoryClient(rpc);
    await expect(client.retrySignatures(signatures, { kind: 'board' })).rejects.toThrow(/最多支持 20/);
    expect(calls.genesis).toBe(0);
  });
});


describe('二审剩余边界', () => {
  it('genesis阶段单RPC超时后迟到成功被拒绝', async () => {
    const sigA = signature(1);
    const rows = [{ signature: sigA, err: null }];
    const transactions = new Map<string, unknown>([[sigA, fixture('A', sigA)]]);
    const { rpc, calls } = createFakeHistoryRpc({ rows, transactions, genesisDelayMs: 30 });
    const client = createHistoryClient(rpc, { rpcTimeoutMs: 5, operationTimeoutMs: 500 });
    await expect(client.readPage({ kind: 'board' }, null)).rejects.toThrow(/网络校验超时/);
    expect(calls.list).toBe(0);
    expect(calls.transactions).toHaveLength(0);
  });

  it('列表阶段单RPC超时后迟到成功被拒绝', async () => {
    const sigA = signature(1);
    const rows = [{ signature: sigA, err: null }];
    const transactions = new Map<string, unknown>([[sigA, fixture('A', sigA)]]);
    const { rpc, calls } = createFakeHistoryRpc({ rows, transactions, listDelayMs: 30 });
    const client = createHistoryClient(rpc, { rpcTimeoutMs: 5, operationTimeoutMs: 500 });
    await expect(client.readPage({ kind: 'board' }, null)).rejects.toThrow(/签名列表超时/);
    expect(calls.transactions).toHaveLength(0);
  });

  it('genesis中取消后不派发列表或详情', async () => {
    const sigA = signature(1);
    const rows = [{ signature: sigA, err: null }];
    const transactions = new Map<string, unknown>([[sigA, fixture('A', sigA)]]);
    const { rpc, calls } = createFakeHistoryRpc({ rows, transactions, genesisDelayMs: 50 });
    const client = createHistoryClient(rpc);
    const caller = new AbortController();
    const pending = client.readPage({ kind: 'board' }, null, caller.signal);
    setTimeout(() => caller.abort(), 10);
    await expect(pending).rejects.toThrow(/已取消或超时/);
    expect(calls.list).toBe(0);
    expect(calls.transactions).toHaveLength(0);
  });

  it('header只读账户计数越界被拒绝', () => {
    const outOfRange = fixture();
    outOfRange.transaction.message.header.numReadonlyUnsignedAccounts = 999;
    expect(parseGuestbookTransaction(outOfRange, signature(1)).kind).toBe('invalid');
  });

  it('零转账标记账户落入只读区域被拒绝', () => {
    const markerReadonly = fixture();
    markerReadonly.transaction.message.header.numReadonlyUnsignedAccounts = markerReadonly.transaction.message.accountKeys.length - 1;
    expect(parseGuestbookTransaction(markerReadonly, signature(1)).kind).toBe('invalid');
  });

  it('原始页[A,B,A]的游标取原始尾A，且去重后只读一次详情', async () => {
    const sigA = signature(1);
    const sigB = signature(2);
    const rows = [
      { signature: sigA, err: null },
      { signature: sigB, err: null },
      { signature: sigA, err: null },
    ];
    const transactions = new Map<string, unknown>([
      [sigA, fixture('A', sigA)],
      [sigB, fixture('B', sigB)],
    ]);
    const { rpc, calls } = createFakeHistoryRpc({ rows, transactions });
    const client = createHistoryClient(rpc);
    const result = await client.readPage({ kind: 'board' }, null);
    expect(result.nextCursor).toBe(sigA);
    expect(result.messages.map((message) => message.signature)).toEqual([sigA, sigB]);
    expect(calls.transactions.filter((sig) => sig === sigA)).toHaveLength(1);
  });

  it('before等于原始尾A时[A,B,A]无进展报错', async () => {
    const sigA = signature(1);
    const sigB = signature(2);
    const rows = [
      { signature: sigA, err: null },
      { signature: sigB, err: null },
      { signature: sigA, err: null },
    ];
    const transactions = new Map<string, unknown>([
      [sigA, fixture('A', sigA)],
      [sigB, fixture('B', sigB)],
    ]);
    const client = createHistoryClient(createFakeHistoryRpc({ rows, transactions }).rpc);
    await expect(client.readPage({ kind: 'board' }, sigA)).rejects.toThrow(/游标无进展/);
  });
});
