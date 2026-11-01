# Said STATUS

更新：2026-11-01T23:56:15+08:00。**SPRINT-MAINNET 已部署，线上运行主网 9be4bad。** 公网首页明确显示 Solana 主网与真实 SOL；未连接时主网公共板为空状态。浏览器中的 Phantom 已连接主网账户，显示完整地址和真实余额；该账户余额为 0 SOL，因此准备、签名、广播与读回尚未执行。

## 当前发布

- 正式地址：[Said](https://londonyu.github.io/said/)，GitHub Pages托管，独立于用户电脑和本地进程。
- 线上代码：`9be4bade341e2b6722910257ecee03e4747c9710`；[部署运行41323014881](https://github.com/LondonYu/said/actions/runs/41323014881)成功，build与deploy均成功，2026-11-01T23:48:25+08:00。线上资源清单见[public-assets.json](docs/sprints/SPRINT-MAINNET/evidence/public-assets.json)。
- 线上能力：连接钱包、读取公共/作者历史、显式准备/签名/提交、原签名确认与读回；当前线上已切到 Solana 主网。主网公共板为空，旧 Devnet 留言与回执不进入当前页面。
- 主网配置：Pages工作流build显式`VITE_SOLANA_NETWORK=mainnet`；本地`npm run dev`和`npm test`默认Devnet。主网使用`solana:mainnet`、PublicNode、主网genesis、`public-mainnet-v1`、独立回执key和无cluster的Explorer；真实SOL网络费由用户支付，平台不额外收费。
- 既有检查：255项项目测试、typecheck、默认Devnet构建、主网构建均通过；非法网络值构建失败；`git diff --check`通过。主网只读证据见[SPRINT-MAINNET](docs/sprints/SPRINT-MAINNET/evidence/read-only-mainnet.json)。
- 治理入口：本文件维护当前状态/待办；[DECISIONS](DECISIONS.md)维护决策；[docs/sprints/](docs/sprints/)维护历史。

## v0.2 逐条验收

| ID | 标准 | 实际证据与最终结果 |
| --- | --- | --- |
| W01 | Devnet/付款地址/正文/估费审阅，用户主动钱包签名 | 用户报告“第一次失败显示超时 第二次成功签名并发布 测试”，[用户反馈记录](docs/sprints/SPRINT-2.2B/evidence/user-publication-confirmation.json)；通过 |
| W02 | 真实广播/确认、原签名官方Devnet链接 | [本次交易](https://explorer.solana.com/tx/3gkgb4vK4xypp342nPGwEmJL5gwfhWysWGrcyKQLz1UDPdmeedp5gARgvARYdWyrSsGT5GMGbNV8pMz3iCZvr4nz?cluster=devnet)，RPC为finalized、err=null；费用5000lamports（0.000005测试SOL）、slot 517526468，作者为用户Hs1N…k31S；[只读状态](docs/sprints/SPRINT-2.2B/evidence/user-post-status.json)；通过 |
| W03 | 刷新页面后仍能从链上读回新留言 | 用户对明确刷新问题回答“能看到‘测试’”；独立history客户端无缓存读回同签名/作者/正文，无不可得条目；[读回证据](docs/sprints/SPRINT-2.2B/evidence/user-post-chain-readback.json)；通过 |

用户反馈记录时间：2026-11-01T22:44:04+08:00。RPC核验原始时间见各证据；链上blockTime为2026-11-01T22:35:34+08:00，不当作用户点击时刻。用户钱包操作由用户执行，代理未直接观察本次签名弹窗，也未代签或广播。三条由用户反馈和实际链上证据共同验收，不以测试通过代替。

## 已关闭阶段与当前待办

- [x] v0.1只读演示由用户完成V01/V02/V03最终确认；[归档与证据](docs/sprints/SPRINT-4.0/SPRINT-4.0.md)。不重新开闸。
- [x] 2.2B发布页面、能力getter兼容及模拟前预算契约完成；旧R1修复1/1、确认1/1保留，准备契约实质重写后一次确认，不追加边界复审。
- [x] 用户真实Phantom发布成功、链上finalized、刷新读回确认；[2.2B验收归档](docs/sprints/SPRINT-2.2B/ACCEPTANCE.md)。
- 当前工单：[SPRINT-MAINNET](docs/sprints/SPRINT-MAINNET.md)。用户要求“用Solana真实币呀”，允许开发主网能力，覆盖旧Devnet-only边界。Cline已在工作区实现候选并留证，未改线上部署。
- [x] Cline统一网络配置、chain/genesis/board/回执/Explorer隔离和主网文案，保留原发布保护，交一次审查。
- [x] Codex一次独立审查通过：typecheck、255项测试、主网build、diff检查通过；隔离探针确认旧Devnet回执不读取、错genesis拒绝且无回退，实际浏览器真实主网空列表成功。证据：[审查](docs/sprints/SPRINT-MAINNET/evidence/codex-review.json)、[截图](docs/sprints/SPRINT-MAINNET/evidence/preview-home.png)。
- [x] Codex部署主网版本，线上运行`9be4bad`；M01通过，M02主网连接与余额读取通过，M03待有真实SOL的账户完成一笔交易。
- [ ] 用户切换至有主网SOL的Phantom账户，或在确认风险后向当前地址转入足够支付网络费的主网SOL；随后准备、签名、确认并刷新读回一笔测试留言。

## 开源作品文档收尾（已完成）

- 范围：在用户“好下一步”后补齐中英文README的体验步骤、固定版本本地启动、六个换链模块和已验证/限制说明；保留MIT与现有产品。
- 演示材料：[真实公网首页截图](docs/sprints/SPRINT-2.2B/evidence/portfolio-home.png)，显示4条真实记录、未连接钱包；[采集记录](docs/sprints/SPRINT-2.2B/evidence/portfolio-home.json)。记录时间2026-11-01T22:55:55+08:00，线上仍7216807。
- 核对来源：本地.nvmrc/package.json/脚本、已验收交易记录、GitHub连接器确认现有仓库public；官方水龙头链接已打开核对。本轮只读网页与改文档，不改产品/依赖/视觉，不运行测试/签名/广播/部署，不创建Release或tag。
- 当前无新产品工单；后续目标由用户另定，不从backlog自动续做。

## 主网实现、部署与验收

- 网络来源：`src/network.ts`统一导出chain、RPC、genesis、board、Explorer后缀和回执key；未设置`VITE_SOLANA_NETWORK`默认Devnet，只接受`devnet`/`mainnet`，非法值在Vite构建和模块加载时失败，无运行时URL/query切网或失败回退。wallet/network/message/simulation/publisher/history/explorer/App共同使用该来源。
- 隔离：主网`solana:mainnet`、`https://solana-rpc.publicnode.com`、genesis`5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`、board`public-mainnet-v1`、回执key`said.publication-receipts.mainnet.v1`、Explorer不带cluster；Devnet保留原RPC/genesis/board/`said.publication-receipts.v1`和`?cluster=devnet`。既有Devnet记录不迁移、不混入主网查询。
- 交易保护保留：400000 CU与0 micro-lamports/CU在准备时定义，基础费由RPC估算；同消息估费/模拟/签名、逐字节一致、实际Ed25519验签、genesis/会话/高度/费用/余额复核、同步签名锁、单次广播、原签名查询与回执恢复均未放宽。
- 展示：页面顶部、余额、发布审阅、钱包指引、历史详情和Explorer按构建网络显示；主网三语言文案经SSR读取检查，无Devnet/Testnet/测试币/水龙头用语。主网公共流为空，不展示旧Devnet四条记录或示例冒充主网。
- 工作流与文档：Pages仅build命令改为`VITE_SOLANA_NETWORK=mainnet npm run build`；中英文README说明主网目标、本地Devnet默认和两种构建。未新增依赖、服务、密钥、账号或付费RPC。
- 构建证据：[mainnet-build.json](docs/sprints/SPRINT-MAINNET/evidence/mainnet-build.json)。2026-11-01T23:30:48+08:00，`VITE_SOLANA_NETWORK=mainnet npm run build`成功，73 modules，单一JS产物`index-CNefGxtp.js`399348 bytes，`index.html`引用同一产物，bundle hash`b4e4de09ba6fe60bbb101ac713f30e6df1be67e7b98bf2aeaf76a8756b1b6f16`；主网token均在产物中。`VITE_SOLANA_NETWORK=testnet`构建exit 1并报“只支持devnet或mainnet”。
- 只读RPC证据：[read-only-mainnet.json](docs/sprints/SPRINT-MAINNET/evidence/read-only-mainnet.json)。2026-11-01T23:27:21+08:00，Vite SSR以mainnet加载实际模块：chain/genesis/board/回执key/Explorer一致，PublicNode genesis匹配，Memo程序executable，marker历史0条；三语言流程文案forbiddenMatches为空。无签名、无广播。
- M01：通过。公网部署后的真实浏览器显示“Solana 主网 · 真实 SOL”“Solana 主网只读”；未连接时主网板返回真实空状态，扫描候选为0。
- M02：主网连接与余额读取通过。浏览器请求 Phantom 连接后显示完整地址`Hs1NxWYZdXE6opzTY1wR9XCbq2QtNwrGdkWgSMeWk31S`与余额`0 SOL（真实主网 SOL）`。准备交易、签名与广播未执行，因为当前余额不足以支付任何主网手续费。
- M03：待验证。尚无真实主网交易、确认或刷新读回；不把空板、模拟或注入测试当作M03证据。
- 浏览器证据：[pages-mainnet-browser.json](docs/sprints/SPRINT-MAINNET/evidence/pages-mainnet-browser.json)；部署记录：[pages-deployment.json](docs/sprints/SPRINT-MAINNET/evidence/pages-deployment.json)。
- 未验证项：有余额账户的主网估费/签名/广播/确认/读回、其他钱包、真机与异常矩阵。公共RPC预检、Node只读请求和注入测试不能替代这些验收。

## backlog（不阻断已验收里程碑）

当前无已登记未解决的P0/P1。以下为P2、后续功能或未验证项，升降级仍需AGENTS要求的证据。

| ID | 类型 | 内容与理由 |
| --- | --- | --- |
| B01 | 后续功能 | 多笔回执管理、批量恢复、额外交易能力，不属于单条发布闭环 |
| B02 | 未验证项 | 个人历史/切账户/拒绝/取消及其他钱包、版本、全机型矩阵，不自动扩展支持声明 |
| B03 | 未验证项 | 真实响应丢失/网络抖动/多标签等异常矩阵；本次成功不代表这些已验证 |
| B04 | 体验后置 | 横屏、200%缩放、全语言矩阵 |
| B05 | P2 文案 | 英文页头Devnet/Testnet混用，不影响固定Devnet链路 |
| B06 | P2 格式 | Publication.tsx、capture.mjs各一个EOF空行，无运行影响 |
| B07 | 可恢复超时反馈，P2待查 | 用户首次超时、第二次成功；发生阶段/原因/第一笔签名未知，不判定是否广播，不归咎钱包或网络，不自动重发。若真实复现影响主路径，按证据制度重新分级 |

## 回退

- 线上主网版本为`9be4bad`、Pages运行41323014881。若部署后出现有证据的P0/P1，可恢复上一成功Devnet运行41308454557；不重写或删除任何链上记录。
- 保留当前main-only手动Pages工作流；重新运行之前成功的Pages提交可回退。
- 已验收只读v0.1回退点：`ea2f60e46d851b38806009dcee81d2c9afb3c5bb`，[运行41273238142](https://github.com/LondonYu/said/actions/runs/41273238142)。本轮未回退。
- Vite `base: './'`适配`/said/`子路径，恢复默认根路径前需重新核对资源路径。

## 本轮不建议修

- 主网动态优先费、平台代付、收费和额外转账不在本单；固定400000 CU/0 micro-lamports价格继续保留。
- PublicNode已在真实浏览器只读读取成功；真实主网钱包签名、广播、确认和读回由用户在部署后按M02/M03验收，不用模拟替代。
- 旧Devnet记录不迁移、不删除；主网公共流为空是正常状态。
- B05/B06、B07和全钱包/异常矩阵继续后置，不以P2或未验证项阻止候选审查。
- 用户接入的规则、技能、记忆和钩子保持原样，不借本轮提交或整理。
