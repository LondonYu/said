# Said

[English](README.en.md) · [简体中文](README.md)

Said is a blockchain guestbook example under development. Its goal is to let people use a wallet to publish short messages on-chain, then read the public feed and their own history. Wallet connection, unsigned transaction construction, simulation, and a standalone history reader are implemented. The home feed still shows clearly labeled samples; the reader is not connected to the interface yet. Transaction signing and submission are not implemented.

This is a learning and portfolio project. It currently uses Solana Devnet, with no custom application backend or traditional database. A wallet public key identifies the author. The project does not promise permanent storage or guaranteed access to historical data.

## Intended workflow (partly implemented)

- Connect a wallet through Wallet Standard, without creating a separate account.
- Write a message of up to 140 grapheme clusters and 560 UTF-8 bytes, then sign a Solana transaction to publish it.
- Store the message in SPL Memo transaction data, alongside a transfer of 0 lamports to a fixed board marker address that serves as a history lookup key.
- Read valid messages through RPC and derive authorship from transaction signatures rather than an address claimed in the message text.

## Technical design

- React, TypeScript, and Vite for the frontend; `@solana/kit` for transaction construction and RPC calls; native Wallet Standard for wallet discovery and connection.
- Memo4 carries the JSON payload `{"app":"cyber-guestbook","v":1,"board":"public-devnet-v1","text":"..."}`. The Memo instruction explicitly includes the author as a required signer. The current app only constructs and simulates the unsigned transaction.
- Each guestbook transaction includes a transfer of 0 lamports to the board marker address. The reader in `src/history.ts` uses `getSignaturesForAddress` and `getTransaction` to discover and validate candidates, including programs, protocol, and author signer accounts. Personal history is queried independently by author address. Pages default to 10 candidates, with a maximum of 20 and two concurrent detail requests; unavailable signatures are retained for explicit retry. UI integration is pending.
- The static frontend connects directly to Devnet RPC. No custom on-chain program, application server, or traditional database is required by the current implementation.

## Adapting it to another chain

The current implementation is Solana-specific; it does not support multiple chains. It depends on `@solana/kit`, Memo4, and a fixed board marker address.

To adapt the project, replace the wallet integration, transaction construction, message storage mechanism, and history discovery API. Relevant modules include `src/wallet.ts`, `src/network.ts`, `src/message.ts`, `src/simulation.ts`, and `src/history.ts`. The interface and chain-independent text validation can be reused with suitable changes. The reader must verify authorship and message validity using the target chain's transaction model.

## Current status

- Implemented: wallet connection and disconnection, account change handling, read-only Devnet balances, responsive layout, theme and language preferences, unsigned transaction construction, simulation with `sigVerify=false`, and the independently reviewed Stage 3.1 parser, board/author pagination, and explicit retry client.
- Not implemented: transaction signing and submission (Sprint 2.2), and the history UI (Stage 3.2). The current home feed is explicitly labeled sample data.
- Validation: 107 project tests pass. An independent Devnet check retrieved three messages by two authors over two pages. See the [Stage 3.1 review](docs/REVIEW-3.1-RESULT.md). Next is the [Stage 3.2 UI work order](docs/SPRINT-3.2.md), which is specified but not implemented yet. Engineering work orders are currently in Chinese.
- Limitations: Devnet may reset. Public RPC services impose rate limits and do not guarantee long-term access to history. Published content cannot be retracted through the app; the frontend can only choose whether to display it. Unsigned simulation does not verify signatures or publish anything.

## Development

Use the Node.js and npm versions specified in `package.json` and `.nvmrc`.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run dev   # http://127.0.0.1:5173
```

The repository contains no wallet secrets or API keys. No production deployment or real funds are required for this Devnet project.

## License

[MIT](LICENSE)
