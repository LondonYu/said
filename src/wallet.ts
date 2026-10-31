import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';

export const DEVNET_CHAIN = 'solana:devnet' as const;

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type WalletSnapshot = {
  readonly wallets: readonly Wallet[];
  readonly status: WalletStatus;
  readonly walletName: string | null;
  readonly accountAddress: string | null;
  readonly error: string | null;
  readonly notice: string | null;
  /**
   * 底层 standard:connect 仍未结束的钱包名。
   * 本地取消不能让钱包请求真正停止，因此保留此列表以避免同一钱包并发弹窗。
   */
  readonly pendingWalletNames: readonly string[];
};

export type WalletController = {
  getSnapshot(): WalletSnapshot;
  subscribe(listener: () => void): () => void;
  connect(wallet: Wallet): Promise<void>;
  /**
   * 只停止页面等待并使旧连接结果失效；不会关闭钱包弹窗或撤销授权。
   * 底层请求结束后，同一钱包才能重新连接。
   */
  cancelConnect(): void;
  disconnect(): Promise<void>;
  dispose(): void;
};

/**
 * Wallet Standard 的应用侧注册表（与 @wallet-standard/app 的 Wallets 结构兼容）。
 * 作为可选依赖传入，仅用于测试，不建立通用依赖注入框架。
 */
export type WalletRegistry = {
  get(): readonly Wallet[];
  on(event: 'register' | 'unregister', listener: (...wallets: Wallet[]) => void): () => void;
};

// 本仓库未安装 @wallet-standard/features，仅声明本工单用到的三个特性契约。
type StandardConnectFeature = {
  connect(options?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }>;
};
type StandardDisconnectFeature = {
  disconnect(): Promise<void>;
};
type StandardEventsFeature = {
  on(
    event: 'change',
    listener: (properties: { accounts?: readonly WalletAccount[] }) => void,
  ): () => void;
};

function supportsSolana(wallet: Wallet): boolean {
  const chains = [...wallet.chains, ...wallet.accounts.flatMap((account) => account.chains)];
  return chains.some((chain) => chain.startsWith('solana:'));
}

function listSolanaWallets(registry: WalletRegistry): readonly Wallet[] {
  return registry.get().filter(supportsSolana);
}

/**
 * 账户的 chains 只是“支持能力”，不代表钱包当前显示的网络。
 * 这里仅筛选支持 solana:devnet 能力的账户，用于读取余额。
 */
function pickDevnetAccount(accounts: readonly WalletAccount[]): WalletAccount | undefined {
  return accounts.find((account) => account.chains.includes(DEVNET_CHAIN));
}

function readFeature<TFeature>(wallet: Wallet, name: `${string}:${string}`): TFeature | undefined {
  const feature = wallet.features[name];
  return feature === undefined ? undefined : (feature as TFeature);
}

