# 验证记录

## 2026-10-30：仓库基线

- 范围：前端骨架、精确依赖、工程文档；钱包模块未实现。
- Node：26.12.1；npm：11.20.0。
- 依赖安装：精确版本安装成功，73个包；package-lock.json已生成。
- 类型检查：npm run typecheck退出0。
- 生产构建：npm run build退出0，Vite 8.3.5完成构建。
- 浏览器骨架检查：实际打开127.0.0.1:5173，标题「留言板」，页面明确显示钱包模块尚未实现。
- 钱包功能测试与真实连接验收：未实现/未验证，不从阶段0直接继承为已通过。

## Cline交付时补充

记录实际命令、退出状态、测试数量、必要错误与修复、当前提交和未完成项。用户未操作的拒绝、切账户、断开、手机、OKX项必须保留未验证状态。

正式工作目录沿用用户现有空文件夹：/Users/londonyu/Desktop/Solana链上留言板项目。脚手架从临时交付目录迁入，避免重复维护两份代码。迁移后再次执行类型检查与构建再建立Git基线。

迁移后复验：npm run typecheck及npm run build均再次退出0；临时目录预览服务已停止。没有运行钱包功能测试，因为该模块尚未实现。

## 2026-10-30：Sprint 1.0 钱包连接与 Devnet 只读实现

### 执行环境与基线
- Node 26.12.1 / npm 11.20.0；新增 vitest 5.0.5（精确版本，package-lock 已更新）。
- 动手前复验：npm run typecheck 退出0；npm run build 退出0（Vite 8.3.5）。
- 安装测试工具：npm install --save-dev --save-exact vitest@5.0.5；当前依赖树共94个包，npm audit 报告0漏洞。

### 交付内容
- src/wallet.ts：Wallet Standard 发现、显式连接、断开、standard:events 账户变更、请求代次失效、dispose 清理。
- src/network.ts：固定 https://api.devnet.solana.com 与 genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`；genesis 不匹配立即失败；地址校验后读取 lamports；10 秒超时；RPC 错误不回退 0。
- src/App.tsx：钱包选择/连接/断开、完整公钥、应用查询网络状态、余额加载/错误/重试、Phantom Testnet Mode 指引；无签名与交易入口。
- src/styles.css：基础暗色布局与窄屏换行。

### 自动化结果
- 先写测试并确认失败：2个测试文件均报 `Cannot find module './wallet'` / `'./network'`。
- 实现后 npm test：2个文件、26项全部通过（wallet 15项，network 11项）。覆盖拒绝后可重试、连点只发起一次连接、连接中断开后旧结果失效、账户切换、清空账户、取消注册、dispose、genesis 不匹配、RPC 异常/超时/取消、有效0余额、非法地址不发请求、旧余额请求取消。
- npm run typecheck：退出0。
- npm run build：退出0；59 modules transformed；dist/assets/index-FEgIC5BR.js 253.29 kB（gzip 80.31 kB），index-BkEsgadn.css 1.52 kB。

### 真实 Devnet 只读核验
- 命令：Node 直接加载 src/network.ts，调用 verifyDevnet 与 readBalance（公共只读 RPC，无签名、无交易）。
- 实际输出：`GENESIS_OK EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`；`BALANCE_LAMPORTS 4235100000`（示例公开地址 `4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T`，不是用户钱包，未用于任何写操作）。
- 全程未使用主网 RPC，未存放私钥、助记词或 API key。

### 页面可达性
- 启动 vite 于 127.0.0.1:5173：GET / 返回200，标题「留言板」；GET /src/main.tsx 返回200。检查后已停止服务。
- 未在真实浏览器中操作钱包弹窗，因此人工项仍为“未验证”。

### 源码范围扫描
- 在 src 中检索 signTransaction/signMessage/sendTransaction/sendAndConfirm/mainnet/privateKey/mnemonic/secretKey/apiKey：产品代码无命中；仅 wallet.test.ts 使用 `solana:mainnet` 作为“非 Devnet 账户”的负向夹具，不含主网 URL 或写操作。

