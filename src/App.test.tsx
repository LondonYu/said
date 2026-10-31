// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import App from './App';
import type { WalletRegistry } from './wallet';
import type { SimulationCheckResult } from './simulation';

// 真实格式的 Solana 公钥，只用于展示与断言，不对应任何私钥。
const ADDRESS_A = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const ADDRESS_B = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const DEVNET_CHAIN = 'solana:devnet' as const;

type ChangeListener = (properties: { accounts?: readonly WalletAccount[] }) => void;

const mockState = vi.hoisted(() => ({ registry: undefined as unknown }));

// App 使用真实的钱包控制器；仅把注册表替换为测试用假钱包。
vi.mock('./wallet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./wallet')>();
  return {
    ...actual,
    createWalletController: () =>
      actual.createWalletController(
        mockState.registry as Parameters<typeof actual.createWalletController>[0],
      ),
  };
});

const networkMock = vi.hoisted(() => ({
  verifyDevnet: vi.fn(),
  readBalance: vi.fn(),
}));

vi.mock('./network', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./network')>();
  return {
    ...actual,
    verifyDevnet: networkMock.verifyDevnet,
    readBalance: networkMock.readBalance,
  };
});

const simulationMock = vi.hoisted(() => ({
  checkTransaction: vi.fn(),
}));

