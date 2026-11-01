# Said STATUS

更新：2026-11-01，Asia/Shanghai。**v0.1只读演示已通过用户最终验收，SPRINT-4.0结束。** 当前工单为SPRINT-2.2B：页面接入已通过Codex初审，候选版已部署，真实Devnet签名、确认和读回仍待用户验收。已验收v0.1不重新开闸。

## 当前发布

- 正式地址：[https://londonyu.github.io/said/](https://londonyu.github.io/said/)，GitHub Pages托管，无本地服务器/隧道依赖。
- 线上候选提交：`8c594079865f1c37264ddabb399c676e1b91a222`；[部署运行41305328834](https://github.com/LondonYu/said/actions/runs/41305328834)成功，2026-11-01T20:12:34+08:00。后续仅记录证据的文档提交不重新部署。
- 已验收v0.1回退点：`ea2f60e46d851b38806009dcee81d2c9afb3c5bb`，[运行41273238142](https://github.com/LondonYu/said/actions/runs/41273238142)。
- 既有v0.1基线：252项项目测试、16项独立注入断言；v0.1验收范围未变。SPRINT-2.2B的当前检查与1项回归测试见下节。
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
- 当前工单：[SPRINT-2.2B](docs/sprints/SPRINT-2.2B.md)。页面接入已通过Codex初审；受审检查点8c59407已提交、推送并部署至现有Pages；真实交易验收仍待执行。
- [x] Cline按工单接入既有发布核心，交可复现截图与现有检查结果，停在工作区供Codex复审。
- [x] Codex初审通过，无P0/P1阻断；修复轮0/1、确认轮0/1，本次不需要补修。详见[复审记录](docs/sprints/SPRINT-2.2B/REVIEW.md)。
- [x] 保存受审检查点8c59407、推送并完成候选部署；未运行真实钱包签名或交易。
- [ ] 用户在钱包内置浏览器刷新正式URL，完成一笔Devnet签名、确认与刷新读回，逐项反馈W01-W03。
- [ ] 下一版本逐条记录真实证据及用户确认；版本名暂定v0.2，不代表已发布。

## SPRINT-2.2B 页面接入（代码初审通过，真实验收待执行）

- 范围：`src/Publication.tsx`提供准备/签名/提交/确认/读回状态机；`src/App.tsx`复用现有publisher、simulation、history与钱包会话；`src/Preview.tsx`在既有编辑审阅页展示发布面板；`src/explorer.ts`统一Devnet Explorer链接。
- 行为：准备只构造并模拟未签名交易；只有用户点击“签名并发送”才请求钱包；正文/账户变化使旧准备失效；发送结果不确定时只查询原签名，不提供重发；确认后按原签名读回并刷新公共流/作者历史，仅当正文与作者未变时清理草稿。
- 检查（2026-11-01，当前工作区）：`npm run typecheck`通过；`npm test`通过253项（既有252项基线＋1项StrictMode回归）；`npm run build`通过；`git --no-pager diff --check`无输出。
- 浏览器验证发现并修复：React StrictMode 开发态重放 effect 时，`disposedRef`在清理阶段置真后未复位，导致准备结果不渲染；现于 effect 挂载时复位，并新增`src/Publication.test.tsx`回归用例。
- 模拟截图（假钱包＋拦截RPC，未签名、未广播、未上链）：[桌面编辑审阅](docs/sprints/SPRINT-2.2B/evidence/review-desktop.png)、[桌面准备完成](docs/sprints/SPRINT-2.2B/evidence/publish-ready-desktop.png)、[390px编辑审阅](docs/sprints/SPRINT-2.2B/evidence/review-390.png)、[390px准备完成](docs/sprints/SPRINT-2.2B/evidence/publish-ready-390.png)。复现：`node docs/sprints/SPRINT-2.2B/evidence/capture.mjs`，元数据见[capture.json](docs/sprints/SPRINT-2.2B/evidence/capture.json)，采集时间2026-11-01T14:20:15+08:00。
- 未验证：真实钱包签名、真实广播、链上确认、新留言刷新读回、真实异常矩阵；W01-W03仍待用户真实验收。公网候选部署已完成，不等于写入验收通过。

- Codex独立复审（2026-11-01T15:36:30+08:00）：typecheck、9文件/253项测试、build、diff检查通过；3项临时mock探针通过并已删除，不增加永久测试要求。确认、原签名查询与拒签仅为模拟路径核验。[源文件摘要与检查记录](docs/sprints/SPRINT-2.2B/evidence/codex-review.json)；未发现阻断P0/P1，B05文案P2后置。

### 候选部署证据

- 部署运行、真实提交及步骤：[pages-run.json](docs/sprints/SPRINT-2.2B/evidence/pages-run.json)；GitHub部署7472814885的[成功状态](docs/sprints/SPRINT-2.2B/evidence/pages-deployment-status.json)。
- 公网HTTP检查：2026-11-01T20:12:53.378152+08:00，首页/JS/CSS/favicon均200，资源字节摘要与受审本地构建一致；见[pages-http.json](docs/sprints/SPRINT-2.2B/evidence/pages-http.json)。
- 公网浏览器观察记录时间：2026-11-01T20:13:50+08:00，无钱包/无注入夹具，公共流显示3条既有真实留言；发布入口显示Devnet面板，未连接时准备按钮禁用。[首页截图](docs/sprints/SPRINT-2.2B/evidence/public-home.png)、[编辑入口截图](docs/sprints/SPRINT-2.2B/evidence/public-editor.png)、[观察记录](docs/sprints/SPRINT-2.2B/evidence/pages-browser.json)。未代用户连接或签名。

### 下一版本的最小验收（全部待验证）

| ID | 可观察结果 | 证据与当前状态 |
| --- | --- | --- |
| W01 | 现有编辑入口显示Devnet、付款完整公钥、原正文和实际预估费；用户主动确认后由钱包签一笔交易 | 页面接入与模拟截图已交付；真实钱包签名由用户执行，待验证 |
| W02 | 页面显示真实确认状态、原签名及固定官方Devnet Explorer链接；未知结果明确待查，不自动重发 | 页面状态与查询路径已接入；待真实Devnet交易证据，记录URL、签名、版本和时间戳 |
| W03 | 刷新页面后通过公共流读到该签名的新留言，未连接仍可阅读；原v0.1连接/地址展示继续可用 | 已接既有读回与刷新；公网候选已部署，待用户新留言刷新实测及最终确认，RPC不可得需如实显示 |

## backlog（不阻断已验收v0.1）

当前没有已登记未解决的P0/P1；以下为后置功能或未验证项，不冒充已复现缺陷。新P2一律在本节登记，不阻断；升降级按AGENTS的证据制度执行。

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

- 无本单范围内有证据的P0/P1；B05英文网络标签属于P2，本轮不追加修复。v0.1已验收不重开；W01-W03真实写入验收仍待执行。
- 全钱包/机型矩阵、写入异常穷举、新增测试数量和旧核心重构后置；本单只接已有核心完成单条发布。
- 真实钱包签名、广播、确认、新留言刷新读回仍待用户操作；候选部署已完成，不用部署成功或模拟截图代替用户验收。
- 用户新接入的规则/技能/记忆/钩子保持原样，不借收尾整理或提交。