### 未验证 / 待用户人工验收
- W01 无钱包扩展：需在未安装钱包的浏览器验证提示与刷新路径。
- W02 钱包后注册/取消注册：真实扩展操作未执行（控制器逻辑已由单测覆盖）。
- W03–W07 Phantom 真实连接、拒绝、连点、切账户、钱包侧断开：本次未操作钱包弹窗，不声明通过。
- W08 页面刷新/卸载重挂载：仅 dispose 单测通过，真实刷新未执行。
- N01 RPC genesis 非 Devnet：仅假 RPC 单测，未改用错网 URL 做浏览器实测。
- N02 限流/超时：单测覆盖；真实公共 RPC 限流场景未复现。
- N03 正常0余额：单测覆盖；真实0余额账户未在界面验证。
- N04 切账户旧余额：单测与 AbortController 逻辑覆盖；真实钱包时序未验证。
- U01 390px 窄屏：CSS 已按无横向溢出设计，未在设备模拟器实测。
- 手机钱包、OKX 等其他钱包未验证。

### 用户人工验收步骤（Chrome + Phantom）
1. `npm ci && npm run dev`，打开 http://127.0.0.1:5173 。
2. 未安装钱包时确认无空白页/死按钮（W01）；安装扩展后刷新确认列表出现（W02）。
3. Phantom → 设置 → 开发者设置 → Testnet Mode → Solana Devnet。
4. 选择 Phantom → 连接所选钱包；批准后确认显示完整公钥与余额（W03/N03）。
5. 断开后重连并在弹窗中取消一次，确认显示已取消且可再次连接（W04）。
6. 在 Phantom 切换到另一账户，确认地址与余额更新（W06/N04）。
7. 在 Phantom 清除站点连接，确认页面自动断开并清空地址（W07）。
8. 窗口缩到390px，确认无横向滚动、完整地址可换行（U01）。

## 2026-10-30：REVIEW-1.0 R1/R2 修复与回归

### 工单与范围
- 对应 [REVIEW-1.0.md](REVIEW-1.0.md) 的 R1（连接等待无取消入口）与 R2（切账户首帧显示旧余额）；保持 Sprint 1.0，只改前端钱包/余额交互与测试，未加入签名、交易、留言、主网、后端或部署。
- 新增精确开发依赖：`@testing-library/react@16.3.3`、`@testing-library/dom@10.4.2`、`jsdom@30.1.3`（package.json 与 package-lock 已更新，新增 50 个包）。只用于 jsdom 组件回归，不引入 E2E 框架。
- 本轮未提交、未推送、未部署；工作区保留用户与 Cline 原有改动。

### 先失败再修复
- 新增 `src/App.test.tsx`（5 项视图回归），并在 `src/wallet.test.ts` 增加取消/并发策略回归；实现前定向运行：2 个文件、6 项失败、16 项通过。
- 实际失败包括：`controller.cancelConnect is not a function`；`pendingWalletNames` 为 `undefined`；找不到「取消等待」；切账户后仍能找到 A 的余额。
- 首次 R2 修复后定向运行出现 2 项测试自身问题（正则转义写错；切账户后网络复核尚未完成就同步断言 loading）和 1 个未处理 rejection（在余额请求开始前就 reject 了 deferred）。仅修正测试的等待与正则后，定向 22/22 通过；这不是产品实现通过。
- 最终新增第三项控制器回归：取消 A 后 B 正在等待，A 拒绝时 B 仍保持 `connecting`、无旧错误；B 之后成功连接。

### 修复内容
- `src/wallet.ts`：快照新增 `pendingWalletNames`；按钱包名记录底层 `standard:connect` 是否仍未结束。新增 `cancelConnect()`：只失效旧 generation、清本地状态并提示“不会关闭钱包弹窗或撤销授权”，不调用钱包断开。同一钱包的旧请求未结束前，`connect()` 只给出等待提示、不再次调用钱包；不同钱包仍可连接。旧请求的 `finally` 只更新等待列表，不覆盖新状态；`dispose` 清理等待集合。
- `src/App.tsx`：连接中显示「取消等待」及明确文案；取消后用 action 序号释放页面锁，旧 connect 的 finally 不能解锁新操作；选中钱包仍在底层等待时禁用其重连并显示等待提示。
- `src/App.tsx` R2：余额拆为以 `${address}:${attempt}` 为 key 的 `BalancePanel`；网络状态记录其校验对应地址。切账户或重试时旧组件同步卸载，新组件从 loading 开始，旧余额/旧错误/旧 loading 与晚到结果都没有展示路径；AbortController 取消语义保留。

