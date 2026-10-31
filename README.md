# Said

[简体中文](README.md) · [English](README.en.md)

Said 是一个正在开发的链上留言板（guestbook）示例，目标是用钱包签名把短文字写到链上，再读回公共留言和自己的历史。当前已实现钱包连接、交易构造、模拟及独立历史读取模块；页面仍展示明确标注的示例，真实列表尚未接入，签名发送尚未实现。无自建业务后端、无传统业务数据库，身份是钱包公钥。

这是一个学习 / 作品集项目，不是要运营的社交产品。当前跑在 Solana Devnet；留言“不可删”以链上数据可得性为前提，不承诺永久存储。

## 目标流程（尚未全部实现）

- 通过 Wallet Standard 连接钱包，无需注册，公钥即身份。
- 写一段不超过 140 个可见字符（grapheme clusters）、且不超过 560 UTF-8 字节的留言，签名后作为一笔 Solana 交易上链。
- 留言记录在 SPL Memo 程序的交易数据里，并附带一笔 0 SOL 转账到固定的板级标记地址，作为可查询入口。
- 任何人打开页面都能从 RPC 读回符合协议的有效留言，作者来自交易签名而非正文自报。

## 技术实现

- React + TypeScript + Vite；`@solana/kit` 构造交易与调用 RPC；原生 Wallet Standard 发现并连接钱包。
- 协议：Memo4 程序写入固定 JSON `{"app":"cyber-guestbook","v":1,"board":"public-devnet-v1","text":"..."}`，Memo 指令显式包含作者作为签名账户。
- 板级入口：所有有效留言交易都包含一笔向固定标记地址的 0 lamports 转账；`src/history.ts` 用 `getSignaturesForAddress` 和 `getTransaction` 发现候选并严格校验程序、协议与作者签名账户。个人历史按作者地址独立查询后执行同一校验。默认10条候选/页、上限20、详情并发2，不可得签名保留供显式重试；尚未接入页面。
- 无后端、无数据库、无自定义链上程序；静态前端直连 Devnet RPC。

## 换链说明

当前实现基于 Solana（依赖 `@solana/kit`、Memo4 程序与固定板级标记地址），并不是已经支持多链。链相关模块包括 `src/wallet.ts`、`src/network.ts`、`src/message.ts`、`src/simulation.ts` 和 `src/history.ts`；换链需要替换钱包连接、交易构造、存证和历史发现，并按目标链重新验证作者身份。界面与不依赖链的正文校验可按需复用。

## 当前状态

- 已实现：钱包连接/断开/账户变化、Devnet 只读余额、响应式界面与主题/语言设置、未签名交易构造与 `sigVerify=false` 模拟；3.1 历史解析/公共与作者分页/显式重试模块已通过独立复审。
- 未实现：真实签名发送（2.2）、历史读取界面（3.2）。当前首页仍为明确标注的示例流。
- 验证：全项目107项测试通过；独立真实Devnet两页读回3条、2作者。详见[3.1复审](docs/REVIEW-3.1-RESULT.md)。下一步为[3.2页面接入工单](docs/SPRINT-3.2.md)，已完成规划，尚未接入。
- 已知限制：Devnet 会重置；公共 RPC 有速率限制且不保证历史长期可读；内容上链后无法删除，前端只能选择展示与否。

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
