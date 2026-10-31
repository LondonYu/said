# 验证记录

## 2026-10-31：Sprint 2.2A 二审剩余 R3/R4 修复

- R3可靠终态：先把 `confirmationStatus` 规范化为已知级别；只有 `confirmed`/`finalized` 可结算成功或失败，成功必须显式 `err === null`，只有对象形态的明确错误才写 `failed`。`processed`、null/未知级别、缺失或畸形 `err` 均返回 `pending`/`not_terminal`，保留原签名与观察到的错误，不写盘、不释放容量；确认轮询遇到 processed 错误仍继续到后续 confirmed 或上限。
- R4实时能力：删除 `walletFeaturesFromEvent`/`walletChainsFromEvent` 永久信任标记；`getSigningSession()` 每次同时核对事件期望值、钱包实时 `chains`/`features`、账户 `chains`/`features`、地址/公钥、特性 `1.0.0` 与 v0 交易版本。事件与实时 getter 不一致或账户对象原地撤销时保守失效但保留只读连接；事件与 getter 一致时正常提供可调用签名会话。未改连接 generation、未回退 `signAndSend`。
- 新增13项回归：processed+错误与未知级别+错误不结算、processed→confirmed继续轮询、confirmed/finalized缺err、confirmed畸形err、confirmed/finalized明确err结算；features事件一致后静默删除/替换、chains事件一致后静默撤销Devnet、事件/getter不一致、同账户原地撤销特性+accounts事件，以及签名等待期静默撤销和账户撤销组合零广播。现有R1/R2/R5回归保持通过。
- 实际自动检查：`npm run typecheck` 退出0；`npm test` 8文件252项通过（publisher 98、wallet 38、message 13、simulation 13、network 11、history 34、App 27、historyFeed 18）；`npm run build` 退出0（70 modules，`dist/assets/index-Byps-RCq.js` 346.16 kB/gzip 108.13 kB，CSS 15.68 kB/gzip 4.04 kB）；`git diff --check` 退出0。
- 本轮只改 `src/publisher.ts`、`src/wallet.ts` 及对应测试与交接/验证/复审文档；未接B/UI，未调用真实钱包签名或 `sendTransaction`，未新增依赖、后台、数据库、主网或部署，未提交/推送。真实钱包、真实广播/确认、浏览器WebCrypto Ed25519、真实429/响应丢失与真机项仍未验证；工作区停交Codex复审。

## 2026-10-31：Sprint 2.2A R1–R5限定修复与回归

- R1签名锁：`sign`在首次`await`前同步占有对象token；前置复核失败只释放本次token；页面取消但底层钱包Promise未结束时保留锁，旧请求`finally`不释放后来者。新增同帧连点、前置失败后重试、取消后底层仍pending、迟到结果与旧finally隔离回归。
- R2截止/取消：`prepare`/`sign`/`submit`/`check`/`confirm`/`recover`/`readBack`接入可组合caller signal与总/单RPC截止；RPC实际race且await后复查，迟到成功/失败被丢弃；确认轮询包含在途RPC和轮间等待；监听器、计时器和睡眠均清理。发送已派发后超时/取消返回`uncertain`并保留原签名，不标未发送、不重签重发。新增预取消零RPC、genesis/高度/费用/余额逐阶段取消、状态/确认/恢复/读回取消、无响应send、迟到状态、轮间等待截止等回归。
- R3终态结算：`check`/`confirm`/`recover`把confirmed/finalized/可靠失败写回同一原签名回执；`persistence`显式区分persisted/failed/not_terminal，写盘失败仍返回链上结果。新增confirmed/failed结算、写盘失败、recover结算、确认终态及实际浏览器回执存储连续11次成功发布/确认回归；第11笔会淘汰最旧confirmed，保留10条，不再耗尽容量。
- R4钱包能力：处理`standard:events`的chains/features独立事件并重算会话；`getSigningSession()`每次核验实时能力与版本，静默替换也失效；仅接受签名特性1.0.0、v0、Devnet。新增未知版本拒绝、features-only撤销、chains-only移除Devnet、特性替换/恢复/交易版本变化、静默变更失效回归。
- R5 Unicode：`message`新增well-formed Unicode检查，孤立高/低代理项返回`not_well_formed`；`prepare`在模拟前拒绝，`validatePrepared`对伪造准备对象同样拒绝；合法代理对、emoji与ZWJ保留原文通过。新增准备零模拟、伪造对象零钱包、合法序列通过回归。
- 实际自动检查：`npm run typecheck`退出0；`npm test` 8文件239项通过（publisher89、wallet34、message13、simulation13、network11、history34、App27、historyFeed18）；`npm run build`退出0（70 modules，JS 345.92 kB/gzip 108.09 kB，CSS 15.68 kB/gzip 4.04 kB）；`git diff --check`退出0。
- 本轮未接B页面/发布UI，未调用真实钱包签名或`sendTransaction`，未新增依赖、后台、数据库、主网或部署，未提交/推送。真实钱包、真实广播/确认、浏览器WebCrypto Ed25519、真实429/响应丢失与真机项仍未验证；注入钱包和Node验签不能替代B验收。工作区停交Codex复审。

