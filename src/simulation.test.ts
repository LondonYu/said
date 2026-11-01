import { describe, expect, it } from 'vitest';
import type { Address } from '@solana/kit';
import { SOLANA_NETWORK_CONFIG } from './network';
import { createSimulationClient, type SimulationRpc } from './simulation';

const ADDRESS_A = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const ADDRESS_B = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const DEVNET_GENESIS_HASH = SOLANA_NETWORK_CONFIG.genesisHash;

type FakeSimulationOptions = {
  genesisHash?: string;
  genesisDelayMs?: number;
  blockHeight?: bigint;
  recheckBlockHeight?: bigint;
  balance?: bigint;
  fee?: bigint | null;
  feeDelayMs?: number;
  simErr?: unknown | null;
  simLogs?: readonly string[];
  simDelayMs?: number;
};

function sendAfter<T>(signal: AbortSignal | undefined, delayMs: number, getValue: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      try {
        resolve(getValue());
      } catch (error) {
        reject(error);
      }
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function createFakeSimulationRpc(options: FakeSimulationOptions = {}) {
  const calls: string[] = [];
  let blockHeightCall = 0;
  const rpc: SimulationRpc = {
    getGenesisHash: () => ({
      send: ({ abortSignal } = {}) => {
        calls.push('genesis');
        return sendAfter(abortSignal, options.genesisDelayMs ?? 0, () => options.genesisHash ?? DEVNET_GENESIS_HASH);
      },
    }),
    getLatestBlockhash: () => ({
      send: ({ abortSignal } = {}) => {
        calls.push('blockhash');
        return sendAfter(abortSignal, 0, () => ({
          value: { blockhash: 'B'.repeat(43), lastValidBlockHeight: 900000n },
        }));
      },
    }),
    getBlockHeight: () => ({
      send: ({ abortSignal } = {}) => {
        calls.push('blockHeight');
        const value = blockHeightCall === 0 ? options.blockHeight ?? 899990n : options.recheckBlockHeight ?? options.blockHeight ?? 899990n;
        blockHeightCall += 1;
        return sendAfter(abortSignal, 0, () => value);
      },
    }),
    getBalance: (_address: Address) => ({
      send: ({ abortSignal } = {}) => {
        calls.push('balance');
        return sendAfter(abortSignal, 0, () => ({ value: options.balance ?? 0n }));
      },
    }),
    getFeeForMessage: (_messageBase64: string) => ({
      send: ({ abortSignal } = {}) => {
        calls.push('fee');
        return sendAfter(abortSignal, options.feeDelayMs ?? 0, () => ({ value: options.fee === undefined ? 5000n : options.fee }));
      },
    }),
    simulateTransaction: (_transactionBase64: string, _config: unknown) => ({
      send: ({ abortSignal } = {}) => {
        calls.push('simulate');
        return sendAfter(abortSignal, options.simDelayMs ?? 0, () => ({
          value: { err: options.simErr ?? null, logs: options.simLogs ?? [], unitsConsumed: 100 },
        }));
      },
    }),
  };
  return { rpc, calls };
}

describe('Devnet模拟RPC流程', () => {
  it('按genesis→blockhash→高度→余额→编译→估费→模拟顺序返回', async () => {
    const { rpc, calls } = createFakeSimulationRpc({
      blockHeight: 123n,
      balance: 4_235_100_000n,
      fee: 5000n,
      simErr: null,
      simLogs: ['Program log: memo'],
    });
    const client = createSimulationClient(rpc);

    const result = await client.checkTransaction({ feePayer: ADDRESS_A, text: '你好', signal: new AbortController().signal });

    expect(calls).toEqual(['genesis', 'blockhash', 'blockHeight', 'balance', 'fee', 'simulate', 'blockHeight']);
    expect(result.feePayer).toBe(ADDRESS_A);
    expect(result.balanceLamports).toBe(4_235_100_000n);
    expect(result.feeLamports).toBe(5000n);
    expect(result.blockHeight).toBe(123n);
    expect(result.simulationErr).toBeNull();
    expect(result.simulationLogs).toEqual(['Program log: memo']);
  });

  it('估费为null时保留null，不回退为0', async () => {
    const { rpc } = createFakeSimulationRpc({ fee: null });
    const client = createSimulationClient(rpc);
    const result = await client.checkTransaction({ feePayer: ADDRESS_A, text: '你好', signal: new AbortController().signal });
    expect(result.feeLamports).toBeNull();
  });

  it('模拟value.err非空时如实返回程序错误', async () => {
    const simErr = { InstructionError: [1, 'InvalidAccountData'] };
    const { rpc } = createFakeSimulationRpc({ simErr });
    const client = createSimulationClient(rpc);
    const result = await client.checkTransaction({ feePayer: ADDRESS_A, text: '你好', signal: new AbortController().signal });
    expect(result.simulationErr).toEqual(simErr);
  });

  it('genesis不匹配时失败', async () => {
    const { rpc } = createFakeSimulationRpc({ genesisHash: 'wrong' });
    const client = createSimulationClient(rpc);
    await expect(client.checkTransaction({ feePayer: ADDRESS_A, text: '你好', signal: new AbortController().signal })).rejects.toThrow(
      /不是 Devnet/,
    );
  });

  it('费用RPC失败时如实报错', async () => {
    const { rpc } = createFakeSimulationRpc();
    const feeRpc: SimulationRpc = {
      ...rpc,
      getFeeForMessage: () => ({
        send: () => Promise.reject(new Error('503 Service Unavailable')),
      }),
    };
    const client = createSimulationClient(feeRpc);
    await expect(client.checkTransaction({ feePayer: ADDRESS_A, text: '你好', signal: new AbortController().signal })).rejects.toThrow(
      /费用估算失败：.*503/,
    );
  });

  it('超时按页面取消语义失败', async () => {
    const { rpc } = createFakeSimulationRpc({ genesisDelayMs: 200 });
    const client = createSimulationClient(rpc, { timeoutMs: 25 });
    await expect(client.checkTransaction({ feePayer: ADDRESS_A, text: '你好', signal: new AbortController().signal })).rejects.toThrow(
      /网络校验超时/,
    );
  });

  it('调用方取消后失败', async () => {
    const { rpc } = createFakeSimulationRpc({ genesisDelayMs: 200 });
    const client = createSimulationClient(rpc);
    const abort = new AbortController();
    const pending = expect(client.checkTransaction({ feePayer: ADDRESS_A, text: '你好', signal: abort.signal })).rejects.toThrow(
      /网络校验已取消/,
    );
    abort.abort();
    await pending;
  });

  it('非法付款地址在RPC前失败', async () => {
    const { rpc, calls } = createFakeSimulationRpc();
    const client = createSimulationClient(rpc);
    await expect(client.checkTransaction({ feePayer: 'not-an-address', text: '你好', signal: new AbortController().signal })).rejects.toThrow(
      /付款地址格式无效/,
    );
    expect(calls).toHaveLength(0);
  });

  it('付款账户与结果一致', async () => {
    const { rpc } = createFakeSimulationRpc({ balance: 7n, fee: 5000n });
    const client = createSimulationClient(rpc);
    const result = await client.checkTransaction({ feePayer: ADDRESS_B, text: '你好', signal: new AbortController().signal });
    expect(result.feePayer).toBe(ADDRESS_B);
    expect(result.balanceLamports).toBe(7n);
  });

  it('初次高度未过期、复核高度已过期时标记失效', async () => {
    const { rpc } = createFakeSimulationRpc({
      blockHeight: 899990n,
      recheckBlockHeight: 900001n,
      balance: 1_000_000n,
      fee: 5000n,
    });
    const client = createSimulationClient(rpc);
    const result = await client.checkTransaction({ feePayer: ADDRESS_A, text: '你好', signal: new AbortController().signal });
    expect(result.blockHeight).toBe(900001n);
    expect(result.blockhashExpired).toBe(true);
  });

  it('模拟返回BlockhashNotFound时映射为过期状态', async () => {
    const { rpc } = createFakeSimulationRpc({
      blockHeight: 899990n,
      recheckBlockHeight: 899990n,
      balance: 1_000_000n,
      fee: 5000n,
      simErr: 'BlockhashNotFound',
    });
    const client = createSimulationClient(rpc);
    const result = await client.checkTransaction({ feePayer: ADDRESS_A, text: '你好', signal: new AbortController().signal });
    expect(result.simulationErr).toBe('BlockhashNotFound');
    expect(result.blockhashExpired).toBe(true);
  });

  it('重新检查会获取新blockhash与新费用', async () => {
    const base = createFakeSimulationRpc();
    let blockhashCall = 0;
    let feeCall = 0;
    const rpc: SimulationRpc = {
      ...base.rpc,
      getLatestBlockhash: () => ({
        send: (_abortSignal = {}) => {
          const blockhash = blockhashCall === 0 ? 'B'.repeat(43) : 'C'.repeat(43);
          blockhashCall += 1;
          return Promise.resolve({ value: { blockhash, lastValidBlockHeight: 900000n } });
        },
      }),
      getFeeForMessage: (_messageBase64: string) => ({
        send: (_abortSignal = {}) => {
          const value = feeCall === 0 ? 5000n : 6000n;
          feeCall += 1;
          return Promise.resolve({ value });
        },
      }),
    };
    const client = createSimulationClient(rpc);
    const first = await client.checkTransaction({ feePayer: ADDRESS_A, text: '你好', signal: new AbortController().signal });
    const second = await client.checkTransaction({ feePayer: ADDRESS_A, text: '你好', signal: new AbortController().signal });
    expect(first.blockhash).toBe('B'.repeat(43));
    expect(first.feeLamports).toBe(5000n);
    expect(second.blockhash).toBe('C'.repeat(43));
    expect(second.feeLamports).toBe(6000n);
  });

  it('非法正文在发出RPC前失败', async () => {
    const { rpc, calls } = createFakeSimulationRpc();
    const client = createSimulationClient(rpc);
    await expect(client.checkTransaction({ feePayer: ADDRESS_A, text: '   ', signal: new AbortController().signal })).rejects.toThrow(
      /不能为空白/,
    );
    expect(calls).toHaveLength(0);
  });
});
