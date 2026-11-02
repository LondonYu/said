# Said

[English](README.en.md) · [简体中文](README.md) · [Live demo](https://londonyu.github.io/said/)

An open-source guestbook on Solana. Connect a wallet, sign a short message, and read the public feed or an author's history through RPC. The build chooses Solana Devnet or Solana Mainnet; the Pages workflow uses mainnet, while local development and tests default to Devnet. Built with React, TypeScript, and Vite, without a custom application server or traditional database.

This is a learning and portfolio project available under the MIT license. Mainnet publishing pays the network fee in real SOL; the platform charges nothing extra. The user's wallet performs signing and broadcasting.

![Said public feed](docs/sprints/SPRINT-2.2B/evidence/portfolio-home.png)

Public-site screenshot from November 1, 2026: real Devnet messages, with no wallet connected. It does not show mainnet records.

## Try it

1. Open the [live demo](https://londonyu.github.io/said/). Reading the public feed requires no wallet connection. The Pages build command is fixed to `VITE_SOLANA_NETWORK=mainnet`; [STATUS](STATUS.md) records the currently deployed version and mainnet acceptance state.
2. Connect a wallet to post. Desktop Chrome with Phantom has been verified for a real Devnet signature; mainnet signing still needs user-led M02/M03 verification.
3. A mainnet account needs real SOL for the network fee. The page shows Solana Mainnet, the full fee payer, the original text, and the RPC fee estimate. No fixed 5000-lamport promise is made, and the platform does not sponsor or add charges.
4. Enter a message, preview it, and choose “Prepare post.” Review the mainnet identity, fee payer, text, and estimated fee, then choose “Sign and send” and confirm in your wallet.
5. Check the confirmation status and mainnet Explorer link. After refreshing, the published mainnet message should load from the chain again.

Messages allow up to 140 grapheme clusters and 560 UTF-8 bytes. Text is public. The site does not need a password, private key, or recovery phrase.

If a send result is uncertain, use “Query original signature” or “Query pending records” rather than posting again because of a timeout. Fees depend on the actual estimate and transaction result.

## Run locally

Use Node.js **26.12.1** from [.nvmrc](.nvmrc) and npm **11.20.0** from [package.json](package.json).

```sh
git clone https://github.com/LondonYu/said.git
cd said
npm ci
npm run dev
```

Open <http://127.0.0.1:5173/>. No API key or database setup is required; without `VITE_SOLANA_NETWORK`, local development uses the public Solana Devnet RPC. For mobile access, use the live demo. Your computer's `127.0.0.1` is not an address your phone can use.

Two production builds:

```sh
npm run build                                  # Devnet
VITE_SOLANA_NETWORK=mainnet npm run build      # Solana Mainnet
```

Existing checks:

```sh
npm run typecheck
npm test
```

`VITE_SOLANA_NETWORK` accepts only `devnet` or `mainnet`; an invalid value fails the build. There is no runtime URL or query switching and no fallback to another network when RPC fails. The production build is written to `dist/`. GitHub Pages uses the existing manual workflow; ordinary pushes do not deploy automatically. [STATUS](STATUS.md) records the running version and acceptance evidence.

## How it works

- **Network configuration:** `src/network.ts` is the single source for chain, RPC, genesis, text board, Explorer, and the local receipt key. Mainnet uses `public-mainnet-v1`; Devnet uses `public-devnet-v1`. The ledgers and receipts are isolated, and old Devnet records are not migrated.
- **Identity:** Wallet Standard connects the wallet and selects only accounts declaring the current network chain. The public key identifies the author. The wallet signs; the site does not hold user keys.
- **Writing:** A v0 transaction sets a 400,000 CU limit and 0 micro-lamports/CU priority-fee price, transfers 0 lamports to a fixed board marker, and writes the text through Memo4. The basic network fee comes from the RPC estimate.
- **Payload:** An example is `{"app":"cyber-guestbook","v":1,"board":"public-mainnet-v1","text":"..."}`; the build network selects the actual board. The Memo instruction includes the author as a signer. The protocol name remains compatible with existing records.
- **Publishing:** The same message is estimated, simulated, and signed. After the wallet returns, the client checks message byte equality and verifies the signature, then rechecks genesis, session, block height, fee, and balance before a single broadcast. Uncertain results are queried by the original signature without automatic re-signing or resending.
- **Wallet compatibility:** Phantom's mainnet Lighthouse anti-spoofing guards are handled through an exact allowlist. The blockhash and original ComputeBudget, System zero-transfer, Memo, and account references must remain unchanged. Only additional instructions from the audited Lighthouse program are accepted; all other modifications are rejected, and fees are checked against the wallet-returned message.
- **Reading:** `getSignaturesForAddress` discovers candidates by board marker or author; `getTransaction` validates them and their board. History is paginated rather than scanned across the entire chain, and unavailable records can be retried.
- **Hosting:** GitHub Pages serves the static frontend, which calls RPC directly and uses existing Solana programs. There is no custom on-chain program.

## What to check when changing networks

| Module | Responsibility |
| --- | --- |
| [wallet.ts](src/wallet.ts) | Wallet connection, current-network accounts, and signing capabilities |
| [network.ts](src/network.ts) | Build-time network selection, RPC, genesis, and balances |
| [message.ts](src/message.ts) | Transaction construction, payload, and network-selected board |
| [simulation.ts](src/simulation.ts) | Current-network fee estimation and unsigned simulation |
| [publisher.ts](src/publisher.ts) | Signature verification, submission, confirmation, and network-isolated receipt recovery |
| [history.ts](src/history.ts) | Current-network discovery, authorship checks, and board parsing |

The React interface, themes, language settings, and some text validation can be reused. Changing only the RPC URL is insufficient.

## Verified behavior and limits

The user completed real Devnet and Solana Mainnet publications in Chrome with Phantom and confirmed that each message remained visible after refreshing. The [mainnet verification transaction](https://explorer.solana.com/tx/1BuLMQJnNreHBv1JtsLeqB1SUkCTEeMHAs6BgknUG72UQLAYyNmCXf3F1BN5qax2X638RnbK5xFhNVMVHbcf3Qp) reached finalized, and the text “测试” loads again on the deployed public page. See [STATUS](STATUS.md) for the evidence.

- The mainnet build is deployed on GitHub Pages. Phantom connection, real signing, broadcast, finalized confirmation, and refresh read-back have all been completed.
- The first mainnet post contains “测试”, derives its author from the fee-paying signature, and cost 5000 lamports. Old Devnet posts remain on Devnet and are not described as migrated or deleted.
- Mainnet uses `https://rpc.solanatracker.io/public` with a minimal Phantom Lighthouse guard allowlist. Core instructions and accounts must remain unchanged; all other wallet modifications are rejected.
- Public RPC services may throttle requests or lack historical data. Permanent storage and complete availability are not guaranteed. The mainnet basic fee is whatever the RPC estimates for that transaction.
- Other wallets, mobile signing, and all failure scenarios have not been verified. An initial timeout followed by a successful Devnet retry is recorded; its cause is unknown.
- Sponsored fees, platform charges, likes, replies, and private messages are outside this implementation.

When reporting an issue, include reproduction steps, wallet and browser versions, error text, and a transaction signature if available. Never include private keys or recovery phrases. See [DECISIONS](DECISIONS.md) and the [archive](docs/sprints/) for decisions and historical work.

## License

[MIT](LICENSE)