## 2026-10-31：Sprint3.2 R1/R2最终独立复审通过

- Codex独立typecheck、7文件132项测试、临时目录build、diff检查均通过；构建70 modules，JS341.90 kB/gzip106.85、CSS15.68 kB/gzip4.04，与Cline产物一致。
- 独立5组hook断言通过：三种手动操作卸载信号真正取消；刷新/恢复旧记录/后续分页稳定为[120,110,70]；重叠页验证成功后核销对应不可得项，其他项保留。最终探针与首轮失败证据分别保留，不覆盖历史。
- 独立实际构建浏览器检查：新localhost origin、无钱包/无注入，公共流3条2作者，首条详情/Devnet href与rel正确，加载更多至源末尾仍3条及扫描数3，无DOM告警或示例标签。临时本地服务/页已撤下，未公网部署。
- 完整响应式/语言/搜索/刷新浏览器结果为Cline修复后证据；真实钱包个人历史/切账户/断开、真实429/不可得重试、真机键盘安全区继续未验证。见REVIEW-3.2-RESULT最新通过节及公开证据。

## 2026-10-31：Sprint3.2 R1/R2限定修复与修复后真实只读浏览器

- 先补7项针对性回归并实际执行，其中6项复现失败：R1三个手动操作（refresh/loadMore/retryUnavailable）pending时unmount，`signal.aborted`均为false；R2“刷新→恢复旧记录→加载中间页”得到`[120,70,110]`，重叠成功签名仍留在不可得队列，跨页同slot顺序错误。修复前定向测试`6 failed | 11 passed`。修复后另补1项刷新核销边界回归。
- 修复后`historyFeed.test.tsx` 18/18通过。R1 cleanup取消当前controller并保留范围切换/new-mount隔离；R2统一按slot新到旧稳定合并、同slot保持已显示与页内顺序、按signature去重，并用合并后消息统一核销不可得队列（重试仍移除本批明确无效候选）。
- `npm run typecheck`退出0；`npm test` 7文件132项全通过（wallet18、message11、simulation13、network11、history34、App27、historyFeed18）；`npm run build`退出0，70 modules，`dist/assets/index-DqHusx3n.js` 341.90 kB/gzip106.85，CSS15.68 kB/gzip4.04；`git diff --check`退出0。
- 修复后全新headless Chrome、未连接钱包、无注入夹具，经正常history客户端只读Devnet，时刻`2026-10-31T12:38:22.826Z`：首屏3条/2作者，无“示例留言”标签、无读取错误，`本次扫描候选3条`；刷新和加载更多到源末尾后仍3条、扫描数保持3；3条详情字段/Devnet Explorer链接正常；320/390/768/1440/844×390均无横向溢出；三语言、浅色主题切换保留3条；CDP Runtime/Log应用异常为空。证据见[evidence/review-3.2-browser.json](evidence/review-3.2-browser.json)。
- 本轮只改`src/historyFeed.ts`、`src/historyFeed.test.tsx`及文档/证据；未改已复审读取核心、钱包、网络、消息、模拟、UI/依赖，未签名/发送、未部署/提交/推送，2.2继续关闭。真实钱包个人历史/切账户、真实429/不可得重试与真机键盘/安全区仍未验证。

## 2026-10-31：Sprint3.2 Codex独立复审暂不通过

