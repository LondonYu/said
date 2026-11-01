// 本地截图脚本：假钱包 + 模拟 RPC，只走到 prepare 摘要，不签名、不广播、不上链。
// 运行：node docs/sprints/SPRINT-2.2B/evidence/capture.mjs
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBase58Encoder, getCompiledTransactionMessageDecoder, getTransactionDecoder } from '@solana/kit';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_URL = 'http://127.0.0.1:4173/';
const CHROME_BIN = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const ADDRESS = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const PUBLIC_KEY = Array.from(getBase58Encoder().encode(ADDRESS));
const DRAFT = '2.2B 页面接入测试：准备后只请求一次签名。';
const BANNER = '模拟状态：本地假钱包 + 模拟 RPC；未签名、未广播、未上链';
const observedRpc = {
  feeMessageBase64: null,
  simulatedTransactionBase64: null,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite 尚未就绪。
    }
    await sleep(200);
  }
  throw new Error(`Vite did not start: ${url}`);
}

async function waitForFile(path, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      return await readFile(path, 'utf8');
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

function startProcess(command, args) {
  const child = spawn(command, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

function rpcPayload(body) {
  const request = JSON.parse(body);
  if (request.method === 'getFeeForMessage') {
    observedRpc.feeMessageBase64 = Array.isArray(request.params) ? request.params[0] ?? null : null;
  }
  if (request.method === 'simulateTransaction') {
    observedRpc.simulatedTransactionBase64 = Array.isArray(request.params) ? request.params[0] ?? null : null;
  }
  let result;
  switch (request.method) {
    case 'getGenesisHash':
      result = DEVNET_GENESIS_HASH;
      break;
    case 'getLatestBlockhash':
      result = { context: { slot: 1 }, value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1000 } };
      break;
    case 'getBlockHeight':
      result = 100;
      break;
    case 'getBalance':
      result = { context: { slot: 1 }, value: 1_000_000_000 };
      break;
    case 'getFeeForMessage':
      result = { context: { slot: 1 }, value: 5000 };
      break;
    case 'simulateTransaction':
      result = { context: { slot: 1 }, value: { err: null, logs: ['Program log: simulated'], unitsConsumed: 1000 } };
      break;
    case 'getSignaturesForAddress':
      result = [];
      break;
    case 'getTransaction':
      result = null;
      break;
    case 'getSignatureStatuses':
      result = { context: { slot: 1 }, value: [null] };
      break;
    case 'getVersion':
      result = { 'solana-core': 'simulated', 'feature-set': 0 };
      break;
    default:
      throw new Error(`Unexpected RPC method in capture: ${request.method}`);
  }
  return JSON.stringify({ jsonrpc: '2.0', id: request.id, result });
}

const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const MEMO_PROGRAM = 'Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH';

function decodeFourInstructionTransaction(transactionBase64) {
  if (typeof transactionBase64 !== 'string' || transactionBase64 === '') {
    throw new Error('未捕获 simulatedTransaction 的 transaction 字节');
  }
  const wireBytes = new Uint8Array(Buffer.from(transactionBase64, 'base64'));
  const transaction = getTransactionDecoder().decode(wireBytes);
  const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  const decodedInstructions = message.instructions.map((instruction, index) => {
    const data = new Uint8Array(instruction.data ?? new Uint8Array());
    return {
      index,
      programAddress: message.staticAccounts[instruction.programAddressIndex] ?? null,
      accountIndices: instruction.accountIndices ?? [],
      dataHex: Buffer.from(data).toString('hex'),
      dataLength: data.length,
    };
  });

  const limitData = new Uint8Array(message.instructions[0]?.data ?? new Uint8Array());
  const limitView = new DataView(limitData.buffer, limitData.byteOffset, limitData.byteLength);
  const priceData = new Uint8Array(message.instructions[1]?.data ?? new Uint8Array());
  const priceView = new DataView(priceData.buffer, priceData.byteOffset, priceData.byteLength);
  const transferData = new Uint8Array(message.instructions[2]?.data ?? new Uint8Array());
  const memoData = new Uint8Array(message.instructions[3]?.data ?? new Uint8Array());

  const programOrder = decodedInstructions.map((instruction) => instruction.programAddress);
  const computeUnitLimit =
    limitData.length === 5 && limitView.getUint8(0) === 2 ? limitView.getUint32(1, true) : null;
  const computeUnitPriceMicroLamports =
    priceData.length === 9 && priceView.getUint8(0) === 3 ? priceView.getBigUint64(1, true) : null;
  const memoText = new TextDecoder().decode(memoData);
  const signatureSlots = Object.keys(transaction.signatures);
  const signatureSlotsArePlaceholders = Object.values(transaction.signatures).every(
    (signature) =>
      signature === null ||
      signature === undefined ||
      (signature.length === 64 && signature.every((byte) => byte === 0)),
  );
  const messageBase64 = Buffer.from(new Uint8Array(transaction.messageBytes)).toString('base64');

  const summary = {
    sizeBytes: wireBytes.length,
    messageBytes: new Uint8Array(transaction.messageBytes).length,
    instructionCount: decodedInstructions.length,
    programOrder,
    computeUnitLimit,
    computeUnitPriceMicroLamports: computeUnitPriceMicroLamports?.toString() ?? null,
    computeBudgetAccountsEmpty:
      decodedInstructions[0]?.accountIndices.length === 0 && decodedInstructions[1]?.accountIndices.length === 0,
    transferLamports:
      transferData.length === 12 && transferData[0] === 2 && transferData.slice(1).every((byte) => byte === 0)
        ? '0'
        : null,
    memoText,
    signatureSlots,
    signatureSlotsArePlaceholders,
    feeMessageMatchesPreparedTransaction: observedRpc.feeMessageBase64 === messageBase64,
    simulationInputMatchesPreparedTransaction: observedRpc.simulatedTransactionBase64 === transactionBase64,
    instructions: decodedInstructions,
  };

  const failures = [];
  if (summary.instructionCount !== 4) failures.push(`instructionCount=${summary.instructionCount}`);
  if (
    programOrder[0] !== COMPUTE_BUDGET_PROGRAM ||
    programOrder[1] !== COMPUTE_BUDGET_PROGRAM ||
    programOrder[2] !== SYSTEM_PROGRAM ||
    programOrder[3] !== MEMO_PROGRAM
  ) {
    failures.push(`programOrder=${JSON.stringify(programOrder)}`);
  }
  if (summary.computeUnitLimit !== 400_000) failures.push(`computeUnitLimit=${summary.computeUnitLimit}`);
  if (computeUnitPriceMicroLamports !== 0n) {
    failures.push(`computeUnitPriceMicroLamports=${summary.computeUnitPriceMicroLamports}`);
  }
  if (!summary.computeBudgetAccountsEmpty) failures.push('computeBudgetAccountsEmpty=false');
  if (summary.transferLamports !== '0') failures.push(`transferLamports=${summary.transferLamports}`);
  if (!summary.feeMessageMatchesPreparedTransaction) failures.push('feeMessageMatches=false');
  if (!summary.simulationInputMatchesPreparedTransaction) failures.push('simulationInputMatches=false');
  if (signatureSlots.length !== 1 || !signatureSlotsArePlaceholders) {
    failures.push(`signatureSlots=${JSON.stringify(signatureSlots)}`);
  }
  if (failures.length > 0) {
    throw new Error(`四指令模拟证据校验失败：${failures.join('；')}`);
  }

  return summary;
}

async function main() {
  const chromeDir = await mkdtemp(join(tmpdir(), 'said-2.2b-chrome-'));
  let vite;
  let chrome;
  let socket;
  try {
    vite = startProcess(join(process.cwd(), 'node_modules', '.bin', 'vite'), [
      '--host', '127.0.0.1', '--port', '4173', '--strictPort',
    ]);
    await waitForHttp(APP_URL);

    chrome = startProcess(CHROME_BIN, [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${chromeDir}`,
      '--no-first-run',
      '--disable-gpu',
      '--hide-scrollbars',
      'about:blank',
    ]);
    const portText = await waitForFile(join(chromeDir, 'DevToolsActivePort'));
    const port = portText.split('\n')[0].trim();
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('No Chrome page target');

    let nextId = 0;
    const pending = new Map();
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = nextId + 1;
        nextId = id;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const resolver = pending.get(message.id);
        if (!resolver) return;
        pending.delete(message.id);
        if (message.error) resolver.reject(new Error(JSON.stringify(message.error)));
        else resolver.resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        console.error('PAGE EXCEPTION', JSON.stringify(message.params.exceptionDetails));
      }
      if (message.method === 'Fetch.requestPaused') {
        const { requestId, request } = message.params;
        void (async () => {
          try {
            if (request.method === 'OPTIONS') {
              await send('Fetch.fulfillRequest', {
                requestId,
                responseCode: 204,
                responseHeaders: [
                  { name: 'Access-Control-Allow-Origin', value: '*' },
                  { name: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
                  { name: 'Access-Control-Allow-Headers', value: '*' },
                ],
              });
              return;
            }
            const body = rpcPayload(request.postData ?? '{}');
            await send('Fetch.fulfillRequest', {
              requestId,
              responseCode: 200,
              responseHeaders: [
                { name: 'Content-Type', value: 'application/json' },
                { name: 'Access-Control-Allow-Origin', value: '*' },
              ],
              body: Buffer.from(body).toString('base64'),
            });
          } catch (error) {
            console.error('RPC mock error:', error);
            await send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
          }
        })();
      }
    });

    const sendCall = send;

    async function evaluate(expression) {
      const result = await sendCall('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text ?? 'Runtime.evaluate failed');
      }
      return result.result.value;
    }

    async function waitFor(expression, timeoutMs = 10_000) {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        if (await evaluate(expression)) return;
        await sleep(100);
      }
      throw new Error(`Timed out: ${expression}`);
    }

    async function clickText(text) {
      const clicked = await evaluate(`(() => {
        const button = [...document.querySelectorAll('button')].find(
          (item) => item.textContent.trim() === ${JSON.stringify(text)} && !item.disabled
        );
        if (!button) return false;
        button.click();
        return true;
      })()`);
      if (!clicked) throw new Error(`Button not clickable: ${text}`);
    }


    async function setViewport(width, height) {
      await sendCall('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 600,
        screenWidth: width,
        screenHeight: height,
      });
      await sleep(350);
    }

    async function addBanner() {
      await evaluate(`(() => {
        if (document.getElementById('simulation-banner')) return;
        const dialog = document.querySelector('dialog');
        const head = dialog?.querySelector('.modal-head');
        if (!dialog || !head) throw new Error('Dialog missing');
        const banner = document.createElement('p');
        banner.id = 'simulation-banner';
        banner.textContent = ${JSON.stringify(BANNER)};
        Object.assign(banner.style, {
          position: 'sticky', top: '66px', zIndex: '1',
          margin: '12px 24px 0', padding: '8px 12px', borderRadius: '8px',
          background: '#7a2e2e', color: '#fff', fontSize: '12px',
          lineHeight: '1.5', textAlign: 'center'
        });
        head.after(banner);
      })()`);
    }

    async function screenshot(name) {
      const image = await sendCall('Page.captureScreenshot', { format: 'png', fromSurface: true });
      await writeFile(join(OUT_DIR, name), Buffer.from(image.data, 'base64'));
      return name;
    }

    await sendCall('Page.enable');
    await sendCall('Runtime.enable');
    await sendCall('Fetch.enable', {
      patterns: [{ urlPattern: '*api.devnet.solana.com*', requestStage: 'Request' }],
    });

    const walletScript = `(() => {
      const account = {
        address: ${JSON.stringify(ADDRESS)},
        publicKey: Uint8Array.from(${JSON.stringify(PUBLIC_KEY)}),
        chains: ['solana:devnet'],
        features: ['solana:signTransaction'],
      };
      const wallet = {
        version: '1.0.0',
        name: '模拟钱包',
        icon: 'data:image/svg+xml;base64,AA==',
        chains: ['solana:devnet'],
        accounts: [account],
        features: {
          'standard:connect': {
            version: '1.0.0',
            connect: async () => ({ accounts: [account] }),
          },
          'standard:disconnect': {
            version: '1.0.0',
            disconnect: async () => {},
          },
          'standard:events': {
            version: '1.0.0',
            on: () => () => {},
          },
          'solana:signTransaction': {
            version: '1.0.0',
            supportedTransactionVersions: [0],
            signTransaction: async () => { throw new Error('模拟钱包不签名'); },
          },
        },
      };
      const stableFeatures = wallet.features;
      Object.defineProperty(wallet, 'features', {
        configurable: true,
        get: () => ({
          ...stableFeatures,
          'solana:signTransaction': { ...stableFeatures['solana:signTransaction'] },
        }),
      });
      window.addEventListener('wallet-standard:app-ready', (event) => {
        event.detail.register(wallet);
      });
      window.__saidMockWallet = true;
    })();`;
    await sendCall('Page.addScriptToEvaluateOnNewDocument', { source: walletScript });
    await sendCall('Page.navigate', { url: APP_URL });
    await waitFor('document.readyState === "complete"', 15_000);
    await waitFor('window.__saidMockWallet === true', 10_000);
    await waitFor(`[...document.querySelectorAll('button')].some(
      (item) => item.textContent.trim() === '登录' && !item.disabled
    )`, 15_000);

    await setViewport(1280, 900);
    await clickText('登录');
    await waitFor(`document.querySelector('.wallet-option')?.textContent.includes('模拟钱包') ?? false`);
    await evaluate(`document.querySelector('.wallet-option').click()`);
    await waitFor(`[...document.querySelectorAll('button')].some(
      (item) => item.textContent.trim() === '连接所选钱包' && !item.disabled
    )`);
    await clickText('连接所选钱包');
    await waitFor(`document.body.innerText.includes(${JSON.stringify(ADDRESS)})`, 10_000);
    await evaluate(`document.querySelector('dialog button[aria-label="关闭"]').click()`);
    await waitFor('document.querySelector("dialog") === null');

    await clickText('发布');
    await waitFor('document.querySelector("#preview-draft") !== null');
    await evaluate(`(() => {
      const textarea = document.querySelector('#preview-draft');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(textarea, ${JSON.stringify(DRAFT)});
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitFor(`document.querySelector('#preview-draft').value === ${JSON.stringify(DRAFT)}`);
    await clickText('预览内容');
    await waitFor(`[...document.querySelectorAll('button')].some(
      (item) => item.textContent.trim() === '准备发布' && !item.disabled
    )`);


    await addBanner();
    await evaluate(`document.querySelector('dialog').scrollTop = 0`);
    const capturedAtStart = new Date().toISOString();
    const screenshots = [];
    screenshots.push({ file: await screenshot('review-desktop.png'), viewport: '1280x900' });
    const reviewChecks = await evaluate(`(() => {
      const text = document.querySelector('dialog').innerText;
      return {
        draftVisible: text.includes(${JSON.stringify(DRAFT)}),
        prepareEnabled: [...document.querySelectorAll('button')].some(
          (item) => item.textContent.trim() === '准备发布' && !item.disabled
        ),
        simulatedBanner: document.getElementById('simulation-banner')?.textContent ?? null,
      };
    })()`);

    await setViewport(390, 844);
    await evaluate(`document.querySelector('dialog').scrollTop = 0`);
    screenshots.push({ file: await screenshot('review-390.png'), viewport: '390x844' });

    await setViewport(1280, 900);
    await clickText('准备发布');
    await waitFor(`document.querySelector('dialog').innerText.includes('交易已准备，等待你确认签名。')`, 15_000);
    await waitFor(`document.querySelector('dialog').innerText.includes('发布前核对')`);
    await evaluate(`document.querySelector('.publication-panel').scrollIntoView({ block: 'start' })`);
    await sleep(250);
    screenshots.push({ file: await screenshot('publish-ready-desktop.png'), viewport: '1280x900' });
    const preparedChecks = await evaluate(`(() => {
      const text = document.querySelector('dialog').innerText;
      return {
        devnetLabel: text.includes('Devnet'),
        fullFeePayer: text.includes(${JSON.stringify(ADDRESS)}),
        originalText: text.includes(${JSON.stringify(DRAFT)}),
        estimatedFee: text.includes('0.000005 SOL'),
        irreversibleWarning: text.includes('交易公开且不可撤回'),
        signButtonEnabled: [...document.querySelectorAll('button')].some(
          (item) => item.textContent.trim() === '签名并发送' && !item.disabled
        ),
        simulatedBanner: document.getElementById('simulation-banner')?.textContent ?? null,
      };
    })()`);

    await setViewport(390, 844);
    await evaluate(`(() => {
      const panel = document.querySelector('.publication-panel');
      panel.scrollIntoView({ block: 'start' });
      const dialog = document.querySelector('dialog');
      if (dialog.scrollTop > 120) dialog.scrollTop -= 120;
    })()`);
    await sleep(250);
    screenshots.push({ file: await screenshot('publish-ready-390.png'), viewport: '390x844' });

    const transactionChecks = decodeFourInstructionTransaction(observedRpc.simulatedTransactionBase64);

    const evidence = {
      capturedAtStart,
      capturedAtEnd: new Date().toISOString(),
      simulation: true,
      note: BANNER,
      appUrl: APP_URL,
      wallet: {
        name: '模拟钱包',
        address: ADDRESS,
        featureGetter: '每次读取返回新的 solana:signTransaction 包装对象，方法引用不变',
      },
      rpc: 'Chrome Fetch 拦截 api.devnet.solana.com，返回固定 Devnet 形状的 JSON-RPC 结果',
      draft: DRAFT,
      screenshots,
      checks: { review: reviewChecks, prepared: preparedChecks, transaction: transactionChecks },
    };
    await writeFile(join(OUT_DIR, 'capture.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    try {
      socket?.close();
    } catch {
      // 连接已断开。
    }
    chrome?.kill('SIGTERM');
    vite?.kill('SIGTERM');
    await sleep(400);
    await rm(chromeDir, { recursive: true, force: true });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });

