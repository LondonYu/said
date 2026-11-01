import { defineConfig, loadEnv } from 'vite';

const SUPPORTED_NETWORKS = new Set(['devnet', 'mainnet']);

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, process.cwd(), '');
  const configured = (process.env.VITE_SOLANA_NETWORK ?? loaded.VITE_SOLANA_NETWORK)?.trim();
  if (configured !== undefined && configured !== '' && !SUPPORTED_NETWORKS.has(configured)) {
    throw new Error(`VITE_SOLANA_NETWORK 只支持 devnet 或 mainnet，收到：${configured}`);
  }

  return {
    base: './',
  };
});