- 独立typecheck退出0，7文件124项测试通过，build输出/tmp/said-review-3.2-dist（70 modules，JS341.77 kB/gzip106.83、CSS15.68 kB/gzip4.04），diff检查通过；读取核心/钱包/模拟/依赖未改。
- 独立jsdom探针复现：refresh/loadMore/retryUnavailable未决时unmount，当前请求signal.aborted均为false；刷新保留旧不可得并先恢复slot70后加载slot110，顺序成为[120,70,110]；重叠页已解析成功的签名仍残留不可得队列。
- 限定修复R1请求清理、R2分页/恢复/队列协调；见[REVIEW-3.2-RESULT.md](REVIEW-3.2-RESULT.md)及[evidence/review-3.2-codex-probes.json](evidence/review-3.2-codex-probes.json)。未改产品源码/测试，未提交推送或部署，2.2继续关闭。
- 本轮核读Cline真实浏览器JSON但未独立重跑浏览器；上述探针是注入客户端的jsdom行为，不冒称真实钱包、429或真机验收。

## 2026-10-31：Sprint3.2实现与真实浏览器只读验证

- 基线提交`7e2d5d9`，工作区包含本轮3.2修改；`git diff --check`退出0，无空白错误。本轮未提交、推送或部署。
- `npm run typecheck`退出0；`npm test`为7个文件124项全通过（wallet 18、message 11、simulation 13、network 11、history 34、App 27、historyFeed 10）。3.2新增/扩展覆盖：范围首帧隔离、迟到成功与finally、刷新/翻页连点锁、全过滤页、跨页扫描候选累计且空末页不清零、游标A→B→A停止、刷新成功保留不可得队列、翻页追加去重、重试不改分页边界、失败保留、slot恢复顺序、公共流/我的/搜索/详情/账户切换/首页连接不重查。
- `npm run build`退出0：70 modules，`dist/assets/index-DhRB2lJY.js` 341.77 kB/gzip106.83，CSS15.68 kB/gzip4.04，HTML0.94 kB/gzip0.52。
- 最终页面真实浏览器：2026-10-31T12:22:31.943Z，全新headless Chrome用户目录、未连接钱包、无注入夹具，经当前Vite页面和正常history客户端只读Devnet。首页读回3条、2作者（Aq7g…4yG2一条，Hs1N…k31S两条），无“示例留言”标签、无读取错误，`本次扫描候选3条`；刷新后仍3条，加载更多到源末尾后仍3条且扫描数保持3。
- 逐条打开3条详情：均为真实正文，时间分别为2026-10-30 11:46/11:24/11:23，slot 516644546/516639135/516638664，实际费用均80000 lamports（0.00008 SOL，标注Devnet），签名为BiMx…Rox/4koz…DXE/5yCs…TnJ；Explorer链接均为官方域名、`cluster=devnet`、`target=_blank`、`rel=noopener noreferrer`。返回后3条仍在。
- 刷新时`aria-busy=true`，完成后仍3条、无错误；点击加载更多时`aria-busy=true`，随后显示“已到达本次可读取范围的末尾”，无翻页错误、无重复。
- 响应式实测（Chrome设备指标模拟，不是真机）：320×800 client/scroll305/305、390×844 390/390、768×1024 768/768、1440×900 1440/1440、844×390 829/829，均无横向溢出；详情按钮44×44，刷新56×44。搜索弹层无横向溢出，输入字号16px，标注“当前范围：公共留言”和“不请求额外 RPC，不是全链搜索”。
- 语言/主题：English、繁體中文、简体中文实际切换且3条仍在；浅色主题切换后3条仍在。CDP Runtime/Log应用异常为空；Chrome进程日志仅有macOS CVDisplayLink与Crashpad平台噪声，不是应用异常。完整机器可读证据见[evidence/review-3.2-browser.json](evidence/review-3.2-browser.json)。
- 未验证：真实钱包连接/切账户/断开下的个人历史（本轮只做未连接公共流真实读取，账户隔离由App假钱包集成测试覆盖）；真实RPC 429/不可得签名重试与游标循环（注入测试覆盖）；真实手机、软键盘、安全区、字体放大；主网/签名/发送。开发服务器、headless Chrome与临时探针已停止/清理。等待Codex复审，2.2继续关闭。

