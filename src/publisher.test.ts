import { describe, expect, it, vi } from 'vitest';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import {
  getBase58Decoder,
  getTransactionDecoder,
  getTransactionEncoder,
} from '@solana/kit';
import {
  createWalletController,
  type WalletRegistry,
  type WalletSigningSession,
} from './wallet';
import { buildUnsignedGuestbookTransaction } from './message';
import type { GuestbookMessage } from './history';
import type { SimulationCheckResult } from './simulation';
import { SOLANA_CHAIN, SOLANA_NETWORK_CONFIG } from './network';
import {
  PUBLICATION_RECEIPT_STORAGE_KEY,
  createBrowserPublicationReceiptStore,
  createPublisher,
  verifySignedGuestbookTransaction,
  type PreparedPublication,
  type PublicationReceipt,
  type PublicationReceiptStore,
  type PublisherRpc,
} from './publisher';

const BLOCKHASH = getBase58Decoder().decode(new Uint8Array(32).fill(9));
const LAST_VALID_BLOCK_HEIGHT = 900_000n;
const CURRENT_BLOCK_HEIGHT = 899_990n;
const NOW = 1_700_000_000_000;
const DEVNET_CHAIN = SOLANA_CHAIN;
const DEVNET_GENESIS_HASH = SOLANA_NETWORK_CONFIG.genesisHash;

type TestSigner = {
  readonly keyPair: CryptoKeyPair;
  readonly address: string;
  readonly publicKey: Uint8Array;
};

type SignInput = {
  readonly account: WalletAccount;
  readonly chain: string;
  readonly transaction: Uint8Array;
};

type SignOutput = { readonly signedTransaction: Uint8Array };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function createSigner(): Promise<TestSigner> {
  const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
  return { keyPair, publicKey, address: getBase58Decoder().decode(publicKey) };
}

async function signWire(
  signer: TestSigner,
  unsignedWire: Uint8Array,
  options: Readonly<{ author?: string; allZero?: boolean; trailing?: boolean }> = {},
): Promise<Uint8Array> {
  const transaction = getTransactionDecoder().decode(unsignedWire);
  const signature = options.allZero
    ? new Uint8Array(64)
    : new Uint8Array(
        await crypto.subtle.sign(
          'Ed25519',
          signer.keyPair.privateKey,
          new Uint8Array(transaction.messageBytes),
        ),
      );
  const encoded = new Uint8Array(
    getTransactionEncoder().encode({
      ...transaction,
      signatures: { [options.author ?? signer.address]: signature } as unknown as typeof transaction.signatures,
    }),
  );
  if (!options.trailing) return encoded;
  const withTrailing = new Uint8Array(encoded.length + 1);
  withTrailing.set(encoded);
  withTrailing[encoded.length] = 7;
  return withTrailing;
}

type SignatureStatusFixture = {
  readonly confirmationStatus: 'processed' | 'confirmed' | 'finalized' | null;
  readonly err?: unknown;
  readonly confirmations?: bigint | null;
  readonly slot?: bigint;
};

function createFakeRpc(options: {
  fee?: bigint | null;
  balance?: bigint;
  blockHeight?: bigint;
  genesisHash?: string;
  send?: (input: { wire: string; config: unknown; signal: AbortSignal }) => Promise<string>;
  statuses?: () => Promise<readonly (SignatureStatusFixture | null)[]>;
} = {}) {
  const events: string[] = [];
  const sendPayloads: string[] = [];
  const sendConfigs: unknown[] = [];
  const statusCalls: { signatures: readonly string[]; config: unknown }[] = [];
  const blockHeight = options.blockHeight ?? CURRENT_BLOCK_HEIGHT;
  const fee = options.fee === undefined ? 5_000n : options.fee;
  const balance = options.balance ?? 1_000_000n;
  const statusImpl =
    options.statuses ?? (async () => [{ confirmationStatus: 'confirmed' as const, err: null }]);

  const rpc: PublisherRpc = {
    getGenesisHash: () => ({
      send: async () => options.genesisHash ?? DEVNET_GENESIS_HASH,
    }),
    getBlockHeight: () => ({ send: async () => blockHeight }),
    getFeeForMessage: () => ({ send: async () => ({ value: fee }) }),
    getBalance: () => ({ send: async () => ({ value: balance }) }),
    sendTransaction: (wire, config) => ({
      send: async ({ abortSignal } = {}) => {
        events.push('rpc:send');
        sendPayloads.push(wire);
        sendConfigs.push(config);
        if (options.send === undefined) {
          const decoded = getTransactionDecoder().decode(decodeWireBase64(wire));
          const signature = Object.values(decoded.signatures)[0];
          if (signature == null) throw new Error('test wire unsigned');
          return getBase58Decoder().decode(signature);
        }
        return options.send({
          wire,
          config,
          signal: abortSignal ?? new AbortController().signal,
        });
      },
    }),
    getSignatureStatuses: (signatures, config) => ({
      send: async () => {
        events.push('rpc:status');
        statusCalls.push({ signatures, config });
        return { value: await statusImpl() };
      },
    }),
  };

  return { rpc, events, sendPayloads, sendConfigs, statusCalls };
}

function createMemoryReceiptStore(
  initial: readonly PublicationReceipt[] = [],
  options: Readonly<{ onSave?: (receipt: PublicationReceipt) => void; fail?: boolean }> = {},
) {
  let receipts = [...initial];
  const events: string[] = [];
  const store: PublicationReceiptStore = {
    save(receipt) {
      events.push('receipt:save');
      options.onSave?.(receipt);
      if (options.fail) throw new Error('quota exceeded');
      receipts = [...receipts.filter((item) => item.signature !== receipt.signature), receipt];
    },
    list: () => [...receipts],
  };
  return { store, events, get receipts() { return receipts; } };
}


type FixtureOptions = {
  fee?: bigint | null;
  balance?: bigint;
  blockHeight?: bigint;
  genesisHash?: string;
  send?: (input: { wire: string; config: unknown; signal: AbortSignal }) => Promise<string>;
  statuses?: () => Promise<readonly (SignatureStatusFixture | null)[]>;
  simulationOverride?: Partial<SimulationCheckResult>;
  onSimulation?: () => void;
  receiptStore?: PublicationReceiptStore;
  timeoutMs?: number;
  confirmTotalTimeoutMs?: number;
  confirmIntervalMs?: number;
  confirmMaxRounds?: number;
};