function isWalletError(error: unknown): error is { code?: number; message?: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function describeConnectError(error: unknown): string {
  if (isWalletError(error) && error.code === 4001) {
    return '已取消连接：你已在钱包中拒绝连接请求。';
  }
  if (error instanceof Error && error.message.trim() !== '') {
    return `连接失败：${error.message.trim()}`;
  }
  if (isWalletError(error) && typeof error.message === 'string' && error.message.trim() !== '') {
    return `连接失败：${error.message.trim()}`;
  }
  return '连接失败：钱包没有完成连接请求。';
}

export function createWalletController(registry: WalletRegistry = getWallets()): WalletController {
  let disposed = false;
  let generation = 0;
  let accountUnsubscribe: (() => void) | null = null;
  // 底层钱包请求无法被页面真正取消，按钱包名记录仍在等待的请求，避免同一钱包并发弹窗。
  const pendingConnectWallets = new Set<string>();
  let snapshot: WalletSnapshot = {
    wallets: listSolanaWallets(registry),
    status: 'disconnected',
    walletName: null,
    accountAddress: null,
    error: null,
    notice: null,
    pendingWalletNames: [],
  };
  const listeners = new Set<() => void>();

  function pendingWalletNames(): readonly string[] {
    return [...pendingConnectWallets];
  }

  function update(patch: Partial<WalletSnapshot>) {
    if (disposed) return;
    snapshot = { ...snapshot, ...patch };
    for (const listener of [...listeners]) listener();
  }

  function clearAccountListener() {
    if (accountUnsubscribe !== null) {
      accountUnsubscribe();
      accountUnsubscribe = null;
    }
  }

  // 任何“断开”都必须递增 generation，使尚未返回的连接结果失效。
  function resetToDisconnected(notice: string | null) {
    generation += 1;
    clearAccountListener();
    update({ status: 'disconnected', walletName: null, accountAddress: null, error: null, notice });
  }

  function handleAccountsChanged(accounts: readonly WalletAccount[]) {
    if (disposed || snapshot.status !== 'connected') return;
    if (accounts.length === 0) {
      resetToDisconnected('钱包已断开连接或没有可用账户，页面已清理连接状态。');
      return;
    }
    const account = pickDevnetAccount(accounts);
    if (!account) {
      resetToDisconnected('钱包已没有支持 solana:devnet 的账户，页面已清理连接状态。');
      return;
    }
    if (account.address !== snapshot.accountAddress) {
      update({ status: 'connected', accountAddress: account.address, error: null, notice: null });
    }
  }

  function subscribeToAccountChanges(wallet: Wallet, requestId: number) {
    clearAccountListener();
    const events = readFeature<StandardEventsFeature>(wallet, 'standard:events');
    if (events === undefined) return;
    accountUnsubscribe = events.on('change', (properties) => {
      if (disposed || requestId !== generation) return;
      if (properties.accounts === undefined) return;
      handleAccountsChanged(properties.accounts);
    });
  }

  function handleRegistryChange() {
    if (disposed) return;
    const wallets = listSolanaWallets(registry);
    const activeWalletStillRegistered =
      snapshot.walletName === null || wallets.some((wallet) => wallet.name === snapshot.walletName);
    if (!activeWalletStillRegistered) {
      resetToDisconnected('钱包已从浏览器中移除或不可用，页面已清理连接状态。');
    }
    update({ wallets });
  }


  async function connect(wallet: Wallet): Promise<void> {
    if (disposed) return;

    // 同一钱包的旧弹窗仍未结束：不并发发起第二次请求，也不把本地取消宣传成钱包请求已取消。
    if (pendingConnectWallets.has(wallet.name)) {
      update({
        notice: `「${wallet.name}」的上一次连接仍在等待钱包处理。请先在钱包扩展中完成或关闭弹窗；处理结束后可重试。`,
      });
      return;
    }

    const requestId = generation + 1;
    generation = requestId;
    clearAccountListener();
    pendingConnectWallets.add(wallet.name);
    update({
      status: 'connecting',
      walletName: wallet.name,
      accountAddress: null,
      error: null,
      notice: null,
      pendingWalletNames: pendingWalletNames(),
    });

    try {
      const feature = readFeature<StandardConnectFeature>(wallet, 'standard:connect');
      if (feature === undefined) {
        update({ status: 'error', error: '该钱包不支持 Wallet Standard 的 standard:connect 能力。' });
        return;
      }

      let accounts: readonly WalletAccount[];
      try {
        const output = await feature.connect();
        accounts = output.accounts;
      } catch (error) {
        if (disposed || requestId !== generation) return;
        update({ status: 'error', error: describeConnectError(error) });
        return;
      }

      // 等待钱包弹窗期间用户可能已取消、断开或卸载页面，旧结果必须丢弃。
      if (disposed || requestId !== generation) return;

      const account = pickDevnetAccount(accounts.length > 0 ? accounts : wallet.accounts);
      if (account === undefined) {
        update({ status: 'error', error: '钱包没有提供支持 solana:devnet 的账户。' });
        return;
      }

      subscribeToAccountChanges(wallet, requestId);
      update({ status: 'connected', accountAddress: account.address, error: null, notice: null });
    } finally {
      // 这里只更新底层等待列表：旧请求无论成功、失败还是 finally，
      // 都不能覆盖新一轮操作的状态，也不能替新操作解锁。
      pendingConnectWallets.delete(wallet.name);
      update({ pendingWalletNames: pendingWalletNames() });
    }
  }

  function cancelConnect(): void {
    if (disposed || snapshot.status !== 'connecting') return;

    const walletName = snapshot.walletName;
    generation += 1;
    clearAccountListener();
    update({
      status: 'disconnected',
      walletName: null,
      accountAddress: null,
      error: null,
      notice:
        walletName === null
          ? '已停止页面等待，但不会关闭钱包弹窗或撤销授权。'
          : `已停止等待「${walletName}」，但不会关闭钱包弹窗或撤销授权。`,
    });
  }

  async function disconnect(): Promise<void> {
    if (disposed) return;

    const previousWalletName = snapshot.walletName;
    const shouldDisconnectWallet = snapshot.status === 'connected';
    const requestId = generation + 1;
    generation = requestId;
    clearAccountListener();
    update({ status: 'disconnected', walletName: null, accountAddress: null, error: null, notice: null });

    // 从未连接成功时只清理本地状态，不向钱包发起多余的断开请求。
    if (!shouldDisconnectWallet || previousWalletName === null) return;

    const wallet = listSolanaWallets(registry).find((registered) => registered.name === previousWalletName);
    if (wallet === undefined) return;

    const feature = readFeature<StandardDisconnectFeature>(wallet, 'standard:disconnect');
    if (feature === undefined) {
      update({ notice: '该钱包不支持 standard:disconnect，已在页面内清除本地连接状态。' });
      return;
    }

    try {
      await feature.disconnect();
    } catch {
      if (!disposed && requestId === generation) {
        update({ notice: '钱包未确认断开，已在页面内清除连接状态。' });
      }
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    generation += 1;
    clearAccountListener();
    pendingConnectWallets.clear();
    for (const unsubscribe of unsubscribers) unsubscribe();
    unsubscribers.length = 0;
    listeners.clear();
  }

  const unsubscribers = [
    registry.on('register', handleRegistryChange),
    registry.on('unregister', handleRegistryChange),
  ];

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect,
    cancelConnect,
    disconnect,
    dispose,
  };
}

