import { describe, expect, it } from 'vitest';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import {
  DEVNET_CHAIN,
  createWalletController,
  type WalletController,
  type WalletRegistry,
} from './wallet';

// 两个真实格式的 Solana 公钥，只用于展示与断言，不对应任何私钥。
const ADDRESS_A = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const ADDRESS_B = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

type ChangeListener = (properties: { accounts?: readonly WalletAccount[] }) => void;

function account(address: string, chains: WalletAccount['chains'] = [DEVNET_CHAIN]): WalletAccount {
  return { address, publicKey: new Uint8Array(32), chains, features: [] };
}

type FakeWalletConfig = {
  name?: string;
  chains?: WalletAccount['chains'];
  accounts?: readonly WalletAccount[];
  connect?: () => Promise<{ accounts: readonly WalletAccount[] }>;
  disconnect?: () => Promise<void>;
  withConnect?: boolean;
  withDisconnect?: boolean;
  withEvents?: boolean;
};

function createFakeWallet(config: FakeWalletConfig = {}) {
  const name = config.name ?? 'Phantom';
  const chains = config.chains ?? [DEVNET_CHAIN];
  const accounts = config.accounts ?? [account(ADDRESS_A)];
  const listeners = new Set<ChangeListener>();
  const features: Record<string, unknown> = {};
  const connectCalls = { count: 0 };
  const disconnectCalls = { count: 0 };
  const eventUnsubscribeCalls = { count: 0 };

  if (config.withConnect !== false) {
    const connectImpl = config.connect ?? (async () => ({ accounts }));
    features['standard:connect'] = {
      version: '1.0.0',
      connect: async () => {
        connectCalls.count += 1;
        return connectImpl();
      },
    };
  }
  if (config.withDisconnect !== false) {
    const disconnectImpl = config.disconnect ?? (async () => {});
    features['standard:disconnect'] = {
      version: '1.0.0',
      disconnect: async () => {
        disconnectCalls.count += 1;
        await disconnectImpl();
      },
    };
  }
  if (config.withEvents !== false) {
    features['standard:events'] = {
      version: '1.0.0',
      on: (_event: 'change', listener: ChangeListener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
          eventUnsubscribeCalls.count += 1;
        };
      },
    };
  }

  const wallet: Wallet = {
    version: '1.0.0',
    name,
    icon: 'data:image/svg+xml;base64,AA==',
    chains,
    features,
    accounts,
  };

  return {
    wallet,
    connectCalls,
    disconnectCalls,
    eventUnsubscribeCalls,
    emitChange(next: readonly WalletAccount[]) {
      for (const listener of [...listeners]) listener({ accounts: next });
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

function createFakeRegistry(initial: readonly Wallet[] = []) {
  let wallets: readonly Wallet[] = [...initial];
  const registerListeners = new Set<(...registered: Wallet[]) => void>();
  const unregisterListeners = new Set<(...unregistered: Wallet[]) => void>();

  const registry: WalletRegistry = {
    get: () => wallets,
    on: (event, listener) => {
      const listeners = event === 'register' ? registerListeners : unregisterListeners;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return {
    registry,
    register(wallet: Wallet) {
      wallets = [...wallets, wallet];
      for (const listener of [...registerListeners]) listener(wallet);
    },
    unregister(wallet: Wallet) {
      wallets = wallets.filter((registered) => registered !== wallet);
      for (const listener of [...unregisterListeners]) listener(wallet);
    },
    listenerCount() {
      return registerListeners.size + unregisterListeners.size;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}


describe('钱包发现', () => {
  it('只列出支持 Solana 的钱包，初始状态为未连接', () => {
    const phantom = createFakeWallet();
    const ethereumOnly = createFakeWallet({
      name: 'Ethereum Wallet',
      chains: ['eip155:1'],
      accounts: [account(ADDRESS_A, ['eip155:1'])],
    });
    const fakeRegistry = createFakeRegistry([phantom.wallet, ethereumOnly.wallet]);

    const controller = createWalletController(fakeRegistry.registry);
    const snapshot = controller.getSnapshot();

    expect(snapshot.wallets.map((wallet) => wallet.name)).toEqual(['Phantom']);
    expect(snapshot.status).toBe('disconnected');
    expect(snapshot.accountAddress).toBeNull();
    expect(snapshot.error).toBeNull();

    controller.dispose();
  });

  it('钱包注册后更新列表，未连接时不自动连接', () => {
    const first = createFakeWallet();
    const second = createFakeWallet({ name: 'Backpack' });
    const fakeRegistry = createFakeRegistry([first.wallet]);
    const controller = createWalletController(fakeRegistry.registry);

    fakeRegistry.register(second.wallet);

    expect(controller.getSnapshot().wallets.map((wallet) => wallet.name)).toEqual(['Phantom', 'Backpack']);
    expect(controller.getSnapshot().status).toBe('disconnected');
    expect(first.connectCalls.count + second.connectCalls.count).toBe(0);

    controller.dispose();
  });

  it('已连接的钱包被取消注册时清理连接状态', async () => {
    const fakeWallet = createFakeWallet();
    const fakeRegistry = createFakeRegistry([fakeWallet.wallet]);
    const controller = createWalletController(fakeRegistry.registry);
    await controller.connect(fakeWallet.wallet);

    fakeRegistry.unregister(fakeWallet.wallet);

    const snapshot = controller.getSnapshot();
    expect(snapshot.wallets).toHaveLength(0);
    expect(snapshot.status).toBe('disconnected');
    expect(snapshot.walletName).toBeNull();
    expect(snapshot.accountAddress).toBeNull();
    expect(snapshot.error).toBeNull();
    expect(snapshot.notice).toMatch(/移除|不可用/);

    controller.dispose();
  });
});

describe('连接与断开', () => {
  it('连接成功时显示钱包名称与完整公钥', async () => {
    const fakeWallet = createFakeWallet();
    const fakeRegistry = createFakeRegistry([fakeWallet.wallet]);
    const controller: WalletController = createWalletController(fakeRegistry.registry);

    await controller.connect(fakeWallet.wallet);

    const snapshot = controller.getSnapshot();
    expect(fakeWallet.connectCalls.count).toBe(1);
    expect(snapshot.status).toBe('connected');
    expect(snapshot.walletName).toBe('Phantom');
    expect(snapshot.accountAddress).toBe(ADDRESS_A);
    expect(snapshot.accountAddress).toHaveLength(44);
    expect(snapshot.error).toBeNull();

    controller.dispose();
  });

  it('只选择支持 solana:devnet 的账户，忽略其他链账户', async () => {
    const fakeWallet = createFakeWallet({
      accounts: [account(ADDRESS_A, ['solana:mainnet']), account(ADDRESS_B, [DEVNET_CHAIN])],
    });
    const fakeRegistry = createFakeRegistry([fakeWallet.wallet]);
    const controller = createWalletController(fakeRegistry.registry);

    await controller.connect(fakeWallet.wallet);

    expect(controller.getSnapshot().accountAddress).toBe(ADDRESS_B);
    controller.dispose();
  });

  it('钱包拒绝连接后显示可读错误，并且可以再次连接', async () => {
    let attempts = 0;
    const fakeWallet = createFakeWallet({
      connect: async () => {
        attempts += 1;
        if (attempts === 1) throw { code: 4001, message: 'User rejected the request.' };
        return { accounts: [account(ADDRESS_A)] };
      },
    });
    const fakeRegistry = createFakeRegistry([fakeWallet.wallet]);
    const controller = createWalletController(fakeRegistry.registry);

    await controller.connect(fakeWallet.wallet);

    expect(controller.getSnapshot().status).toBe('error');
    expect(controller.getSnapshot().error).toMatch(/取消|拒绝/);
    expect(controller.getSnapshot().accountAddress).toBeNull();

    await controller.connect(fakeWallet.wallet);

    expect(controller.getSnapshot().status).toBe('connected');
    expect(controller.getSnapshot().accountAddress).toBe(ADDRESS_A);
    expect(fakeWallet.connectCalls.count).toBe(2);

    controller.dispose();
  });


  it('连接进行中重复点击只发起一次钱包请求', async () => {
    const gate = deferred<{ accounts: readonly WalletAccount[] }>();
    const fakeWallet = createFakeWallet({ connect: () => gate.promise });
    const fakeRegistry = createFakeRegistry([fakeWallet.wallet]);
    const controller = createWalletController(fakeRegistry.registry);

    const first = controller.connect(fakeWallet.wallet);
    const second = controller.connect(fakeWallet.wallet);
    await second;

    expect(fakeWallet.connectCalls.count).toBe(1);
    expect(controller.getSnapshot().status).toBe('connecting');

    gate.resolve({ accounts: [account(ADDRESS_A)] });
    await first;

    expect(controller.getSnapshot().status).toBe('connected');
    controller.dispose();
  });

  it('连接尚未返回时断开，旧连接结果不会把页面恢复为已连接', async () => {
    const gate = deferred<{ accounts: readonly WalletAccount[] }>();
    const fakeWallet = createFakeWallet({ connect: () => gate.promise });
    const fakeRegistry = createFakeRegistry([fakeWallet.wallet]);
    const controller = createWalletController(fakeRegistry.registry);

    const connecting = controller.connect(fakeWallet.wallet);
    await controller.disconnect();

    expect(controller.getSnapshot().status).toBe('disconnected');

    gate.resolve({ accounts: [account(ADDRESS_A)] });
    await connecting;

    const snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe('disconnected');
    expect(snapshot.accountAddress).toBeNull();
    expect(snapshot.walletName).toBeNull();
    expect(fakeWallet.disconnectCalls.count).toBe(0);

    controller.dispose();
  });
  it('取消等待后立即清理本地状态，旧请求结束前不并发弹窗', async () => {
    const gate = deferred<{ accounts: readonly WalletAccount[] }>();
    let attempts = 0;
    const fakeWallet = createFakeWallet({
      connect: () => {
        attempts += 1;
        return attempts === 1 ? gate.promise : Promise.resolve({ accounts: [account(ADDRESS_A)] });
      },
    });
    const fakeRegistry = createFakeRegistry([fakeWallet.wallet]);
    const controller = createWalletController(fakeRegistry.registry);

    const first = controller.connect(fakeWallet.wallet);
    expect(controller.getSnapshot().pendingWalletNames).toEqual(['Phantom']);
    expect(controller.getSnapshot().status).toBe('connecting');

    controller.cancelConnect();

    let snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe('disconnected');
    expect(snapshot.accountAddress).toBeNull();
    expect(snapshot.walletName).toBeNull();
    expect(snapshot.notice).toMatch(/不会关闭钱包弹窗|撤销授权/);
    expect(snapshot.pendingWalletNames).toEqual(['Phantom']);
    expect(fakeWallet.disconnectCalls.count).toBe(0);

    // 同一钱包的底层请求仍未结束：只给出等待提示，不能再调用一次 connect。
    await controller.connect(fakeWallet.wallet);
    expect(fakeWallet.connectCalls.count).toBe(1);
    expect(controller.getSnapshot().notice).toMatch(/仍在等待钱包处理|上一次连接/);

    gate.resolve({ accounts: [account(ADDRESS_A)] });
    await first;

    snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe('disconnected');
    expect(snapshot.accountAddress).toBeNull();
    expect(snapshot.pendingWalletNames).toEqual([]);

    // 旧请求真正结束后才允许重试同一钱包。
    await controller.connect(fakeWallet.wallet);
    expect(controller.getSnapshot().status).toBe('connected');
    expect(controller.getSnapshot().accountAddress).toBe(ADDRESS_A);
    expect(fakeWallet.connectCalls.count).toBe(2);

    controller.dispose();
  });

  it('取消等待后可连接其他钱包，旧钱包晚到结果不覆盖新连接', async () => {
    const gateA = deferred<{ accounts: readonly WalletAccount[] }>();
    const walletA = createFakeWallet({ name: 'Phantom', connect: () => gateA.promise });
    const walletB = createFakeWallet({ name: 'Backpack', accounts: [account(ADDRESS_B)] });
    const fakeRegistry = createFakeRegistry([walletA.wallet, walletB.wallet]);
    const controller = createWalletController(fakeRegistry.registry);

    const firstA = controller.connect(walletA.wallet);
    controller.cancelConnect();
    await controller.connect(walletB.wallet);

    expect(controller.getSnapshot().status).toBe('connected');
    expect(controller.getSnapshot().accountAddress).toBe(ADDRESS_B);
    expect(controller.getSnapshot().pendingWalletNames).toEqual(['Phantom']);

    gateA.resolve({ accounts: [account(ADDRESS_A)] });
    await firstA;

    const snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe('connected');
    expect(snapshot.walletName).toBe('Backpack');
    expect(snapshot.accountAddress).toBe(ADDRESS_B);
    expect(snapshot.pendingWalletNames).toEqual([]);

    controller.dispose();
  });

  it('断开时调用 standard:disconnect 并清空地址', async () => {
    const fakeWallet = createFakeWallet();
    const fakeRegistry = createFakeRegistry([fakeWallet.wallet]);
    const controller = createWalletController(fakeRegistry.registry);
    await controller.connect(fakeWallet.wallet);

    await controller.disconnect();

    const snapshot = controller.getSnapshot();
    expect(fakeWallet.disconnectCalls.count).toBe(1);
    expect(snapshot.status).toBe('disconnected');
    expect(snapshot.accountAddress).toBeNull();
    expect(snapshot.walletName).toBeNull();
    expect(snapshot.error).toBeNull();

    controller.dispose();
  });

  it('取消等待后旧请求失败也不写入错误或结束新连接', async () => {
    const gateA = deferred<{ accounts: readonly WalletAccount[] }>();
    const gateB = deferred<{ accounts: readonly WalletAccount[] }>();
    const walletA = createFakeWallet({ name: 'Phantom', connect: () => gateA.promise });
    const walletB = createFakeWallet({
      name: 'Backpack',
      accounts: [account(ADDRESS_B)],
      connect: () => gateB.promise,
    });
    const fakeRegistry = createFakeRegistry([walletA.wallet, walletB.wallet]);
    const controller = createWalletController(fakeRegistry.registry);

    const firstA = controller.connect(walletA.wallet);
    controller.cancelConnect();
    const pendingB = controller.connect(walletB.wallet);
    expect(controller.getSnapshot().status).toBe('connecting');
    expect(controller.getSnapshot().walletName).toBe('Backpack');

    gateA.reject(new Error('用户关闭了旧的 Phantom 弹窗'));
    await firstA;

    let snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe('connecting');
    expect(snapshot.walletName).toBe('Backpack');
    expect(snapshot.error).toBeNull();
    expect(snapshot.accountAddress).toBeNull();
    expect(snapshot.pendingWalletNames).toEqual(['Backpack']);

    gateB.resolve({ accounts: [account(ADDRESS_B)] });
    await pendingB;

    snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe('connected');
    expect(snapshot.walletName).toBe('Backpack');
    expect(snapshot.accountAddress).toBe(ADDRESS_B);
    expect(snapshot.error).toBeNull();

    controller.dispose();
  });

  it('钱包不支持 standard:disconnect 时仅在页面清除状态并说明', async () => {
    const fakeWallet = createFakeWallet({ withDisconnect: false });
    const fakeRegistry = createFakeRegistry([fakeWallet.wallet]);
    const controller = createWalletController(fakeRegistry.registry);
    await controller.connect(fakeWallet.wallet);

    await controller.disconnect();

    const snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe('disconnected');
    expect(snapshot.accountAddress).toBeNull();
    expect(snapshot.notice).toMatch(/不支持断开|本地/);

    controller.dispose();
  });

  it('钱包不支持 standard:connect 时不伪造连接成功', async () => {
    const fakeWallet = createFakeWallet({ withConnect: false });
    const fakeRegistry = createFakeRegistry([fakeWallet.wallet]);
    const controller = createWalletController(fakeRegistry.registry);

    await controller.connect(fakeWallet.wallet);

    expect(controller.getSnapshot().status).toBe('error');
    expect(controller.getSnapshot().accountAddress).toBeNull();
    expect(controller.getSnapshot().error).toMatch(/standard:connect/);

    controller.dispose();
  });

  it('钱包没有 Devnet 账户时不显示已连接', async () => {
    const fakeWallet = createFakeWallet({ accounts: [account(ADDRESS_A, ['solana:mainnet'])] });
    const fakeRegistry = createFakeRegistry([fakeWallet.wallet]);
    const controller = createWalletController(fakeRegistry.registry);

    await controller.connect(fakeWallet.wallet);

    expect(controller.getSnapshot().status).toBe('error');
    expect(controller.getSnapshot().error).toMatch(/devnet/i);

    controller.dispose();
  });

describe('账户事件与生命周期', () => {
  it('钱包切换账户后更新公钥', async () => {
    const fakeWallet = createFakeWallet();
    const fakeRegistry = createFakeRegistry([fakeWallet.wallet]);
    const controller = createWalletController(fakeRegistry.registry);
    await controller.connect(fakeWallet.wallet);

    fakeWallet.emitChange([account(ADDRESS_B)]);

    expect(controller.getSnapshot().status).toBe('connected');
    expect(controller.getSnapshot().accountAddress).toBe(ADDRESS_B);

    controller.dispose();
  });

  it('钱包清空账户后断开并清空地址与错误', async () => {
    const fakeWallet = createFakeWallet();
    const fakeRegistry = createFakeRegistry([fakeWallet.wallet]);
    const controller = createWalletController(fakeRegistry.registry);
    await controller.connect(fakeWallet.wallet);

    fakeWallet.emitChange([]);

    const snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe('disconnected');
    expect(snapshot.accountAddress).toBeNull();
    expect(snapshot.walletName).toBeNull();
    expect(snapshot.error).toBeNull();

    controller.dispose();
  });

  it('dispose 后清理注册表、账户事件与订阅，事件只生效一次', async () => {
    const fakeWallet = createFakeWallet();
    const fakeRegistry = createFakeRegistry([fakeWallet.wallet]);
    const controller = createWalletController(fakeRegistry.registry);
    await controller.connect(fakeWallet.wallet);

    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    fakeWallet.emitChange([account(ADDRESS_B)]);

    expect(notifications).toBe(1);
    expect(controller.getSnapshot().accountAddress).toBe(ADDRESS_B);

    controller.dispose();

    expect(fakeWallet.listenerCount()).toBe(0);
    expect(fakeWallet.eventUnsubscribeCalls.count).toBe(1);
    expect(fakeRegistry.listenerCount()).toBe(0);

    fakeWallet.emitChange([account(ADDRESS_A)]);

    expect(notifications).toBe(1);
    expect(controller.getSnapshot().accountAddress).toBe(ADDRESS_B);
  });
});

});