### 最终自动化结果（本轮实际输出）
- `npm run typecheck`：退出0。
- `npm test`：3 个测试文件、34 项通过（wallet 18，network 11，App 5）。
- `npm run build`：退出0，59 modules transformed；`dist/assets/index-HaMtJLmS.js` 255.05 kB（gzip 80.80 kB），`index-BkEsgadn.css` 1.52 kB。
- `git diff --check`：退出0。
- `npm audit`：退出0，0 vulnerabilities。
- `npm ci --ignore-scripts`（更新后的 lock）：成功输出 `added 143 packages, and audited 144 packages`，0 vulnerabilities。
- 新增 R1 回归覆盖：挂起连接→页面取消→地址为空且可改选其他钱包；旧 A 成功/失败/finally 不恢复连接、不结束 B 的等待；同一钱包在旧弹窗结束前不产生第二次 `connect` 调用、结束后可重试。R2 覆盖：A 余额已显示→切 B 首帧无 A 数值；A 错误不显示在 B；A 晚到结果不可见；B 结果返回后才显示。

### 仍未验证 / 待用户人工验收
- 真实 Phantom 弹窗下的取消路径（R1）：未操作真实钱包，不声明“取消能关闭弹窗”；实际只验证本地停止等待与旧结果失效。
- 真实钱包切账户时的首帧视觉（R2）：视图回归已覆盖，真实扩展事件时序与是否有可见闪烁未操作。
- 原有 W01–W08、N01–N04、390px U01、手机钱包与 OKX 仍按上一节保留未验证；本轮未重新启动浏览器做 390px 实测。
- 全程未签名、未构造/发送交易、未写留言、未使用主网或真实资金。

### 人工验收补充步骤（在原有步骤基础上）
1. 点击连接后，在钱包弹窗未返回前点「取消等待」：页面应立即停止等待、地址为空；随后完成/关闭旧弹窗，页面不得自动恢复连接。
2. 取消后先选择另一个钱包，确认可以发起连接；再选回原钱包，确认在旧弹窗结束前显示“仍在等待钱包处理”且不能重复弹窗；旧弹窗结束后可重试。
3. 准备两个余额不同的 Phantom 账户，先显示 A 余额，再在钱包内切到 B：确认 B 首次出现时看不到 A 的数值或错误；A 的迟到结果也不得显示。
4. 切换过程中观察网络状态是否短暂显示“校验中…”并最终为 Devnet；失败时使用重试，不得把 RPC 失败显示为 0 余额。

## 2026-10-30：Codex 独立复审
- R1/R2 代码复审通过，按锁文件安装143包后类型检查、34项测试（wallet18/network11/App5）、构建及git diff --check均通过。
- 正式5173开发服务已启动，HTTP页面标题核对为「留言板」。尚未操作真实钱包或重新进行390px浏览器实测；不改变前文未验证项。
- 详细结果见 [REVIEW-1.0-RESULT.md](REVIEW-1.0-RESULT.md)。未提交、未推送、未部署。

## 2026-10-30：用户反馈与后续适配
- 用户反馈：“可以能连上钱包”。据此记录实际连接成功；未提供完整公钥、余额、取消/切账户等逐项结果，不将W03其余细项或整个Sprint自动标为通过。
- 用户提出钱包内置浏览器和电脑/手机多分辨率适配需求，已拆入ROADMAP.md的1.1A/1.1B及阶段4。手机、OKX和硬件钱包未由本条反馈验证。

## 2026-10-30：1.1A.1正式界面接入

Codex直接实现；39项测试、类型、构建通过，保留原控制器/网络/锁文件。详见[交付记录](REVIEW-1.1A.1.md)，真实钱包/手机验收继续待办。1.1A.2已由Cline实现，见下一节。

