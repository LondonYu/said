# Said

[简体中文](README.md) · [English](README.en.md) · [在线演示](https://londonyu.github.io/said/)

基于 Solana Devnet 的开源链上留言板。连接钱包、签名发布短文字，再通过 RPC 读取公共留言和作者历史。React + TypeScript + Vite，无自建业务后端或传统数据库。

这是一个学习与作品集项目。当前实现仅支持 Solana Devnet；代码按 MIT 协议开放。

![Said 公共留言流](docs/sprints/SPRINT-2.2B/evidence/portfolio-home.png)

2026-11-01 公网截图：未连接钱包，从 Devnet 读取真实留言。

## 快速体验

1. 打开[在线演示](https://londonyu.github.io/said/)，无需连接钱包即可阅读公共留言。
2. 发布时连接钱包。已完成真实签名验证的路径是电脑 Chrome + Phantom；其他钱包的发布兼容性仍需分别验证。
3. 确认账户有少量 **Devnet 测试 SOL**。可自行向 [Solana 官方水龙头](https://faucet.solana.com/)申请；服务可能限流。测试币与主网 SOL 分开使用。
4. 输入留言，预览并点击「准备发布」。核对 Devnet、付款公钥、正文与实际估费后，点击「签名并发送」，由你在钱包确认。
5. 查看确认状态和 Devnet Explorer 链接。刷新页面后，应能重新读取已上链的留言。

正文限制为 140 个可见字符（grapheme clusters）且不超过 560 UTF-8 字节。留言公开；网站不需要密码、私钥或助记词。

如果发送结果待查询，使用「查询原签名」或「查询待确认记录」，不要因超时直接重复发布。实际交易费以当次估费及链上结果为准。

## 本地运行

使用仓库指定的 Node.js **26.12.1**（[.nvmrc](.nvmrc)）和 npm **11.20.0**（[package.json](package.json)）。

```sh
git clone https://github.com/LondonYu/said.git
cd said
npm ci
npm run dev
```

打开 <http://127.0.0.1:5173/>。无需配置 API key 或数据库；默认连接 Solana Devnet 公共 RPC。手机可直接使用在线演示，电脑的 `127.0.0.1` 不是手机访问地址。

已有检查与构建命令：

```sh
npm run typecheck
npm test
npm run build
```

生产构建输出到 `dist/`。GitHub Pages 使用现有手动工作流；普通 push 不会自动部署。当前实例的运行版本与验收记录见 [STATUS](STATUS.md)。

## 技术实现

- **身份**：Wallet Standard 连接钱包，公钥标识作者。签名由钱包完成，网站不持有用户密钥。
- **写入**：v0 交易先设置计算预算和 Devnet 优先费价格，再执行一笔向固定板级标记地址的 0 lamports 转账，最后用 Memo4 写入正文。
- **正文协议**：`{"app":"cyber-guestbook","v":1,"board":"public-devnet-v1","text":"..."}`。Memo 指令包含作者签名账户，协议名称保留兼容现有记录。
- **发布校验**：同一消息用于估费、模拟和签名；钱包返回后检查消息字节一致并实际验签，再由固定 Devnet RPC 提交。未知结果按原签名查询，不自动重签或重发。
- **读取**：按板级标记或作者地址调用 `getSignaturesForAddress`，再用 `getTransaction` 校验候选。分页读取，不扫描整个区块链；不可得记录保留重试入口。
- **部署**：静态网页托管于 GitHub Pages，前端直连 RPC；使用已有 Solana 程序，无自定义链上程序。

## 换链时需要修改什么

当前没有多链适配接口。移植到其他链时，需要按目标链重新验证以下部分：

| 模块 | 职责 |
| --- | --- |
| [wallet.ts](src/wallet.ts) | 钱包连接、账户与签名能力 |
| [network.ts](src/network.ts) | RPC、网络身份校验和余额 |
| [message.ts](src/message.ts) | 交易构造、正文与板级发现协议 |
| [simulation.ts](src/simulation.ts) | 估费和未签名模拟 |
| [publisher.ts](src/publisher.ts) | 签名验证、提交、确认与回执恢复 |
| [history.ts](src/history.ts) | 候选发现、作者身份校验和记录解析 |

React 界面、主题、语言设置和部分正文校验可以复用；仅替换 RPC 地址不能完成换链。

## 已验证与限制

用户已在 Chrome + Phantom 完成真实 Devnet 签名发布，并确认刷新后可读。[本次验证交易](https://explorer.solana.com/tx/3gkgb4vK4xypp342nPGwEmJL5gwfhWysWGrcyKQLz1UDPdmeedp5gARgvARYdWyrSsGT5GMGbNV8pMz3iCZvr4nz?cluster=devnet)达到 finalized；完整证据见 [STATUS](STATUS.md)。

- Devnet 可能重置，公共 RPC 可能限流或缺少历史，不承诺永久存储或始终完整可读。
- 全钱包、手机签名和全部异常场景尚未验证。首次超时、重试成功的反馈已记录，根因未知。
- 功能不含主网发布、代付、点赞、回复或私信。

反馈问题时提供复现步骤、钱包和浏览器版本、错误文本，以及交易签名（如有）。不要提供私钥或助记词。决策与被否方案见 [DECISIONS](DECISIONS.md)，历史工单和证据见 [归档](docs/sprints/)。

## License

[MIT](LICENSE)
