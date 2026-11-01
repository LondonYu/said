# SPRINT-4.0：v0.1只读公网演示归档

最终结果：2026-11-01用户确认V01/V02正常，V03此前已确认；v0.1验收通过，SPRINT-4.0结束。记录时间：2026-11-01T13:54:56.766708+08:00。

[最终确认](evidence/pages-user-final-acceptance.json) · [当前STATUS](../../../STATUS.md)

以下保留阶段执行原文，包含当时的待验收状态；其历史状态不覆盖上述最终确认。过渡CLINE-NEXT已按约定删除，历史链接改为当前STATUS。

# Said STATUS

更新：2026-11-01，Asia/Shanghai。当前唯一目标：**v0.1只读演示**。GitHub Pages已部署；公网未连接钱包读到3条真实留言。V03真实钱包地址已由用户确认；V01独立联网复验和V02用户最终确认待完成，不宣称v0.1验收通过。

## 当前状态

- 产品源码检查点：[f9add95](https://github.com/LondonYu/said/commit/f9add95e75c63cad0b49aa664684bb71d368a74e)。钱包连接、Devnet历史流、地址显示已实现；2.2A发布核心通过旧阶段复审，页面未接签名/发送。
- 既有验证基线：252项项目测试、16项独立注入断言；原背景239项是较早记录。本轮没有重跑或增加测试，计数不构成发布验收。
- 当前公网URL：**[https://londonyu.github.io/said/](https://londonyu.github.io/said/)**，GitHub Pages / Actions托管，无本地服务器或隧道依赖。已部署提交`ea2f60e46d851b38806009dcee81d2c9afb3c5bb`；[部署运行](https://github.com/LondonYu/said/actions/runs/41273238142)成功。电脑断网＋手机移动数据的等效实测仍待用户留证。
- 下一步：完成SPRINT-4.0剩余用户验收：电脑彻底断网，手机关闭Wi-Fi并使用移动数据刷新同一URL；确认首页3条留言，V03已确认不重复要求。**2.2B后置，不是v0.1前置条件**。
- 唯一治理入口：本文件管状态、证据、待办/backlog和当前工单；[DECISIONS](../../../DECISIONS.md)管决策/被否方案；[docs/sprints/](..)保留历史。[CLINE-NEXT](../../CLINE-NEXT.md)仅过渡传话，SPRINT-4.0结束后删除。

## v0.1验收与证据

仅以下三条。三条都记录证据后提交用户逐条确认；代理不得把“已观察”自动改为“用户通过”。没有证据不等于发现P0/P1，但不能声称目标已达成。缺少三条中的任一项就保持“待验收”，不追加其他标准。

| ID | 唯一通过标准 | 当前证据与时间 | 当前判定 | 用户最终确认 |
| --- | --- | --- | --- | --- |
| V01 | 公网URL在用户电脑关机、本地进程结束后仍可访问；仅以GitHub Pages托管验收，临时隧道不算证据 | [实际URL](https://londonyu.github.io/said/)，[部署成功](https://github.com/LondonYu/said/actions/runs/41273238142)；2026-11-01T12:30:36.269415+08:00直接HTTPS首页/JS/CSS/favicon均200，[输出](evidence/pages-http.json)。代理未启动本地预览/隧道；用户电脑断网、手机移动数据刷新同一URL的等效实测待补 | 公网已观察；独立联网复验待用户 | 待确认 |
| V02 | 未连接钱包可读取3条真实链上留言 | 2026-11-01T12:31:50.085+08:00，同一Pages提交新会话未连接钱包，正常RPC读到3条/2作者，逐条核对不同交易签名及Devnet详情；[观测JSON](evidence/pages-browser-observation.json)、[截图](evidence/pages-public.png)、[三条详情](evidence/pages-details.json) | 代理已观察，用户待验收 | 待确认 |
| V03 | 连接钱包后显示自身地址，不含签名发送 | 用户对正式URL的手机钱包连接问题直接回复“显示了，地址一致”；[反馈证据](evidence/pages-wallet-user-confirmation.json)，记录时间2026-11-01T12:36:04.375194+08:00。这是用户实测反馈，代理未代点钱包；操作精确时间/钱包版本未提供，不冒充代理独立观测 | 用户实测确认 | 用户已确认 |

每项执行后在此表更新并附实际记录（不是新验收条件）：

- GitHub Pages实际URL、部署运行链接、对应提交/构建标识；临时隧道不算V01证据。按用户确认的等效方法：电脑断开所有联网方式，手机关闭Wi-Fi、使用移动数据刷新同一URL，记录实际结果及时间戳即可；无需实际关机。这里只更新验证方法，用户尚未报告实测通过。
- 实际步骤与结果；提供URL、命令实际输出或截图，附ISO 8601时间戳和时区。不要用命令文本或“应该成功”代替输出。
- V02保留同一公网版本未连接状态的3条记录及交易签名/Devnet详情证据，允许同文不同签名；不拿本地缓存、示例或注入数据凑数。
- V03保留页面地址与用户钱包同一Solana公钥的核对证据；由用户授权，截图不得包含秘密。记录所用设备/钱包版本即可，不要求补齐所有组合。
- 每项分别写“代理已观察／失败／未验证”和“用户确认结果＋时间”。最终确认人：用户；当前三项均未获得本次最终确认。

## 待办

- [x] 写入P0/P1/P2、证据升降级、复审上限、审查不修清单及演示产物制度。
- [x] 合并治理入口，保留历史证据，记录于DECISIONS。
- [x] SPRINT-4.0 Pages部署成功，首页及静态资源200，未连接钱包的3条真实留言已留证。
- [x] 用户在正式URL用真实手机钱包连接，确认完整地址一致（V03）。
- [ ] 补V01电脑断网＋手机移动数据访问及V02首页3条的用户最终确认；V03已确认，不再重复要求。
- [ ] 用户逐条确认v0.1；未确认前不宣布发布验收达成。
- [ ] SPRINT-4.0结束后删除docs/CLINE-NEXT.md，并修正指向它的当前入口；历史引用不当作执行指令。

## 缺陷与backlog

本轮公网观测未发现未解决的P0/P1；V01独立联网复验尚未反馈结果，V03用户已确认，不能据此宣称全部路径无缺陷。P2和未验证项按下表后置，旧阶段已修复缺陷不重复打开。

P2发现后**一律在本节登记，不阻断、不追加到本轮修复**。登记格式：ID、P级、影响路径、复现证据/时间、暂不修理由；升级另列原级别→新级别、真机/真实钱包触发证据、步骤、实际影响及时间。P0/P1降级须附不可达路径复现证据；不确定就标不确定。

| ID | 类型 | 后置项及理由 |
| --- | --- | --- |
| B01 | 范围外功能，非缺陷 | 2.2B签名发送/回执页面：v0.1明确不含写入，后续另定目标 |
| B02 | 未验证项，非已证实缺陷 | 真实钱包个人历史、切账户/拒绝/取消及多钱包组合：不要求为v0.1补齐；若实机证据表明影响三条主路径，再按制度定级 |
| B03 | 未验证项，非已证实缺陷 | 浏览器Ed25519、真实广播/确认、发送响应丢失：属于后置写入路径，不为只读演示新增验证 |
| B04 | 后续体验，非已证实缺陷 | 全机型/横屏/200%缩放与全语言矩阵：不是v0.1闸门；已确认设计保留，实际主路径故障须有证据定级 |

## 当前工单：SPRINT-4.0 — v0.1只读公网演示

状态：**Pages部署完成，待用户验收**。工作流提交`ea2f60e`已推送，Pages已启用并手动部署成功；V03用户已确认；V01独立联网实测与V02用户最终确认待补。执行者VS Code/Cline，Codex审查，用户验收。工单/修复轮次从此单重新记录：修复0/1、确认0/1；不沿用旧2.2A的无限修复方式。

### 目标与操作

1. 读取STATUS、DECISIONS、AGENTS/.clinerules并检查工作区。使用本轮vite.config.ts（base='./'），用现有npm run build重新生成dist；**不得复用本次配置前的旧dist**。不新增测试或提高测试数，不把构建或测试当V01–V03证据。
2. 仅使用现有LondonYu/said仓库与账号的GitHub Pages；最小工作流已准备为`.github/workflows/pages.yml`：只允许`workflow_dispatch`手动触发，仅当`github.ref == 'refs/heads/main'`时构建和部署；Node版本读取`.nvmrc`，执行`npm ci`和`npm run build`，仅上传`./dist`；使用官方`actions/checkout@v7`、`actions/setup-node@v7`、`actions/configure-pages@v6`、`actions/upload-pages-artifact@v5`、`actions/deploy-pages@v5`，权限为`contents: read`、`pages: write`、`id-token: write`，并发组`pages`，部署环境`github-pages`。Codex审查后由Codex启用Pages（发布源选GitHub Actions）并手动运行；Cline不触发。无需新账号、付费服务、自定义域名或DNS修改。
3. 记录Actions部署运行、实际输出page_url和对应提交；从该URL检查首页与JS/CSS/favicon资源。可用用户认可的等效验证：电脑彻底断网，手机关闭Wi-Fi、使用移动数据刷新同一URL并留证；无需实际关机，不把已有页面未刷新的缓存显示当成重新访问成功。临时Quick Tunnel只可调试，不得回退成V01产物。
4. 在同一Pages版本的新会话、不连接钱包，记录3条真实Devnet留言的V02证据。不得写交易、播种新留言或注入假数据补数；若不足3条/RPC不可用，如实记录缺口与证据，交用户决定，不悄悄放宽标准。
5. 用户在一个实际可用的浏览器＋钱包组合中主动连接，核对页面完整地址与钱包公钥，保存V03证据；只连接，不请求signMessage/signTransaction/sendTransaction。是否弹窗取决于既有授权状态，不能把自动复连冒充新弹框。
6. 将三条证据、时间戳、版本、部署运行和实际Pages URL写回STATUS，逐条提交用户最终确认。演示截图/命令输出可存docs/sprints/SPRINT-4.0/evidence/；不新增平行状态/验收文档。

### 范围与审查边界

- 只服务V01–V03。默认不改产品源码、依赖、视觉/协议，不接2.2B，不做主网/真实资金、后台/数据库或交易。
- 若出现有证据的P0/P1，只提出与三条直接相关的最小修复；本工单不授予预防性重构。P2进本文件backlog；不凭“可能有风险”提级。
- 最多一轮修复＋一轮确认；第三轮仍未通过则按制度重写工单描述/复现和预期，不追加修复，也不靠重编号绕过。
- 每轮审查结果就地追加本文件，结尾必须有「本轮不建议修」及理由，无则写无。
- 演示产物为公网URL（附实际观测记录，可辅截图）；文档、构建成功或测试数不算产物。v0.1必须三条齐证且用户最终确认，不能用可复现截图替代本版本明确要求的公网URL。
- Pages站点必须独立于用户电脑及本地进程。后续执行遇到权限/Actions/Pages策略阻塞时记录具体API错误或运行日志并提出约束内替代；不得自动回退临时隧道，也不把尚未核验的预计URL当上线证据。

### 当前Pages部署

- 地址：[https://londonyu.github.io/said/](https://londonyu.github.io/said/)，HTTPS启用，无自定义域名或DNS修改。
- 发布提交：`ea2f60e46d851b38806009dcee81d2c9afb3c5bb`，与分支后续文档提交分开记录，不把HEAD自动当线上版本。
- Actions运行：[41273238142](https://github.com/LondonYu/said/actions/runs/41273238142)，build/deploy均success；部署成功时间2026-11-01T12:29:12+08:00。
- [运行证据](evidence/pages-deployment.json)、[部署状态](evidence/pages-deployment-status.json)、[HTTP证据](evidence/pages-http.json)。只部署dist，不依赖电脑进程。用户电脑断网＋手机移动数据刷新的实际结果仍待反馈，不自动确认V01。
- V02当前公网版本已观察3条/2作者，待用户最终确认；V03实际钱包地址一致已由用户确认。252项既有测试本轮未重跑，无交易、无新增测试要求。

### 本轮构建配置变更与回滚

- 改了什么：新增根目录vite.config.ts，仅`defineConfig({ base: './' })`，未改src、index.html、依赖/锁文件或视觉。
- 为什么：原默认base='/'会让项目Pages下的资源指向域名根`/assets/...`；相对base使构建首页使用`./assets/...`及`./said-favicon.svg`，在`/said/`解析，无须把仓库名硬编码进配置。当前页面是状态切换，没有新增历史路由或深层路径需求。
- 如何回滚：本轮新增前无该文件，删除vite.config.ts并重新构建即可恢复默认base='/'；若已提交，撤销该配置变更或恢复改动前版本后重建。该默认构建不能直接覆盖已发布的/said/站点；已部署场景应恢复上一个已验证的Pages版本，避免重新引入资源404。现已部署，尚未执行回滚。
- 实际核验：`npm run build -- --outDir /tmp/said-pages-base-check/said`退出0，70 modules；JS346.16 kB/gzip108.13，CSS15.68 kB/gzip4.04。在仅本机127.0.0.1短时静态挂载/said/后，首页、`./said-favicon.svg`、`./assets/index-Byps-RCq.js`、`./assets/index-DEn8a_P7.css`均HTTP 200，均解析到/said/内；服务已停止。这只是构建路径核验，**不是Pages或V01验收**，没有新增测试用例或重跑既有测试。
- 2026-11-01T11:35+08:00复验（Cline，HEAD `63d9d75`）：`npm run build`退出0（70 modules；JS `index-Byps-RCq.js` 346.16 kB/gzip108.13，CSS `index-DEn8a_P7.css` 15.68 kB/gzip4.04）；`npm run typecheck`退出0。`dist/index.html`实际含`src="./assets/index-Byps-RCq.js"`、`href="./assets/index-DEn8a_P7.css"`、`href="./said-favicon.svg"`；仅本机`127.0.0.1:5189`将`dist`挂载为`/said/`后，`/said/`、JS、CSS、favicon四个URL均HTTP 200，随后服务已停止。该复验只证明构建路径，**不是Pages或V01证据**；未改源码/依赖，未新增测试，未部署或提交。

### Pages工作流与回滚

- 工作流：`.github/workflows/pages.yml`，仅`workflow_dispatch`；`build`和`deploy`均以`github.ref == 'refs/heads/main'`为条件，非main分支只跳过、不部署。`actions/setup-node@v7`读取`.nvmrc`，执行`npm ci`与`npm run build`；`actions/configure-pages@v6`配置Pages，`actions/upload-pages-artifact@v5`仅上传`./dist`，`actions/deploy-pages@v5`部署到`github-pages`环境。权限与并发按官方接口设置。无测试步骤、第三方action或依赖变更。
- 状态：工作流经Codex核对官方接口后提交推送，Pages已启用，手动部署运行成功；当前URL/提交/证据见上节。Cline只准备工作流，Codex完成部署，用户最终验收待完成。
- 回滚：后续新版本部署失败或不可用时，在Actions中重新运行上一个成功的Pages工作流，重新部署其对应提交/构建；该入口仍受main限制和`github-pages`环境保护。若工作流配置本身需要撤回，移除或还原`.github/workflows/pages.yml`并停用站点；已发布历史保留，不删除失败运行或证据。现已部署，尚未执行回滚。

## 不建议修记录（2026-11-01 Pages修订）

- 无新增已复现且未修的P0/P1：本轮只处理用户指定的构建路径前提，未做真实钱包或链上运行验收，不能据此宣布产品无缺陷。
- 不继续2.2B及写入异常测试：不属于v0.1三条，后置。
- 不补齐所有钱包/手机/异常路径：目前是未验证项，没有影响本次三条的实证；有证据时按分级制度处理。
- 不追求测试数增长：既有252项仅为基线，发布由三条证据和用户确认决定。

## 本轮执行记录

2026-11-01：仅规则、治理合并、历史迁移及下一步工单；未改源码/依赖/视觉，未运行产品测试、构建、交易、浏览器验收或部署。治理整理不作为Sprint演示产物。具体合并决策及迁移清单见DECISIONS。 文档核对：137个本地链接均有效、两个规则块一致；26个源码文件哈希未变，8个历史证据文件字节未变，git diff --check通过。这些是文档完整性检查，不是产品验收或新增测试要求。

2026-11-01补充：用户修正V01独立托管下限并指定GitHub Pages。本轮同步两份规则、工单和本节回滚记录，新增唯一构建配置base='./'，完成上述本地核验；未部署Pages、未开公网、未运行产品测试/交易。上方“仅治理整理”是前一轮历史记录，不代表本轮没有构建配置改动。

2026-11-01 Pages工作流准备：仅新增`.github/workflows/pages.yml`并更新本文件；工作流只允许`workflow_dispatch`，`github.ref == 'refs/heads/main'`才构建和部署，Node读取`.nvmrc`，执行`npm ci`、`npm run build`，仅上传`./dist`，使用GitHub官方Pages actions、最小权限、`github-pages`环境与`pages`并发组。构建退出0（70 modules；JS 346.16 kB/gzip108.13，CSS 15.68 kB/gzip4.04），YAML解析通过，`git diff --check`通过。未重复产品测试，未提交、推送、启用Pages或触发Actions；V01/V02/V03仍未确认。

## 本轮不建议修（2026-11-01 Pages工作流准备）

- 不新增测试步骤或重复产品测试：本轮只准备部署链路；工作流仅执行安装和构建，构建成功不是V01–V03证据。
- 不把工作流准备或本地构建当作V01/V02/V03通过：三条仍需实际Pages URL、真实链上读取和钱包连接证据，并由用户最终确认。
- 不添加push/PR触发、非main分支部署、预览环境或第三方action：严格保留手动触发、main-only和官方最小链路。
- 不提前处理尚未实际运行的Pages权限、环境审批、runner或部署后RPC问题：等Codex实际启用和运行时取得错误信息，再按P0/P1/P2分级处理，不新增预防性配置。
- 不修改AGENTS/.clinerules/.memory/.agents/.githooks/.workflow.lock、业务源码、依赖或视觉：这些文件保持现状，本轮范围仅为工作流与STATUS。

## 首轮部署观测（2026-11-01）

Pages工作流使用官方Actions现有版本，Node按.nvmrc、锁文件安装并构建，只发布dist；构建及部署均成功。公网资源4项200，未连接钱包正常读取3条真实留言，三条签名不同，详情均指向Devnet。无源码修复，修复0/1；本轮为首次观测，不把未完成用户验收写成通过。证据已存上表链接，无本地服务或隧道启动，未操作真实钱包签名/发送。

## 本轮不建议修（Pages部署与首轮观测）

- 不接2.2B、写入或验签功能：v0.1仅只读与连接地址。
- 不增加测试数、完整机型/钱包矩阵：三条的实际证据和用户确认优先，未验证项如实保留。
- 不整理或提交用户新接入的AGENTS/.clinerules/.agents/.githooks/.memory/.workflow.lock：与当前部署无关，保持原有工作区改动。
- 无本轮新发现的未解决P0/P1；不凭未测试的边界追加修复。

用户反馈记录（2026-11-01T12:36:04.375194+08:00）：针对当前Pages URL的真实钱包连接检查，用户答“显示了，地址一致”，V03记为用户确认；无用户钱包截图或版本信息，不冒称代理独立验收。V01关机复验与V02用户最终确认继续待办。

V01验证方法调整（2026-11-01，用户提出）：允许电脑彻底断网、手机关闭Wi-Fi并使用移动数据刷新正式URL作为关机测试的等效验证。独立托管下限保持，临时隧道仍不算证据；本条只确认方法，尚未收到用户实测成功反馈，V01仍待确认。V03已确认，不重复要求。
