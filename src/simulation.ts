import { createSolanaRpc, isAddress } from '@solana/kit';
import type { Address } from '@solana/kit';
import { SOLANA_NETWORK_CONFIG } from './network';
import { buildUnsignedGuestbookTransaction, describeMessageTextError, validateMessageText, type BlockhashLifetime } from './message';

export const SIMULATION_TIMEOUT_MS = 10_000;

type PendingRpcRequest<TResponse> = {
  send(options?: Readonly<{ abortSignal?: AbortSignal }>): Promise<TResponse>;
};

export type SimulationRpc = {
  getGenesisHash(): PendingRpcRequest<string>;
  getLatestBlockhash(config?: Readonly<{ commitment?: 'confirmed' | 'finalized' | 'processed' }>): PendingRpcRequest<{
    value: { blockhash: string; lastValidBlockHeight: bigint };
  }>;
  getBlockHeight(config?: Readonly<{ commitment?: 'confirmed' | 'finalized' | 'processed' }>): PendingRpcRequest<bigint>;
  getBalance(
    address: Address,
    config?: Readonly<{ commitment?: 'confirmed' | 'finalized' | 'processed' }>,
  ): PendingRpcRequest<{ value: bigint }>;
  getFeeForMessage(
    messageBase64: string,
    config?: Readonly<{ commitment?: 'confirmed' | 'finalized' | 'processed' }>,
  ): PendingRpcRequest<{ value: bigint | null }>;
  simulateTransaction(
    transactionBase64: string,
    config: Readonly<{
      encoding: 'base64';
      commitment: 'confirmed' | 'finalized' | 'processed';
      sigVerify: false;
      replaceRecentBlockhash: false;
    }>,
  ): PendingRpcRequest<{
    value: {
      err: unknown | null;
      logs?: readonly string[];
      unitsConsumed?: number | bigint | null;
    };
  }>;
};

export type SimulationCheckResult = {
  readonly feePayer: string;
  readonly text: string;
  readonly balanceLamports: bigint;
  readonly feeLamports: bigint | null;
  readonly transactionSizeBytes: number;
  readonly blockhash: string;
  readonly lastValidBlockHeight: bigint;
  readonly blockHeight: bigint | null;
  readonly simulationErr: unknown | null;
  readonly simulationLogs: readonly string[];
  readonly simulationUnitsConsumed: bigint | null;
  readonly blockhashExpired: boolean;
  // 与本次估费/模拟完全同一笔未签名交易，供 2.2 准备阶段逐字节锁定。
  readonly wireTransactionBase64: string;
  readonly messageBase64: string;
};

export type SimulationClient = {
  checkTransaction(input: { feePayer: string; text: string; signal: AbortSignal }): Promise<SimulationCheckResult>;
};

function describeDuration(milliseconds: number): string {
  const seconds = milliseconds / 1000;
  return Number.isInteger(seconds) ? `${seconds} 秒` : `${milliseconds} 毫秒`;
}

