import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { getBase58Decoder, type ReadonlyUint8Array } from '@solana/kit';
import { SOLANA_CHAIN, SOLANA_NETWORK_CONFIG } from './network';

export const SIGN_TRANSACTION_FEATURE = 'solana:signTransaction' as const;

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export const SIGNING_TRANSACTION_VERSION = 0 as const;

/** 本仓库只消费单笔 v0 交易的 Wallet Standard 签名契约。 */
export type SignTransactionFeature = {
  readonly version: string;
  readonly supportedTransactionVersions: readonly (0 | 'legacy')[];
  signTransaction(
    ...inputs: readonly {
      account: WalletAccount;
      transaction: Uint8Array;
      chain: string;
    }[]
  ): Promise<readonly { signedTransaction: Uint8Array }[]>;
};

/**
 * 只有在钱包、账户和能力同时满足条件时才存在。
 * 每次连接/账户/能力/注册表变化都会递增 revision；旧会话不得再用于签名。
 */
export type WalletSigningSession = {
  readonly wallet: Wallet;
  readonly account: WalletAccount;
  readonly accountAddress: string;
  readonly publicKey: ReadonlyUint8Array;
  readonly chain: typeof SOLANA_CHAIN;
  readonly featureVersion: string;
  readonly supportedTransactionVersions: readonly (0 | 'legacy')[];
  readonly feature: SignTransactionFeature;
  /** 创建会话时的方法引用快照；调用仍通过 feature 保留钱包要求的 this。 */
  readonly signTransaction: SignTransactionFeature['signTransaction'];
  readonly revision: number;
};

export type SigningSnapshot = {
  readonly available: boolean;
  readonly reason: string | null;
  readonly revision: number;
};

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
  /** 签名能力只描述当前已连接账户；与钱包“当前网络”无关。 */
  readonly signing: SigningSnapshot;
};