## 2026-10-30：1.1A.2示例流与编辑预览

### 范围与交付
- 按 SPRINT-1.1A.md 的 1.1A.2 实现：首页静态示例流、示例详情、仅过滤本地示例的搜索，以及本地编辑预览；保留真实钱包、Devnet只读、R1/R2 保护。
- 新增 `src/Preview.tsx`；修改 `src/App.tsx`、`src/styles.css`、`src/i18n.ts`；不新增依赖，不改 `wallet.ts`、`network.ts` 与锁文件。
- 预览标注「本地预览，未上链」；不伪造链上哈希、不请求签名或发送交易、不把示例账户归属给真实钱包。

### 实际检查输出
- `npm run typecheck`：退出0。
- `npm test`：3 个文件、44 项通过（wallet 18，network 11，App 15）。
- `npm run build`：退出0，65 modules transformed；`dist/assets/index-Du_61bB_.js` 282.74 kB（gzip 90.05 kB），`index-B6jXdZp1.css` 13.05 kB（gzip 3.56 kB）。
- `git diff --check`：退出0。
- 首次 App 定向测试 15 项中 2 项失败：弹层打开时首页示例仍在 DOM，导致文本查询命中多处；这是测试查询作用域问题，改为 `within(dialog)` 后通过，产品实现未因此改动。

### 新增回归
- 首页示例流明确标注且不出现「交易哈希/已上链/签名成功」。
- 本地搜索只过滤示例文本与账户名，无匹配显示空结果。
- 示例详情显示「本地预览，未上链」且不出现哈希。
- 编辑预览：空白禁用；140 grapheme 上限；560 UTF-8 字节上限（用 ZWJ 图文字符串验证）；预览/返回修改；关闭弹层草稿保留。
- 示例流与编辑预览随语言切换为英文。

### 未验证 / 待用户人工验收
- 真实 Phantom/OKX 取消、切账户、断开和余额体验。
- 真机软键盘/安全区/横屏/200%缩放，以及手机钱包内置浏览器路径。
- 本轮未重做浏览器 320–1440px 人工检查；仅由既有 1.1A.1 视觉基线与 CSS 检查覆盖，不把视口模拟或自动检查当成真机通过。
- 示例流仅本地样例，真实历史读取属于阶段3；本交付不声称链上记录通过。

详见 [REVIEW-1.1A.2.md](REVIEW-1.1A.2.md)。未提交、未推送、未部署。

## Codex独立复审（2026-10-30）
按锁安装143包后44测试、类型、构建及diff检查均通过；浏览器发现详情44×36px与输入15px，列为R1/R2，整体待修复。详见[复审工单](REVIEW-1.1A.2-RESULT.md)。Codex未改产品源码。R1/R2已由Cline修复，见下一节。

## 2026-10-30：REVIEW-1.1A.2 R1/R2修复

- 范围：仅修改 `src/styles.css`，保持业务边界、钱包保护与依赖不变，不新增测试依赖。
- R1：`.post-detail` 从 `width/height:36px` 改为 `flex:0 0 44px; width:44px; height:44px`；`.preview-post-head strong` 增加 `min-width:0; flex-shrink:1`，`.sample-author` 增加 `flex-shrink:0`，避免详情目标挤压作者行。
- R2：`.sample-search, .preview-draft` 增加 `font-size:16px`，用于避免 iOS 聚焦自动放大风险；未修改视口缩放设置。

### 实际浏览器测量（无头 Chrome + CDP，实际 5173 页面）
- 320×800、390×844、768×1024、1440×900、844×390 五个视口：首页6个 `.post-detail` 点击区域均为 `[44,44]`。
- 同一批视口：搜索弹层 `.sample-search` 与编辑弹层 `.preview-draft` 的 `computed font-size` 均为 `16px`。
- 另用与真实结构一致的探针 DOM 复核简中/繁中/英文作者行：`scrollWidth - clientWidth` 为0，无横向溢出。
- 这仍是无头浏览器实测，不是真机；iOS 自动放大、软键盘/安全区、200%缩放等仍未验证。

### 自动检查输出
- `npm run typecheck`：退出0。
- `npm test`：3个文件、44项通过（wallet 18，network 11，App 15）。
- `npm run build`：退出0，65 modules；`dist/assets/index-CvHDh2h9.js` 282.74 kB（gzip 90.05 kB），`index-DjATmW_d.css` 13.12 kB（gzip 3.56 kB）。
- `git diff --check`：退出0。
- 未提交、未推送、未部署；待 Codex 复审。

## 2026-10-30：Codex独立复审 REVIEW-1.1A.2 R1/R2

- 结论：R1/R2修复通过，无新增代码阻塞项。`src/styles.css` 的修改范围与复审工单一致，未发现因固定详情目标造成作者行或弹层横向溢出。
- 实际5173页面独立复测320×800、390×844、768×1024、1440×900、844×390：首页与搜索结果中的6个 `.post-detail` 均为44×44px；`.sample-search` 与 `.preview-draft` 的计算字号均为16px。
- 三语言独立操作：320px与390px下分别切换简体中文、繁体中文、英文；首页与搜索结果的 `.preview-post-head` 均满足 `scrollWidth === clientWidth`，搜索/编辑弹层均满足 `scrollWidth === clientWidth`。
- 独立重跑：typecheck退出0；3个测试文件44项通过；build退出0（65 modules，CSS 13.12 kB / gzip 3.56 kB，JS 282.74 kB / gzip 90.05 kB）；git diff --check退出0。
- 未验证项保持不变：真实Phantom/OKX钱包操作、真机软键盘与安全区、200%缩放、手机钱包内置浏览器。R1/R2代码复审通过不等于1.1A或1.1B整体验收。

## 2026-10-30：转入1.1B

用户确认1.1A设计已在Codex完成，不再重复索要视觉确认；R1/R2复审结论保留。已准备docs/SPRINT-1.1B.md与CLINE-NEXT.md，Codex拆单审查、Cline执行。先做dist临时HTTPS预览，再逐项真机钱包只读验证。当前仅完成工单准备，尚未安装cloudflared、启动隧道或部署，未重跑代码检查；沿用上轮44项通过的历史证据，不冒充本轮结果。未改产品源码、依赖，不提交或推送。

## 2026-10-30：1.1B.1 临时 HTTPS 预览完成

- 自动检查本轮实际输出：typecheck 退出0；44项测试通过（wallet 18，network 11，App 15）；build 退出0，65 modules，JS 282.74 kB / gzip 90.05 kB，CSS 13.12 kB / gzip 3.56 kB；git diff --check 退出0。
- 临时获取官方 cloudflared 2026.10.6（官方 GitHub Release，仅下载到 /tmp，不装全局、不改现有配置）。
- 静态服务 127.0.0.1:5181 + Quick Tunnel `https://bargain-wives-battle-dealt.trycloudflare.com`（HTTP2）；HTTPS 页面 `isSecureContext=true`、静态资产200、示例/本地预览标识存在、Devnet RPC 返回正确 genesis。
- 已按本次进程标识停止隧道与静态服务，5181/20241 已释放，入口停止后返回530。
- 真机 1.1B.2 全部未验证；未签名、未发送、未提交、未推送、未部署。详见 [REVIEW-1.1B.md](REVIEW-1.1B.md)。

## 2026-10-30：Codex复审与1.1B.2入口恢复

