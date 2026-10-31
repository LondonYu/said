import { createSolanaRpc, isAddress } from '@solana/kit';
import type { Address } from '@solana/kit';

export const DEVNET_RPC_URL = 'https://api.devnet.solana.com';
export const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const RPC_TIMEOUT_MS = 10_000;

type RpcSendOptions = Readonly<{ abortSignal?: AbortSignal }>;
type PendingRpcRequest<TResponse> = {
  send(options?: RpcSendOptions): Promise<TResponse>;
};

/**
 * 只声明本阶段需要的只读 RPC 能力，便于在测试中替换为假实现。
 * 不包含任何交易构造、签名或发送方法。
 */
export type DevnetRpc = {
  getGenesisHash(): PendingRpcRequest<string>;
  getBalance(address: Address): PendingRpcRequest<{ value: bigint }>;
};

export type NetworkReader = {
  verifyDevnet(signal: AbortSignal): Promise<void>;
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
  rpc: DevnetRpc = createSolanaRpc(DEVNET_RPC_URL),
  options: NetworkReaderOptions = {},
): NetworkReader {
  const timeoutMs = options.timeoutMs ?? RPC_TIMEOUT_MS;

  async function verifyDevnet(signal: AbortSignal): Promise<void> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = AbortSignal.any([signal, timeout]);

    let genesisHash: string;
    try {
      genesisHash = await rpc.getGenesisHash().send({ abortSignal: combined });
    } catch (error) {
      throw describeRpcError(error, signal, timeout, '网络校验', timeoutMs);
    }

    if (genesisHash !== DEVNET_GENESIS_HASH) {
      throw new Error(`网络校验失败：应用查询的 RPC 不是 Devnet（genesis ${genesisHash}）。`);
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

  return { verifyDevnet, readBalance };
}

const defaultReader = createNetworkReader();

export const verifyDevnet = defaultReader.verifyDevnet;
export const readBalance = defaultReader.readBalance;
