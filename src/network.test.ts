import { describe, expect, it } from 'vitest';
import type { Address } from '@solana/kit';
import {
  SOLANA_NETWORK_CONFIG,
  createNetworkReader,
  type NetworkRpc,
} from './network';

// 真实格式的 Solana 公钥，只用于读取测试，不对应任何私钥。
const ADDRESS_A = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const ADDRESS_B = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const DEVNET_GENESIS_HASH = SOLANA_NETWORK_CONFIG.genesisHash;
const WRONG_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

type FakeRpcOptions = {
  genesisHash?: string;
  genesisError?: unknown;
  balance?: bigint;
  balanceError?: unknown;
  delayMs?: number;
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

function createFakeRpc(options: FakeRpcOptions = {}) {
  const genesisCalls = { count: 0 };
  const balanceCalls: string[] = [];

  const getGenesisHash = () => ({
    send: (sendOptions: { abortSignal?: AbortSignal } = {}) => {
      genesisCalls.count += 1;
      return sendAfter(sendOptions.abortSignal, options.delayMs ?? 0, () => {
        if ('genesisError' in options) throw options.genesisError;
        return options.genesisHash ?? DEVNET_GENESIS_HASH;
      });
    },
  });

  const getBalance = (address: Address) => {
    balanceCalls.push(address);
    return {
      send: (sendOptions: { abortSignal?: AbortSignal } = {}) =>
        sendAfter(sendOptions.abortSignal, options.delayMs ?? 0, () => {
          if ('balanceError' in options) throw options.balanceError;
          return { value: options.balance ?? 0n };
        }),
    };
  };

  const rpc: NetworkRpc = { getGenesisHash, getBalance };

  return { rpc, genesisCalls, balanceCalls };
}

describe('Devnet 网络校验', () => {
  it('genesis 与固定 Devnet 值一致时通过', async () => {
    const { rpc, genesisCalls } = createFakeRpc();
    const reader = createNetworkReader(rpc);
    const abort = new AbortController();

    await expect(reader.verifyNetwork(abort.signal)).resolves.toBeUndefined();
    expect(genesisCalls.count).toBe(1);
  });

  it('genesis 不匹配时失败，并说明不是 Devnet', async () => {
    const { rpc } = createFakeRpc({ genesisHash: WRONG_GENESIS_HASH });
    const reader = createNetworkReader(rpc);

    await expect(reader.verifyNetwork(new AbortController().signal)).rejects.toThrow(/Devnet/);
  });

  it('RPC 异常时失败，不报告网络就绪', async () => {
    const { rpc } = createFakeRpc({ genesisError: new Error('429 Too Many Requests') });
    const reader = createNetworkReader(rpc);

    await expect(reader.verifyNetwork(new AbortController().signal)).rejects.toThrow(/网络校验失败：.*429/);
  });

  it('调用方取消后停止网络校验', async () => {
    const { rpc } = createFakeRpc({ delayMs: 250 });
    const reader = createNetworkReader(rpc);
    const abort = new AbortController();

    const pending = expect(reader.verifyNetwork(abort.signal)).rejects.toThrow(/已取消/);
    abort.abort();
    await pending;
  });

  it('超时后失败并提示重试', async () => {
    const { rpc } = createFakeRpc({ delayMs: 250 });
    const reader = createNetworkReader(rpc, { timeoutMs: 25 });

    await expect(reader.verifyNetwork(new AbortController().signal)).rejects.toThrow(/超时.*重试/);
  });
});

describe('余额读取', () => {
  it('有效零余额返回 0n，而不是错误', async () => {
    const { rpc, balanceCalls } = createFakeRpc({ balance: 0n });
    const reader = createNetworkReader(rpc);

    await expect(reader.readBalance(ADDRESS_A, new AbortController().signal)).resolves.toBe(0n);
    expect(balanceCalls).toEqual([ADDRESS_A]);
  });

  it('返回 RPC 给定的 lamports', async () => {
    const { rpc } = createFakeRpc({ balance: 1_500_000_000n });
    const reader = createNetworkReader(rpc);

    await expect(reader.readBalance(ADDRESS_A, new AbortController().signal)).resolves.toBe(1_500_000_000n);
  });

  it('地址非法时在发请求前失败', async () => {
    const { rpc, balanceCalls } = createFakeRpc();
    const reader = createNetworkReader(rpc);

    await expect(reader.readBalance('not-a-solana-address', new AbortController().signal)).rejects.toThrow(
      /地址格式无效/,
    );
    expect(balanceCalls).toHaveLength(0);
  });

  it('RPC 失败时不返回假 0 余额', async () => {
    const { rpc } = createFakeRpc({ balanceError: new Error('503 Service Unavailable') });
    const reader = createNetworkReader(rpc);

    await expect(reader.readBalance(ADDRESS_A, new AbortController().signal)).rejects.toThrow(
      /余额读取失败：.*503/,
    );
  });

  it('切换账户时取消旧请求，旧余额不会返回', async () => {
    const { rpc } = createFakeRpc({ balance: 42n, delayMs: 250 });
    const reader = createNetworkReader(rpc);
    const oldRequest = new AbortController();

    const stale = expect(reader.readBalance(ADDRESS_A, oldRequest.signal)).rejects.toThrow(/已取消/);
    oldRequest.abort();

    await stale;
    await expect(reader.readBalance(ADDRESS_B, new AbortController().signal)).resolves.toBe(42n);
  });

  it('读取超时后失败并提示重试', async () => {
    const { rpc } = createFakeRpc({ balance: 7n, delayMs: 250 });
    const reader = createNetworkReader(rpc, { timeoutMs: 25 });

    await expect(reader.readBalance(ADDRESS_A, new AbortController().signal)).rejects.toThrow(/超时.*重试/);
  });
});
