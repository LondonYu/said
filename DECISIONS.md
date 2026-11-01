# Said DECISIONS

更新：2026-11-01，Asia/Shanghai。当前状态、证据和工单只维护于[STATUS](STATUS.md)，规则载体为[AGENTS](AGENTS.md)及[.clinerules](.clinerules)。本文件只记决策与被否方案；历史结论不覆盖最新用户决定。

## D01：v0.1改为只读演示（2026-11-01，用户确认）

- 唯一验收：公网URL在用户电脑关机、本地进程结束后仍可访问（本轮追加下限，临时隧道不作V01证据）；未连接钱包读取3条真实链上留言；连接钱包后显示自身地址。托管指定GitHub Pages，三条逐条留证于STATUS，由用户最终确认，不含签名发送。
- 被否：先完成2.2B签名发送、全面异常路径和设备矩阵，再提供首次公网演示。理由：超出v0.1目标，使发布不断后移。
- 2.2A已实现并通过旧阶段复审的代码保留，2.2B排入后置，不撤销既有成果、不因此加新开发。

## D02：建立缺陷级别、证据变级和复审上限（2026-11-01，用户确认）

- P0用户打开即坏；P1主路径可用但明显错误；P2边界与异常路径。仅P0/P1阻断，P2一律STATUS backlog，不延迟发布。
- P2有真机/真实钱包复现证据可升P1回本轮；P0/P1有不可达路径复现证据可降级。必须留触发证据、步骤、影响与时间，不靠感觉或推测。
- 一轮修复＋一轮确认是上限；第三轮仍不过判为描述不清，重写工单，不继续追加、不靠重编号绕过。每轮审查必须附「本轮不建议修」。
- 被否：发现更深边界就不断追加为阻断项、无限增加修复轮次和测试数。理由：没有结束定义，不能等同主路径发布质量。
- 历史P级、测试数和旧复审记录保留原样作历史，不追溯改写为当前发布阻断。

## D03：演示产物与证据验收（2026-11-01，用户确认）

- 每个Sprint必须有公网URL或可复现截图；文档不是演示产物。v0.1更具体要求公网URL，不能拿截图替代V01。
- STATUS逐条填写URL、命令实际输出或截图、时间戳/时区和版本；“代理已观察”和“用户确认”分开。测试通过不等于达成三条。
- 本轮为用户指定的纯治理整理，不部署、不改产品，也不宣称完成产品Sprint。下一单SPRINT-4.0交付演示；没有产物不能以文档完工作为Sprint完成。

## D04：治理文档合并（2026-11-01，本次执行）

- 活跃治理面仅三处：根目录STATUS.md管当前状态/验收/待办/backlog/当前工单；根目录DECISIONS.md管决策和被否方案；docs/sprints/管历史归档。AGENTS/.clinerules只管规则，README/README.en只管项目介绍与入口，不维护第二份待办。
- 将原docs/ROADMAP.md、docs/VALIDATION.md、docs/DECISIONS.md及产品/旅程/各轮工单复审等共28份Markdown移入docs/sprints/，加历史提示并修正Markdown相对链接；8份机器证据移入docs/sprints/evidence/，内容字节不变。没有删除失败证据，也没有修改产品源码。
- 原历史决策全文保留于[历史DECISIONS](docs/sprints/DECISIONS.md)。以下迁移表标明每个旧路径，便于追溯；历史中的纯文本原路径/命令保留其当时语境，不作为当前入口。
- SPRINT-4.0已结束，过渡docs/CLINE-NEXT.md按约定删除；当前交接只读STATUS，不维护平行工单。被否：继续叠加ROADMAP/VALIDATION/REVIEW/CLINE等活跃治理文件，理由是容易出现多个“当前状态”。

