import { useEffect, useMemo, useRef, useState } from 'react';
import type { Wallet } from '@wallet-standard/base';
import { readBalance, verifyDevnet } from './network';
import { createWalletController, type WalletController, type WalletSnapshot } from './wallet';
import { createSimulationClient, type SimulationCheckResult } from './simulation';
import { translations, type Labels } from './i18n';
import { usePreferences, type Theme } from './usePreferences';
import { Logo, Wordmark } from './Brand';
import { Icon } from './Icons';
import { Modal } from './Modal';
import { PreviewEditor } from './Preview';
import { createHistoryClient, type GuestbookMessage } from './history';
import { useHistoryFeed } from './historyFeed';
import { HistoryDetail, HistoryFeedView, HistorySearch } from './HistoryViews';

type NetworkState =
  | { status: 'checking' }
  | { status: 'ready'; address: string | null }
  | { status: 'error'; address: string | null; message: string };

type BalanceState =
  | { status: 'loading' }
  | { status: 'ready'; lamports: bigint }
  | { status: 'error'; message: string };

type TxCheckState =
  | { status: 'idle' }
  | { status: 'loading'; account: string; text: string }
  | { status: 'ready'; account: string; text: string; result: SimulationCheckResult }
  | { status: 'error'; account: string; text: string; error: string };

const LAMPORTS_PER_SOL = 1_000_000_000n;

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return '未知错误，请重试。';
}

function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction === '' ? whole.toString() : `${whole}.${fraction}`;
}

/**
 * 余额状态属于某个具体账户。调用方按 `${address}:${attempt}` 作为 key，
 * 换账户时整个组件同步重建，绝不沿用上一个账户的余额、错误或 loading。
 */
