export const EXPLORER_TRANSACTION_BASE = 'https://explorer.solana.com/tx/';

export function devnetExplorerUrl(signature: string): string {
  return `${EXPLORER_TRANSACTION_BASE}${encodeURIComponent(signature)}?cluster=devnet`;
}