## 2026-10-31：Sprint3.1最终独立复审通过

- typecheck退出0；6文件107项测试通过；build输出/tmp/said-review-3.1-final-dist，67 modules，JS312.93 kB/gzip98.67、CSS13.66 kB/gzip3.67；git diff --check通过。
- 额外8组独立断言覆盖上轮剩余genesis/列表迟到拒绝、两个入口genesis取消零后续派发、header范围/标记角色、原始尾游标/无进展/去重和作者查询参数，全部通过；R1/R2/R3关闭。
- 独立公网：正式history模块新进程无缓存，两页(pageSize=2)读回2+1条、2作者，filtered=0、unavailable=[]，实际费用均80000 lamports。记录时刻2026-10-31T11:46:27.266Z，见[evidence/review-3.1-devnet.json](evidence/review-3.1-devnet.json)。未签名或广播。
- 个人历史公网查询结果沿用Cline交付，本轮Codex另用注入RPC断言作者地址/游标/页大小/commitment，不冒称重跑所有作者历史或真机验收。
- 本轮Codex改复审/工单/说明文档；提交前仅机械清理history.test.ts及REVIEW-3.1.md末尾空行，不改产品源码或测试逻辑。最终暂存区diff检查覆盖未跟踪文件；3.2工单已准备但未实现，2.2签名/发送继续关闭。

## 2026-10-31：Sprint3.1 R1/R2/R3修复后二审

- 独立typecheck、6文件100项测试、build（/tmp/said-review-3.1-r123-dist）及diff检查通过；已确认详情取消/单笔timeout隔离、畸形解析封装和多数严格校验、超量/坏候选保护生效。
- 仍复现：genesis或列表单RPC超时后迟到成功被接受，genesis中取消后仍派发列表；header只读计数999或将标记设为只读仍被解析；原始页[A,B,A]返回去重尾B，before=A时绕过无进展检查。
- 结论暂不通过，只收尾这三处。REVIEW-3.1-RESULT末尾二审节与CLINE-NEXT为当前修复入口；不重写已通过部分。Codex未改源码/测试，未提交推送，真实RPC结果仍为Cline交付证据。

## 2026-10-31：Sprint3.1独立复审暂不通过

- Codex实际重跑typecheck、6文件88项测试、build（/tmp/said-review-3.1-dist）、git diff --check全部通过；构建67 modules，JS312.93 kB/gzip98.67、CSS13.66 kB/gzip3.67。
- 独立定向复现：caller已取消/整操作超时后详情仍返回成功；单笔详情timeout导致整页失败；非法base58解析异常使正常同页消息一并丢失；畸形header/索引/ALT、负bigint及孤立代理项被误收；before无进展未报错；pageSize=1的超量RPC响应发起21次详情；坏签名列表静默变成无法前进的结果。
- 结论暂不通过，限定修复R1/R2/R3，见[REVIEW-3.1-RESULT.md](REVIEW-3.1-RESULT.md)；3.2与2.2继续关闭。Codex只改复审/交接文档，未改产品源码和测试、未提交推送部署。
- 真实Devnet读取沿用Cline交付证据，未冒称本轮独立重跑；本轮定向复现使用公开交易夹具与注入RPC，不是真机验收。

## 2026-10-31：Sprint3.1工单准备的只读前检

- 新进程直接调用官方Devnet RPC，genesis正确；查询标记地址候选10条上限，实际返回3条，逐笔查询3条；共5次RPC，无签名、发送或主网。
- 使用原阶段0实验解析器（不是尚未实现的产品history模块）确认3条有效留言、2作者，getTransaction均非null。作者Aq7g…4yG2一条，Hs1N…k31S两条，3条实际费用均80000 lamports。检查时刻2026-10-31T07:29:23.533Z，slot分别516644546/516639135/516638664。
- 此证据仅说明旧交易目前可作真实只读验收样本，不表示3.1实现、分页、错误恢复或个人历史读取已通过；新模块仍须Cline实现后独立验证。
- 本轮改动仅开发工单和入口/状态文档，不重复运行产品测试。文档链接、diff和提交推送结果以本轮实际检查为准，原73项通过保留为历史证据。

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

## 2026-10-31：Sprint 3.1 历史解析与分页核心