function BalancePanel({
  address,
  networkReady,
  attempt,
  onRetry,
  labels,
}: {
  address: string;
  networkReady: boolean;
  attempt: number;
  onRetry: () => void;
  labels: Labels;
}) {
  const [balance, setBalance] = useState<BalanceState>({ status: 'loading' });

  useEffect(() => {
    if (!networkReady) return;

    const abort = new AbortController();
    let cancelled = false;
    setBalance({ status: 'loading' });

    void (async () => {
      try {
        const lamports = await readBalance(address, abort.signal);
        if (!cancelled) setBalance({ status: 'ready', lamports });
      } catch (error) {
        if (!cancelled) setBalance({ status: 'error', message: toMessage(error) });
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [address, networkReady, attempt]);

  if (!networkReady) return null;

  return (
    <div className="balance-panel" aria-live="polite">
      {balance.status === 'loading' && <p>{labels.balanceLoading}</p>}
      {balance.status === 'ready' && <p className="balance">{labels.balance}{formatSol(balance.lamports)} {labels.testSol}</p>}
      {balance.status === 'error' && <>
        <ErrorNotice message={balance.message} title={labels.balanceError} labels={labels} />
        <button className="button secondary" type="button" onClick={onRetry}>{labels.retry}</button>
      </>}
    </div>
  );
}

function TransactionSummary({ result, labels }: { result: SimulationCheckResult; labels: Labels }) {
  const insufficient = result.feeLamports !== null && result.balanceLamports < result.feeLamports;
  const expired = result.blockhashExpired;
  return (
    <div className="tx-summary">
      <p className="section-label">{labels.txSummary}</p>
      <dl className="tx-facts">
        <div><dt>{labels.txFeePayer}</dt><dd><code>{result.feePayer}</code></dd></div>
        <div><dt>{labels.txBody}</dt><dd className="tx-body">{result.text}</dd></div>
        <div><dt>{labels.txTransfer}</dt><dd>{labels.zeroSolTransfer}</dd></div>
        <div><dt>{labels.txFee}</dt><dd>{result.feeLamports === null ? labels.txFeeUnknown : `${formatSol(result.feeLamports)} SOL`}</dd></div>
        <div><dt>{labels.txBalance}</dt><dd>{formatSol(result.balanceLamports)} SOL</dd></div>
        <div><dt>{labels.txSize}</dt><dd>{result.transactionSizeBytes} B</dd></div>
        <div>
          <dt>{labels.txSimulate}</dt>
          <dd>{insufficient ? labels.txSimulateBlocked : expired ? labels.txBlockExpired : result.simulationErr === null ? labels.txSimulateOk : labels.txSimulateErr}</dd>
        </div>
      </dl>
      {result.simulationErr !== null && (
        <details className="tx-error-detail"><summary>{labels.details}</summary><p className="error-detail">{String(result.simulationErr)}</p></details>
      )}
      {expired && <p className="error" role="alert">{labels.txBlockExpired}</p>}
      {insufficient && <p className="error" role="alert">{labels.txInsufficient}</p>}
      <p className="hint">{labels.txUnsigned}</p>
    </div>
  );
}

function ErrorNotice({ message, title, labels }: { message: string; title: string; labels: Labels }) {
  const known = message.includes('已在钱包中拒绝') ? labels.rejected
    : message.includes('standard:connect') ? labels.unsupported
    : message.includes('钱包没有提供') ? labels.noDevnetAccount : null;
  return <div className="error" role="alert">
    <p>{known ?? title}</p>
    {!known && <details><summary>{labels.details}</summary><p className="error-detail">{message}</p></details>}
  </div>;
}

function WalletNotice({ message, labels }: { message: string; labels: Labels }) {
  const text = message.startsWith('已停止') ? labels.cancelledWait
    : message.includes('上一次连接仍在等待') ? labels.pendingHint
    : message.includes('断开') || message.includes('standard:disconnect') ? labels.localDisconnect
    : labels.cleared;
  return <p className="notice" role="status">{text}</p>;
}

function useWalletController(): {
  controller: WalletController | null;
  snapshot: WalletSnapshot | null;
} {
  const [controller, setController] = useState<WalletController | null>(null);
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);

  useEffect(() => {
    // StrictMode 会挂载两次：每次都在清理函数里 dispose，避免监听累积。
    const instance = createWalletController();
    setController(instance);
    setSnapshot(instance.getSnapshot());
    const unsubscribe = instance.subscribe(() => setSnapshot(instance.getSnapshot()));
    return () => {
      unsubscribe();
      instance.dispose();
    };
  }, []);

  return { controller, snapshot };
}

export default function App() {
  const { preferences, setPreferences, storageAvailable } = usePreferences();
  const labels = translations[preferences.lang];
  const [modal, setModal] = useState<'wallet' | 'settings' | 'guide' | 'write' | 'search' | 'detail' | null>(null);
  const [tab, setTab] = useState<'home' | 'mine'>('home');
  // 编辑预览的草稿只保存在本次页面内存中；关闭弹层不丢失，刷新后不保留。
  const [draft, setDraft] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<GuestbookMessage | null>(null);
  const [selectedMessageAccount, setSelectedMessageAccount] = useState<string | null>(null);
  const [detailReturn, setDetailReturn] = useState<'home' | 'search'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScopeTab, setSearchScopeTab] = useState<'home' | 'mine'>('home');
  const [searchAccount, setSearchAccount] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      document.documentElement.style.setProperty('--viewport-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
      document.documentElement.style.setProperty('--viewport-top', `${window.visualViewport?.offsetTop ?? 0}px`);
    };
    sync();
    window.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('scroll', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('scroll', sync);
    };
  }, []);
  const { controller, snapshot } = useWalletController();
  const [selectedWalletName, setSelectedWalletName] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [activeAction, setActiveAction] = useState<number | null>(null);
  const actionSeq = useRef(0);
  const [network, setNetwork] = useState<NetworkState>({ status: 'checking' });
  const simulation = useMemo(() => createSimulationClient(), []);
  const [check, setCheck] = useState<TxCheckState>({ status: 'idle' });
  const checkSeq = useRef(0);
  const checkAbort = useRef<AbortController | null>(null);

  const wallets = snapshot?.wallets ?? [];
  const accountAddress = snapshot?.accountAddress ?? null;
  const status = snapshot?.status ?? 'disconnected';
  const connecting = status === 'connecting';
  const selectedWallet: Wallet | null =
    wallets.find((wallet) => wallet.name === selectedWalletName) ?? null;
  const pendingWalletNames = snapshot?.pendingWalletNames ?? [];
  const selectedWalletPending =
    selectedWallet !== null && pendingWalletNames.includes(selectedWallet.name);
  const busy = activeAction !== null;
  const historyClient = useMemo(() => createHistoryClient(), []);
  const boardFeed = useHistoryFeed({ client: historyClient, scope: { kind: 'board' } });
  const accountAddressRef = useRef(accountAddress);
  // 钱包在页面打开期间切换/断开时，旧账户的详情与搜索上下文立即失效。
  useEffect(() => {
    if (accountAddressRef.current === accountAddress) return;
    accountAddressRef.current = accountAddress;
    setSelectedMessage(null);
    setSelectedMessageAccount(null);
    setDetailReturn('home');
    setSearchQuery('');
    setSearchScopeTab('home');
    setSearchAccount(null);
    setModal((previous) => (previous === 'detail' || previous === 'search' ? null : previous));
  }, [accountAddress]);
  const mineScope = useMemo(
    () => (accountAddress === null ? { kind: 'board' as const } : { kind: 'author' as const, author: accountAddress }),
    [accountAddress],
  );
  // 我的留言只在已连接且进入该页时独立查询，绝不复用公共首页结果。
  const mineFeed = useHistoryFeed({ client: historyClient, scope: mineScope, enabled: tab === 'mine' && accountAddress !== null });

  const networkReadyForAccount = network.status === 'ready' && network.address === accountAddress;
  const networkErrorForAccount = network.status === 'error' && network.address === accountAddress;
  const networkLabel = networkReadyForAccount ? 'Devnet' : networkErrorForAccount ? labels.notReady : labels.checking;

  // 钱包被取消注册后清空已选项，不自动静默改选其他钱包。
  useEffect(() => {
    if (selectedWalletName !== null && !wallets.some((wallet) => wallet.name === selectedWalletName)) {
      setSelectedWalletName(null);
    }
  }, [selectedWalletName, wallets]);

  // 账户、草稿或弹层变化时，交易检查结果立即失效并取消页面侧等待中的请求。
  useEffect(() => {
    checkSeq.current += 1;
    checkAbort.current?.abort();
    checkAbort.current = null;
    setCheck({ status: 'idle' });
  }, [accountAddress, draft, modal]);

  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;
    setNetwork({ status: 'checking' });

    void (async () => {
      try {
        await verifyDevnet(abort.signal);
      } catch (error) {
        if (!cancelled) setNetwork({ status: 'error', address: accountAddress, message: toMessage(error) });
        return;
      }
      if (cancelled) return;
      // 记录本次校验对应的账户，切换账户后旧结果不能显示为新账户的状态。
      setNetwork({ status: 'ready', address: accountAddress });
    })();

    return () => {
      // 账户切换或卸载时取消旧校验，旧结果不能覆盖新账户。
      cancelled = true;
      abort.abort();
    };
  }, [accountAddress, attempt]);

  async function runAction(action: () => Promise<void>): Promise<void> {
    const actionId = actionSeq.current + 1;
    actionSeq.current = actionId;
    setActiveAction(actionId);
    try {
      await action();
    } finally {
      // 旧 connect 的 finally 只能清理自己的 action，不能解锁后来发起的新操作。
      setActiveAction((current) => (current === actionId ? null : current));
    }
  }

  function handleConnect() {
    if (controller === null || selectedWallet === null) return;
    void runAction(() => controller.connect(selectedWallet));
  }

  function handleCancelConnect() {
    if (controller === null) return;
    // 立即释放页面等待，并让挂起的 connect 结果在控制器和页面两侧都失效。
    actionSeq.current += 1;
    setActiveAction(null);
    controller.cancelConnect();
  }

  function handleDisconnect() {
    if (controller === null) return;
    void runAction(() => controller.disconnect());
  }

  function handleRetry() {
    setNetwork({ status: 'checking' });
    setAttempt((current) => current + 1);
  }

  function handleCheckTransaction() {
    if (controller === null || accountAddress === null) return;
    if (check.status === 'loading') return;

    const requestId = checkSeq.current + 1;
    checkSeq.current = requestId;
    const abort = new AbortController();
    checkAbort.current?.abort();
    checkAbort.current = abort;
    setCheck({ status: 'loading', account: accountAddress, text: draft });

    void (async () => {
      try {
        const result = await simulation.checkTransaction({ feePayer: accountAddress, text: draft, signal: abort.signal });
        if (requestId !== checkSeq.current) return;
        setCheck({ status: 'ready', account: accountAddress, text: draft, result });
      } catch (error) {
        if (requestId !== checkSeq.current) return;
        setCheck({ status: 'error', account: accountAddress, text: draft, error: toMessage(error) });
      } finally {
        if (requestId === checkSeq.current) checkAbort.current = null;
      }
    })();
  }

  const connected = accountAddress !== null;

  const checking = check.status === 'loading';
  const checkResult =
    check.status === 'ready' && check.account === accountAddress && check.text === draft ? check.result : null;
  const checkError =
    check.status === 'error' && check.account === accountAddress && check.text === draft ? check.error : null;
  const checkSummary =
    accountAddress === null ? (
      <p className="hint">{labels.txNotConnected}</p>
    ) : checkResult !== null ? (
      <TransactionSummary result={checkResult} labels={labels} />
    ) : checkError !== null ? (
      <>
        <ErrorNotice message={checkError} title={labels.txError} labels={labels} />
        <button className="button secondary" type="button" onClick={handleCheckTransaction}>{labels.retry}</button>
      </>
    ) : checking ? (
      <p className="hint">{labels.checkingTx}</p>
    ) : (
      <p className="hint">{labels.checkTxHint}</p>
    );


  const shortAddress = accountAddress === null ? null : `${accountAddress.slice(0, 5)}…${accountAddress.slice(-4)}`;
  const openWallet = () => setModal('wallet');
  const openSearch = () => {
    // 未连接的“我的”没有作者范围可搜；此时退回公共已加载范围，避免显示空账户范围。
    const nextTab = tab === 'mine' && accountAddress !== null ? 'mine' : 'home';
    setSearchScopeTab(nextTab);
    setSearchAccount(accountAddress);
    setModal('search');
  };
  const searchContextCurrent = searchAccount === accountAddress;
  const visibleSearchScopeTab = searchContextCurrent ? searchScopeTab : 'home';
  const detailContextCurrent = selectedMessage === null || selectedMessageAccount === accountAddress;
  const visibleModal =
    (modal === 'search' && !searchContextCurrent) || (modal === 'detail' && !detailContextCurrent)
      ? null
      : modal;
  const searchFeed = visibleSearchScopeTab === 'home' ? boardFeed : mineFeed;
  const nav = [
    { name: labels.home, icon: 'home', active: tab === 'home', click: () => setTab('home') },
    { name: labels.search, icon: 'search', active: false, click: openSearch },
    { name: labels.write, icon: 'plus', active: false, click: () => setModal('write') },
    { name: labels.mine, icon: 'user', active: tab === 'mine', click: () => setTab('mine') },
  ] as const;
  const modalTitle = modal === 'wallet' ? connected ? labels.account : labels.connectWallet
    : modal === 'settings' ? labels.settings
      : modal === 'guide' ? labels.walletGuide
        : modal === 'search' ? labels.search
          : modal === 'write' ? labels.editPreview
            : modal === 'detail' ? labels.postDetails
              : labels.unavailable;

  return (
    <>
      <a className="skip-link" href="#main">{labels.home}</a>
      <nav className="rail" aria-label={labels.navigation}>
        <button className="brand" type="button" aria-label="Said" onClick={() => setTab('home')}>
          <Logo className="brand-icon" /><Wordmark />
        </button>
        <div className="rail-main">
          {nav.map((item) => <button key={item.icon} type="button" className={`nav-button nav-${item.icon}${item.active ? ' active' : ''}`}
            aria-label={item.name} aria-current={item.active ? 'page' : undefined} onClick={item.click}>
            <Icon name={item.icon} /><span>{item.name}</span>
          </button>)}
        </div>
        <button className="nav-button rail-settings" type="button" aria-label={labels.settings} onClick={() => setModal('settings')}>
          <Icon name="settings" /><span>{labels.settings}</span>
        </button>
      </nav>

      <main id="main" className="layout">
        <header className="page-header">
          <button className="icon-button mobile-menu" type="button" aria-label={labels.settings} onClick={() => setModal('settings')}><Icon name="menu" /></button>
          <button className="mobile-brand" type="button" aria-label="Said" onClick={() => setTab('home')}>
            <span className="mobile-brand-line"><Logo className="mobile-logo" /><Wordmark /></span>
            <span className="mobile-context">{labels.readOnly}</span>
          </button>
          <h1>{tab === 'home' ? labels.home : labels.mine}</h1>
          <button className="icon-button mobile-search" type="button" aria-label={labels.search} onClick={openSearch}><Icon name="search" /></button>
          <button className="button header-account" type="button" onClick={openWallet}>{shortAddress ?? labels.login}</button>
        </header>
        <div className="view-context">{labels.readOnly}</div>
        <section className="feed-shell" aria-label={tab === 'home' ? labels.home : labels.mine}>
          <div className="inline-composer">
            <button type="button" className="avatar" aria-label={labels.account} onClick={openWallet}><Icon name="user" /></button>
            <div className="composer-copy">
              <button className="composer-account" type="button" onClick={openWallet}>{shortAddress ?? labels.connectWallet}</button>
              <button className="composer-prompt" type="button" onClick={() => setModal('write')}>{labels.prompt}</button>
            </div>
            <button className="button secondary desktop-post" type="button" onClick={() => setModal('write')}>{labels.write}</button>
          </div>
          {tab === 'home' ? (
            <HistoryFeedView
              feed={boardFeed}
              labels={labels}
              note={labels.historyBoardNote}
              onDetail={(message) => {
                setSelectedMessage(message);
                setSelectedMessageAccount(accountAddress);
                setDetailReturn('home');
                setModal('detail');
              }}
            />
          ) : connected ? (
            <HistoryFeedView
              feed={mineFeed}
              labels={labels}
              note={labels.historyMineNote}
              onDetail={(message) => {
                setSelectedMessage(message);
                setSelectedMessageAccount(accountAddress);
                setDetailReturn('home');
                setModal('detail');
              }}
            />
          ) : (
            <div className="empty-state">
              <Logo className="empty-logo" />
              <h2>{labels.mineConnectTitle}</h2>
              <p>{labels.mineConnectNote}</p>
              <button className="button secondary" type="button" onClick={openWallet}>{labels.connectWallet}</button>
            </div>
          )}
        </section>
      </main>

      {visibleModal !== null && <Modal title={modalTitle} closeLabel={labels.close} onClose={() => setModal(null)}>
        {modal === 'settings' && <>
          <section className="settings-group" aria-labelledby="appearance-heading">
            <h3 id="appearance-heading">{labels.appearance}</h3>
            <div className="theme-grid">
              {(['light', 'dark', 'system'] as const).map((theme: Theme) => <button key={theme} type="button" className="theme-option"
                aria-pressed={preferences.theme === theme} onClick={() => setPreferences((current) => ({ ...current, theme }))}>
                <Icon name={theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'monitor'} /><span>{labels[theme]}</span>
              </button>)}
            </div>
          </section>
          <section className="settings-group" aria-labelledby="language-heading">
            <h3 id="language-heading">{labels.language}</h3>
            {([['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['en', 'English']] as const).map(([lang, title]) => <button key={lang} type="button" className="language-row"
              aria-pressed={preferences.lang === lang} onClick={() => setPreferences((current) => ({ ...current, lang }))}>
              {title}{preferences.lang === lang && <Icon name="check" />}
            </button>)}
          </section>
          <p className="hint" role="status">{storageAvailable ? labels.settingsNote : labels.storageError}</p>
        </>}

        {modal === 'wallet' && <>
          <div className="login-logo"><Logo /></div>
          {snapshot === null && <p className="hint">{labels.initializing}</p>}
          {snapshot !== null && wallets.length === 0 && <>
            <p>{labels.noWallets}</p><p className="hint">{labels.installHint}</p>
          </>}
          {snapshot !== null && wallets.length > 0 && !connected && <>
            <p className="hint">{labels.chooseWallet}</p>
            <ul className="wallet-list">
              {wallets.map((wallet, index) => <li key={`${wallet.name}-${index}`}>
                <button className="wallet-option" type="button" aria-pressed={selectedWallet?.name === wallet.name}
                  onClick={() => setSelectedWalletName(wallet.name)} disabled={connecting}>
                  <span className="wallet-initial" aria-hidden="true">{wallet.name.slice(0, 1)}</span><span>{wallet.name}</span>
                  {selectedWallet?.name === wallet.name && <Icon name="check" />}
                </button>
              </li>)}
            </ul>
            <div className="actions">
              <button type="button" className="button" onClick={handleConnect} disabled={selectedWallet === null || connecting || selectedWalletPending || busy}>
                {connecting ? labels.connecting : labels.connect}
              </button>
              {connecting && <button type="button" className="button secondary" onClick={handleCancelConnect}>{labels.cancelWait}</button>}
            </div>
            {connecting && <p className="hint">{labels.cancelHint}</p>}
            {!connecting && pendingWalletNames.length > 0 && <p className="notice" role="status">
              {labels.pending}{pendingWalletNames.join('、')}。{labels.pendingHint}
            </p>}
          </>}
          {connected && <>
            <p className="wallet-name">{labels.connectedWallet}：<strong>{snapshot?.walletName}</strong></p>
            <p className="section-label">{labels.fullAddress}</p>
            <code className="address">{accountAddress}</code>
            <p className="hint">{labels.accountHint}</p>
            <button type="button" className="button secondary" onClick={handleDisconnect} disabled={busy}>{labels.disconnect}</button>
          </>}
          {snapshot?.error && <ErrorNotice message={snapshot.error} title={labels.walletError} labels={labels} />}
          {snapshot?.notice && <WalletNotice message={snapshot.notice} labels={labels} />}

          <section className="network-panel" aria-labelledby="network-heading">
            <h3 id="network-heading">{labels.network}</h3>
            <p className="hint">{labels.queryNetwork}{networkLabel}</p>
            {networkErrorForAccount && network.status === 'error' && <>
              <ErrorNotice message={network.message} title={labels.networkError} labels={labels} />
              <button className="button secondary" type="button" onClick={handleRetry}>{labels.retry}</button>
            </>}
            {accountAddress !== null ? <BalancePanel key={`${accountAddress}:${attempt}`} address={accountAddress}
              networkReady={networkReadyForAccount} attempt={attempt} onRetry={handleRetry} labels={labels} />
              : <p className="hint">{labels.connectForBalance}</p>}
            <p className="hint">{labels.networkHint}</p>
          </section>
          <details className="devnet-guide"><summary>{labels.devnetGuide}</summary><p className="hint">{labels.phantomPath}</p><p className="hint">{labels.rpcHint}</p></details>
          <button className="help-link" type="button" onClick={() => setModal('guide')}>{labels.walletHelp}</button>
          <p className="connection-note">{labels.connectionNote}</p>
        </>}
        {modal === 'guide' && <>
          <ol className="help-steps"><li>{labels.guide1}</li><li>{labels.guide2}</li><li>{labels.guide3}</li></ol>
          <button className="button secondary" type="button" onClick={openWallet}>{labels.back}</button>
        </>}
        {modal === 'search' && (
          <HistorySearch
            labels={labels}
            messages={searchFeed.messages}
            query={searchQuery}
            onQuery={(value) => {
              setSearchAccount(accountAddress);
              setSearchQuery(value);
            }}
            scopeLabel={visibleSearchScopeTab === 'home' ? labels.searchBoardScope : labels.searchMineScope}
            onDetail={(message) => {
              setSelectedMessage(message);
              setSelectedMessageAccount(accountAddress);
              setDetailReturn('search');
              setModal('detail');
            }}
          />
        )}
        {modal === 'write' && (
          <PreviewEditor
            labels={labels}
            draft={draft}
            onDraft={setDraft}
            onCheck={handleCheckTransaction}
            checkDisabled={accountAddress === null}
            checking={checking}
            checkSummary={checkSummary}
          />
        )}
        {modal === 'detail' && selectedMessage !== null && detailContextCurrent && (
          <>
            <HistoryDetail labels={labels} language={preferences.lang} message={selectedMessage} />
            <div className="preview-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setSelectedMessage(null);
                  setSelectedMessageAccount(null);
                  setModal(detailReturn === 'search' ? 'search' : null);
                }}
              >
                {labels.back}
              </button>
            </div>
          </>
        )}
      </Modal>}
    </>
  );
}
