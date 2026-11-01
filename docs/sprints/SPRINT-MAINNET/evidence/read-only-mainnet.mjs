import { createServer } from 'vite';

process.env.VITE_SOLANA_NETWORK = 'mainnet';

const RPC_TIMEOUT_MS = 15_000;
const FLOW_LABEL_KEYS = [
  'readOnly',
  'accountHint',
  'guide3',
  'networkName',
  'balanceUnit',
  'connectForBalance',
  'networkHint',
  'walletNetworkGuide',
  'phantomPath',
  'rpcHint',
  'noNetworkAccount',
  'publishSection',
  'publishIrreversible',
  'publishNoSession',
  'publishOpenExplorer',
  'onChainFeed',
  'onChainBadge',
  'historyBoardNote',
  'openInExplorer',
];

function localTimestamp() {
  return `${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })}+08:00`;
}

async function rpc(config, method, params) {
  const response = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `${method}-1`, method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}: ${JSON.stringify(body)}`);
  if (body.error !== undefined) throw new Error(`${method} RPC error: ${JSON.stringify(body.error)}`);
  return body.result;
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const network = await server.ssrLoadModule('/src/network.ts');
  const message = await server.ssrLoadModule('/src/message.ts');
  const explorer = await server.ssrLoadModule('/src/explorer.ts');
  const publisher = await server.ssrLoadModule('/src/publisher.ts');
  const { translations } = await server.ssrLoadModule('/src/i18n.ts');
  const config = network.SOLANA_NETWORK_CONFIG;

  if (network.SOLANA_NETWORK !== 'mainnet' || config.chain !== 'solana:mainnet') {
    throw new Error(`构建时网络未落到主网：${network.SOLANA_NETWORK}/${config.chain}`);
  }
  if (message.PROTOCOL_BOARD !== config.board) {
    throw new Error(`正文 board 与网络配置不一致：${message.PROTOCOL_BOARD}/${config.board}`);
  }
  if (publisher.PUBLICATION_RECEIPT_STORAGE_KEY !== config.receiptStorageKey) {
    throw new Error(
      `回执 key 与网络配置不一致：${publisher.PUBLICATION_RECEIPT_STORAGE_KEY}/${config.receiptStorageKey}`,
    );
  }
  const sampleSignature = '5'.repeat(88);
  const sampleExplorerUrl = explorer.explorerUrl(sampleSignature);
  if (
    !sampleExplorerUrl.startsWith('https://explorer.solana.com/tx/') ||
    sampleExplorerUrl.includes('cluster=')
  ) {
    throw new Error(`主网 Explorer 链接不隔离：${sampleExplorerUrl}`);
  }

  const mainnetForbidden = /Devnet|Testnet|test SOL|測試幣|测试币|水龙头|水龍頭/i;
  const labelChecks = Object.fromEntries(
    Object.entries(translations).map(([language, labels]) => {
      const flow = Object.fromEntries(FLOW_LABEL_KEYS.map((key) => [key, labels[key]]));
      const offenders = FLOW_LABEL_KEYS.filter((key) => mainnetForbidden.test(labels[key]));
      return [language, { ...flow, forbiddenMatches: offenders }];
    }),
  );
  for (const [language, check] of Object.entries(labelChecks)) {
    if (check.forbiddenMatches.length > 0) {
      throw new Error(`${language} 主网流程文案仍含测试网用语：${check.forbiddenMatches.join(',')}`);
    }
  }

  const startedAt = performance.now();
  const genesis = await rpc(config, 'getGenesisHash', []);
  if (genesis !== config.genesisHash) {
    throw new Error(`主网 genesis 不一致：${genesis}`);
  }

  const latestBlockhash = await rpc(config, 'getLatestBlockhash', [
    { commitment: 'confirmed' },
  ]);
  const boardHistory = await rpc(config, 'getSignaturesForAddress', [
    message.MARKER_ADDRESS,
    { limit: 10, commitment: 'confirmed' },
  ]);
  if (!Array.isArray(boardHistory)) throw new Error('主网 board 历史返回格式无效。');

  const memoAccount = await rpc(config, 'getAccountInfo', [
    message.MEMO_PROGRAM_ADDRESS,
    { encoding: 'base64', commitment: 'confirmed' },
  ]);
  if (memoAccount?.value?.executable !== true) {
    throw new Error('Memo 程序缺失或不可执行。');
  }

  process.stdout.write(`${JSON.stringify({
    checkedAt: localTimestamp(),
    noSigning: true,
    noBroadcast: true,
    source: 'Vite SSR loaded src/network.ts, src/message.ts, src/explorer.ts, src/publisher.ts and src/i18n.ts with VITE_SOLANA_NETWORK=mainnet',
    buildTimeNetwork: network.SOLANA_NETWORK,
    chain: config.chain,
    rpcUrl: config.rpcUrl,
    genesisHash: config.genesisHash,
    genesisMatches: true,
    board: config.board,
    messageBoardMatches: true,
    receiptStorageKey: publisher.PUBLICATION_RECEIPT_STORAGE_KEY,
    receiptStorageKeyMatches: true,
    explorerExample: sampleExplorerUrl,
    explorerMainnetIsolated: true,
    markerAddress: message.MARKER_ADDRESS,
    memoProgramAddress: message.MEMO_PROGRAM_ADDRESS,
    memoProgramExecutable: memoAccount.value.executable,
    latestBlockhash: {
      blockhash: latestBlockhash.value.blockhash,
      lastValidBlockHeight: latestBlockhash.value.lastValidBlockHeight.toString(),
    },
    boardHistoryCount: boardHistory.length,
    boardHistory,
    labelChecks,
    elapsedMs: Math.round(performance.now() - startedAt),
    scope: 'Read-only mainnet RPC and build-time module check; not browser CORS, wallet signing or broadcast acceptance',
  }, null, 2)}\n`);
} finally {
  await server.close();
}