vi.mock('./simulation', () => ({
  createSimulationClient: () => ({ checkTransaction: simulationMock.checkTransaction }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function account(address: string): WalletAccount {
  return { address, publicKey: new Uint8Array(32), chains: [DEVNET_CHAIN], features: [] };
}

type FakeWalletOptions = {
  name?: string;
  accounts?: readonly WalletAccount[];
  connect?: () => Promise<{ accounts: readonly WalletAccount[] }>;
};

function createFakeWallet(options: FakeWalletOptions = {}) {
  const name = options.name ?? 'Phantom';
  const accounts = options.accounts ?? [account(ADDRESS_A)];
  const listeners = new Set<ChangeListener>();
  const connectCalls = { count: 0 };
  const connectImpl = options.connect ?? (async () => ({ accounts }));
  const features: Record<string, unknown> = {
    'standard:connect': {
      version: '1.0.0',
      connect: async () => {
        connectCalls.count += 1;
        return connectImpl();
      },
    },
    'standard:disconnect': {
      version: '1.0.0',
      disconnect: async () => {},
    },
    'standard:events': {
      version: '1.0.0',
      on: (_event: 'change', listener: ChangeListener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  };

  const wallet: Wallet = {
    version: '1.0.0',
    name,
    icon: 'data:image/svg+xml;base64,AA==',
    chains: [DEVNET_CHAIN],
    features,
    accounts,
  };

  return {
    wallet,
    connectCalls,
    emitChange(next: readonly WalletAccount[]) {
      for (const listener of [...listeners]) listener({ accounts: next });
    },
  };
}

function createFakeRegistry(initial: readonly Wallet[]): WalletRegistry {
  return {
    get: () => initial,
    on: (_event, _listener) => () => {},
  };
}

function renderWithWallets(wallets: readonly Wallet[], openWallet = true) {
  mockState.registry = createFakeRegistry(wallets);
  const view = render(<App />);
  if (openWallet) fireEvent.click(screen.getByRole('button', { name: '连接钱包' }));
  return view;
}

function openSettings(name = '设置') {
  fireEvent.click(screen.getAllByRole('button', { name })[0]!);
}

function buttonByName(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() { this.setAttribute('open', ''); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() { this.removeAttribute('open'); },
  });
  networkMock.verifyDevnet.mockReset().mockResolvedValue(undefined);
  networkMock.readBalance.mockReset().mockResolvedValue(0n);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});


describe('R1 连接等待取消', () => {
  it('取消后立即清空等待并可改连其他钱包，旧请求完成不覆盖新状态', async () => {
    const firstA = deferred<{ accounts: readonly WalletAccount[] }>();
    const pendingB = deferred<{ accounts: readonly WalletAccount[] }>();
    let attemptsA = 0;
    const walletA = createFakeWallet({
      name: 'Phantom',
      connect: () => {
        attemptsA += 1;
        return attemptsA === 1 ? firstA.promise : Promise.resolve({ accounts: [account(ADDRESS_A)] });
      },
    });
    const walletB = createFakeWallet({
      name: 'Backpack',
      accounts: [account(ADDRESS_B)],
      connect: () => pendingB.promise,
    });

    renderWithWallets([walletA.wallet, walletB.wallet]);

    fireEvent.click(await screen.findByRole('button', { name: 'Phantom' }));
    fireEvent.click(buttonByName('连接所选钱包'));

    expect(await screen.findByRole('button', { name: '取消等待' })).toBeTruthy();
    expect(screen.getByText('正在等待钱包确认…')).toBeTruthy();

    fireEvent.click(buttonByName('取消等待'));

    expect(screen.queryByText('完整公钥')).toBeNull();
    expect(screen.getByText(/不会关闭钱包弹窗或撤销授权/)).toBeTruthy();
    expect(screen.getByText(/仍在等待钱包处理：Phantom/)).toBeTruthy();
    expect(buttonByName('Phantom').disabled).toBe(false);
    expect(buttonByName('连接所选钱包').disabled).toBe(true);

    fireEvent.click(buttonByName('Backpack'));
    expect(buttonByName('连接所选钱包').disabled).toBe(false);
    fireEvent.click(buttonByName('连接所选钱包'));

    expect(await screen.findByRole('button', { name: '取消等待' })).toBeTruthy();
    expect(walletA.connectCalls.count).toBe(1);
    expect(walletB.connectCalls.count).toBe(1);

    // 旧钱包 A 的请求此刻才成功：不能恢复连接，也不能结束 B 的等待。
    await act(async () => {
      firstA.resolve({ accounts: [account(ADDRESS_A)] });
      await Promise.resolve();
    });

    expect(screen.queryByText(ADDRESS_A)).toBeNull();
    expect(screen.getByText('正在等待钱包确认…')).toBeTruthy();
    expect(screen.getByRole('button', { name: '取消等待' })).toBeTruthy();

    await act(async () => {
      pendingB.resolve({ accounts: [account(ADDRESS_B)] });
      await Promise.resolve();
    });

    expect(await screen.findByText('完整公钥')).toBeTruthy();
    expect(screen.getByText(ADDRESS_B)).toBeTruthy();
    expect(screen.queryByText(ADDRESS_A)).toBeNull();
  });

  it('同一钱包的旧请求结束前不并发弹窗，结束后可重试', async () => {
    const first = deferred<{ accounts: readonly WalletAccount[] }>();
    let attempts = 0;
    const wallet = createFakeWallet({
      connect: () => {
        attempts += 1;
        return attempts === 1 ? first.promise : Promise.resolve({ accounts: [account(ADDRESS_A)] });
      },
    });

    renderWithWallets([wallet.wallet]);

    fireEvent.click(await screen.findByRole('button', { name: 'Phantom' }));
    fireEvent.click(buttonByName('连接所选钱包'));
    fireEvent.click(await screen.findByRole('button', { name: '取消等待' }));

    expect(screen.getByText(/仍在等待钱包处理：Phantom/)).toBeTruthy();
    expect(buttonByName('连接所选钱包').disabled).toBe(true);
    fireEvent.click(buttonByName('连接所选钱包'));
    expect(wallet.connectCalls.count).toBe(1);

    await act(async () => {
      first.resolve({ accounts: [account(ADDRESS_A)] });
      await Promise.resolve();
    });

    await waitFor(() => expect(buttonByName('连接所选钱包').disabled).toBe(false));
    fireEvent.click(buttonByName('连接所选钱包'));

    expect(await screen.findByText('完整公钥')).toBeTruthy();
    expect(screen.getByText(ADDRESS_A)).toBeTruthy();
    expect(wallet.connectCalls.count).toBe(2);
  });
});

describe('R2 切换账户后的余额归属', () => {
  it('A 余额已显示时切到 B，B 首次渲染不显示 A 余额', async () => {
    const balanceA = deferred<bigint>();
    const balanceB = deferred<bigint>();
    networkMock.readBalance.mockImplementation((address: string) =>
      address === ADDRESS_A ? balanceA.promise : balanceB.promise,
    );
    const wallet = createFakeWallet({ accounts: [account(ADDRESS_A)] });

    renderWithWallets([wallet.wallet]);

    fireEvent.click(await screen.findByRole('button', { name: 'Phantom' }));
    fireEvent.click(buttonByName('连接所选钱包'));
    expect(await screen.findByText('完整公钥')).toBeTruthy();

    await act(async () => {
      balanceA.resolve(1_500_000_000n);
      await Promise.resolve();
    });
    expect(await screen.findByText(/余额：1\.5 SOL/)).toBeTruthy();

    act(() => {
      wallet.emitChange([account(ADDRESS_B)]);
    });

    expect(screen.getByText(ADDRESS_B)).toBeTruthy();
    expect(screen.queryByText(/余额：1\.5 SOL/)).toBeNull();
    expect(await screen.findByText('正在读取余额…')).toBeTruthy();

    await act(async () => {
      balanceB.resolve(2_000_000_000n);
      await Promise.resolve();
    });

    expect(await screen.findByText(/余额：2 SOL/)).toBeTruthy();
    expect(screen.queryByText(/余额：1\.5 SOL/)).toBeNull();
  });

  it('A 余额错误不显示在 B 下，B 的新结果正常显示', async () => {
    const balanceA = deferred<bigint>();
    const balanceB = deferred<bigint>();
    networkMock.readBalance.mockImplementation((address: string) =>
      address === ADDRESS_A ? balanceA.promise : balanceB.promise,
    );
    const wallet = createFakeWallet({ accounts: [account(ADDRESS_A)] });

    renderWithWallets([wallet.wallet]);

    fireEvent.click(await screen.findByRole('button', { name: 'Phantom' }));
    fireEvent.click(buttonByName('连接所选钱包'));
    expect(await screen.findByText('完整公钥')).toBeTruthy();
    expect(await screen.findByText('正在读取余额…')).toBeTruthy();

    await act(async () => {
      balanceA.reject(new Error('A 账户余额读取失败'));
      await Promise.resolve();
    });
    expect(await screen.findByText(/A 账户余额读取失败/)).toBeTruthy();

    act(() => {
      wallet.emitChange([account(ADDRESS_B)]);
    });

    expect(screen.queryByText(/A 账户余额读取失败/)).toBeNull();
    expect(await screen.findByText('正在读取余额…')).toBeTruthy();

    await act(async () => {
      balanceB.resolve(42n);
      await Promise.resolve();
    });

    expect(await screen.findByText(/余额：0\.000000042 SOL/)).toBeTruthy();
    expect(screen.queryByText(/A 账户余额读取失败/)).toBeNull();
  });

  it('切到 B 后旧 A 请求晚到也不显示，B 结果才显示', async () => {
    const balanceA = deferred<bigint>();
    const balanceB = deferred<bigint>();
    networkMock.readBalance.mockImplementation((address: string) =>
      address === ADDRESS_A ? balanceA.promise : balanceB.promise,
    );
    const wallet = createFakeWallet({ accounts: [account(ADDRESS_A)] });

    renderWithWallets([wallet.wallet]);

    fireEvent.click(await screen.findByRole('button', { name: 'Phantom' }));
    fireEvent.click(buttonByName('连接所选钱包'));
    expect(await screen.findByText('完整公钥')).toBeTruthy();
    expect(await screen.findByText('正在读取余额…')).toBeTruthy();

    act(() => {
      wallet.emitChange([account(ADDRESS_B)]);
    });

    await act(async () => {
      balanceA.resolve(7_000_000_000n);
      await Promise.resolve();
    });

    expect(screen.queryByText(/余额：7 SOL/)).toBeNull();
    expect(screen.getByText(ADDRESS_B)).toBeTruthy();

    await act(async () => {
      balanceB.resolve(3_000_000_000n);
      await Promise.resolve();
    });

    expect(await screen.findByText(/余额：3 SOL/)).toBeTruthy();
    expect(screen.queryByText(/余额：7 SOL/)).toBeNull();
  });
});


describe('1.1A.1 页面和真实钱包入口', () => {
  it('未发现钱包时不伪造Phantom或OKX；注册钱包后不自动连接', async () => {
    const wallet = createFakeWallet();
    let wallets: readonly Wallet[] = [];
    const registered = new Set<(...items: Wallet[]) => void>();
    mockState.registry = {
      get: () => wallets,
      on: (event: string, listener: (...items: Wallet[]) => void) => {
        if (event === 'register') registered.add(listener);
        return () => registered.delete(listener);
      },
    };
    render(<App />);
    expect(wallet.connectCalls.count).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: '连接钱包' }));
    expect(screen.getByText('未发现支持 Solana 的浏览器钱包。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Phantom' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'OKX Wallet' })).toBeNull();
    act(() => {
      wallets = [wallet.wallet];
      for (const listener of registered) listener(wallet.wallet);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Phantom' }));
    expect(wallet.connectCalls.count).toBe(0);
    fireEvent.click(buttonByName('连接所选钱包'));
    expect(await screen.findByText(ADDRESS_A)).toBeTruthy();
    expect(wallet.connectCalls.count).toBe(1);
  });

  it('钱包侧清空账户后，账户弹层清除地址和余额', async () => {
    const wallet = createFakeWallet();
    networkMock.readBalance.mockResolvedValue(9_000_000_000n);
    renderWithWallets([wallet.wallet]);
    fireEvent.click(await screen.findByRole('button', { name: 'Phantom' }));
    fireEvent.click(buttonByName('连接所选钱包'));
    expect(await screen.findByText(/余额：9 SOL/)).toBeTruthy();
    act(() => wallet.emitChange([]));
    expect(screen.queryByText(ADDRESS_A)).toBeNull();
    expect(screen.queryByText(/余额：9 SOL/)).toBeNull();
    expect(buttonByName('连接所选钱包')).toBeTruthy();
  });

  it('系统主题实时变化，主题和语言在重新挂载后保留', async () => {
    let mediaListener: ((event: { matches: boolean }) => void) | undefined;
    const removeListener = vi.fn();
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      addEventListener: (_name: string, listener: typeof mediaListener) => { mediaListener = listener; },
      removeEventListener: removeListener,
    })));
    const view = renderWithWallets([], false);
    openSettings();
    fireEvent.click(buttonByName('跟随系统'));
    expect(document.documentElement.dataset.theme).toBe('light');
    act(() => mediaListener?.({ matches: true }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(buttonByName('English'));
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    view.unmount();
    expect(removeListener).toHaveBeenCalled();
    renderWithWallets([], false);
    expect(document.documentElement.lang).toBe('en');
    openSettings('Settings');
    expect(buttonByName('Use device setting').getAttribute('aria-pressed')).toBe('true');
    expect(buttonByName('English').getAttribute('aria-pressed')).toBe('true');
  });

  it('损坏或不可访问的本地设置不阻断页面和设置切换', () => {
    localStorage.setItem('said-preferences', '{broken');
    const view = renderWithWallets([], false);
    expect(document.documentElement.lang).toBe('zh-CN');
    view.unmount();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    renderWithWallets([], false);
    openSettings();
    fireEvent.click(buttonByName('浅色'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByText('当前无法保存设置，刷新后将恢复默认。')).toBeTruthy();
  });

  it('英文界面实际拒绝连接后显示英文错误并可重试', async () => {
    localStorage.setItem('said-preferences', JSON.stringify({ theme: 'dark', lang: 'en' }));
    const wallet = createFakeWallet({ connect: async () => { throw { code: 4001 }; } });
    renderWithWallets([wallet.wallet], false);
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Phantom' }));
    fireEvent.click(buttonByName('Connect selected wallet'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Connection declined in your wallet.')).toBeTruthy();
    expect(buttonByName('Connect selected wallet').disabled).toBe(false);
  });
});

describe('1.1A.2 示例流与编辑预览', () => {
  it('首页显示明确标注的示例流，不伪造链上状态或哈希', () => {
    renderWithWallets([], false);
    expect(screen.getByText('示例留言 · 未上链')).toBeTruthy();
    expect(screen.getByText(/以下为明确标注的静态示例/)).toBeTruthy();
    expect(screen.getByText(/今天开始做第一个小项目/)).toBeTruthy();
    expect(screen.queryByText(/交易哈希|已上链|签名成功/)).toBeNull();
  });

  it('搜索只过滤本地示例，无匹配时显示空结果', () => {
    renderWithWallets([], false);
    fireEvent.click(screen.getAllByRole('button', { name: '搜索' })[0]);
    const dialog = screen.getByRole('dialog');
    const scoped = within(dialog);

    const input = scoped.getByLabelText('搜索示例留言') as HTMLInputElement;
    expect(scoped.getByText(/仅搜索本页示例内容和示例账户名称/)).toBeTruthy();

    fireEvent.change(input, { target: { value: '手机钱包' } });
    expect(scoped.getByText(/有人在用手机钱包吗/)).toBeTruthy();
    expect(scoped.queryByText(/今天开始做第一个小项目/)).toBeNull();

    fireEvent.change(input, { target: { value: '不存在的关键字' } });
    expect(scoped.getByText('没有匹配的示例留言')).toBeTruthy();
  });

  it('示例详情标记本地预览，不出现链上哈希', () => {
    renderWithWallets([], false);
    fireEvent.click(screen.getAllByRole('button', { name: '查看详情' })[0]);
    const scoped = within(screen.getByRole('dialog'));

    expect(scoped.getByRole('heading', { name: '留言详情' })).toBeTruthy();
    expect(scoped.getByText('本地预览，未上链')).toBeTruthy();
    expect(scoped.getByText(/今天开始做第一个小项目/)).toBeTruthy();
    expect(scoped.getByText('sample.01')).toBeTruthy();
    expect(scoped.queryByText(/0x[0-9a-fA-F]{20,}/)).toBeNull();
  });

  it('编辑预览校验空白、140字符与560字节限制，预览可返回，关闭弹层草稿保留', () => {
    renderWithWallets([], false);
    fireEvent.click(screen.getAllByRole('button', { name: '发布' })[0]);

    expect(screen.getByRole('heading', { name: '编辑预览' })).toBeTruthy();
    expect(screen.getByText('本地预览，未上链')).toBeTruthy();
    expect(buttonByName('预览内容').disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('留言内容'), { target: { value: '你好 👋' } });
    expect(buttonByName('预览内容').disabled).toBe(false);
    fireEvent.click(buttonByName('预览内容'));
    expect(screen.getByText('你好 👋')).toBeTruthy();

    fireEvent.click(buttonByName('返回修改'));

    // 超过140个grapheme。
    fireEvent.change(screen.getByLabelText('留言内容'), { target: { value: '你'.repeat(141) } });
    expect(screen.getByText(/141 \/ 140 字符/)).toBeTruthy();
    expect(buttonByName('预览内容').disabled).toBe(true);

    // ZWJ序列是1个grapheme但UTF-8字节很多：字符数仍为140，字节数超过560。
    fireEvent.change(screen.getByLabelText('留言内容'), { target: { value: '👨‍👩‍👧‍👦'.repeat(140) } });
    expect(screen.getByText(/140 \/ 140 字符/)).toBeTruthy();
    expect(buttonByName('预览内容').disabled).toBe(true);

    // 关闭弹层后草稿仍保留，重新打开可继续编辑。
    fireEvent.change(screen.getByLabelText('留言内容'), { target: { value: '你好 👋' } });
    fireEvent.click(screen.getAllByRole('button', { name: '关闭' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '发布' })[0]);
    expect((screen.getByLabelText('留言内容') as HTMLTextAreaElement).value).toBe('你好 👋');
  });

  it('示例流与编辑预览随语言切换', () => {
    localStorage.setItem('said-preferences', JSON.stringify({ theme: 'dark', lang: 'en' }));
    renderWithWallets([], false);
    expect(screen.getByText('Sample posts · Not on chain')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Post' })[0]);
    expect(screen.getByRole('heading', { name: 'Editor preview' })).toBeTruthy();
    expect(screen.getByText('Local preview. Not on chain.')).toBeTruthy();
  });
});


describe('2.1 交易检查', () => {
  function simulationResult(overrides: Partial<SimulationCheckResult> = {}): SimulationCheckResult {
    return {
      feePayer: ADDRESS_A,
      text: '你好 👋',
      balanceLamports: 1_000_000n,
      feeLamports: 5000n,
      transactionSizeBytes: 123,
      blockhash: 'B'.repeat(43),
      lastValidBlockHeight: 10n,
      blockHeight: 5n,
      simulationErr: null,
      simulationLogs: [],
      simulationUnitsConsumed: null,
      blockhashExpired: false,
      ...overrides,
    };
  }

  async function connectAndOpenWriter() {
    const wallet = createFakeWallet();
    renderWithWallets([wallet.wallet]);
    fireEvent.click(await screen.findByRole('button', { name: 'Phantom' }));
    fireEvent.click(buttonByName('连接所选钱包'));
    await screen.findByText(ADDRESS_A);
    fireEvent.click(screen.getAllByRole('button', { name: '关闭' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '发布' })[0]);
    fireEvent.change(screen.getByLabelText('留言内容'), { target: { value: '你好 👋' } });
    fireEvent.click(buttonByName('预览内容'));
    return wallet;
  }

  it('未连接时检查交易按钮禁用并提示先连接钱包', () => {
    renderWithWallets([], false);
    fireEvent.click(screen.getAllByRole('button', { name: '发布' })[0]);
    fireEvent.change(screen.getByLabelText('留言内容'), { target: { value: '你好' } });
    fireEvent.click(buttonByName('预览内容'));
    expect(buttonByName('检查交易').disabled).toBe(true);
    expect(screen.getByText('请先连接钱包后再检查交易。')).toBeTruthy();
  });

  it('连接后展示付款公钥、正文、0 SOL、估费、大小和未签名提示', async () => {
    simulationMock.checkTransaction.mockResolvedValue(simulationResult());
    await connectAndOpenWriter();

    fireEvent.click(buttonByName('检查交易'));

    expect(await screen.findByText('交易检查摘要')).toBeTruthy();
    expect(screen.getByText(ADDRESS_A)).toBeTruthy();
    expect(screen.getByText('0 SOL（公开板级标记）')).toBeTruthy();
    expect(screen.getByText('0.000005 SOL')).toBeTruthy();
    expect(screen.getByText('0.001 SOL')).toBeTruthy();
    expect(screen.getByText('123 B')).toBeTruthy();
    expect(screen.getByText('模拟通过（未验证签名，未广播，不等于上链成功）')).toBeTruthy();
    expect(screen.getByText('未签名、未上链')).toBeTruthy();
  });

  it('余额不足时显示不足提示，不显示模拟通过', async () => {
    simulationMock.checkTransaction.mockResolvedValue(simulationResult({ balanceLamports: 0n, feeLamports: 5000n }));
    await connectAndOpenWriter();

    fireEvent.click(buttonByName('检查交易'));

    expect(await screen.findByText('余额不足，无法覆盖估算费用；未显示为模拟成功。')).toBeTruthy();
    expect(screen.getByText('未执行（余额不足）')).toBeTruthy();
    expect(screen.queryByText(/模拟通过/)).toBeNull();
  });

  it('检查失败显示错误并可重试', async () => {
    simulationMock.checkTransaction.mockRejectedValueOnce(new Error('RPC 503'));
    await connectAndOpenWriter();

    fireEvent.click(buttonByName('检查交易'));

    expect(await screen.findByText('交易检查失败，请重试。')).toBeTruthy();
    fireEvent.click(buttonByName('重试'));
    expect(simulationMock.checkTransaction).toHaveBeenCalledTimes(2);
  });

  it('连点只检查一次；切账户后旧检查结果失效', async () => {
    const gate = deferred<SimulationCheckResult>();
    simulationMock.checkTransaction.mockReturnValue(gate.promise);
    const wallet = await connectAndOpenWriter();

    fireEvent.click(buttonByName('检查交易'));
    const checkingButton = buttonByName('正在检查交易…');
    expect(checkingButton.disabled).toBe(true);
    fireEvent.click(checkingButton);
    expect(simulationMock.checkTransaction).toHaveBeenCalledTimes(1);

    act(() => wallet.emitChange([account(ADDRESS_B)]));
    await act(async () => {
      gate.resolve(simulationResult());
      await Promise.resolve();
    });

    expect(screen.queryByText('交易检查摘要')).toBeNull();
    expect(screen.queryByText(ADDRESS_A)).toBeNull();
  });
});

