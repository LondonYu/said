// @vitest-environment jsdom
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePublicationFlow } from './Publication';
import type { PreparedPublication, Publisher } from './publisher';
import type { WalletSigningSession } from './wallet';

const ADDRESS = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const DRAFT = '严格模式下的准备状态';

const prepared: PreparedPublication = {
  version: 1 as PreparedPublication['version'],
  chain: 'solana:devnet',
  sessionRevision: 1,
  walletName: '模拟钱包',
  author: ADDRESS,
  text: DRAFT,
  feeLamports: 5000n,
  balanceLamports: 1_000_000_000n,
  blockhash: '11111111111111111111111111111111',
  lastValidBlockHeight: 1000n,
  transactionSizeBytes: 200,
  unsignedTransactionBase64: 'AA==',
  messageBase64: 'AA==',
  checkedAt: Date.now(),
};

const session = {
  accountAddress: ADDRESS,
  chain: 'solana:devnet',
} as unknown as WalletSigningSession;

function Harness({ publisher }: { publisher: Publisher }) {
  const flow = usePublicationFlow({
    publisher,
    getSession: () => session,
    draft: DRAFT,
    author: ADDRESS,
    connected: true,
    signingReason: null,
    onConfirmed: () => {},
  });
  return (
    <>
      <button type="button" onClick={() => flow.prepare(DRAFT)}>prepare</button>
      <p data-testid="phase">{flow.state.phase}</p>
      <p data-testid="fee">{flow.state.prepared?.feeLamports.toString() ?? ''}</p>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePublicationFlow', () => {
  it('keeps prepared state visible under StrictMode replay', async () => {
    const prepare = vi.fn(async () => prepared);
    const sign = vi.fn();
    const publisher = { prepare, sign } as unknown as Publisher;

    render(<StrictMode><Harness publisher={publisher} /></StrictMode>);
    fireEvent.click(screen.getByText('prepare'));

    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('ready'));
    expect(screen.getByTestId('fee').textContent).toBe('5000');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(sign).not.toHaveBeenCalled();
  });
});