- 新增 `src/history.ts`（严格解析、公共/作者分页、显式重试、有界并发与超时）与 `src/history.test.ts`；公开真实夹具 `src/fixtures/real-wallet-transaction.json`。未接 UI，未改钱包/网络/模拟/依赖。
- 自动检查：typecheck 退出0；npm test 6文件88项通过（wallet18/network11/message11/simulation13/history15/App20）；build 退出0，67 modules，JS312.93 kB/gzip98.67，CSS13.66 kB/gzip3.67；git diff --check 退出0。
- 真实 Devnet 只读核验：板级 pageSize=2 两页共 3 条、2 作者；同文不同签名不合并；两位作者独立查询成功（Aq7g…1条、Hs1N…1条并保留4条429不可得）；实际费用80000 lamports。
- 未验证：UI 接入、真机/浏览器、3.2 跨页合并与状态隔离、限流恢复等；未签名/发送，未提交/推送/部署。详见 [REVIEW-3.1.md](REVIEW-3.1.md)。

## 2026-10-31：Sprint 3.1 R1/R2/R3复审修复

- R1 取消/整操作超时贯穿详情池，预取消零RPC，详情中取消/超时终止且不接收迟到成功；单笔详情超时按unavailable保留，其他有效消息正常返回。
- R1 二审剩余：genesis/list 单RPC超时后迟到成功拒绝；genesis/list阶段间取消检查；genesis中取消不派发列表/详情。
- R2 解析入口对unknown稳定返回，不再抛异常；补header/索引/ALT/负bigint/孤立代理项校验；畸形条目不拖垮同页有效消息。
- R2 二审剩余：header计数上限与静态账户数核对；零转账标记账户必须处于可写非签名区域。
- R3 候选列表超limit在详情前失败；无效候选行显式报错；before==nextCursor报无进展；空页才sourceExhausted。
- R3 二审剩余：nextCursor取原始页尾签名，去重只影响详情请求与消息输出。
- 自动检查：typecheck 退出0；npm test 6文件107项通过（history34）；build 退出0，67 modules，JS312.93/gzip98.67，CSS13.66/gzip3.67；git diff --check 退出0。
- 修复后真实 Devnet 板级 pageSize=2 探针：2条有效留言、2作者、同文不同签名、费用80000 lamports；scanned2/filtered0/unavailable[]。
- 未签名/发送，未提交/推送/部署；3.2 与 2.2 继续关闭。详见 [REVIEW-3.1.md](REVIEW-3.1.md)。

## 2026-10-31：Sprint 2.2A 发布核心交付

- 新增 `src/publisher.ts`/`publisher.test.ts`；`src/wallet.ts` 增加 `getSigningSession()` 与可失效 revision；`src/simulation.ts` 返回同一笔待签 wire/message。页面未接入 publisher，未改发布 UI。
- 实际自动检查：`npx tsc -b --pretty false` 退出0；`npm run typecheck` 退出0；`npx vitest run` 8文件205项通过（publisher 62、wallet 29、message 11、simulation 13、network 11、history 34、App 27、historyFeed 18）；`npm run build` 退出0（70 modules，JS 344.44 kB/gzip 107.59 kB，CSS 15.68 kB/gzip 4.04 kB）；`git diff --check` 退出0。
- 针对性覆盖：待签字节篡改/伪造拒绝；单输出/真实 Ed25519/换私钥/全零/尾随字节/超长/非 Uint8Array/零或两条输出；genesis/费用/高度/会话前后失效；连点与取消；回执先落盘、写入失败零广播、并发同签名只广播一次、响应丢失/不一致保留原签名；processed 不升级、429/空状态/过期待确认、恢复零钱包零广播、读回作者核对；回执10条上限与逐字段校验，损坏回执在 check/confirm/readBack 前被拒。
- 真实只读核验：Devnet `getGenesisHash` 返回固定值；历史签名 `4kozshro…McDXE` 的 `getSignatureStatuses(searchTransactionHistory=true)` 为 finalized/err=null；confirmed 高度读取成功。未签名、未发送、未部署、未提交。
- 未验证如实保留：真实 Phantom/Bitget/OKX `signTransaction`、真实 `sendTransaction`/确认/读回、浏览器 WebCrypto Ed25519、真实429/超时/响应丢失、2.2B UI、真机键盘/安全区。A 通过不代表 B 或整个 2.2 验收。详见 [REVIEW-2.2A.md](REVIEW-2.2A.md)。

