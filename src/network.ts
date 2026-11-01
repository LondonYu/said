import { createSolanaRpc, isAddress } from '@solana/kit';
import type { Address } from '@solana/kit';

export type SolanaNetworkName = 'devnet' | 'mainnet';

const NETWORKS = {
  devnet: {
    name: 'devnet',
    displayName: 'Devnet',
    chain: 'solana:devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    genesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
    board: 'public-devnet-v1',
    explorerCluster: '?cluster=devnet',
    receiptStorageKey: 'said.publication-receipts.v1',
  },
  mainnet: {
    name: 'mainnet',
    displayName: 'Solana Mainnet',
    chain: 'solana:mainnet',
    rpcUrl: 'https://solana-rpc.publicnode.com',
    genesisHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
    board: 'public-mainnet-v1',
    explorerCluster: '',
    receiptStorageKey: 'said.publication-receipts.mainnet.v1',
  },
} as const;

export type SolanaNetworkConfig = (typeof NETWORKS)[SolanaNetworkName];

/** 未设置时使用 Devnet；只接受构建时注入的 devnet/mainnet，非法值直接失败。 */
export function resolveSolanaNetwork(value: string | undefined): SolanaNetworkName {
  const normalized = value?.trim();
  if (normalized === undefined || normalized === '') return 'devnet';
  if (normalized === 'devnet' || normalized === 'mainnet') return normalized;
  throw new Error(`VITE_SOLANA_NETWORK 只支持 devnet 或 mainnet，收到：${value}`);
}

export const SOLANA_NETWORK = resolveSolanaNetwork(
  import.meta.env.VITE_SOLANA_NETWORK as string | undefined,
);
export const SOLANA_NETWORK_CONFIG: SolanaNetworkConfig = NETWORKS[SOLANA_NETWORK];
export const SOLANA_CHAIN = SOLANA_NETWORK_CONFIG.chain;
export const IS_MAINNET = SOLANA_NETWORK === 'mainnet';
export const RPC_TIMEOUT_MS = 10_000;

type RpcSendOptions = Readonly<{ abortSignal?: AbortSignal }>;
type PendingRpcRequest<TResponse> = {
  send(options?: RpcSendOptions): Promise<TResponse>;
};

/**
 * 只声明本阶段需要的只读 RPC 能力，便于在测试中替换为假实现。
 * 不包含任何交易构造、签名或发送方法。
 */
export type NetworkRpc = {
  getGenesisHash(): PendingRpcRequest<string>;
  getBalance(address: Address): PendingRpcRequest<{ value: bigint }>;
};

export type NetworkReader = {
  verifyNetwork(signal: AbortSignal): Promise<void>;
  readBalance(address: string, signal: AbortSignal): Promise<bigint>;
};

export type NetworkReaderOptions = {
  /** 仅用于测试缩短超时；生产固定使用 RPC_TIMEOUT_MS。 */
  timeoutMs?: number;
};

function describeDuration(milliseconds: number): string {
  const seconds = milliseconds / 1000;
  return Number.isInteger(seconds) ? `${seconds} 秒` : `${milliseconds} 毫秒`;
}

function describeRpcError(
  error: unknown,
  callerSignal: AbortSignal,
  timeoutSignal: AbortSignal,
  action: string,
  timeoutMs: number,
): Error {
  if (callerSignal.aborted) return new Error(`${action}已取消。`);
  if (timeoutSignal.aborted) return new Error(`${action}超时（${describeDuration(timeoutMs)}），请重试。`);
  const detail = error instanceof Error && error.message.trim() !== '' ? error.message.trim() : '未知错误';
  return new Error(`${action}失败：${detail}`);
}

export function createNetworkReader(
  rpc: NetworkRpc = createSolanaRpc(SOLANA_NETWORK_CONFIG.rpcUrl),
  options: NetworkReaderOptions = {},
): NetworkReader {
  const timeoutMs = options.timeoutMs ?? RPC_TIMEOUT_MS;

  async function verifyNetwork(signal: AbortSignal): Promise<void> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = AbortSignal.any([signal, timeout]);

    let genesisHash: string;
    try {
      genesisHash = await rpc.getGenesisHash().send({ abortSignal: combined });
    } catch (error) {
      throw describeRpcError(error, signal, timeout, '网络校验', timeoutMs);
    }

    if (genesisHash !== SOLANA_NETWORK_CONFIG.genesisHash) {
      throw new Error(
        `网络校验失败：应用查询的 RPC 不是 ${SOLANA_NETWORK_CONFIG.displayName}（genesis ${genesisHash}）。`,
      );
    }
  }

  async function readBalance(address: string, signal: AbortSignal): Promise<bigint> {
    // 先核验地址；非法地址直接失败，不发出 RPC 请求。
    if (!isAddress(address)) {
      throw new Error('地址格式无效，无法读取余额。');
    }

    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = AbortSignal.any([signal, timeout]);

    let response: { value: bigint };
    try {
      response = await rpc.getBalance(address).send({ abortSignal: combined });
    } catch (error) {
      throw describeRpcError(error, signal, timeout, '余额读取', timeoutMs);
    }

    // RPC 失败绝不能回退为 0 冒充余额。
    const value = response.value;
    if (typeof value !== 'bigint' || value < 0n) {
      throw new Error('余额读取失败：RPC 返回的余额格式无效。');
    }
    return value;
  }

  return { verifyNetwork, readBalance };
}

const defaultReader = createNetworkReader();

export const verifyNetwork = defaultReader.verifyNetwork;
export const readBalance = defaultReader.readBalance;
