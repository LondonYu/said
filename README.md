# Said

[简体中文](README.md) · [English](README.en.md)

[演示（Solana Devnet，只读）](https://londonyu.github.io/said/)

Said 是一个正在开发的链上留言板（guestbook）示例，目标是用钱包签名把短文字写到链上，再读回公共留言和自己的历史。当前已实现钱包连接、交易构造、模拟、发布核心模块、独立历史读取模块，以及接入真实 Devnet 的公共流、我的留言、搜索、详情、分页、刷新和不可读记录重试界面；页面上的签名发送尚未接入。无自建业务后端、无传统业务数据库，身份是钱包公钥。

这是一个学习 / 作品集项目，不是要运营的社交产品。当前跑在 Solana Devnet；留言“不可删”以链上数据可得性为前提，不承诺永久存储。

## 目标流程（尚未全部实现）

- 通过 Wallet Standard 连接钱包，无需注册，公钥即身份。
- 写一段不超过 140 个可见字符（grapheme clusters）、且不超过 560 UTF-8 字节的留言，签名后作为一笔 Solana 交易上链。
- 留言记录在 SPL Memo 程序的交易数据里，并附带一笔 0 SOL 转账到固定的板级标记地址，作为可查询入口。
- 任何人打开页面都能从 RPC 读回符合协议的有效留言，作者来自交易签名而非正文自报。

## 技术实现

- React + TypeScript + Vite；`@solana/kit` 构造交易与调用 RPC；原生 Wallet Standard 发现并连接钱包。
- 协议：Memo4 程序写入固定 JSON `{"app":"cyber-guestbook","v":1,"board":"public-devnet-v1","text":"..."}`，Memo 指令显式包含作者作为签名账户。
- 板级入口：所有有效留言交易都包含一笔向固定标记地址的 0 lamports 转账；`src/history.ts` 用 `getSignaturesForAddress` 和 `getTransaction` 发现候选并严格校验程序、协议与作者签名账户。个人历史按作者地址独立查询后执行同一校验。默认10条候选/页、上限20、详情并发2，不可得签名保留供显式重试；已由 `src/historyFeed.ts` 与 `src/HistoryViews.tsx` 接入页面。
- 无后端、无数据库、无自定义链上程序；静态前端直连 Devnet RPC。

## 换链说明

当前实现基于 Solana（依赖 `@solana/kit`、Memo4 程序与固定板级标记地址），并不是已经支持多链。链相关模块包括 `src/wallet.ts`、`src/network.ts`、`src/message.ts`、`src/simulation.ts` 和 `src/history.ts`；换链需要替换钱包连接、交易构造、存证和历史发现，并按目标链重新验证作者身份。界面与不依赖链的正文校验可按需复用。

## 当前目标与状态

v0.1只做三件事：通过GitHub Pages提供用户电脑关机、本地进程结束后仍可访问的公网URL；未连接钱包读到3条真实链上留言；连接后显示自身地址。不含签名发送，临时隧道不作为公网验收证据。当前结果与逐条证据见[STATUS](STATUS.md)，由用户最终确认。2.2A核心保留，2.2B后置；测试数不是发布条件。决策与被否方案见[DECISIONS](DECISIONS.md)，旧工单及证据在[历史归档](docs/sprints/)。

## 开发

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run dev   # http://127.0.0.1:5173
```

本仓库不含密钥、API key、真实资产或生产部署。

## License

[MIT](LICENSE)
