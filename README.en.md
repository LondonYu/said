# Said

[English](README.en.md) · [简体中文](README.md)

Said is a blockchain guestbook example under development. Its goal is to let people use a wallet to publish short messages on-chain, then read the public feed and their own history. Wallet connection, unsigned transaction construction, simulation, a publishing core module, a standalone history reader, and a real Devnet interface for the public feed, personal history, search, details, pagination, refresh, and unreadable-record retry are implemented. Signing and submission are not yet connected to the interface.

This is a learning and portfolio project. It currently uses Solana Devnet, with no custom application backend or traditional database. A wallet public key identifies the author. The project does not promise permanent storage or guaranteed access to historical data.

## Intended workflow (partly implemented)

- Connect a wallet through Wallet Standard, without creating a separate account.
- Write a message of up to 140 grapheme clusters and 560 UTF-8 bytes, then sign a Solana transaction to publish it.
- Store the message in SPL Memo transaction data, alongside a transfer of 0 lamports to a fixed board marker address that serves as a history lookup key.
- Read valid messages through RPC and derive authorship from transaction signatures rather than an address claimed in the message text.

## Technical design

- React, TypeScript, and Vite for the frontend; `@solana/kit` for transaction construction and RPC calls; native Wallet Standard for wallet discovery and connection.
- Memo4 carries the JSON payload `{"app":"cyber-guestbook","v":1,"board":"public-devnet-v1","text":"..."}`. The Memo instruction explicitly includes the author as a required signer. The current interface only constructs and simulates the unsigned transaction; the Stage 2.2A publishing core is not wired into it.
- Each guestbook transaction includes a transfer of 0 lamports to the board marker address. The reader in `src/history.ts` uses `getSignaturesForAddress` and `getTransaction` to discover and validate candidates, including programs, protocol, and author signer accounts. Personal history is queried independently by author address. Pages default to 10 candidates, with a maximum of 20 and two concurrent detail requests; unavailable signatures are retained for explicit retry. `src/historyFeed.ts` and `src/HistoryViews.tsx` connect this reader to the interface.
- The static frontend connects directly to Devnet RPC. No custom on-chain program, application server, or traditional database is required by the current implementation.

## Adapting it to another chain

The current implementation is Solana-specific; it does not support multiple chains. It depends on `@solana/kit`, Memo4, and a fixed board marker address.

To adapt the project, replace the wallet integration, transaction construction, message storage mechanism, and history discovery API. Relevant modules include `src/wallet.ts`, `src/network.ts`, `src/message.ts`, `src/simulation.ts`, and `src/history.ts`. The interface and chain-independent text validation can be reused with suitable changes. The reader must verify authorship and message validity using the target chain's transaction model.

## Current goal and status

v0.1 has three acceptance criteria: a GitHub Pages URL that remains accessible after the user’s computer is shut down and local processes stop, three real on-chain messages visible without a wallet connection, and the connected wallet’s own address displayed. Temporary tunnels are for debugging and do not count as URL acceptance evidence. Signing and submission are outside v0.1. [STATUS](STATUS.md) holds the current evidence and requires the user’s final confirmation. The 2.2A core is retained; 2.2B is deferred. Test counts do not establish release acceptance. See [DECISIONS](DECISIONS.md) and the [historical archive](docs/sprints/).

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
