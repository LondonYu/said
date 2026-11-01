# Said STATUS

更新：2026-11-01T22:44:04+08:00。**v0.2 Devnet单条发布演示已完成最小验收，SPRINT-2.2B结束。** 用户Chrome Phantom完成签名发布“测试”，并确认刷新后仍可读；独立链上核验为finalized且无错误。当前没有新的执行工单，不自动追加功能或修复。

## 当前发布

- 正式地址：[Said](https://londonyu.github.io/said/)，GitHub Pages托管，独立于用户电脑和本地进程。
- 线上代码：`72168077f97ed64cca0823e4284e28a3b72a1664`；[部署运行41308454557](https://github.com/LondonYu/said/actions/runs/41308454557)成功，2026-11-01T20:51:55+08:00。后续证据文档提交不再次部署。
- 当前能力：连接钱包、读取公共/作者历史、显式准备/签名/提交、原签名确认与读回；仅Solana Devnet。真实写入验证覆盖本次电脑Chrome Phantom路径，版本未提供，不承诺全钱包兼容或永久存储。
- 既有检查：255项项目测试、typecheck/build已在代码确认时通过；本轮仅用户验收及只读链上核验，不新增/重跑测试、不改产品或再次部署。
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
- 当前无新执行工单。后续目标由用户选择；不因首次超时或P2反馈继续增加测试和功能。

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

- 保留当前main-only手动Pages工作流；重新运行之前成功的Pages提交可回退。
- 已验收只读v0.1回退点：`ea2f60e46d851b38806009dcee81d2c9afb3c5bb`，[运行41273238142](https://github.com/LondonYu/said/actions/runs/41273238142)。本轮未回退。
- Vite `base: './'`适配`/said/`子路径，恢复默认根路径前需重新核对资源路径。

## 本轮不建议修

- 首次超时的根因暂不扩展排查：缺少阶段/错误/回执证据，第二次发布及刷新已成功，记B07并后置。
- B05/B06和全钱包/异常矩阵继续后置，不以P2推迟已验收的最小演示。
- 用户接入的规则、技能、记忆和钩子保持原样，不借收尾整理或提交。
