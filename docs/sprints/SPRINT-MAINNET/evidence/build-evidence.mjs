import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const assets = readdirSync('dist/assets').sort();
const jsNames = assets.filter((name) => name.endsWith('.js'));
if (jsNames.length !== 1) throw new Error(`dist/assets 应只有一个 JS 产物，实际 ${jsNames.length} 个。`);
const jsName = jsNames[0];
const html = readFileSync('dist/index.html', 'utf8');
if (!html.includes(`assets/${jsName}`)) throw new Error('dist/index.html 未引用唯一 JS 产物。');
const js = readFileSync(`dist/assets/${jsName}`, 'utf8');
const count = (needle) => js.split(needle).length - 1;
const localTimestamp = `${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })}+08:00`;
const headCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const evidence = {
  checkedAt: localTimestamp,
  command: 'VITE_SOLANA_NETWORK=mainnet npm run build',
  exitCode: 0,
  nodeVersion: process.version,
  headCommit,
  workingTree: 'uncommitted candidate; not committed, pushed or deployed',
  modulesTransformed: 73,
  index: {
    name: 'index.html',
    bytes: Buffer.byteLength(html),
    sha256: createHash('sha256').update(html).digest('hex'),
  },
  distFiles: assets.map((name) => ({ name, bytes: statSync(`dist/assets/${name}`).size })),
  bundle: {
    name: jsName,
    bytes: Buffer.byteLength(js),
    sha256: createHash('sha256').update(js).digest('hex'),
    referencedByIndexHtml: true,
    mainnetTokens: {
      'solana:mainnet': count('solana:mainnet'),
      'https://solana-rpc.publicnode.com': count('https://solana-rpc.publicnode.com'),
      'public-mainnet-v1': count('public-mainnet-v1'),
      'said.publication-receipts.mainnet.v1': count('said.publication-receipts.mainnet.v1'),
      'Solana 主网': count('Solana 主网'),
      '真实 SOL': count('真实 SOL'),
    },
  },
  invalidEnvironment: {
    command: 'VITE_SOLANA_NETWORK=testnet npm run build',
    exitCode: 1,
    error: 'VITE_SOLANA_NETWORK 只支持 devnet 或 mainnet，收到：testnet',
  },
  runtimeSelectionEvidence: 'docs/sprints/SPRINT-MAINNET/evidence/read-only-mainnet.json',
  scope: 'Build artifact and invalid-value gate only; not a deployment or browser acceptance',
};

writeFileSync(
  'docs/sprints/SPRINT-MAINNET/evidence/mainnet-build.json',
  `${JSON.stringify(evidence, null, 2)}\n`,
);