function describeSimulationError(
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


export function createSimulationClient(
  rpc: SimulationRpc = createSolanaRpc(SOLANA_NETWORK_CONFIG.rpcUrl) as unknown as SimulationRpc,
  options: Readonly<{ timeoutMs?: number }> = {},
): SimulationClient {
  const timeoutMs = options.timeoutMs ?? SIMULATION_TIMEOUT_MS;

  async function call<TResponse>(
    action: string,
    callerSignal: AbortSignal,
    request: (signal: AbortSignal) => Promise<TResponse>,
  ): Promise<TResponse> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = AbortSignal.any([callerSignal, timeout]);
    try {
      return await request(combined);
    } catch (error) {
      throw describeSimulationError(error, callerSignal, timeout, action, timeoutMs);
    }
  }

  async function verifyNetwork(callerSignal: AbortSignal): Promise<void> {
    const genesisHash = await call('网络校验', callerSignal, (signal) => rpc.getGenesisHash().send({ abortSignal: signal }));
    if (genesisHash !== SOLANA_NETWORK_CONFIG.genesisHash) {
      throw new Error(
        `网络校验失败：应用查询的 RPC 不是 ${SOLANA_NETWORK_CONFIG.displayName}（genesis ${genesisHash}）。`,
      );
    }
  }

  function isBlockhashNotFoundError(error: unknown): boolean {
    if (error === 'BlockhashNotFound') return true;
    if (typeof error === 'object' && error !== null) {
      const value = error as Record<string, unknown>;
      if (value.type === 'BlockhashNotFound' || value.err === 'BlockhashNotFound') return true;
    }
    return false;
  }

  async function checkTransaction({
    feePayer,
    text,
    signal,
  }: {
    feePayer: string;
    text: string;
    signal: AbortSignal;
  }): Promise<SimulationCheckResult> {
    if (!isAddress(feePayer)) throw new Error('付款地址格式无效。');

    // 模拟入口同样强制正文规则，非法输入不发出任何 RPC。
    const validation = validateMessageText(text);
    if (!validation.ok) throw new Error(describeMessageTextError(validation.reason));

    await verifyNetwork(signal);

    const latestBlockhash = await call('获取最新 blockhash', signal, (requestSignal) =>
      rpc.getLatestBlockhash({ commitment: 'confirmed' }).send({ abortSignal: requestSignal }),
    );
    const lifetime: BlockhashLifetime = {
      blockhash: latestBlockhash.value.blockhash,
      lastValidBlockHeight: latestBlockhash.value.lastValidBlockHeight,
    };

    const initialBlockHeight = await call('获取区块高度', signal, (requestSignal) =>
      rpc.getBlockHeight({ commitment: 'confirmed' }).send({ abortSignal: requestSignal }),
    );
    const balance = await call('余额读取', signal, (requestSignal) =>
      rpc.getBalance(feePayer as Address, { commitment: 'confirmed' }).send({ abortSignal: requestSignal }),
    );

    const unsigned = buildUnsignedGuestbookTransaction({ feePayer, text, lifetime });

    const fee = await call('费用估算', signal, (requestSignal) =>
      rpc.getFeeForMessage(unsigned.messageBase64, { commitment: 'confirmed' }).send({ abortSignal: requestSignal }),
    );

    const simulated = await call('交易模拟', signal, (requestSignal) =>
      rpc
        .simulateTransaction(unsigned.wireTransactionBase64, {
          encoding: 'base64',
          commitment: 'confirmed',
          sigVerify: false,
          replaceRecentBlockhash: false,
        })
        .send({ abortSignal: requestSignal }),
    );

    // 返回前重新取当前高度，避免把检查前的高度快照当作仍有效。
    const currentBlockHeight = await call('复核区块高度', signal, (requestSignal) =>
      rpc.getBlockHeight({ commitment: 'confirmed' }).send({ abortSignal: requestSignal }),
    );

    const blockhashNotFound = isBlockhashNotFoundError(simulated.value.err);
    const blockhashExpired =
      blockhashNotFound || (currentBlockHeight !== null && currentBlockHeight > lifetime.lastValidBlockHeight);

    const units = simulated.value.unitsConsumed;
    const simulationUnitsConsumed = typeof units === 'bigint' ? units : typeof units === 'number' ? BigInt(units) : null;

    return {
      feePayer,
      text,
      balanceLamports: balance.value,
      feeLamports: fee.value,
      transactionSizeBytes: unsigned.sizeBytes,
      blockhash: lifetime.blockhash,
      lastValidBlockHeight: lifetime.lastValidBlockHeight,
      blockHeight: currentBlockHeight ?? initialBlockHeight,
      simulationErr: simulated.value.err ?? null,
      simulationLogs: simulated.value.logs ?? [],
      simulationUnitsConsumed,
      blockhashExpired,
      wireTransactionBase64: unsigned.wireTransactionBase64,
      messageBase64: unsigned.messageBase64,
    };
  }

  return { checkTransaction };
}