- 结论：1.1B.1准备工作复审通过，允许进入真机只读验证。独立核对dist仅4个预期文件，SHA-256均与Cline记录一致；git diff --check通过。未改产品代码或依赖，未重跑类型/44项测试/构建（本轮仅文档及同一产物入口恢复）。此前自动检查是Cline交付证据。
- 独立恢复Python静态服务127.0.0.1:5181（PID 7316，exec session 34646）与cloudflared 2026.10.6 HTTP2（exec session 50559）；未使用旧PID记录。新入口：https://vacuum-marsh-pest-rocket.trycloudflare.com 。本次4个HTTPS资源均200且远端哈希与本地一致；Codex内置浏览器打开后显示Said、Devnet只读、6条明确标注的示例。
- 新链接目前为手机测试保持运行，电脑须保持运行；本次并非已停止。停止应先核对进程身份，再仅停止本次隧道/静态服务，复核入口失效；不要沿用Cline上一轮PID。隧道可通过exec session 50559终止，静态服务通过34646终止。
- 1.1B.2所有真机项仍未验证，下一步用户在iPhone Phantom内置浏览器打开新链接，先检查页面、主动连接、公钥及Devnet余额；随后逐项拒绝/取消/返回、断开/切账户、键盘/横屏。系统与钱包版本待记录。无签名、交易、主网或真实资金操作。
- 表述修正：已做临时HTTPS测试预览开放；未做生产部署、提交或推送。不要笼统称“未部署”而掩盖入口已开放。

## 2026-10-30：1.1B.2 用户手机反馈（Bitget）

- 用户确认手机Chrome可打开HTTPS页面；此项只证明页面可访问，不证明Chrome钱包连接。
- 用户随后使用Bitget手机钱包反馈：钱包被识别、DApp连接授权成功、页面显示完整公钥。按用户反馈记录这三个子项通过，非Codex直接观察；未取得设备系统/钱包版本、公钥比对或截图。
- 用户反馈网络和余额不显示，认为与钱包处于真实网络有关。该原因尚未证实：源码network.ts固定Devnet RPC并独立验证genesis，余额不读取主网；主网余额与Devnet余额独立。需取得页面确切错误/状态，不能直接判定切网即可修复。
- Bitget网络校验与余额项未通过/待诊断；拒绝、取消、返回、断开、切账户、键盘、安全区、横屏等未验证。Phantom/OKX均未据此通过；不进入交易写入。
- 未改产品源码、依赖；未签名或发送交易。下一步取得账户面板网络/余额错误原文或局部截图，再拆最小修复工单。

## 2026-10-30：Bitget手机只读验证后续反馈

- 证据补充：用户提供IMG_0954.PNG，明确显示Bitget已连接、完整公钥与“网络校验超时（10秒）”。不是主网/Devnet错配的证据。截图另有钱包侧钓鱼风险提示，原因未查明，继续保留问题，不指导绕过。
- 用户随后反馈网络恢复后成功显示Devnet余额0 SOL；据用户实测反馈将网络校验/余额读取子项更新为通过。此前超时已恢复，用户归因为网络不佳，未以技术测量确认具体网络原因；无需凭此修改超时或RPC。
- 对“断开后重连，以及搜索/编辑框弹出键盘是否遮挡按钮”的检查，用户回复“不会，都挺好的”；按此上下文记录断开重连正常、键盘无按钮遮挡，证据类型为用户反馈。
- 当前通过范围：手机Chrome页面访问；Bitget内置浏览器发现、授权连接、完整公钥显示、Devnet校验、0 SOL余额显示、断开重连、搜索/编辑键盘基本体验。未把其他钱包或整个1.1B标为通过。
- 剩余：真实拒绝/取消及返回、切账户隔离、横屏/缩放/安全区专项、系统及钱包版本；Phantom/OKX/Android未验证。下一步优先补拒绝/取消恢复与版本记录，再评估写入阶段关口。未签名、未转账、不进入Sprint2实现。
- 本次仅同步记录，不改代码/依赖、不重跑测试，临时入口状态本轮未重新核验。

## 2026-10-31：放行2.1无签名模拟工单

用户确认新origin能打开但Bitget直接连接、没有授权提示；拒绝/取消继续未验证，不再反复换域名。用户同意推进构造/模拟准备；已形成正式docs/SPRINT-2.1.md交Cline执行，仅允许未签名构造、Devnet费用检查和simulateTransaction，2.2签名/发送保持关闭。0 SOL不足不冒充模拟成功；真实模拟探针与用户状态分开。更新AGENTS、CLINE-NEXT与阶段准备稿；本次不改产品源码/依赖、不跑产品测试、不启动新入口或交易，工单尚未实现。既有Bitget通过项目保留，手机其余项和风险提示仍待核实。