export type WalletController = {
  getSnapshot(): WalletSnapshot;
  /** 返回当前唯一签名会话；断开、账户变化或能力变化后旧值立即失效。 */
  getSigningSession(): WalletSigningSession | null;
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
type WalletChangeProperties = {
  readonly accounts?: readonly WalletAccount[];
  readonly chains?: Wallet['chains'];
  readonly features?: Wallet['features'];
};
type StandardEventsFeature = {
  on(event: 'change', listener: (properties: WalletChangeProperties) => void): () => void;
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
 * 这里仅筛选支持所选网络能力的账户，用于读取余额。
 */
function pickNetworkAccount(accounts: readonly WalletAccount[]): WalletAccount | undefined {
  return accounts.find((account) => account.chains.includes(SOLANA_CHAIN));
}

function readFeature<TFeature>(wallet: Wallet, name: `${string}:${string}`): TFeature | undefined {
  const feature = wallet.features[name];
  return feature === undefined ? undefined : (feature as TFeature);
}

function accountMatchesAddress(account: WalletAccount): boolean {
  if (account.publicKey.length !== 32) return false;
  try {
    return getBase58Decoder().decode(account.publicKey) === account.address;
  } catch {
    return false;
  }
}

function sameStringList(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameTransactionVersions(
  left: readonly (0 | 'legacy')[],
  right: readonly (0 | 'legacy')[],
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** 钱包每次 getter 可以返回新的 feature 包装对象；能力身份取方法引用与相关值。 */
function sameSigningCapability(
  left: SignTransactionFeature,
  right: SignTransactionFeature,
): boolean {
  if (typeof left.signTransaction !== 'function' || typeof right.signTransaction !== 'function') {
    return false;
  }
  if (left.signTransaction !== right.signTransaction) return false;
  if (left.version !== right.version) return false;
  if (
    !Array.isArray(left.supportedTransactionVersions) ||
    !Array.isArray(right.supportedTransactionVersions)
  ) {
    return false;
  }
  return sameTransactionVersions(
    left.supportedTransactionVersions,
    right.supportedTransactionVersions,
  );
}

function evaluateSigningSession(
  wallet: Wallet,
  account: WalletAccount,
  revision: number,
  walletChains: readonly string[],
  walletFeatures: Wallet['features'],
): { session: WalletSigningSession | null; reason: string | null } {
  if (!walletChains.includes(SOLANA_CHAIN)) {
    return { session: null, reason: `钱包未声明支持 ${SOLANA_NETWORK_CONFIG.displayName}，无法准备签名。` };
  }
  const feature = walletFeatures[SIGN_TRANSACTION_FEATURE] as
    | SignTransactionFeature
    | undefined;
  if (feature === undefined || typeof feature.signTransaction !== 'function') {
    return { session: null, reason: '钱包没有 standard:signTransaction 签名能力。' };
  }
  if (feature.version !== '1.0.0') {
    return { session: null, reason: '钱包签名能力版本不是 1.0.0，无法安全签名。' };
  }
  if (!Array.isArray(feature.supportedTransactionVersions)) {
    return { session: null, reason: '钱包没有声明可签名的交易版本。' };
  }
  if (!feature.supportedTransactionVersions.includes(SIGNING_TRANSACTION_VERSION)) {
    return { session: null, reason: '钱包不支持 v0 交易版本。' };
  }
  if (!account.chains.includes(SOLANA_CHAIN)) {
    return { session: null, reason: `所选账户未声明 ${SOLANA_CHAIN} 支持。` };
  }
  if (!account.features.includes(SIGN_TRANSACTION_FEATURE)) {
    return { session: null, reason: '所选账户未声明签名能力。' };
  }
  if (account.publicKey.length !== 32) {
    return { session: null, reason: '账户公钥不是 32 字节，无法安全绑定签名身份。' };
  }
  if (!accountMatchesAddress(account)) {
    return { session: null, reason: '账户地址与公钥不一致，无法安全绑定签名身份。' };
  }
  return {
    session: {
      wallet,
      account,
      accountAddress: account.address,
      publicKey: account.publicKey,
      chain: SOLANA_CHAIN,
      featureVersion: feature.version,
      supportedTransactionVersions: [...feature.supportedTransactionVersions],
      feature,
      signTransaction: feature.signTransaction,
      revision,
    },
    reason: null,
  };
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
  // 以对象身份而非钱包名绑定：两个同名扩展不能互相断开或复用会话。
  let activeWallet: Wallet | null = null;
  let activeAccount: WalletAccount | null = null;
  // change 事件提供的 chains/features 期望值；每次仍须与钱包实时 getter 一致。
  let activeWalletChains: readonly string[] | null = null;
  let activeWalletFeatures: Wallet['features'] | null = null;
  let activeSigningSession: WalletSigningSession | null = null;
  let signingRevision = 0;
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
    signing: { available: false, reason: null, revision: 0 },
  };
  const listeners = new Set<() => void>();

  function nextSigning(wallet: Wallet | null, account: WalletAccount | null): SigningSnapshot {
    signingRevision += 1;
    if (wallet === null || account === null) {
      activeSigningSession = null;
      activeWalletChains = null;
      activeWalletFeatures = null;
      return { available: false, reason: null, revision: signingRevision };
    }
    const evaluated = evaluateSigningSession(
      wallet,
      account,
      signingRevision,
      activeWalletChains ?? wallet.chains,
      activeWalletFeatures ?? wallet.features,
    );
    activeSigningSession = evaluated.session;
    if (activeSigningSession !== null && !isSessionStillCurrent(activeSigningSession)) {
      // 事件与实时 getter 不一致时不能保留签名授权；只读连接仍保留。
      activeSigningSession = null;
      return {
        available: false,
        reason: '签名能力事件与钱包实时状态不一致，请重新连接。',
        revision: signingRevision,
      };
    }
    return {
      available: evaluated.session !== null,
      reason: evaluated.reason,
      revision: signingRevision,
    };
  }

  function recomputeSigning(wallet: Wallet | null, account: WalletAccount | null) {
    update({ signing: nextSigning(wallet, account) });
  }

  /**
   * 每次获取/使用会话都要同时核对事件期望值、钱包实时值、账户授权与不可变快照。
   * 发过事件不代表可以永久信任旧值；任何来源不一致都保守失效。
   */
  function isSessionStillCurrent(session: WalletSigningSession): boolean {
    if (activeWallet !== session.wallet || activeAccount !== session.account) return false;
    const liveChains = session.wallet.chains;
    const effectiveChains = activeWalletChains ?? liveChains;
    if (!sameStringList(liveChains, effectiveChains)) return false;
    if (!effectiveChains.includes(SOLANA_CHAIN)) return false;

    const liveFeatures = session.wallet.features;
    const effectiveFeatures = activeWalletFeatures ?? liveFeatures;
    const liveFeature = liveFeatures[SIGN_TRANSACTION_FEATURE] as
      | SignTransactionFeature
      | undefined;
    const effectiveFeature = effectiveFeatures[SIGN_TRANSACTION_FEATURE] as
      | SignTransactionFeature
      | undefined;
    if (liveFeature === undefined || effectiveFeature === undefined) return false;
    if (!sameSigningCapability(liveFeature, effectiveFeature)) return false;
    // 会话保存方法、版本与交易版本的不可变快照；新包装对象不等于能力变化。
    if (effectiveFeature.signTransaction !== session.signTransaction) return false;
    if (effectiveFeature.version !== '1.0.0' || effectiveFeature.version !== session.featureVersion) {
      return false;
    }
    if (
      !sameTransactionVersions(
        effectiveFeature.supportedTransactionVersions,
        session.supportedTransactionVersions,
      )
    ) {
      return false;
    }

    // 账户对象可能被原地修改；不能只比较引用。
    if (session.accountAddress !== session.account.address) return false;
    if (!session.account.chains.includes(SOLANA_CHAIN)) return false;
    if (!session.account.features.includes(SIGN_TRANSACTION_FEATURE)) return false;
    return accountMatchesAddress(session.account);
  }

  function sameAccountIdentity(left: WalletAccount | null, right: WalletAccount): boolean {
    if (left === null) return false;
    if (left === right) return true;
    if (left.address !== right.address || left.publicKey.length !== right.publicKey.length) return false;
    if (left.publicKey.some((byte, index) => byte !== right.publicKey[index])) return false;
    if (
      left.chains.length !== right.chains.length ||
      !left.chains.every((chain, index) => chain === right.chains[index])
    ) {
      return false;
    }
    return (
      left.features.length === right.features.length &&
      left.features.every((feature, index) => feature === right.features[index])
    );
  }

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
    activeWallet = null;
    activeAccount = null;
    recomputeSigning(null, null);
    update({ status: 'disconnected', walletName: null, accountAddress: null, error: null, notice });
  }

  function handleAccountsChanged(
    accounts: readonly WalletAccount[],
    forceRecompute = false,
  ) {
    if (disposed || snapshot.status !== 'connected') return;
    if (accounts.length === 0) {
      resetToDisconnected('钱包已断开连接或没有可用账户，页面已清理连接状态。');
      return;
    }
    const account = pickNetworkAccount(accounts);
    if (!account) {
      resetToDisconnected(`钱包已没有支持 ${SOLANA_CHAIN} 的账户，页面已清理连接状态。`);
      return;
    }
    if (sameAccountIdentity(activeAccount, account)) {
      if (forceRecompute && activeWallet !== null) {
        activeAccount = account;
        update({ signing: nextSigning(activeWallet, account) });
      }
      return;
    }
    const previousAccount = activeAccount;
    activeAccount = account;
    const signing = nextSigning(activeWallet, activeAccount);
    if (previousAccount === null || account.address !== previousAccount.address) {
      update({
        status: 'connected',
        accountAddress: account.address,
        error: null,
        notice: null,
        signing,
      });
      return;
    }
    update({ signing });
  }

  function subscribeToAccountChanges(wallet: Wallet, requestId: number) {
    clearAccountListener();
    const events = readFeature<StandardEventsFeature>(wallet, 'standard:events');
    if (events === undefined) return;
    accountUnsubscribe = events.on('change', (properties) => {
      if (disposed || requestId !== generation) return;
      const capabilitiesChanged =
        properties.chains !== undefined || properties.features !== undefined;
      if (properties.chains !== undefined) {
        activeWalletChains = [...properties.chains];
      }
      if (properties.features !== undefined) {
        activeWalletFeatures = { ...properties.features };
      }
      if (properties.accounts !== undefined) {
        handleAccountsChanged(properties.accounts, capabilitiesChanged);
        return;
      }
      if (!capabilitiesChanged) return;
      if (
        snapshot.status !== 'connected' ||
        activeWallet === null ||
        activeAccount === null
      ) {
        return;
      }
      recomputeSigning(activeWallet, activeAccount);
    });
  }

  function handleRegistryChange() {
    if (disposed) return;
    const wallets = listSolanaWallets(registry);
    const activeWalletStillRegistered = activeWallet === null || wallets.includes(activeWallet);
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
    activeWallet = null;
    activeAccount = null;
    recomputeSigning(null, null);
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

      const account = pickNetworkAccount(accounts.length > 0 ? accounts : wallet.accounts);
      if (account === undefined) {
        update({ status: 'error', error: `钱包没有提供支持 ${SOLANA_CHAIN} 的账户。` });
        return;
      }

      subscribeToAccountChanges(wallet, requestId);
      activeWallet = wallet;
      activeAccount = account;
      activeWalletChains = [...wallet.chains];
      activeWalletFeatures = { ...wallet.features };
      recomputeSigning(activeWallet, activeAccount);
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
    activeWallet = null;
    activeAccount = null;
    recomputeSigning(null, null);
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

    const walletToDisconnect = activeWallet;
    const shouldDisconnectWallet = snapshot.status === 'connected' && walletToDisconnect !== null;
    const requestId = generation + 1;
    generation = requestId;
    clearAccountListener();
    activeWallet = null;
    activeAccount = null;
    recomputeSigning(null, null);
    update({ status: 'disconnected', walletName: null, accountAddress: null, error: null, notice: null });

    // 从未连接成功时只清理本地状态，不向钱包发起多余的断开请求。
    if (!shouldDisconnectWallet || walletToDisconnect === null) return;

    const wallet = walletToDisconnect;

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
    activeWallet = null;
    activeAccount = null;
    activeSigningSession = null;
    signingRevision += 1;
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
    getSigningSession() {
      if (disposed || activeSigningSession === null) return null;
      if (!isSessionStillCurrent(activeSigningSession)) {
        activeSigningSession = null;
        signingRevision += 1;
        snapshot = {
          ...snapshot,
          signing: {
            available: false,
            reason: '签名能力已变化，请重新连接。',
            revision: signingRevision,
          },
        };
        return null;
      }
      return activeSigningSession;
    },
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