| 原路径 | 历史归档路径 |
| --- | --- |
| `docs/DECISIONS.md` | `docs/sprints/DECISIONS.md` |
| `docs/EPITAPH-POSITIONING.md` | `docs/sprints/EPITAPH-POSITIONING.md` |
| `docs/PRODUCT-BLUEPRINT.md` | `docs/sprints/PRODUCT-BLUEPRINT.md` |
| `docs/REVIEW-1.0-RESULT.md` | `docs/sprints/REVIEW-1.0-RESULT.md` |
| `docs/REVIEW-1.0.md` | `docs/sprints/REVIEW-1.0.md` |
| `docs/REVIEW-1.1A.1.md` | `docs/sprints/REVIEW-1.1A.1.md` |
| `docs/REVIEW-1.1A.2-RESULT.md` | `docs/sprints/REVIEW-1.1A.2-RESULT.md` |
| `docs/REVIEW-1.1A.2.md` | `docs/sprints/REVIEW-1.1A.2.md` |
| `docs/REVIEW-1.1B.md` | `docs/sprints/REVIEW-1.1B.md` |
| `docs/REVIEW-2.1-RESULT.md` | `docs/sprints/REVIEW-2.1-RESULT.md` |
| `docs/REVIEW-2.1.md` | `docs/sprints/REVIEW-2.1.md` |
| `docs/REVIEW-2.2A-RESULT.md` | `docs/sprints/REVIEW-2.2A-RESULT.md` |
| `docs/REVIEW-2.2A.md` | `docs/sprints/REVIEW-2.2A.md` |
| `docs/REVIEW-3.1-RESULT.md` | `docs/sprints/REVIEW-3.1-RESULT.md` |
| `docs/REVIEW-3.1.md` | `docs/sprints/REVIEW-3.1.md` |
| `docs/REVIEW-3.2-RESULT.md` | `docs/sprints/REVIEW-3.2-RESULT.md` |
| `docs/REVIEW-3.2.md` | `docs/sprints/REVIEW-3.2.md` |
| `docs/ROADMAP.md` | `docs/sprints/ROADMAP.md` |
| `docs/SPRINT-1.0.md` | `docs/sprints/SPRINT-1.0.md` |
| `docs/SPRINT-1.1A.md` | `docs/sprints/SPRINT-1.1A.md` |
| `docs/SPRINT-1.1B.md` | `docs/sprints/SPRINT-1.1B.md` |
| `docs/SPRINT-2-PREP.md` | `docs/sprints/SPRINT-2-PREP.md` |
| `docs/SPRINT-2.1.md` | `docs/sprints/SPRINT-2.1.md` |
| `docs/SPRINT-2.2.md` | `docs/sprints/SPRINT-2.2.md` |
| `docs/SPRINT-3.1.md` | `docs/sprints/SPRINT-3.1.md` |
| `docs/SPRINT-3.2.md` | `docs/sprints/SPRINT-3.2.md` |
| `docs/USER-JOURNEY.md` | `docs/sprints/USER-JOURNEY.md` |
| `docs/VALIDATION.md` | `docs/sprints/VALIDATION.md` |
| `docs/evidence/review-3.2-browser.json` | `docs/sprints/evidence/review-3.2-browser.json` |
| `docs/evidence/review-3.2-codex-probes.json` | `docs/sprints/evidence/review-3.2-codex-probes.json` |
| `docs/evidence/review-2.2A-codex-second-probes.json` | `docs/sprints/evidence/review-2.2A-codex-second-probes.json` |
| `docs/evidence/review-3.1-devnet.json` | `docs/sprints/evidence/review-3.1-devnet.json` |
| `docs/evidence/review-2.2A-codex-final-probes.json` | `docs/sprints/evidence/review-2.2A-codex-final-probes.json` |
| `docs/evidence/review-3.2-codex-browser.json` | `docs/sprints/evidence/review-3.2-codex-browser.json` |
| `docs/evidence/review-2.2A-codex-probes.json` | `docs/sprints/evidence/review-2.2A-codex-probes.json` |
| `docs/evidence/review-3.2-final-codex-probes.json` | `docs/sprints/evidence/review-3.2-final-codex-probes.json` |

## 继续有效的产品与技术取舍

- Said是学习/作品集项目，MIT开源，当前实现基于Solana Devnet，不宣称已支持多链或永久存储；不把钱包助记词称作本站登录密码，产品不收集它。
- 静态前端直连RPC、无自建业务后端/数据库；账号展示依据钱包公钥。Memo协议、固定标记地址与已审查读取实现保留，不因治理整理更改。
- 用户已确认的视觉和Logo保留，不重做设计。功能缺口、服务依赖和未验证项如实说明，不用示例或缓存伪装实时链上数据。
- 具体历史设计与被后置/否决的定位（墓志铭包装、Threads式全量社交、点赞/回复/私信、多链/代付等）仅保留档案；不属于v0.1，也不据此扩展下一单。
- 原先发布前要求签名/全面兼容/异常全部验收的顺序，被D01覆盖；保留历史不等于继续执行。

## 本轮不同意见与事实边界

对用户确认的分级、证据升降级、复审上限和v0.1三条没有实质异议，已按原意写入，没有额外发布闸门。仅保留事实边界：本轮未核验公网和Devnet现状，不能承诺三条当前已达成；临时隧道不等于持续托管。它们已在STATUS标为不确定，不作为要求增加功能/测试的理由。

## D05：V01独立托管下限与GitHub Pages（2026-11-01，用户修正）