## 2026-10-31：Sprint 2.1 未签名构造/费用检查/Devnet模拟

- 新增 `src/message.ts`（协议JSON、140 grapheme/560字节/空白校验、v0未签名交易、占位签名槽、大小）与 `src/simulation.ts`（genesis、blockhash/高度、余额、getFeeForMessage、simulateTransaction，sigVerify=false）。
- 编辑预览增加「检查交易」入口与摘要；切账户/草稿/关闭弹层使结果失效并取消页面请求；连点不并发；余额不足不显示模拟成功。
- 自动检查：typecheck 退出0；npm test 5文件66项通过（wallet18/network11/message8/simulation9/App20）；build 退出0，67 modules，JS 311.66 kB/gzip98.21，CSS13.66 kB/gzip3.67；git diff --check 退出0；产品源码无签名/发送/主网/私钥命中。
- 真实 Devnet 只读探针（公开测试地址，非用户钱包，未签名未广播）：余额4235100000 lamports、估费5000 lamports、交易347字节、`simulationErr:null`，日志显示协议JSON与System/Memo4 success。
- 当前用户0 SOL分支、2.2签名/发送、真实历史、主网、后端均未执行；1.1B真机未验证项继续保留。详见 [REVIEW-2.1.md](REVIEW-2.1.md)。未提交、未推送、未部署。

## 2026-10-31：Sprint2.1独立复审待修复

Codex独立typecheck/66项测试/build/diff均通过，但审查不通过：R1 Memo accounts为空，缺少工单要求的作者签名账户；R2构造入口接受空正文与141字符（已独立复现），缺少强制输入/整笔大小防线；R3过期判断只用模拟前高度，无法覆盖执行期间过期。详见正式仓库docs/REVIEW-2.1-RESULT.md，CLINE-NEXT已更新。Codex只写复审文档，未改产品源码；真实RPC探针本轮未重跑，2.2签名发送继续关闭。下一步Cline按R1/R2/R3修复后复审。


## 2026-10-31：Sprint2.1 R1/R2/R3修复

- R1：Memo 指令显式声明付款作者账户（READONLY_SIGNER），真实模拟日志出现 `Signed by`；整笔仍仅付款者一个占位签名槽。
- R2：构造与模拟入口都强制正文规则（空白/140 grapheme/560 UTF-8字节），非法输入不发 RPC；以实际 wire 字节数校验 1232 字节完整交易上限，超限拒绝构造。
- R3：模拟返回前重读当前高度；BlockhashNotFound 或复核高度超限都标记 blockhashExpired；重试重取 blockhash/费用。
- 修复后自动检查：typecheck 退出0；5文件73项通过（wallet18/network11/message11/simulation13/App20）；build 退出0，JS312.93 kB/gzip98.67，CSS13.66 kB/gzip3.67；git diff --check 退出0。
- 修复后真实 Devnet 只读探针：余额4235100000、估费5000、交易357字节、simulationErr:null、blockhashExpired:false；日志含 `Signed by: 4Nd1mBQ...` 与协议 JSON。
- 未签名、未发送、未提交、未推送、未部署；2.2 仍关闭，待 Codex 复审。

## 2026-10-31：首次 GitHub 上传前检查

- 定位：Said 是开发中的开源学习作品；README 区分目标流程与已实现功能，真实签名发送和历史读取尚未实现。
- 公开准备：新增 MIT LICENSE，作者 LondonYu；本仓库提交身份使用 GitHub noreply 地址。未改产品源码、依赖或已确认设计。
- 本轮执行：npm run typecheck 退出0；npm test 5文件73项通过；npm run build 退出0（67 modules，JS 312.93 kB / gzip 98.67 kB，CSS 13.66 kB / gzip 3.67 kB）；git diff --check 退出0。
- 对50个待版本管理文件进行常见凭据格式扫描，无命中；node_modules、dist、环境文件和日志由 .gitignore 排除。格式扫描不等于全面安全审计。
- 未执行真实钱包、签名/发送或新的真机验证；既有未验证项保留。GitHub 创建/推送结果以实际远端核验及 Obsidian 执行日志为准。
