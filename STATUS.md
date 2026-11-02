# Said STATUS

更新：2026-11-02T13:50:00+08:00。**Said首笔真实主网留言已完成发布、finalized和公网刷新读回。** 交易`1BuLM…cf3Qp`正文“测试”，作者为付款账户，费用5000lamports；部署`3630afe`后公共流正常显示。

## 当前发布

- 正式地址：[Said](https://londonyu.github.io/said/)，GitHub Pages托管，独立于用户电脑和本地进程。
- 线上代码：`3630afe`；[部署运行41395955859](https://github.com/LondonYu/said/actions/runs/41395955859)成功，build与deploy均成功，2026-11-02T13:47+08:00。
- 线上能力：连接钱包、读取公共/作者历史、显式准备/签名/提交、原签名确认与读回；当前线上运行 Solana 主网，公共板已有1条经签名验证的留言。旧 Devnet 留言与回执不进入当前页面。
- 主网配置：Pages工作流build显式`VITE_SOLANA_NETWORK=mainnet`；本地`npm run dev`和`npm test`默认Devnet。主网使用`solana:mainnet`、Solana Tracker公共RPC、主网genesis、`public-mainnet-v1`、独立回执key和无cluster的Explorer；真实SOL网络费由用户支付，平台不额外收费。
- 既有检查：259项项目测试、typecheck、默认Devnet构建、主网构建均通过；非法网络值构建失败；`git diff --check`通过。
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
- 当前工单：[SPRINT-MAINNET](docs/sprints/SPRINT-MAINNET.md)。用户要求“用Solana真实币呀”，允许开发主网能力，覆盖旧Devnet-only边界。主网发布、确认与刷新读回已完成。
- [x] Cline统一网络配置、chain/genesis/board/回执/Explorer隔离和主网文案，保留原发布保护，交一次审查。
- [x] Codex一次独立审查通过：typecheck、255项测试、主网build、diff检查通过；隔离探针确认旧Devnet回执不读取、错genesis拒绝且无回退，实际浏览器真实主网空列表成功。证据：[审查](docs/sprints/SPRINT-MAINNET/evidence/codex-review.json)、[截图](docs/sprints/SPRINT-MAINNET/evidence/preview-home.png)。
- [x] Codex部署主网版本并完成后续RPC、钱包等待、Lighthouse兼容与历史读取修复。
- [x] 用户用Phantom确认真实主网交易；RPC finalized、公共板读回、刷新页面显示“测试”均通过。

## 开源作品文档收尾（已完成）

- 范围：在用户“好下一步”后补齐中英文README的体验步骤、固定版本本地启动、六个换链模块和已验证/限制说明；保留MIT与现有产品。
- 演示材料：[真实公网首页截图](docs/sprints/SPRINT-2.2B/evidence/portfolio-home.png)，显示4条真实记录、未连接钱包；[采集记录](docs/sprints/SPRINT-2.2B/evidence/portfolio-home.json)。记录时间2026-11-01T22:55:55+08:00，线上仍7216807。
- 核对来源：本地.nvmrc/package.json/脚本、已验收交易记录、GitHub连接器确认现有仓库public；官方水龙头链接已打开核对。本轮只读网页与改文档，不改产品/依赖/视觉，不运行测试/签名/广播/部署，不创建Release或tag。
- 当前无新产品工单；后续目标由用户另定，不从backlog自动续做。

## 主网实现、部署与验收

- 网络来源：`src/network.ts`统一导出chain、RPC、genesis、board、Explorer后缀和回执key；未设置`VITE_SOLANA_NETWORK`默认Devnet，只接受`devnet`/`mainnet`，非法值在Vite构建和模块加载时失败，无运行时URL/query切网或失败回退。wallet/network/message/simulation/publisher/history/explorer/App共同使用该来源。
- 隔离：主网`solana:mainnet`、`https://rpc.solanatracker.io/public`、genesis`5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`、board`public-mainnet-v1`、回执key`said.publication-receipts.mainnet.v1`、Explorer不带cluster；Devnet保留原RPC/genesis/board/`said.publication-receipts.v1`和`?cluster=devnet`。既有Devnet记录不迁移、不混入主网查询。
- 交易保护保留：400000 CU与0 micro-lamports/CU在准备时定义，基础费由RPC估算；同消息估费/模拟/签名、逐字节一致、实际Ed25519验签、genesis/会话/高度/费用/余额复核、同步签名锁、单次广播、原签名查询与回执恢复均未放宽。
- 展示：页面顶部、余额、发布审阅、钱包指引、历史详情和Explorer按构建网络显示；主网三语言文案经SSR读取检查，无Devnet/Testnet/测试币/水龙头用语。主网公共流为空，不展示旧Devnet四条记录或示例冒充主网。
- 工作流与文档：Pages仅build命令改为`VITE_SOLANA_NETWORK=mainnet npm run build`；中英文README说明主网目标、本地Devnet默认和两种构建。未新增依赖、服务、密钥、账号或付费RPC。
- 构建证据：[mainnet-build.json](docs/sprints/SPRINT-MAINNET/evidence/mainnet-build.json)。2026-11-01T23:30:48+08:00，`VITE_SOLANA_NETWORK=mainnet npm run build`成功，73 modules，单一JS产物`index-CNefGxtp.js`399348 bytes，`index.html`引用同一产物，bundle hash`b4e4de09ba6fe60bbb101ac713f30e6df1be67e7b98bf2aeaf76a8756b1b6f16`；主网token均在产物中。`VITE_SOLANA_NETWORK=testnet`构建exit 1并报“只支持devnet或mainnet”。
- 只读RPC证据：[read-only-mainnet.json](docs/sprints/SPRINT-MAINNET/evidence/read-only-mainnet.json)。2026-11-01T23:27:21+08:00，Vite SSR以mainnet加载实际模块：chain/genesis/board/回执key/Explorer一致，PublicNode genesis匹配，Memo程序executable，marker历史0条；三语言流程文案forbiddenMatches为空。无签名、无广播。
- M01：通过。公网部署后的真实浏览器显示“Solana 主网 · 真实 SOL”“Solana 主网只读”；未连接时主网板返回真实空状态，扫描候选为0。
- M02：通过。用户使用Phantom账户`3nbt5qpNubJRPynU5vVJgZJmRkNRimVsQZjZPperNA5w`审阅并签名；准备估费5000lamports。
- M02补充：首次公网签名等待在10秒后显示“签名等待已取消或超时”，没有生成本地签名回执，也没有广播。根因是钱包人工交互错误复用了网络请求截止；修复与证据见下。
- M03：通过。[交易1BuLM…cf3Qp](https://explorer.solana.com/tx/1BuLMQJnNreHBv1JtsLeqB1SUkCTEeMHAs6BgknUG72UQLAYyNmCXf3F1BN5qax2X638RnbK5xFhNVMVHbcf3Qp)为finalized、`err=null`，余额`102099861→102094861`；部署`3630afe`后刷新公共流显示“测试”，详情显示同作者、slot`464380769`、费用`5000`lamports。
- 浏览器证据：[pages-mainnet-browser.json](docs/sprints/SPRINT-MAINNET/evidence/pages-mainnet-browser.json)；部署记录：[pages-deployment.json](docs/sprints/SPRINT-MAINNET/evidence/pages-deployment.json)。
- 未验证项：其他钱包、真机与异常矩阵。公共RPC预检、Node只读请求和注入测试不能替代已完成的M01-M03验收。

### RPC区块高度误判修复

- P1复现：用户在浏览器连接有余额账户后，页面连续显示“区块哈希已过期”。只读探针记录PublicNode返回的最新blockhash有效高度为`442173747`，同一端点却把当前`getBlockHeight`返回为`464152132`；后者实际是slot量级，交易模拟结果本身为成功。
- 修复：主网RPC切换到`https://rpc.solanatracker.io/public`。该端点对GitHub Pages来源返回CORS许可，genesis与主网一致，真实block height处于`lastValidBlockHeight`之前。
- 验证：同一账户`3nbt5qpNubJRPynU5vVJgZJmRkNRimVsQZjZPperNA5w`和新正文`test`连续3次只读准备均得到`blockhashExpired=false`、`feeLamports=5000`、`balanceLamports=102099861`、模拟成功；未请求签名、未广播。[证据](docs/sprints/SPRINT-MAINNET/evidence/rpc-height-mismatch-fix.json)。
- 公网验证：`76b2a55`部署后刷新页面并重连Phantom，再次准备同一笔`test`成功，页面进入“正在等待钱包签名”；尚未在钱包确认，未签名、未广播。
- 现有检查：typecheck退出0；9个测试文件、255项通过；mainnet构建退出0；Pages运行41324737287 build/deploy成功。

### 钱包确认窗口修复

- P1复现：用户提交`test`签名后，页面显示“签名等待已取消或超时”。准备、模拟和余额均正常；失败发生在钱包返回前，没有签名回执或广播。
- 根因：发布核心已有10秒网络请求预算，但`sign`把同一截止同时用于网络复核和人工钱包确认，导致用户在钱包内稍慢即超时。
- 修复：网络RPC仍保持10秒单次预算；新增独立的60秒`signingTimeoutMs`。签名总截止容纳签名前后两次网络复核与人工确认窗口，不把钱包返回后的过期blockhash或费用变化放行。
- 验证：新增“钱包人工确认超过网络请求预算但仍在签名窗口内时成功”回归；typecheck退出0；9个测试文件、256项通过；mainnet构建退出0。证据：[signing-window-fix.json](docs/sprints/SPRINT-MAINNET/evidence/signing-window-fix.json)。
- 待部署后在公网页面重新准备并签名；不能复用已超时的交易对象。

### Phantom Lighthouse守卫兼容

- 实际差异：准备交易与钱包返回交易使用相同blockhash；Phantom额外加入两条Lighthouse程序`L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95`指令，消息由315字节增至394字节。原有ComputeBudget×2、System零转账和Memo均保持。
- 用户确认方案：只允许该审计程序的额外守卫指令，不接受其他消息变化。
- 强制条件：blockhash、签名者角色、核心指令顺序、程序、账户地址和指令数据必须一致；不得存在地址表查询；额外静态账户只能且必须是Lighthouse程序。
- 复核调整：钱包返回后的费用复核使用实际签名消息；原blockhash有效期、余额和会话复核继续执行。
- 验证：新增“允许Phantom只新增Lighthouse守卫”和“拒绝新增非Lighthouse程序”回归；typecheck退出0；9个测试文件、258项通过；mainnet构建输出`index-CC2X8sYU.js`。[证据](docs/sprints/SPRINT-MAINNET/evidence/phantom-lighthouse-compat.json)。
- 用户随后用Phantom完成真实签名；钱包加入的Lighthouse守卫按白名单通过，页面广播并保存原签名。

### 首笔主网留言成功与读回修复

- 主网交易：[1BuLMQJnNreHBv1JtsLeqB1SUkCTEeMHAs6BgknUG72UQLAYyNmCXf3F1BN5qax2X638RnbK5xFhNVMVHbcf3Qp](https://explorer.solana.com/tx/1BuLMQJnNreHBv1JtsLeqB1SUkCTEeMHAs6BgknUG72UQLAYyNmCXf3F1BN5qax2X638RnbK5xFhNVMVHbcf3Qp)。
- 独立RPC：finalized、`err=null`、slot`464380769`、费用`5000`lamports；余额`102099861→102094861`。作者地址和公共板均只返回这一笔签名，另一笔本地`LAyj…`记录为null且未上链。
- 交易日志包含两条Lighthouse守卫、ComputeBudget、System零转账和Memo；“测试”协议JSON为`public-mainnet-v1`。
- 刷新后页面曾扫描到1条候选但不显示，确认历史解析器仍只接受原始4条指令。读取端先移除Lighthouse守卫，再对核心System/Memo、作者签名账户、协议和正文执行原严格校验。
- 验证：typecheck退出0；9个测试文件、259项通过；mainnet构建输出`index-CUXpyRtO.js`；[部署41395955859](https://github.com/LondonYu/said/actions/runs/41395955859)成功后刷新公网页面显示“测试”，详情与Explorer一致。[证据](docs/sprints/SPRINT-MAINNET/evidence/mainnet-publication-readback.json)。

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

- 线上主网版本为`3630afe`、Pages运行41395955859。若后续部署出现有证据的P0/P1，可恢复本次运行；不重写或删除任何链上记录。
- 保留当前main-only手动Pages工作流；重新运行之前成功的Pages提交可回退。
- 已验收只读v0.1回退点：`ea2f60e46d851b38806009dcee81d2c9afb3c5bb`，[运行41273238142](https://github.com/LondonYu/said/actions/runs/41273238142)。本轮未回退。
- Vite `base: './'`适配`/said/`子路径，恢复默认根路径前需重新核对资源路径。

## 本轮不建议修

- 主网动态优先费、平台代付、收费和额外转账不在本单；固定400000 CU/0 micro-lamports价格继续保留。
- PublicNode已在真实浏览器只读读取成功，但真实发布会话中其`getBlockHeight`间歇返回slot值，导致有效blockhash被误判过期；因此主网端点已切换到Solana Tracker公共RPC。该端点的浏览器CORS、区块高度、费用估算、未签名模拟、真实签名、确认和读回均已验收。
- 旧Devnet记录不迁移、不删除；主网公共流当前显示已验证的“测试”记录。
- B05/B06、B07和全钱包/异常矩阵继续后置，不以P2或未验证项阻止候选审查。
- 用户接入的规则、技能、记忆和钩子保持原样，不借本轮提交或整理。
