# Said

[English](README.en.md) · [简体中文](README.md)

Said is a blockchain guestbook example under development. Its goal is to let people use a wallet to publish short messages on-chain, then read the public feed and their own history. Wallet connection, unsigned transaction construction, and simulation are implemented. Transaction signing, submission, and history retrieval are not yet implemented in the app.

This is a learning and portfolio project. It currently uses Solana Devnet, with no custom application backend or traditional database. A wallet public key identifies the author. The project does not promise permanent storage or guaranteed access to historical data.

## Intended workflow (partly implemented)

- Connect a wallet through Wallet Standard, without creating a separate account.
- Write a message of up to 140 grapheme clusters and 560 UTF-8 bytes, then sign a Solana transaction to publish it.
- Store the message in SPL Memo transaction data, alongside a transfer of 0 lamports to a fixed board marker address that serves as a history lookup key.
- Read valid messages through RPC and derive authorship from transaction signatures rather than an address claimed in the message text.

## Technical design

- React, TypeScript, and Vite for the frontend; `@solana/kit` for transaction construction and RPC calls; native Wallet Standard for wallet discovery and connection.
- Memo4 carries the JSON payload `{"app":"cyber-guestbook","v":1,"board":"public-devnet-v1","text":"..."}`. The Memo instruction explicitly includes the author as a required signer. The current app only constructs and simulates the unsigned transaction.
- Each guestbook transaction is designed to include a transfer of 0 lamports to the board marker address. The planned reader will use `getSignaturesForAddress` to discover transactions and `getTransaction` to retrieve them, then validate the programs, protocol, and author signatures before displaying messages.
- The static frontend connects directly to Devnet RPC. No custom on-chain program, application server, or traditional database is required by the current implementation.

## Adapting it to another chain

The current implementation is Solana-specific; it does not support multiple chains. It depends on `@solana/kit`, Memo4, and a fixed board marker address.

To adapt the project, replace the wallet integration, transaction construction, message storage mechanism, and history discovery API. Relevant modules include `src/wallet.ts`, `src/network.ts`, `src/message.ts`, and `src/simulation.ts`. The interface and chain-independent text validation can be reused with suitable changes. Any future reader will need to verify authorship and message validity using the target chain's transaction model.

## Current status

- Implemented: wallet connection and disconnection, account change handling, read-only Devnet balances, responsive layout, theme and language preferences, unsigned transaction construction, and simulation with `sigVerify=false`.
- Not implemented: transaction signing and submission (Sprint 2.2), and on-chain history retrieval (Stage 3). The current home feed is explicitly labeled sample data.
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