async function createFixture(options: FixtureOptions = {}) {
  const signer = await createSigner();
  const account: WalletAccount = {
    address: signer.address,
    publicKey: signer.publicKey,
    chains: [DEVNET_CHAIN],
    features: ['solana:signTransaction'],
  };
  let signBehavior: (inputs: readonly SignInput[]) => Promise<readonly SignOutput[]> = async (
    inputs,
  ) => [{ signedTransaction: await signWire(signer, new Uint8Array(inputs[0]!.transaction)) }];
  const signCalls: SignInput[][] = [];
  type WalletChangeProperties = {
    readonly accounts?: readonly WalletAccount[];
    readonly chains?: Wallet['chains'];
    readonly features?: Wallet['features'];
  };
  const listeners = new Set<(properties: WalletChangeProperties) => void>();
  const wallet: Wallet = {
    version: '1.0.0',
    name: 'Injected Test Wallet',
    icon: 'data:image/svg+xml;base64,AA==',
    chains: [DEVNET_CHAIN],
    accounts: [account],
    features: {
      'standard:connect': {
        version: '1.0.0',
        connect: async () => ({ accounts: [account] }),
      },
      'standard:events': {
        version: '1.0.0',
        on: (_event: string, listener: (properties: WalletChangeProperties) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      'solana:signTransaction': {
        version: '1.0.0',
        supportedTransactionVersions: [0],
        signTransaction: async (...inputs: SignInput[]) => {
          signCalls.push(inputs);
          return signBehavior(inputs);
        },
      },
    },
  };
  const registry: WalletRegistry = {
    get: () => [wallet],
    on: () => () => {},
  };
  const controller = createWalletController(registry);
  await controller.connect(wallet);
  const session = controller.getSigningSession();
  if (session === null) {
    controller.dispose();
    throw new Error('测试钱包会话创建失败。');
  }
  let current: WalletSigningSession | null = session;
  const rpc = createFakeRpc(options);
  const memoryReceipts = options.receiptStore === undefined ? createMemoryReceiptStore() : null;
  const receipts = options.receiptStore ?? memoryReceipts!.store;
  const retrySignatures = vi.fn();
  const simulationCalls = { count: 0 };
  let lastSimulationResult: SimulationCheckResult | null = null;
  const simulation = {
    checkTransaction: async ({
      feePayer,
      text,
      signal,
    }: {
      feePayer: string;
      text: string;
      signal: AbortSignal;
    }): Promise<SimulationCheckResult> => {
      if (signal.aborted) throw new Error('模拟已取消。');
      simulationCalls.count += 1;
      const unsigned = buildUnsignedGuestbookTransaction({
        feePayer,
        text,
        lifetime: { blockhash: BLOCKHASH, lastValidBlockHeight: LAST_VALID_BLOCK_HEIGHT },
      });
      options.onSimulation?.();
      lastSimulationResult = {
        feePayer,
        text,
        balanceLamports: options.balance ?? 1_000_000n,
        feeLamports: options.fee === undefined ? 5_000n : options.fee,
        transactionSizeBytes: unsigned.sizeBytes,
        blockhash: BLOCKHASH,
        lastValidBlockHeight: LAST_VALID_BLOCK_HEIGHT,
        blockHeight: options.blockHeight ?? CURRENT_BLOCK_HEIGHT,
        simulationErr: null,
        simulationLogs: [],
        simulationUnitsConsumed: null,
        blockhashExpired: false,
        wireTransactionBase64: unsigned.wireTransactionBase64,
        messageBase64: unsigned.messageBase64,
        ...options.simulationOverride,
      };
      return lastSimulationResult;
    },
  };
  const publisher = createPublisher({
    simulationClient: simulation,
    rpc: rpc.rpc,
    receiptStore: receipts,
    historyClient: { retrySignatures },
    getCurrentSession: () => current,
    timeoutMs: options.timeoutMs ?? 50,
    confirm: {
      maxRounds: options.confirmMaxRounds ?? 2,
      intervalMs: options.confirmIntervalMs ?? 0,
      totalTimeoutMs: options.confirmTotalTimeoutMs ?? 1_000,
    },
    now: () => NOW,
  });
  return {
    signer,
    account,
    wallet,
    controller,
    session,
    publisher,
    rpc,
    simulation,
    simulationCalls,
    receipts,
    retrySignatures,
    signCalls,
    get lastSimulationResult() {
      return lastSimulationResult;
    },
    get receiptEvents() {
      return memoryReceipts?.events ?? [];
    },
    get receiptEntries() {
      return memoryReceipts?.receipts ?? receipts.list();
    },
    setCurrent(next: WalletSigningSession | null) {
      current = next;
    },
    setSignBehavior(next: (inputs: readonly SignInput[]) => Promise<readonly SignOutput[]>) {
      signBehavior = next;
    },
    emitWalletChange(properties: WalletChangeProperties) {
      for (const listener of [...listeners]) listener(properties);
      // 与页面一致：发布核心每次读取当前会话，能力撤销后必须立即失效。
      current = controller.getSigningSession();
    },
  };
}

function receiptFor(overrides: Partial<PublicationReceipt> = {}): PublicationReceipt {
  return {
    version: 1,
    chain: DEVNET_CHAIN,
    author: getBase58Decoder().decode(new Uint8Array(32).fill(3)),
    signature: getBase58Decoder().decode(new Uint8Array(64).fill(4)),
    blockhash: getBase58Decoder().decode(new Uint8Array(32).fill(5)),
    lastValidBlockHeight: LAST_VALID_BLOCK_HEIGHT.toString(),
    createdAt: NOW,
    status: 'uncertain',
    ...overrides,
  };
}

function createFakeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    storage: {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
    },
  };
}


function decodeWireBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function looksLikeSignature(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(value);
}

