import { SOLANA_NETWORK_CONFIG } from './network';

export const EXPLORER_TRANSACTION_BASE = 'https://explorer.solana.com/tx/';

export function explorerUrl(signature: string): string {
  return `${EXPLORER_TRANSACTION_BASE}${encodeURIComponent(signature)}${SOLANA_NETWORK_CONFIG.explorerCluster}`;
}