- V01要求独立于用户电脑/本地进程；用户后续认可电脑彻底断网、手机关闭Wi-Fi并用移动数据刷新同一URL作等效验证，无须实际关机。Quick Tunnel仅调试，不能当V01证据。上一版4.0允许临时隧道验收的方案撤销，历史记录不再生效。
- SPRINT-4.0指定现有LondonYu/said GitHub Pages，GitHub Actions构建/仅上传dist并部署；不创建账号、不购买服务、不改DNS。配置/工单准备已完成；用户要求读取交接并继续下一步后，按SPRINT-4.0手动启用与部署Pages，只发布dist，用户三条最终验收仍待完成。
- 新增vite.config.ts，base='./'。相对路径使首页资源可从/said/解析，也便于复用本地预览，不硬编码仓库名；当前不涉及深层路由。回滚方式及本地构建/资源200结果在STATUS，本地核验不替代V01。
- Pages已在用户要求继续SPRINT-4.0后启用并部署成功，工作流只允许手动main发布；不创建账号、不付费或改DNS。当前运行版本与三条实际验收证据只维护于STATUS，若未来受限须报告具体错误，不回退临时隧道。
- 原制度其余部分不变：P2不阻断、证据变级、复审上限、三条用户最终确认、不增测试。
- 官方依据：[Vite base](https://vite.dev/config/shared-options.html#base)、[Vite Pages部署](https://vite.dev/guide/static-deploy.html#github-pages)、[GitHub Pages工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## D06：v0.1用户最终验收与阶段关闭（2026-11-01）

用户针对电脑断网＋手机移动数据刷新以及页面/3条留言核对，回复“确认完成正常”；连同此前钱包地址一致确认，V01/V02/V03全部通过。SPRINT-4.0结束，删除过渡CLINE-NEXT，工单与原始证据归档；详细时间戳和唯一当前状态见STATUS。2.2B及兼容扩展仍后置，不自动开始；无需新增测试、功能或部署来证明已获用户确认的三条。

## D07：下一版本先完成单条发布（2026-11-01）

用户在v0.1关闭后要求“好下一步”，按既有顺序将2.2B最小页面接入列为当前工单：复用2.2A核心，一笔Devnet留言完成用户签名、确认与刷新读回。Codex准备和复审，Cline实现，用户操作真实钱包；本次准备工单不运行交易或部署。v0.1结果保持有效，不回头追加条件。

全量回执管理、多钱包/机型矩阵、异常穷举与旧核心重构后置，不新增测试数量要求。当前授权和精确验收只维护于STATUS，代码接口以源码为准。

## D08：模拟前确定计算预算与Devnet优先费（2026-11-01T20:42:10+08:00）

Phantom真实签名返回消息与准备快照不一致，旧单R1已完成修复与确认，按制度重写2.2B准备契约。准备阶段就加入400000 CU限额和0微lamports/CU价格，重新估费/模拟/审阅同一消息；基础费由RPC查询。继续拒绝任何钱包返回的消息变化、继续实际验签，不接纳“只要正文相同”的交易。

依据：[Phantom自动优先费](https://github.com/phantom/docs/blob/master/development-powertools/solana-priority-fees.md)。此次具体钱包返回差异尚未捕获，此方案需真实钱包再验。被否：直接删字节一致性、信任任意ComputeBudget改写、以相同编号无限追加修复。只重写签名前预算定义，不扩展主网/钱包矩阵或重开v0.1。

## D09：单条发布最小闭环完成并结束2.2B（2026-11-01T22:44:04+08:00）

用户报告第二次Phantom签名发布“测试”成功，并明确确认刷新后仍可见；独立RPC读到同作者/正文/签名，最终finalized、err=null。W01-W03完成，结束2.2B，作为v0.2 Devnet演示里程碑；不创建GitHub Release/tag或扩展功能。

首次超时缺少阶段和第一笔回执，记STATUS B07后置，不断言未上链、不自动重发，也不因此继续增加修复/测试轮。验收前STATUS快照和完整证据归档2.2B，根STATUS只保留当前结果。

## D10：用户要求使用主网真实SOL（2026-11-01T23:09:31+08:00）

用户明确提出“用Solana真实币呀”，将下一阶段从Devnet演示改为Solana主网能力，覆盖先前仅Devnet的范围限制。按仅网络手续费、平台不额外收费实施；用户自行审阅并签名，代理不操作真实资金交易。

选择构建时固定网络配置：本地/既有测试默认Devnet，Pages显式mainnet；genesis/chain/board/Explorer/回执按同一配置隔离。保留准备消息严格验签和费用复核，不做全局替换RPC、不混用测试网回执、不新增服务密钥或付费RPC。

本次官方主网公共端点返回403；[PublicNode官方端点](https://solana.publicnode.com/)只读预检返回正确主网genesis和Memo可执行信息，作为当前候选RPC，不承诺其可用性或浏览器兼容已验。当前站点仍Devnet，主网需另行按M01-M03验证。工单及实际结果见STATUS。

主网部署后的真实发布会话发现 PublicNode 的 `getBlockHeight` 间歇返回 slot 数值，导致有效 blockhash 被误判为过期。改用 `https://rpc.solanatracker.io/public`：其浏览器 CORS 允许 GitHub Pages 来源，主网 genesis、blockhash、真实 block height、费用估算和未签名模拟一致。保留现有 genesis 校验、blockhash 有效期复核与单次广播保护；不以放宽过期判断绕过问题。