describe('2.2A 准备：真实费用、模拟与不可变待签字节', () => {
  it('保留模拟同一笔未签名交易的字节、费用和高度摘要', async () => {
    const fixture = await createFixture();
    const prepared = await fixture.publisher.prepare({
      session: fixture.session,
      text: '链上你好',
    });

    expect(prepared.author).toBe(fixture.signer.address);
    expect(prepared.walletName).toBe(fixture.wallet.name);
    expect(prepared.sessionRevision).toBe(fixture.session.revision);
    expect(prepared.feeLamports).toBe(5_000n);
    expect(prepared.balanceLamports).toBe(1_000_000n);
    expect(prepared.blockhash).toBe(BLOCKHASH);
    expect(prepared.lastValidBlockHeight).toBe(LAST_VALID_BLOCK_HEIGHT);
    expect(prepared.unsignedTransactionBase64).toBe(
      fixture.lastSimulationResult?.wireTransactionBase64,
    );
    expect(prepared.messageBase64).toBe(fixture.lastSimulationResult?.messageBase64);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);

    fixture.controller.dispose();
  });

  it('准备入口拒绝孤立 Unicode 代理项，且在模拟前零 RPC', async () => {
    for (const text of [String.fromCharCode(0xd800), `合法${String.fromCharCode(0xdc00)}`]) {
      const fixture = await createFixture();
      await expect(
        fixture.publisher.prepare({ session: fixture.session, text }),
      ).rejects.toThrow(/Unicode|代理项/);
      expect(fixture.simulationCalls.count).toBe(0);
      expect(fixture.rpc.sendPayloads).toHaveLength(0);
      fixture.controller.dispose();
    }
  });

  it('合法代理对、emoji 与 ZWJ 序列可正常准备', async () => {
    const fixture = await createFixture();
    const text = '👨‍👩‍👧‍👦 👋 你好';
    const prepared = await fixture.publisher.prepare({ session: fixture.session, text });

    expect(prepared.text).toBe(text);
    expect(fixture.simulationCalls.count).toBe(1);
    fixture.controller.dispose();
  });

  it.each([
    ['费用未知', { feeLamports: null }],
    ['余额不足', { balanceLamports: 4_999n, feeLamports: 5_000n }],
    ['模拟程序错误', { simulationErr: { InstructionError: [0, 'Custom'] } }],
    ['blockhash 过期', { blockhashExpired: true }],
    ['摘要高度缺失', { blockHeight: null }],
    ['高度已超过有效高度', { blockHeight: LAST_VALID_BLOCK_HEIGHT + 1n }],
    ['付款者不一致', { feePayer: getBase58Decoder().decode(new Uint8Array(32).fill(6)) }],
    ['待签字节缺失', { wireTransactionBase64: '' }],
    ['消息字节缺失', { messageBase64: '' }],
  ])('拒绝进入签名的准备结果：%s', async (_label, override) => {
    const fixture = await createFixture({
      simulationOverride: override as Partial<SimulationCheckResult>,
    });

    await expect(
      fixture.publisher.prepare({ session: fixture.session, text: '不能签' }),
    ).rejects.toThrow();

    expect(fixture.signCalls).toHaveLength(0);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('模拟返回的待签字节与摘要不一致时拒绝', async () => {
    const signer = await createSigner();
    const tampered = buildUnsignedGuestbookTransaction({
      feePayer: signer.address,
      text: '篡改',
      lifetime: { blockhash: BLOCKHASH, lastValidBlockHeight: LAST_VALID_BLOCK_HEIGHT },
    });
    const fixture = await createFixture({
      simulationOverride: {
        feePayer: signer.address,
        wireTransactionBase64: tampered.wireTransactionBase64,
        messageBase64: tampered.messageBase64,
      },
    });

    await expect(
      fixture.publisher.prepare({ session: fixture.session, text: '原始' }),
    ).rejects.toThrow(/字节|消息|不一致/);
    expect(fixture.signCalls).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('模拟期间会话已失效时不返回可签名对象', async () => {
    let fixture: Awaited<ReturnType<typeof createFixture>> | null = null;
    fixture = await createFixture({
      onSimulation: () => fixture?.setCurrent(null),
    });

    await expect(
      fixture.publisher.prepare({ session: fixture.session, text: '会话变化' }),
    ).rejects.toThrow(/会话|连接/);
    expect(fixture.signCalls).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('伪造的准备对象不能通过签名校验', async () => {
    const fixture = await createFixture();
    const fakePrepared = {
      version: 1,
      chain: DEVNET_CHAIN,
      sessionRevision: fixture.session.revision,
      walletName: fixture.wallet.name,
      author: fixture.signer.address,
      text: '伪造',
      feeLamports: 5_000n,
      balanceLamports: 1_000_000n,
      blockhash: BLOCKHASH,
      lastValidBlockHeight: LAST_VALID_BLOCK_HEIGHT,
      transactionSizeBytes: 200,
      unsignedTransactionBase64: '',
      messageBase64: '',
      checkedAt: NOW,
    } satisfies PreparedPublication;
    const unsigned = buildUnsignedGuestbookTransaction({
      feePayer: fixture.signer.address,
      text: '伪造',
      lifetime: { blockhash: BLOCKHASH, lastValidBlockHeight: LAST_VALID_BLOCK_HEIGHT },
    });
    const signed = await signWire(fixture.signer, decodeWireBase64(unsigned.wireTransactionBase64));

    await expect(
      verifySignedGuestbookTransaction({
        prepared: fakePrepared,
        session: fixture.session,
        signedTransaction: signed,
      }),
    ).rejects.toThrow(/准备|快照/);
    fixture.controller.dispose();
  });

  it('准备快照的数值或 blockhash 被篡改时不调用钱包', async () => {
    const fixture = await createFixture();
    const prepared = await fixture.publisher.prepare({ session: fixture.session, text: '数值篡改' });
    const variants: readonly (readonly [string, Record<string, unknown>])[] = [
      ['有效高度不是 bigint', { lastValidBlockHeight: '0' }],
      ['费用为负', { feeLamports: -1n }],
      ['交易长度不是整数', { transactionSizeBytes: 1.5 }],
      ['blockhash 不是 32 字节', { blockhash: '0' }],
    ];

    for (const [, patch] of variants) {
      const tampered = { ...prepared, ...patch } as unknown as PreparedPublication;
      await expect(fixture.publisher.sign(tampered, fixture.session)).rejects.toThrow(/准备快照/);
    }
    expect(fixture.signCalls).toHaveLength(0);
    fixture.controller.dispose();
  });
});

describe('2.2A 签名返回：严格解码、唯一签名槽与真实 Ed25519 验签', () => {
  async function prepare(fixture: Awaited<ReturnType<typeof createFixture>>, text = '签名测试') {
    return fixture.publisher.prepare({ session: fixture.session, text });
  }

  it('注入钱包的真实签名通过本地 Ed25519 验签，且签名阶段不发送', async () => {
    const fixture = await createFixture();
    const prepared = await prepare(fixture);
    const signed = await fixture.publisher.sign(prepared, fixture.session);

    expect(looksLikeSignature(signed.signature)).toBe(true);
    expect(signed.author).toBe(fixture.signer.address);
    expect(signed.sessionRevision).toBe(fixture.session.revision);
    expect(fixture.signCalls).toHaveLength(1);
    expect(fixture.signCalls[0]![0]!.chain).toBe(DEVNET_CHAIN);
    expect(fixture.signCalls[0]![0]!.account.address).toBe(fixture.signer.address);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('待签交易消息被换掉时拒绝', async () => {
    const fixture = await createFixture();
    const prepared = await prepare(fixture);
    const other = buildUnsignedGuestbookTransaction({
      feePayer: fixture.signer.address,
      text: '另一条留言',
      lifetime: { blockhash: BLOCKHASH, lastValidBlockHeight: LAST_VALID_BLOCK_HEIGHT },
    });
    const signed = await signWire(fixture.signer, decodeWireBase64(other.wireTransactionBase64));

    await expect(
      verifySignedGuestbookTransaction({
        prepared,
        session: fixture.session,
        signedTransaction: signed,
      }),
    ).rejects.toThrow(/消息|交易|不一致/);
    fixture.controller.dispose();
  });

  it('签名来自另一把私钥时真实验签失败', async () => {
    const fixture = await createFixture();
    const prepared = await prepare(fixture);
    const otherSigner = await createSigner();
    const signed = await signWire(
      otherSigner,
      decodeWireBase64(prepared.unsignedTransactionBase64),
      { author: fixture.signer.address },
    );

    await expect(
      verifySignedGuestbookTransaction({
        prepared,
        session: fixture.session,
        signedTransaction: signed,
      }),
    ).rejects.toThrow(/签名校验|验签/);
    fixture.controller.dispose();
  });

  it.each([
    ['全零签名', async (fixture: Awaited<ReturnType<typeof createFixture>>, prepared: PreparedPublication) =>
      signWire(fixture.signer, decodeWireBase64(prepared.unsignedTransactionBase64), {
        allZero: true,
      })],
    ['尾随额外字节', async (fixture: Awaited<ReturnType<typeof createFixture>>, prepared: PreparedPublication) =>
      signWire(fixture.signer, decodeWireBase64(prepared.unsignedTransactionBase64), {
        trailing: true,
      })],
    ['非 Uint8Array', async () => 'not-bytes'],
    ['超长字节', async () => new Uint8Array(1_233)],
  ])('拒绝异常签名输出：%s', async (_label, build) => {
    const fixture = await createFixture();
    const prepared = await prepare(fixture);
    const signedTransaction = await build(fixture, prepared);

    await expect(
      verifySignedGuestbookTransaction({
        prepared,
        session: fixture.session,
        signedTransaction,
      }),
    ).rejects.toThrow();
    fixture.controller.dispose();
  });

  it('钱包返回零条或两条输出均拒绝', async () => {
    const fixture = await createFixture();
    const prepared = await prepare(fixture);
    const valid = await signWire(fixture.signer, decodeWireBase64(prepared.unsignedTransactionBase64));

    fixture.setSignBehavior(async () => []);
    await expect(fixture.publisher.sign(prepared, fixture.session)).rejects.toThrow(/输出/);

    fixture.setSignBehavior(async () => [
      { signedTransaction: valid },
      { signedTransaction: valid },
    ]);
    await expect(fixture.publisher.sign(prepared, fixture.session)).rejects.toThrow(/输出/);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });



  it('连点时只允许一个钱包签名请求在途', async () => {
    const fixture = await createFixture();
    const prepared = await prepare(fixture);
    const gate = deferred<readonly SignOutput[]>();
    fixture.setSignBehavior(() => gate.promise);

    const first = fixture.publisher.sign(prepared, fixture.session);
    await vi.waitFor(() => expect(fixture.signCalls).toHaveLength(1), { interval: 1 });
    await expect(fixture.publisher.sign(prepared, fixture.session)).rejects.toThrow(
      /钱包处理|已有签名请求/,
    );
    expect(fixture.signCalls).toHaveLength(1);

    gate.resolve([
      {
        signedTransaction: await signWire(
          fixture.signer,
          decodeWireBase64(prepared.unsignedTransactionBase64),
        ),
      },
    ]);
    await expect(first).resolves.toMatchObject({ author: fixture.signer.address });
    fixture.controller.dispose();
  });

  it('同一帧连点在首次 RPC 复核前就被同步签名锁挡住', async () => {
    const fixture = await createFixture({ timeoutMs: 500 });
    const prepared = await prepare(fixture);
    const genesis = deferred<string>();
    let genesisCalls = 0;
    fixture.rpc.rpc.getGenesisHash = () => ({
      send: async () => {
        genesisCalls += 1;
        return genesisCalls === 1 ? genesis.promise : DEVNET_GENESIS_HASH;
      },
    });

    const first = fixture.publisher.sign(prepared, fixture.session);
    const second = fixture.publisher.sign(prepared, fixture.session);

    await expect(second).rejects.toThrow(/钱包处理|已有签名请求/);
    expect(fixture.signCalls).toHaveLength(0);
    genesis.resolve(DEVNET_GENESIS_HASH);
    await expect(first).resolves.toMatchObject({ author: fixture.signer.address });
    expect(fixture.signCalls).toHaveLength(1);
    fixture.controller.dispose();
  });

  it('签名前置复核失败后释放锁，可重新签名', async () => {
    const fixture = await createFixture({ timeoutMs: 500 });
    const prepared = await prepare(fixture);
    let genesisCalls = 0;
    fixture.rpc.rpc.getGenesisHash = () => ({
      send: async () => {
        genesisCalls += 1;
        return genesisCalls === 1 ? '11111111111111111111111111111111' : DEVNET_GENESIS_HASH;
      },
    });

    await expect(fixture.publisher.sign(prepared, fixture.session)).rejects.toThrow(
      /网络|Devnet/,
    );
    await expect(fixture.publisher.sign(prepared, fixture.session)).resolves.toBeDefined();
    expect(fixture.signCalls).toHaveLength(1);
    fixture.controller.dispose();
  });

  it('钱包等待期间能力被撤销，迟到签名不进入可提交状态', async () => {
    const fixture = await createFixture({ timeoutMs: 500 });
    const prepared = await prepare(fixture);
    const gate = deferred<readonly SignOutput[]>();
    fixture.setSignBehavior(() => gate.promise);
    const pending = fixture.publisher.sign(prepared, fixture.session);
    await vi.waitFor(() => expect(fixture.signCalls).toHaveLength(1), { interval: 1 });

    const feature = fixture.wallet.features['solana:signTransaction'] as {
      readonly version: string;
      readonly supportedTransactionVersions: readonly (0 | 'legacy')[];
      signTransaction: (...inputs: readonly SignInput[]) => Promise<readonly SignOutput[]>;
    };
    const invalidFeatures = {
      ...fixture.wallet.features,
      'solana:signTransaction': { ...feature, version: '2.0.0' },
    };
    (fixture.wallet as { features: Wallet['features'] }).features = invalidFeatures;
    fixture.emitWalletChange({ features: invalidFeatures });
    gate.resolve([
      {
        signedTransaction: await signWire(
          fixture.signer,
          decodeWireBase64(prepared.unsignedTransactionBase64),
        ),
      },
    ]);

    await expect(pending).rejects.toThrow(/会话|连接|1\.0\.0|版本/);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('发过一致 features 事件后静默撤销能力，迟到签名不广播', async () => {
    const fixture = await createFixture({ timeoutMs: 500 });
    const initialSession = fixture.controller.getSigningSession();
    expect(initialSession).not.toBeNull();
    const currentFeature = fixture.wallet.features['solana:signTransaction'] as {
      readonly version: string;
      readonly supportedTransactionVersions: readonly (0 | 'legacy')[];
      signTransaction: (...inputs: readonly SignInput[]) => Promise<readonly SignOutput[]>;
    };
    const replacementFeatures = {
      ...fixture.wallet.features,
      'solana:signTransaction': { ...currentFeature },
    };
    (fixture.wallet as { features: Wallet['features'] }).features = replacementFeatures;
    fixture.emitWalletChange({ features: replacementFeatures });
    const session = fixture.controller.getSigningSession();
    expect(session).not.toBeNull();
    expect(session).not.toBe(initialSession);

    const prepared = await fixture.publisher.prepare({
      session: session!,
      text: '事件后静默撤销',
    });
    const gate = deferred<readonly SignOutput[]>();
    fixture.setSignBehavior(() => gate.promise);
    const pending = fixture.publisher.sign(prepared, session!);
    await vi.waitFor(() => expect(fixture.signCalls).toHaveLength(1), { interval: 1 });

    const revokedFeatures = { ...fixture.wallet.features };
    delete (revokedFeatures as Record<string, unknown>)['solana:signTransaction'];
    (fixture.wallet as { features: Wallet['features'] }).features = revokedFeatures;
    // 页面每次签名阶段都重新读取控制器；这里模拟同样的实时核验。
    fixture.setCurrent(fixture.controller.getSigningSession());
    gate.resolve([
      {
        signedTransaction: await signWire(
          fixture.signer,
          decodeWireBase64(prepared.unsignedTransactionBase64),
        ),
      },
    ]);

    await expect(pending).rejects.toThrow(/会话|连接|签名能力/);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('签名等待期间同账户原地撤销特性并发账户事件时迟到结果不广播', async () => {
    const fixture = await createFixture({ timeoutMs: 500 });
    const prepared = await fixture.publisher.prepare({
      session: fixture.session,
      text: '账户能力撤销',
    });
    const gate = deferred<readonly SignOutput[]>();
    fixture.setSignBehavior(() => gate.promise);
    const pending = fixture.publisher.sign(prepared, fixture.session);
    await vi.waitFor(() => expect(fixture.signCalls).toHaveLength(1), { interval: 1 });

    (fixture.account as unknown as { features: string[] }).features.length = 0;
    fixture.emitWalletChange({ accounts: [fixture.account] });
    gate.resolve([
      {
        signedTransaction: await signWire(
          fixture.signer,
          decodeWireBase64(prepared.unsignedTransactionBase64),
        ),
      },
    ]);

    await expect(pending).rejects.toThrow(/会话|连接|签名能力/);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('页面取消等待后不发送，钱包迟到结果被丢弃且不并发弹窗', async () => {
    const fixture = await createFixture();
    const prepared = await prepare(fixture);
    const lateSigned = await signWire(
      fixture.signer,
      decodeWireBase64(prepared.unsignedTransactionBase64),
    );
    const gate = deferred<readonly SignOutput[]>();
    fixture.setSignBehavior(() => gate.promise);
    const controller = new AbortController();

    const pending = fixture.publisher.sign(prepared, fixture.session, controller.signal);
    await vi.waitFor(() => expect(fixture.signCalls).toHaveLength(1), { interval: 1 });
    controller.abort();
    await expect(pending).rejects.toThrow(/取消/);

    await expect(fixture.publisher.sign(prepared, fixture.session)).rejects.toThrow(
      /钱包处理|签名请求/,
    );
    gate.resolve([{ signedTransaction: lateSigned }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    fixture.setSignBehavior(async (inputs) => [
      { signedTransaction: await signWire(fixture.signer, new Uint8Array(inputs[0]!.transaction)) },
    ]);
    await expect(fixture.publisher.sign(prepared, fixture.session)).resolves.toBeDefined();
    expect(fixture.signCalls).toHaveLength(2);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('钱包返回后会话变化，签名结果不进入可提交状态', async () => {
    const fixture = await createFixture();
    const prepared = await prepare(fixture);
    fixture.setSignBehavior(async (inputs) => {
      fixture.setCurrent(null);
      return [
        {
          signedTransaction: await signWire(
            fixture.signer,
            new Uint8Array(inputs[0]!.transaction),
          ),
        },
      ];
    });

    await expect(fixture.publisher.sign(prepared, fixture.session)).rejects.toThrow(/会话|连接/);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('签名前重新核对费用，费用变化时不调用钱包', async () => {
    const fixture = await createFixture();
    const prepared = await prepare(fixture);
    fixture.rpc.rpc.getFeeForMessage = () => ({ send: async () => ({ value: 6_000n }) });

    await expect(fixture.publisher.sign(prepared, fixture.session)).rejects.toThrow(
      /费用|重新准备/,
    );
    expect(fixture.signCalls).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('签名前网络不是 Devnet 时不调用钱包', async () => {
    const fixture = await createFixture({ genesisHash: '11111111111111111111111111111111' });
    const prepared = await prepare(fixture);

    await expect(fixture.publisher.sign(prepared, fixture.session)).rejects.toThrow(
      /网络|Devnet|重新准备/,
    );
    expect(fixture.signCalls).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('钱包返回后原 blockhash 已过期时丢弃签名且不发送', async () => {
    const fixture = await createFixture();
    const prepared = await prepare(fixture);
    const valid = await signWire(fixture.signer, decodeWireBase64(prepared.unsignedTransactionBase64));
    let height = CURRENT_BLOCK_HEIGHT;
    fixture.rpc.rpc.getBlockHeight = () => ({ send: async () => height });
    const gate = deferred<readonly SignOutput[]>();
    fixture.setSignBehavior(() => gate.promise);

    const pending = fixture.publisher.sign(prepared, fixture.session);
    await vi.waitFor(() => expect(fixture.signCalls).toHaveLength(1), { interval: 1 });
    height = LAST_VALID_BLOCK_HEIGHT + 1n;
    gate.resolve([{ signedTransaction: valid }]);

    await expect(pending).rejects.toThrow(/过期|重新准备/);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('伪造准备对象的孤立代理项在签名入口被拒绝且不调用钱包', async () => {
    const fixture = await createFixture();
    const prepared = await prepare(fixture);
    const tampered = { ...prepared, text: String.fromCharCode(0xd800) };

    await expect(fixture.publisher.sign(tampered, fixture.session)).rejects.toThrow(
      /正文|Unicode|代理项/,
    );
    expect(fixture.signCalls).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('签名前会话已失效时不调用钱包', async () => {
    const fixture = await createFixture();
    const prepared = await prepare(fixture);
    fixture.setCurrent(null);

    await expect(fixture.publisher.sign(prepared, fixture.session)).rejects.toThrow(/会话|连接/);
    expect(fixture.signCalls).toHaveLength(0);
    fixture.controller.dispose();
  });
});

describe('2.2A 提交：回执先行、单次发送与不确定结果', () => {
  async function prepareAndSign(fixture: Awaited<ReturnType<typeof createFixture>>) {
    const prepared = await fixture.publisher.prepare({ session: fixture.session, text: '提交测试' });
    const signed = await fixture.publisher.sign(prepared, fixture.session);
    return { prepared, signed };
  }

  it('回执先落盘再发送，单次广播且只保留最小字段', async () => {
    const fixture = await createFixture();
    const { prepared, signed } = await prepareAndSign(fixture);
    const result = await fixture.publisher.submit(prepared, signed, fixture.session);

    expect(result.kind).toBe('accepted');
    expect(fixture.rpc.sendPayloads).toHaveLength(1);
    expect(fixture.rpc.sendConfigs[0]).toEqual({
      encoding: 'base64',
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 2n,
    });
    expect(fixture.receiptEvents).toEqual(['receipt:save']);
    expect(fixture.rpc.events).toEqual(['rpc:send']);
    const [receipt] = fixture.receiptEntries;
    expect(receipt).toMatchObject({
      version: 1,
      chain: DEVNET_CHAIN,
      author: fixture.signer.address,
      signature: signed.signature,
      blockhash: BLOCKHASH,
      lastValidBlockHeight: LAST_VALID_BLOCK_HEIGHT.toString(),
      createdAt: NOW,
      status: 'submitting',
    });
    expect(Object.keys(receipt!).sort()).toEqual(
      [
        'author',
        'blockhash',
        'chain',
        'createdAt',
        'lastValidBlockHeight',
        'signature',
        'status',
        'version',
      ].sort(),
    );
    expect(JSON.stringify(receipt)).not.toContain('提交测试');
    expect(JSON.stringify(receipt)).not.toContain(prepared.unsignedTransactionBase64);
    fixture.controller.dispose();
  });

  it('回执写入失败时不调用发送', async () => {
    const failing = createMemoryReceiptStore([], { fail: true });
    const fixture = await createFixture({ receiptStore: failing.store });
    const { prepared, signed } = await prepareAndSign(fixture);

    await expect(fixture.publisher.submit(prepared, signed, fixture.session)).rejects.toThrow(
      /回执|写入|quota/,
    );
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('同一签名重复提交不会重复广播', async () => {
    const fixture = await createFixture();
    const { prepared, signed } = await prepareAndSign(fixture);
    const first = await fixture.publisher.submit(prepared, signed, fixture.session);
    const second = await fixture.publisher.submit(prepared, signed, fixture.session);

    expect(first.kind).toBe('accepted');
    expect(second.kind).toBe('duplicate');
    expect(fixture.rpc.sendPayloads).toHaveLength(1);
    fixture.controller.dispose();
  });

  it('并发提交同一签名只广播一次', async () => {
    const fixture = await createFixture();
    const { prepared, signed } = await prepareAndSign(fixture);
    const original = fixture.rpc.rpc.getFeeForMessage;
    const entered = deferred<void>();
    const release = deferred<void>();
    let held = false;
    fixture.rpc.rpc.getFeeForMessage = (message, config) => ({
      send: async (options?: Readonly<{ abortSignal?: AbortSignal }>) => {
        if (!held) {
          held = true;
          entered.resolve();
          await release.promise;
        }
        return original(message, config).send(options);
      },
    });

    const first = fixture.publisher.submit(prepared, signed, fixture.session);
    await entered.promise;
    await expect(fixture.publisher.submit(prepared, signed, fixture.session)).rejects.toThrow(
      /正在提交|重复发送/,
    );
    release.resolve();

    await expect(first).resolves.toMatchObject({ kind: 'accepted' });
    expect(fixture.rpc.sendPayloads).toHaveLength(1);
    fixture.controller.dispose();
  });

  it('广播前费用变化时拒绝且不发送', async () => {
    const fixture = await createFixture();
    const { prepared, signed } = await prepareAndSign(fixture);
    fixture.rpc.rpc.getFeeForMessage = () => ({ send: async () => ({ value: 6_000n }) });

    await expect(fixture.publisher.submit(prepared, signed, fixture.session)).rejects.toThrow(
      /费用|重新准备/,
    );
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    expect(fixture.receiptEvents).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('回执落盘后会话失效则不广播并标为未发送', async () => {
    let fixture!: Awaited<ReturnType<typeof createFixture>>;
    const memory = createMemoryReceiptStore([], {
      onSave: () => fixture.setCurrent(null),
    });
    fixture = await createFixture({ receiptStore: memory.store });
    const { prepared, signed } = await prepareAndSign(fixture);

    await expect(fixture.publisher.submit(prepared, signed, fixture.session)).rejects.toThrow(
      /会话|连接|未发送/,
    );
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    expect(memory.receipts[0]!.status).toBe('not_sent');
    fixture.controller.dispose();
  });

  it('发送响应丢失或 HTTP 取消保持原签名并标为不确定', async () => {
    const fixture = await createFixture({
      send: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('socket closed')), {
            once: true,
          });
        }),
    });
    const prepared = await fixture.publisher.prepare({ session: fixture.session, text: '提交测试' });
    const signed = await fixture.publisher.sign(prepared, fixture.session);
    const controller = new AbortController();
    const pending = fixture.publisher.submit(
      prepared,
      signed,
      fixture.session,
      controller.signal,
    );
    await vi.waitFor(() => expect(fixture.rpc.sendPayloads).toHaveLength(1));
    controller.abort();

    const result = await pending;
    expect(result.kind).toBe('uncertain');
    const [receipt] = fixture.receiptEntries;
    expect(receipt!.signature).toBe(signed.signature);
    expect(receipt!.status).toBe('uncertain');
    expect(fixture.rpc.sendPayloads).toHaveLength(1);
    fixture.controller.dispose();
  });

  it('RPC 返回不同签名时不覆盖本地原签名', async () => {
    const otherSignature = getBase58Decoder().decode(new Uint8Array(64).fill(7));
    const fixture = await createFixture({ send: async () => otherSignature });
    const prepared = await fixture.publisher.prepare({ session: fixture.session, text: '提交测试' });
    const signed = await fixture.publisher.sign(prepared, fixture.session);
    const result = await fixture.publisher.submit(prepared, signed, fixture.session);

    expect(result.kind).toBe('uncertain');
    expect(fixture.receiptEntries[0]!.signature).toBe(signed.signature);
    expect(fixture.receiptEntries[0]!.signature).not.toBe(otherSignature);
    expect(fixture.receiptEntries[0]!.status).toBe('uncertain');
    fixture.controller.dispose();
  });

  it('明确预检拒绝单独标为失败而非待确认', async () => {
    const fixture = await createFixture({
      send: async () => {
        throw { code: -32002, message: 'Transaction simulation failed: custom program error' };
      },
    });
    const prepared = await fixture.publisher.prepare({ session: fixture.session, text: '提交测试' });
    const signed = await fixture.publisher.sign(prepared, fixture.session);
    const result = await fixture.publisher.submit(prepared, signed, fixture.session);

    expect(result.kind).toBe('preflight_rejected');
    expect(fixture.receiptEntries[0]!.status).toBe('preflight_rejected');
    expect(fixture.rpc.sendPayloads).toHaveLength(1);
    fixture.controller.dispose();
  });

  it('无法可靠分类的传输错误保守保持待确认，不自动重试', async () => {
    const fixture = await createFixture({
      send: async () => {
        throw new Error('RPC 503');
      },
    });
    const prepared = await fixture.publisher.prepare({ session: fixture.session, text: '提交测试' });
    const signed = await fixture.publisher.sign(prepared, fixture.session);
    const result = await fixture.publisher.submit(prepared, signed, fixture.session);

    expect(result.kind).toBe('uncertain');
    expect(fixture.receiptEntries[0]!.status).toBe('uncertain');
    expect(fixture.rpc.sendPayloads).toHaveLength(1);
    fixture.controller.dispose();
  });
});


describe('2.2A 确认、恢复与读回：有界、无钱包、无重发', () => {
  it('损坏回执在查询、确认或读回前被显式拒绝', async () => {
    const fixture = await createFixture();
    const corrupted = {
      ...receiptFor(),
      signature: 'not-a-signature',
    } as unknown as PublicationReceipt;

    await expect(fixture.publisher.check(corrupted)).rejects.toThrow(/回执存储损坏/);
    await expect(fixture.publisher.confirm(corrupted)).rejects.toThrow(/回执存储损坏/);
    await expect(fixture.publisher.readBack(corrupted)).rejects.toThrow(/回执存储损坏/);
    expect(fixture.rpc.statusCalls).toHaveLength(0);
    expect(fixture.retrySignatures).not.toHaveBeenCalled();
    fixture.controller.dispose();
  });

  it('processed 和空状态都不提升为已确认，查询只按原签名', async () => {
    let queryCount = 0;
    const fixture = await createFixture({
      statuses: async () => [
        queryCount++ === 0 ? { confirmationStatus: 'processed', err: null } : null,
      ],
    });
    const receipt = receiptFor();
    const first = await fixture.publisher.check(receipt);
    const second = await fixture.publisher.check(receipt);

    expect(first.kind).toBe('pending');
    expect(first.confirmationStatus).toBe('processed');
    expect(second.kind).toBe('pending');
    expect(second.confirmationStatus).toBeNull();
    expect(fixture.rpc.statusCalls[0]!.signatures).toEqual([receipt.signature]);
    expect(fixture.rpc.statusCalls[0]!.config).toMatchObject({
      searchTransactionHistory: true,
    });
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('confirmed/finalized 成功与确认后错误分开', async () => {
    const confirmed = await createFixture({
      statuses: async () => [
        { confirmationStatus: 'confirmed', err: null, slot: 1n, confirmations: 1n },
      ],
    });
    const finalized = await createFixture({
      statuses: async () => [
        { confirmationStatus: 'finalized', err: null, slot: 2n, confirmations: null },
      ],
    });
    const failed = await createFixture({
      statuses: async () => [
        {
          confirmationStatus: 'confirmed',
          err: { InstructionError: [1, { Custom: 1 }] },
          slot: 3n,
          confirmations: 1n,
        },
      ],
    });

    expect((await confirmed.publisher.check(receiptFor())).kind).toBe('confirmed');
    expect((await finalized.publisher.check(receiptFor())).kind).toBe('finalized');
    const failedResult = await failed.publisher.check(receiptFor());
    expect(failedResult.kind).toBe('failed');
    expect(failedResult.err).not.toBeNull();
    confirmed.controller.dispose();
    finalized.controller.dispose();
    failed.controller.dispose();
  });

  it('未查到状态且高度超过有效高度时标为已过期但保留原签名', async () => {
    const fixture = await createFixture({
      blockHeight: LAST_VALID_BLOCK_HEIGHT + 1n,
      statuses: async () => [null],
    });
    const receipt = receiptFor();
    const result = await fixture.publisher.check(receipt);

    expect(result.kind).toBe('expired');
    expect(result.signature).toBe(receipt.signature);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('429/超时保持待确认并给出原因，不伪造成功', async () => {
    const fixture = await createFixture({
      statuses: async () => {
        throw new Error('429 Too Many Requests');
      },
    });
    const result = await fixture.publisher.check(receiptFor());

    expect(result.kind).toBe('pending');
    expect(result.reason).toMatch(/429|查询/);
    fixture.controller.dispose();
  });

  it('confirm 有界轮询并在上限内保持待确认', async () => {
    const fixture = await createFixture({
      statuses: async () => [null],
    });
    const receipt = receiptFor();
    const result = await fixture.publisher.confirm(receipt);

    expect(result.kind).toBe('pending');
    expect(result.rounds).toBe(2);
    expect(fixture.rpc.statusCalls.length).toBeLessThanOrEqual(2);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('刷新恢复只查原回执，不需要钱包，也不信任存储中的成功标记', async () => {
    const storedConfirmed = receiptFor({ status: 'confirmed' });
    const storedUncertain = receiptFor({
      signature: getBase58Decoder().decode(new Uint8Array(64).fill(8)),
      status: 'uncertain',
    });
    const memory = createMemoryReceiptStore([storedConfirmed, storedUncertain]);
    const fixture = await createFixture({
      receiptStore: memory.store,
      statuses: async () => [null],
    });
    fixture.setCurrent(null);

    const entries = await fixture.publisher.recover();

    expect(entries).toHaveLength(2);
    expect(entries[0]!.storedStatus).toBe('confirmed');
    expect(entries[0]!.check.kind).toBe('pending');
    expect(entries[1]!.storedStatus).toBe('uncertain');
    expect(fixture.rpc.statusCalls).toHaveLength(2);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    expect(fixture.signCalls).toHaveLength(0);
    expect(fixture.retrySignatures).not.toHaveBeenCalled();
    fixture.controller.dispose();
  });

  it('确认后按原签名读回链上正文，并核对作者', async () => {
    const fixture = await createFixture();
    const receipt = receiptFor();
    const message: GuestbookMessage = {
      signature: receipt.signature,
      author: receipt.author,
      text: '链上真实正文',
      slot: 12n,
      blockTime: null,
      feeLamports: 5_000n,
    };
    fixture.retrySignatures.mockResolvedValue({
      scope: 'author',
      author: receipt.author,
      messages: [message],
      scanned: 1,
      filtered: 0,
      unavailable: [],
      nextCursor: null,
      sourceExhausted: true,
    });

    const result = await fixture.publisher.readBack(receipt);

    expect(result).toEqual({ kind: 'ready', message });
    expect(fixture.retrySignatures).toHaveBeenCalledWith(
      [receipt.signature],
      { kind: 'author', author: receipt.author },
      expect.any(AbortSignal),
    );
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('读回暂不可用时显式返回 unavailable，不伪造留言', async () => {
    const fixture = await createFixture();
    const receipt = receiptFor();
    fixture.retrySignatures.mockResolvedValue({
      scope: 'author',
      author: receipt.author,
      messages: [],
      scanned: 1,
      filtered: 0,
      unavailable: [{ signature: receipt.signature, reason: 'transaction-null' }],
      nextCursor: null,
      sourceExhausted: true,
    });

    const result = await fixture.publisher.readBack(receipt);

    expect(result.kind).toBe('unavailable');
    fixture.controller.dispose();
  });
});

describe('2.2A 截止与取消：可中止路径不吞取消、超时绝不重发', () => {
  it('准备入口预取消时零模拟零 RPC', async () => {
    const fixture = await createFixture();
    const controller = new AbortController();
    controller.abort();

    await expect(
      fixture.publisher.prepare({ session: fixture.session, text: '取消测试' }, controller.signal),
    ).rejects.toThrow(/取消/);
    expect(fixture.simulationCalls.count).toBe(0);
    expect(fixture.rpc.events).toHaveLength(0);
    fixture.controller.dispose();
  });

  it.each(['genesis', 'height', 'fee', 'balance'])(
    '签名前置复核在 %s 阶段取消时立即停止且不调用钱包',
    async (stage) => {
      const fixture = await createFixture({ timeoutMs: 500 });
      const prepared = await fixture.publisher.prepare({
        session: fixture.session,
        text: '取消测试',
      });
      const entered = deferred<void>();
      const gate = deferred<void>();
      const calls: string[] = [];
      const hold = async (name: string) => {
        calls.push(name);
        if (name === stage) {
          entered.resolve();
          await gate.promise;
        }
      };
      fixture.rpc.rpc.getGenesisHash = () => ({
        send: async () => {
          await hold('genesis');
          return DEVNET_GENESIS_HASH;
        },
      });
      fixture.rpc.rpc.getBlockHeight = () => ({
        send: async () => {
          await hold('height');
          return CURRENT_BLOCK_HEIGHT;
        },
      });
      fixture.rpc.rpc.getFeeForMessage = () => ({
        send: async () => {
          await hold('fee');
          return { value: 5_000n };
        },
      });
      fixture.rpc.rpc.getBalance = () => ({
        send: async () => {
          await hold('balance');
          return { value: 1_000_000n };
        },
      });
      const controller = new AbortController();
      const pending = fixture.publisher.sign(prepared, fixture.session, controller.signal);

      await entered.promise;
      controller.abort();
      gate.resolve();
      await expect(pending).rejects.toThrow(/取消/);

      const order = ['genesis', 'height', 'fee', 'balance'];
      expect(calls).toEqual(order.slice(0, order.indexOf(stage) + 1));
      expect(fixture.signCalls).toHaveLength(0);
      fixture.controller.dispose();
    },
  );

  it('查询确认取消时直接拒绝，迟到状态不覆盖取消原因', async () => {
    const gate = deferred<readonly (SignatureStatusFixture | null)[]>();
    const fixture = await createFixture({ timeoutMs: 500, statuses: () => gate.promise });
    const controller = new AbortController();
    const pending = fixture.publisher.check(receiptFor(), controller.signal);
    await vi.waitFor(() => expect(fixture.rpc.statusCalls).toHaveLength(1), { interval: 1 });

    controller.abort();
    await expect(pending).rejects.toThrow(/取消/);
    gate.resolve([{ confirmationStatus: 'confirmed', err: null }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.controller.dispose();
  });

  it('恢复流程取消后不再查询后续回执，迟到结果被丢弃', async () => {
    const first = receiptFor();
    const second = receiptFor({
      signature: getBase58Decoder().decode(new Uint8Array(64).fill(8)),
    });
    const memory = createMemoryReceiptStore([first, second]);
    const gate = deferred<readonly (SignatureStatusFixture | null)[]>();
    const fixture = await createFixture({
      timeoutMs: 500,
      receiptStore: memory.store,
      statuses: () => gate.promise,
    });
    const controller = new AbortController();
    const pending = fixture.publisher.recover(controller.signal);
    await vi.waitFor(() => expect(fixture.rpc.statusCalls).toHaveLength(1), { interval: 1 });

    controller.abort();
    await expect(pending).rejects.toThrow(/取消/);
    expect(fixture.rpc.statusCalls).toHaveLength(1);
    gate.resolve([null]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.controller.dispose();
  });

  it('读回正文取消时拒绝且不伪装成 unavailable', async () => {
    const fixture = await createFixture({ timeoutMs: 500 });
    const receipt = receiptFor();
    const gate = deferred<Awaited<ReturnType<typeof fixture.retrySignatures>>>();
    fixture.retrySignatures.mockReturnValue(gate.promise);
    const controller = new AbortController();
    const pending = fixture.publisher.readBack(receipt, controller.signal);
    await vi.waitFor(() => expect(fixture.retrySignatures).toHaveBeenCalledTimes(1), {
      interval: 1,
    });

    controller.abort();
    await expect(pending).rejects.toThrow(/取消/);
    gate.resolve({
      scope: 'author',
      author: receipt.author,
      messages: [],
      scanned: 0,
      filtered: 0,
      unavailable: [],
      nextCursor: null,
      sourceExhausted: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.controller.dispose();
  });
});

describe('2.2A 截止与取消：超时保留真实状态且绝不重发', () => {
  it('状态查询超时转待确认，绝不重签或重发', async () => {
    const fixture = await createFixture({
      timeoutMs: 20,
      statuses: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([{ confirmationStatus: 'confirmed', err: null }]), 30);
        }),
    });
    const result = await fixture.publisher.check(receiptFor());

    expect(result.kind).toBe('pending');
    expect(result.reason).toMatch(/超时/);
    expect(fixture.signCalls).toHaveLength(0);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.controller.dispose();
  });

  it('确认轮询超时保留待确认，不把超时当成功', async () => {
    const fixture = await createFixture({
      timeoutMs: 20,
      confirmTotalTimeoutMs: 20,
      confirmMaxRounds: 5,
      statuses: () => new Promise(() => {}),
    });
    const result = await fixture.publisher.confirm(receiptFor());

    expect(result.kind).toBe('pending');
    expect(result.reason).toMatch(/超时/);
    expect(result.rounds).toBe(1);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('恢复总超时后未查询的回执显式保留待确认', async () => {
    const first = receiptFor();
    const second = receiptFor({
      signature: getBase58Decoder().decode(new Uint8Array(64).fill(8)),
    });
    const memory = createMemoryReceiptStore([first, second]);
    const fixture = await createFixture({
      timeoutMs: 20,
      confirmTotalTimeoutMs: 20,
      receiptStore: memory.store,
      statuses: () => new Promise(() => {}),
    });
    const entries = await fixture.publisher.recover();

    expect(entries).toHaveLength(2);
    expect(entries[0]!.check.kind).toBe('pending');
    expect(entries[0]!.check.reason).toMatch(/超时/);
    expect(entries[1]!.check.kind).toBe('pending');
    expect(entries[1]!.check.reason).toMatch(/恢复超时|尚未查询/);
    expect(fixture.rpc.statusCalls).toHaveLength(1);
    fixture.controller.dispose();
  });

  it('确认轮间等待受总截止限制，不会拖过预算', async () => {
    const fixture = await createFixture({
      timeoutMs: 500,
      confirmIntervalMs: 100,
      confirmTotalTimeoutMs: 20,
      confirmMaxRounds: 5,
      statuses: async () => [null],
    });
    const started = Date.now();
    const result = await fixture.publisher.confirm(receiptFor());

    expect(result.kind).toBe('pending');
    expect(result.rounds).toBe(1);
    expect(fixture.rpc.statusCalls).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(200);
    fixture.controller.dispose();
  });

  it('确认轮间等待被页面取消时立即拒绝', async () => {
    const fixture = await createFixture({
      timeoutMs: 500,
      confirmIntervalMs: 500,
      confirmTotalTimeoutMs: 1_000,
      statuses: async () => [null],
    });
    const controller = new AbortController();
    const pending = fixture.publisher.confirm(receiptFor(), controller.signal);
    await vi.waitFor(() => expect(fixture.rpc.statusCalls).toHaveLength(1), { interval: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    controller.abort();
    await expect(pending).rejects.toThrow(/取消/);
    fixture.controller.dispose();
  });

  it('发送等待超时转为不确定结果，回执保留原签名且只发送一次', async () => {
    const fixture = await createFixture({
      timeoutMs: 100,
      send: () => new Promise<string>(() => {}),
    });
    const prepared = await fixture.publisher.prepare({
      session: fixture.session,
      text: '发送超时',
    });
    const signed = await fixture.publisher.sign(prepared, fixture.session);
    const started = Date.now();
    const result = await fixture.publisher.submit(prepared, signed, fixture.session);

    expect(result.kind).toBe('uncertain');
    expect(result.signature).toBe(signed.signature);
    expect(result.receipt.status).toBe('uncertain');
    expect(fixture.rpc.sendPayloads).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(1_000);
    fixture.controller.dispose();
  });

  it('发送等待期间用户取消时转为不确定，绝不自动重发', async () => {
    const fixture = await createFixture({
      timeoutMs: 500,
      send: () => new Promise<string>(() => {}),
    });
    const prepared = await fixture.publisher.prepare({
      session: fixture.session,
      text: '发送取消',
    });
    const signed = await fixture.publisher.sign(prepared, fixture.session);
    const controller = new AbortController();
    const pending = fixture.publisher.submit(prepared, signed, fixture.session, controller.signal);
    await vi.waitFor(() => expect(fixture.rpc.sendPayloads).toHaveLength(1), { interval: 1 });

    controller.abort();
    const result = await pending;

    expect(result.kind).toBe('uncertain');
    expect(result.receipt.status).toBe('uncertain');
    expect(fixture.rpc.sendPayloads).toHaveLength(1);
    fixture.controller.dispose();
  });
});

describe('2.2A 终态回执结算：写盘结果不掩盖链上事实', () => {
  it('确认终态在同一原签名回执上写盘并返回 persisted', async () => {
    const memory = createMemoryReceiptStore();
    const fixture = await createFixture({
      receiptStore: memory.store,
      statuses: async () => [{ confirmationStatus: 'confirmed', err: null }],
    });
    const receipt = receiptFor();
    const result = await fixture.publisher.check(receipt);

    expect(result.kind).toBe('confirmed');
    expect(result.persistence.kind).toBe('persisted');
    if (result.persistence.kind === 'persisted') {
      expect(result.persistence.receipt).toMatchObject({
        signature: receipt.signature,
        status: 'confirmed',
      });
    }
    expect(memory.receipts).toHaveLength(1);
    expect(memory.receipts[0]).toMatchObject({
      signature: receipt.signature,
      status: 'confirmed',
    });
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    expect(fixture.signCalls).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('processed 或未知确认级别的错误只作待确认观察，不结算终态', async () => {
    const processedError = { InstructionError: [1, { Custom: 1 }] };
    const memory = createMemoryReceiptStore();
    let calls = 0;
    const fixture = await createFixture({
      receiptStore: memory.store,
      statuses: async () => {
        calls += 1;
        return [
          calls === 1
            ? { confirmationStatus: 'processed', err: processedError }
            : { confirmationStatus: 'unknown' as never, err: processedError },
        ];
      },
    });
    const receipt = receiptFor();

    const processed = await fixture.publisher.check(receipt);
    const unknown = await fixture.publisher.check(receipt);

    expect(processed.kind).toBe('pending');
    expect(processed.confirmationStatus).toBe('processed');
    expect(processed.err).toEqual(processedError);
    expect(processed.persistence.kind).toBe('not_terminal');
    expect(unknown.kind).toBe('pending');
    expect(unknown.confirmationStatus).toBeNull();
    expect(unknown.persistence.kind).toBe('not_terminal');
    expect(memory.receipts).toHaveLength(0);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    expect(fixture.signCalls).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('确认轮询先遇到 processed 错误仍会继续到 confirmed 成功', async () => {
    const memory = createMemoryReceiptStore();
    const statuses = [
      { confirmationStatus: 'processed' as const, err: { InstructionError: [1, { Custom: 1 }] } },
      { confirmationStatus: 'confirmed' as const, err: null },
    ];
    const fixture = await createFixture({
      receiptStore: memory.store,
      confirmMaxRounds: 2,
      confirmIntervalMs: 0,
      statuses: async () => [statuses.shift() ?? null],
    });

    const result = await fixture.publisher.confirm(receiptFor());

    expect(result.kind).toBe('confirmed');
    expect(result.rounds).toBe(2);
    expect(result.persistence.kind).toBe('persisted');
    expect(fixture.rpc.statusCalls).toHaveLength(2);
    expect(memory.receipts[0]!.status).toBe('confirmed');
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    fixture.controller.dispose();
  });

  it.each(['confirmed', 'finalized'] as const)(
    '%s 缺少 err 字段时不伪造成功',
    async (confirmationStatus) => {
      const memory = createMemoryReceiptStore();
      const fixture = await createFixture({
        receiptStore: memory.store,
        statuses: async () => [{ confirmationStatus }],
      });

      const result = await fixture.publisher.check(receiptFor());

      expect(result.kind).toBe('pending');
      expect(result.persistence.kind).toBe('not_terminal');
      expect(result.reason).toMatch(/err/);
      expect(memory.receipts).toHaveLength(0);
      expect(fixture.rpc.sendPayloads).toHaveLength(0);
      fixture.controller.dispose();
    },
  );

  it('confirmed 的 err 格式异常时不结算失败或成功', async () => {
    const memory = createMemoryReceiptStore();
    const fixture = await createFixture({
      receiptStore: memory.store,
      statuses: async () => [{ confirmationStatus: 'confirmed', err: 'boom' }],
    });

    const result = await fixture.publisher.check(receiptFor());

    expect(result.kind).toBe('pending');
    expect(result.persistence.kind).toBe('not_terminal');
    expect(result.reason).toMatch(/err|格式/);
    expect(memory.receipts).toHaveLength(0);
    fixture.controller.dispose();
  });

  it.each(['confirmed', 'finalized'] as const)(
    '%s 明确 err 非空时结算为 failed',
    async (confirmationStatus) => {
      const memory = createMemoryReceiptStore();
      const executionError = { InstructionError: [1, { Custom: 7 }] };
      const fixture = await createFixture({
        receiptStore: memory.store,
        statuses: async () => [{ confirmationStatus, err: executionError }],
      });

      const result = await fixture.publisher.check(receiptFor());

      expect(result.kind).toBe('failed');
      expect(result.confirmationStatus).toBe(confirmationStatus);
      expect(result.err).toEqual(executionError);
      expect(result.persistence.kind).toBe('persisted');
      expect(memory.receipts[0]!.status).toBe('failed');
      fixture.controller.dispose();
    },
  );

  it.each([
    ['确认后写盘失败', async () => [{ confirmationStatus: 'confirmed', err: null }], 'confirmed'],
    [
      '链上失败后写盘失败',
      async () => [{ confirmationStatus: 'confirmed', err: { Custom: 1 } }],
      'failed',
    ],
  ])('%s 时保留链上结果并显式返回 failed', async (_label, statuses, kind) => {
    const memory = createMemoryReceiptStore([], { fail: true });
    const fixture = await createFixture({
      receiptStore: memory.store,
      statuses: statuses as () => Promise<readonly (SignatureStatusFixture | null)[]>,
    });
    const result = await fixture.publisher.check(receiptFor());

    expect(result.kind).toBe(kind);
    expect(result.persistence.kind).toBe('failed');
    if (result.persistence.kind === 'failed') {
      expect(result.persistence.reason).toMatch(/quota|存储/);
      expect(result.persistence.receipt.status).toBe('uncertain');
    }
    expect(memory.receipts).toHaveLength(0);
    fixture.controller.dispose();
  });

  it('恢复时把可靠终态结算回原回执，不重新签名或发送', async () => {
    const receipt = receiptFor();
    const memory = createMemoryReceiptStore([receipt]);
    const fixture = await createFixture({
      receiptStore: memory.store,
      statuses: async () => [{ confirmationStatus: 'finalized', err: null }],
    });

    const [entry] = await fixture.publisher.recover();

    expect(entry!.check.kind).toBe('finalized');
    expect(entry!.check.persistence.kind).toBe('persisted');
    expect(memory.receipts[0]).toMatchObject({ signature: receipt.signature, status: 'finalized' });
    expect(fixture.signCalls).toHaveLength(0);
    expect(fixture.rpc.sendPayloads).toHaveLength(0);
    expect(fixture.retrySignatures).not.toHaveBeenCalled();
    fixture.controller.dispose();
  });

  it('实际浏览器回执存储跑满11次成功发布后只保留10条终态', async () => {
    const fake = createFakeStorage();
    const store = createBrowserPublicationReceiptStore(fake.storage);
    const fixture = await createFixture({
      timeoutMs: 500,
      receiptStore: store,
      statuses: async () => [{ confirmationStatus: 'confirmed', err: null }],
    });
    const signatures: string[] = [];

    for (let index = 1; index <= 11; index += 1) {
      const prepared = await fixture.publisher.prepare({
        session: fixture.session,
        text: `成功发布 ${index}`,
      });
      const signed = await fixture.publisher.sign(prepared, fixture.session);
      const submitted = await fixture.publisher.submit(prepared, signed, fixture.session);
      expect(submitted.kind).toBe('accepted');
      const confirmed = await fixture.publisher.confirm(submitted.receipt);
      expect(confirmed.kind).toBe('confirmed');
      expect(confirmed.persistence.kind).toBe('persisted');
      signatures.push(signed.signature);
    }

    const stored = store.list();
    expect(stored).toHaveLength(10);
    expect(stored.every((receipt) => receipt.status === 'confirmed')).toBe(true);
    expect(stored.some((receipt) => receipt.signature === signatures[0])).toBe(false);
    expect(stored.some((receipt) => receipt.signature === signatures[10])).toBe(true);
    expect(fixture.rpc.sendPayloads).toHaveLength(11);
    fixture.controller.dispose();
  });

  it('确认轮询命中终态时立即结束并结算', async () => {
    const memory = createMemoryReceiptStore();
    const fixture = await createFixture({
      timeoutMs: 500,
      receiptStore: memory.store,
      statuses: async () => [{ confirmationStatus: 'finalized', err: null }],
    });
    const result = await fixture.publisher.confirm(receiptFor());

    expect(result.kind).toBe('finalized');
    expect(result.rounds).toBe(1);
    expect(result.persistence.kind).toBe('persisted');
    expect(memory.receipts[0]!.status).toBe('finalized');
    fixture.controller.dispose();
  });
});

describe('2.2A 最小回执存储：版本、校验与有界清理', () => {
  function indexedReceipt(index: number, overrides: Partial<PublicationReceipt> = {}) {
    return receiptFor({
      signature: getBase58Decoder().decode(new Uint8Array(64).fill(index)),
      createdAt: NOW + index,
      ...overrides,
    });
  }

  it('按固定键写入版本化数组并可恢复', () => {
    const fake = createFakeStorage();
    const store = createBrowserPublicationReceiptStore(fake.storage);
    const receipt = receiptFor();

    store.save(receipt);

    const raw = fake.values.get(PUBLICATION_RECEIPT_STORAGE_KEY);
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!)).toEqual([receipt]);
    expect(store.list()).toEqual([receipt]);
  });

  it.each([
    ['损坏 JSON', '{'],
    ['非数组', JSON.stringify({ version: 1 })],
    ['错误版本', JSON.stringify([{ ...receiptFor(), version: 2 }])],
    ['错误链', JSON.stringify([{ ...receiptFor(), chain: 'solana:mainnet' }])],
    ['错误作者', JSON.stringify([{ ...receiptFor(), author: 'not-an-address' }])],
    ['错误签名', JSON.stringify([{ ...receiptFor(), signature: 'bad' }])],
    ['错误 blockhash', JSON.stringify([{ ...receiptFor(), blockhash: 'bad' }])],
    ['错误高度', JSON.stringify([{ ...receiptFor(), lastValidBlockHeight: '-1' }])],
    ['未知状态', JSON.stringify([{ ...receiptFor(), status: 'success' }])],
  ])('不把损坏回执当成成功：%s', (_label, raw) => {
    const fake = createFakeStorage({ [PUBLICATION_RECEIPT_STORAGE_KEY]: raw });
    const store = createBrowserPublicationReceiptStore(fake.storage);

    expect(() => store.list()).toThrow(/回执/);
  });

  it('未解决回执达到上限时拒绝新写入，不静默覆盖', () => {
    const fake = createFakeStorage();
    const store = createBrowserPublicationReceiptStore(fake.storage);
    for (let index = 1; index <= 10; index += 1) {
      store.save(indexedReceipt(index, { status: 'uncertain' }));
    }

    expect(() => store.save(indexedReceipt(11))).toThrow(/上限|未解决/);
    expect(store.list()).toHaveLength(10);
  });

  it('有终态记录时优先清理最旧终态，未解决记录保留', () => {
    const fake = createFakeStorage();
    const store = createBrowserPublicationReceiptStore(fake.storage);
    for (let index = 1; index <= 10; index += 1) {
      store.save(indexedReceipt(index, { status: index === 1 ? 'finalized' : 'uncertain' }));
    }

    store.save(indexedReceipt(11));

    const list = store.list();
    expect(list).toHaveLength(10);
    expect(list.some((receipt) => receipt.signature === indexedReceipt(1).signature)).toBe(false);
    expect(list.some((receipt) => receipt.signature === indexedReceipt(11).signature)).toBe(true);
  });

  it('localStorage 写入失败抛错，由调用方在发送前中止', () => {
    const store = createBrowserPublicationReceiptStore({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });

    expect(() => store.save(receiptFor())).toThrow(/回执|写入/);
  });

  it('localStorage 读取异常转换为可控错误', () => {
    const store = createBrowserPublicationReceiptStore({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
    });

    expect(() => store.list()).toThrow(/回执|存储/);
  });
});
