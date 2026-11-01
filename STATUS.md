# Said STATUS

更新：2026-11-01，Asia/Shanghai。**v0.1和SPRINT-4.0已验收结束。** 2.2B重写后的准备契约已实施、一次确认通过并部署为7216807：签名前固定预算/优先费，严格字节一致/验签不变。用户Phantom真实重试和W01-W03仍待验；旧R1修复/确认次数保留，不宣称v0.2完成。

## 当前发布

- 正式地址：[https://londonyu.github.io/said/](https://londonyu.github.io/said/)，GitHub Pages托管，无本地服务器/隧道依赖。
- 线上候选提交：`72168077f97ed64cca0823e4284e28a3b72a1664`；[准备契约部署运行41308454557](https://github.com/LondonYu/said/actions/runs/41308454557)成功，完成时间2026-11-01T20:51:55+08:00。后续只记录证据的提交不再次部署。
- 已验收v0.1回退点：`ea2f60e46d851b38806009dcee81d2c9afb3c5bb`，[运行41273238142](https://github.com/LondonYu/said/actions/runs/41273238142)。
- 既有v0.1基线：252项项目测试、16项独立注入断言；v0.1验收范围未变。SPRINT-2.2B的当前检查与3项回归测试见下节。
- 唯一治理入口：本文件管当前状态/待办/backlog；[DECISIONS](DECISIONS.md)管决策；[docs/sprints/](docs/sprints/)管历史。

## v0.1逐条最终验收

| ID | 标准与证据 | 用户最终结果 |
| --- | --- | --- |
| V01 | URL独立于电脑/本地进程；采用用户认可的等效方法：电脑彻底断网，手机关闭Wi-Fi、使用移动数据刷新同一URL。现有[HTTP输出](docs/sprints/SPRINT-4.0/evidence/pages-http.json)、[部署状态](docs/sprints/SPRINT-4.0/evidence/pages-deployment-status.json)与[用户最终反馈](docs/sprints/SPRINT-4.0/evidence/pages-user-final-acceptance.json)共同留证；用户答“确认完成正常” | 通过，用户确认 |
| V02 | 未连接钱包读3条真实Devnet留言；2026-11-01T12:31:50.085+08:00[公网观测](docs/sprints/SPRINT-4.0/evidence/pages-browser-observation.json)、[截图](docs/sprints/SPRINT-4.0/evidence/pages-public.png)、[3条不同签名详情](docs/sprints/SPRINT-4.0/evidence/pages-details.json)留证；用户针对“页面和3条留言正常加载”答“确认完成正常” | 通过，用户确认 |
| V03 | 连接真实钱包显示自身完整地址；用户此前直接答“显示了，地址一致”，[反馈记录](docs/sprints/SPRINT-4.0/evidence/pages-wallet-user-confirmation.json)时间2026-11-01T12:36:04.375194+08:00 | 通过，用户确认 |

本次V01/V02反馈记录时间：2026-11-01T13:54:56.766708+08:00。用户操作的精确时刻/设备网络画面未提供，代理未独立观察用户手机或钱包；如实记录为用户最终确认，未以测试替代。验收范围只含三条，不含签名发送、永久可用性或全设备兼容承诺。

## 当前待办与工单

- [x] Pages公网演示和三条证据已交付，V01/V02/V03均由用户最终确认。
- [x] SPRINT-4.0结束，按约定删除过渡docs/CLINE-NEXT.md并修正活跃入口。
- [x] [完整SPRINT-4.0工单与执行记录](docs/sprints/SPRINT-4.0/SPRINT-4.0.md)归档，证据保留。
- 当前工单：[重写后的SPRINT-2.2B交易准备契约](docs/sprints/SPRINT-2.2B.md)。旧R1包装对象修复已部署；新P1为签名返回消息变化，具体钱包字节差异尚未捕获。Cline完成四指令准备契约，Codex一次确认通过，代码7216807已部署；实际签名消息差异仍待用户重试。
- [x] Cline按工单接入既有发布核心，交可复现截图与现有检查结果，停在工作区供Codex复审。
- [x] 2026-11-01：Cline按重写契约完成message四指令构造及既有断言更新；typecheck、255项测试、build、diff检查通过；四指令模拟证据见下节，Codex一次确认已通过。
- [x] Codex页面初审曾通过；随后用户真实截图触发P1/R1；修复轮1/1、确认轮1/1完成，代码修复通过；Phantom真实重试待用户。详见[复审记录](docs/sprints/SPRINT-2.2B/REVIEW.md)。
- [x] 保存受审检查点8c59407、推送并完成候选部署；未运行真实钱包签名或交易。
- [ ] 用户在Chrome Phantom刷新正式URL并重新准备一笔Devnet留言，完成签名、确认与刷新读回，逐项反馈W01-W03。
- [ ] 下一版本逐条记录真实证据及用户确认；版本名暂定v0.2，不代表已发布。

## 当前P1：Phantom返回消息变化

- [用户截图与事实边界](docs/sprints/SPRINT-2.2B/evidence/phantom-message-change.json)：实际进入签名校验，错误“签名交易消息与准备快照不一致”，本次应用提交未执行。不能凭截图断言具体新增指令；自动优先费为官方行为支持的假设。
- 按复审上限重写交易准备契约，实质变化为模拟前显式设置400000 CU与0微lamports/CU，再保持同一消息字节签名；不是删除返回校验或只改工单编号。旧R1不清零，不追加第三轮补丁。
- Cline仅调整message构造及直接相关既有断言，Codex一次确认；真正Phantom兼容仍待用户实测。当前四指令候选7216807已上线，不宣称Phantom真实发布或v0.2完成。

### 四指令准备契约实现（已部署，真实钱包待验）

- 改动：`src/message.ts`在v0消息中固定四条指令，顺序为SetComputeUnitLimit(400000)、SetComputeUnitPrice(0 micro-lamports/CU)、原System零转账、原Memo；使用Kit现有`setTransactionMessageComputeUnitLimit`与`setTransactionMessageComputeUnitPrice`生成原生ComputeBudget无账户指令，预算/价格具名常量。`src/message.test.ts`仅把既有两指令断言改为四条并解码预算与价格；`capture.mjs`从实际`getFeeForMessage`/`simulateTransaction`请求解码，校验失败即中止出证。
- 检查（2026-11-01，当前工作区）：`npm run typecheck`通过；`npm test`通过255项、9个测试文件；`npm run build`通过；`git --no-pager diff --check`无输出。
- 四指令模拟证据：[capture.json](docs/sprints/SPRINT-2.2B/evidence/capture.json)记录`instructionCount: 4`、`programOrder`为两条ComputeBudget+System+Memo、`computeUnitLimit: 400000`、`computeUnitPriceMicroLamports: "0"`、`computeBudgetAccountsEmpty: true`、`transferLamports: "0"`、单签名槽占位、`feeMessageMatchesPreparedTransaction: true`、`simulationInputMatchesPreparedTransaction: true`，完整交易432字节；采集时间2026-11-01T20:48:15+08:00。截图：[桌面准备完成](docs/sprints/SPRINT-2.2B/evidence/publish-ready-desktop.png)、[390px准备完成](docs/sprints/SPRINT-2.2B/evidence/publish-ready-390.png)，均为假钱包+拦截RPC模拟，未签名、未广播、未上链。
- 未改并保留：`publisher.ts`的逐字节一致性、实际Ed25519验签、会话/费用/余额/高度复核、单次广播与回执；`src/history.ts`读取器与历史协议；UI、依赖和钱包能力R1。
- 未验证：真实Phantom签名是否接受该四指令消息、真实广播/链上确认/刷新读回；W01-W03仍待用户实测。模拟截图和当前旧候选841a419不等于v0.2发布完成。

- Codex独立确认：typecheck、255项既有测试、build、diff均通过；[确认摘要](docs/sprints/SPRINT-2.2B/evidence/budget-contract-confirmation.json)。[真实Devnet只读模拟](docs/sprints/SPRINT-2.2B/evidence/budget-real-simulation.json)中短正文与560 UTF-8字节边界均成功，费用5000 lamports、完整大小403/934字节、原消息字节一致、未过期。未签名或广播，不等于Phantom真实验收。

## R1代码修复及真实钱包重试

- R1：用户真实截图显示Devnet模拟通过、余额0.00609测试SOL，但“签名能力事件与钱包实时状态不一致”导致发布禁用。记录：[真实截图观察与隔离探针](docs/sprints/SPRINT-2.2B/evidence/wallet-capability-blocker.json)。这不是已登记P2升级，是新发生的真实主路径P1；v0.1验收不重开。
- 当前执行：[R1-wallet-capability](docs/sprints/SPRINT-2.2B/R1-wallet-capability.md)。仅修钱包能力getter的包装对象引用误判，保留真实能力撤销和方法变化的失效校验。用户确认钱包为电脑Chrome Phantom，扩展版本仍待补，不冒充已定位其具体实现。
- 修复1/1、确认1/1完成，修复候选841a419已部署。真实Phantom准备/签名仍待用户重试，不继续追加其他边界修复。

### R1修复记录（代码确认通过，真实Phantom待重试）

- 根因：`isSessionStillCurrent`把每次getter新建的feature包装对象与事件快照、会话旧对象按引用比较；签名方法、版本、v0与Devnet实际未变也判为不一致。
- 改动：产品源码仅`src/wallet.ts`。实时getter与事件期望改为比较签名方法引用、版本、`supportedTransactionVersions`；会话保存创建时的方法引用快照；Devnet、账户地址/公钥、账户签名能力、断开与revision保护未改。`publisher.ts`未改，签名调用仍走`session.feature.signTransaction(...)`，保留原`this`上下文。另在`src/wallet.test.ts`新增2项回归，并让`capture.mjs`假钱包使用新包装getter。
- 检查（2026-11-01，当前工作区）：`npm run typecheck`通过；`npm test`通过255项、9个测试文件（既有252项基线＋1项StrictMode回归＋2项R1钱包能力回归）；`npm run build`通过；`git --no-pager diff --check`无输出。真实撤销、方法替换、版本/v0/Devnet变化、账户能力变化的既有负向用例全部通过。
- 模拟复现：`capture.mjs`假钱包改为每次读取返回新的签名feature包装对象、方法引用不变；[capture.json](docs/sprints/SPRINT-2.2B/evidence/capture.json)记录`review.prepareEnabled: true`、`prepared.signButtonEnabled: true`，R1原始采集时间2026-11-01T20:27:01+08:00；本次四指令契约重采为20:48:15+08:00，见上节。[准备完成截图](docs/sprints/SPRINT-2.2B/evidence/publish-ready-desktop.png)、[390px截图](docs/sprints/SPRINT-2.2B/evidence/publish-ready-390.png)均标注模拟状态；未签名、未广播、未上链。[修复检查摘要](docs/sprints/SPRINT-2.2B/evidence/r1-wallet-capability-fix.json)。
- 未验证：真实Phantom重连与准备按钮、真实签名、广播、确认、刷新读回、公网候选更新；均待Codex确认后由用户操作。本轮未提交、未推送、未部署，未连接真实钱包签名或广播。

- Codex唯一确认（2026-11-01T20:30:30+08:00）：独立运行typecheck、255项现有测试、build、diff检查全部退出0；[隔离探针](docs/sprints/SPRINT-2.2B/evidence/r1-codex-confirmation.json)证明同方法新包装会话可用、重复读取不失效、真实方法替换仍失效。未访问真实钱包或广播。

## SPRINT-2.2B 页面接入（代码初审通过，真实验收待执行）

- 范围：`src/Publication.tsx`提供准备/签名/提交/确认/读回状态机；`src/App.tsx`复用现有publisher、simulation、history与钱包会话；`src/Preview.tsx`在既有编辑审阅页展示发布面板；`src/explorer.ts`统一Devnet Explorer链接。
- 行为：准备只构造并模拟未签名交易；只有用户点击“签名并发送”才请求钱包；正文/账户变化使旧准备失效；发送结果不确定时只查询原签名，不提供重发；确认后按原签名读回并刷新公共流/作者历史，仅当正文与作者未变时清理草稿。
- 检查（2026-11-01，R1修复后当前工作区）：`npm run typecheck`通过；`npm test`通过255项（既有252项基线＋1项StrictMode回归＋2项R1钱包能力回归）；`npm run build`通过；`git --no-pager diff --check`无输出。
- 浏览器验证发现并修复：React StrictMode 开发态重放 effect 时，`disposedRef`在清理阶段置真后未复位，导致准备结果不渲染；现于 effect 挂载时复位，并新增`src/Publication.test.tsx`回归用例。
- 模拟截图（假钱包＋拦截RPC，未签名、未广播、未上链）：[桌面编辑审阅](docs/sprints/SPRINT-2.2B/evidence/review-desktop.png)、[桌面准备完成](docs/sprints/SPRINT-2.2B/evidence/publish-ready-desktop.png)、[390px编辑审阅](docs/sprints/SPRINT-2.2B/evidence/review-390.png)、[390px准备完成](docs/sprints/SPRINT-2.2B/evidence/publish-ready-390.png)。复现：`node docs/sprints/SPRINT-2.2B/evidence/capture.mjs`，元数据见[capture.json](docs/sprints/SPRINT-2.2B/evidence/capture.json)，采集时间2026-11-01T20:48:15+08:00。
- 未验证：真实钱包签名、真实广播、链上确认、新留言刷新读回、真实异常矩阵；W01-W03仍待用户真实验收。公网候选部署已完成，不等于写入验收通过。

- Codex独立复审（2026-11-01T15:36:30+08:00，R1前）：typecheck、9文件/253项测试、build、diff检查通过；3项临时mock探针通过并已删除，不增加永久测试要求。确认、原签名查询与拒签仅为模拟路径核验。[源文件摘要与检查记录](docs/sprints/SPRINT-2.2B/evidence/codex-review.json)；未发现阻断P0/P1，B05文案P2后置。

### 候选部署证据

- 部署运行、真实提交及步骤：[pages-run.json](docs/sprints/SPRINT-2.2B/evidence/pages-run.json)；GitHub部署7472814885的[成功状态](docs/sprints/SPRINT-2.2B/evidence/pages-deployment-status.json)。
- 公网HTTP检查：2026-11-01T20:12:53.378152+08:00，首页/JS/CSS/favicon均200，资源字节摘要与受审本地构建一致；见[pages-http.json](docs/sprints/SPRINT-2.2B/evidence/pages-http.json)。
- 公网浏览器观察记录时间：2026-11-01T20:13:50+08:00，无钱包/无注入夹具，公共流显示3条既有真实留言；发布入口显示Devnet面板，未连接时准备按钮禁用。[首页截图](docs/sprints/SPRINT-2.2B/evidence/public-home.png)、[编辑入口截图](docs/sprints/SPRINT-2.2B/evidence/public-editor.png)、[观察记录](docs/sprints/SPRINT-2.2B/evidence/pages-browser.json)。未代用户连接或签名。

### R1修复候选部署

- 代码提交`841a419f8e7d33a272cd3b92124f99f0f20ee50e`已推送并通过手动Pages运行41306880398。[运行证据](docs/sprints/SPRINT-2.2B/evidence/r1-pages-run.json)。
- 2026-11-01T12:32:12.011729+00:00（UTC）核验首页、JS/CSS/favicon均200，资源摘要与修复构建一致；[HTTP证据](docs/sprints/SPRINT-2.2B/evidence/r1-pages-http.json)。部署与HTTP不代替真实Phantom验收。
- 下一步用户刷新正式URL并重新连接Phantom，再准备并主动签名一条Devnet留言。若仍受阻，保留同一R1证据并重写不清契约，不追加第三轮补丁；若出现不同问题，先留实际证据并分级，不凭推测扩展修复。

### 四指令准备契约候选部署

- 提交`72168077f97ed64cca0823e4284e28a3b72a1664`已推送；手动Pages运行41308454557于2026-11-01T20:51:55+08:00成功。[运行记录](docs/sprints/SPRINT-2.2B/evidence/budget-pages-run.json)。
- 2026-11-01T12:52:58.107294+00:00（UTC）首页/JS/CSS/favicon均200，新JS为index-B7smwdlr.js，资源字节摘要与已确认构建一致。[公网资源证据](docs/sprints/SPRINT-2.2B/evidence/budget-pages-http.json)。
- 用户下一步：保存当前草稿，刷新正式URL并重连Phantom，重新准备（避免复用旧两指令快照），核对Devnet后由用户签名。若再次消息不一致，需记录实际差异并重新界定兼容策略，不自动接受改写或继续追加补丁。

### 下一版本的最小验收（全部待验证）

| ID | 可观察结果 | 证据与当前状态 |
| --- | --- | --- |
| W01 | 现有编辑入口显示Devnet、付款完整公钥、原正文和实际预估费；用户主动确认后由钱包签一笔交易 | 页面接入与模拟截图已交付；真实钱包签名由用户执行，待验证 |
| W02 | 页面显示真实确认状态、原签名及固定官方Devnet Explorer链接；未知结果明确待查，不自动重发 | 页面状态与查询路径已接入；待真实Devnet交易证据，记录URL、签名、版本和时间戳 |
| W03 | 刷新页面后通过公共流读到该签名的新留言，未连接仍可阅读；原v0.1连接/地址展示继续可用 | 已接既有读回与刷新；公网候选已部署，待用户新留言刷新实测及最终确认，RPC不可得需如实显示 |

## backlog（不阻断已验收v0.1）

R1代码修复已部署；当前有返回消息变化P1，见上方重写工单；以下为后置功能或未验证项，不冒充已复现缺陷。新P2一律在本节登记，不阻断；升降级按AGENTS的证据制度执行。

| ID | 类型 | 后置内容与理由 |
| --- | --- | --- |
| B01 | 已纳入当前工单 | 单条发布/最小回执页面进入2.2B；多笔管理、批量恢复与新增交易能力继续后置 |
| B02 | 未验证项 | 个人历史、切账户/拒绝/取消、多钱包和全机型矩阵；不自动扩大本次三条标准 |
| B03 | 未验证项 | 目标钱包/浏览器Ed25519和单笔广播确认在2.2B真实验收时记录；真实响应丢失等异常矩阵后置，未证明缺陷不预先阻断 |
| B04 | 后续体验 | 横屏/200%缩放/全语言完整矩阵；未作为v0.1闸门 |
| B06 | P2 格式 | 暂存新文件后发现Publication.tsx、capture.mjs各多一个EOF空行；普通工作区diff检查未覆盖当时未跟踪文件，无运行影响，本轮不修 |
| B05 | P2 文案 | 英文页头将Devnet标为“Devnet · Testnet”；src/i18n.ts静态复核可见，RPC仍固定Devnet，不影响单条发布主路径，后续修正 |

## 构建与部署回滚

- 构建配置仅vite.config.ts中的`base: './'`，使资源适配Pages `/said/`路径；业务源码/依赖/视觉不因此改变。
- 恢复配置前状态可撤销该配置并重建，但默认`base='/'`不能直接覆盖项目子路径站点，以免资源404。
- 已发布版本回滚：在Actions重新执行上一个成功的Pages运行，恢复其提交/构建；手动main-only和github-pages环境约束保留。本次未执行回滚。

## 本轮不建议修

- 本轮只按重写契约改变签名前预算构造；不扩展UI、依赖、钱包、历史协议、P2或测试数量，不向旧R1追加第三轮修复。
- 当前只修截图触发的P1/R1，修复轮已结束；真实撤销、方法替换、版本/v0/Devnet和账户校验保持不变。B05英文网络标签及B06 EOF空行属于P2，本轮不追加修复。v0.1已验收不重开；W01-W03真实写入验收仍待执行。
- 全钱包/机型矩阵、写入异常穷举、新增测试数量和旧核心重构后置；本单只接已有核心完成单条发布。
- 真实钱包签名、广播、确认、新留言刷新读回仍待用户操作；候选部署已完成，不用部署成功或模拟截图代替用户验收。
- 用户新接入的规则/技能/记忆/钩子保持原样，不借收尾整理或提交。