## 2026-10-31：Sprint 2.2工单准备（仅文档）

- 前置状态：3.2已复审通过并上传6b084d9；132项测试及既有浏览器证据是上轮结果，本次不重复声明为新执行。
- 核对当前wallet/message/simulation/history接口、安装的Kit 8.6.0导出/类型与官方Wallet Standard及Solana发送/确认资料，形成[SPRINT-2.2.md](SPRINT-2.2.md)。接口存在性与文档核对不构成签名、发送或真机兼容证据。
- 分A核心与注入测试、B页面与持有者Devnet验收；两段均未实施。当前未调用钱包签名、未广播交易、未部署或启动新公网入口，未修改产品源码或依赖。
- 文档检查：本轮10个新增/修改文档及规则文件的40个相对链接均可解析，含未跟踪新工单的EOF/行尾空白扫描无问题，git diff --check退出0；差异仅文档。纯文档变更未重跑产品测试，最终暂存差异同样执行空白检查。
- 真实钱包个人历史/切账户、真实429恢复、真机键盘/安全区等既有未验证项保留；不得据此工单把它们标为通过。

## 2026-10-31：Codex独立复审2.2A，暂不通过

- 独立typecheck退出0、8文件205项既有测试通过；build指定/tmp/said-review-2.2A-dist后退出0，70 modules、index-tJ58LKdO.js344.44 kB/gzip107.59，CSS15.68 kB/gzip4.04；diff检查退出0。首次默认dist受沙箱权限阻止，非产品编译错误。
- 临时复用注入夹具新增9项独立契约断言，9项失败，复现R1–R5：同帧签名两次钱包调用；send未按期限结束、迟到genesis仍签名、迟到状态变confirmed、35ms确认预算实际70ms；确认成功回执仍submitting；features-only撤销能力无效、未知2.0.0版本可签；孤立代理项可prepare。
- 原205项测试通过与独立9项失败分开记录，未改产品实现/既有测试，没有真实钱包签名或广播。机器证据见[evidence/review-2.2A-codex-probes.json](evidence/review-2.2A-codex-probes.json)，限定修复见[REVIEW-2.2A-RESULT.md](REVIEW-2.2A-RESULT.md)。
- 2.2A未关闭，B仍关闭。真实浏览器Ed25519、真实钱包/真实网络故障和真机项未验证；不提交推送未通过的交付。构建缓存tsconfig.tsbuildinfo不应作为源码提交。

## 2026-10-31：2.2A独立二审

独立typecheck/239项项目测试/临时目录build/diff通过，构建index-BrnMhRVn.js345.92 kB/gzip108.09；上轮原样9项独立断言全部通过。R1/R2/R5关闭。新组合探针发现：processed+err被failed落盘、confirmed缺err被成功落盘；发过features事件后再静默替换实时表仍沿用旧会话。另记录同对象账户能力原地撤销的防御观察，不单独扩展范围。证据见[evidence/review-2.2A-codex-second-probes.json](evidence/review-2.2A-codex-second-probes.json)。仅修[二审剩余R3/R4](REVIEW-2.2A-RESULT.md)，A暂不通过、B关闭。全部是Node注入，无真实签名/发送或浏览器/真机验收，Codex未改产品实现或既有测试，未提交推送。

## 2026-11-01：2.2A最终独立复审通过

独立typecheck退出0，8文件252项测试通过；build输出/tmp/said-review-2.2A-final-dist成功，70 modules、index-Byps-RCq.js346.16 kB/gzip108.13、CSS15.68 kB/gzip4.04；diff检查退出0。前两轮原样9+4项断言全通过，另3项组合（processed错误→confirmed、能力事件一致→准备签名零广播、真实store11笔注入成功后的容量）通过，共16项。证据：[review-2.2A-codex-final-probes.json](evidence/review-2.2A-codex-final-probes.json)。R1–R5全部关闭，未改产品/既有测试逻辑。只涉及Node注入，不冒充真实钱包/浏览器验签/真机验收，B未开始，产品签名/发送仍关闭。
