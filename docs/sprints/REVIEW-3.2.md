> 历史归档：2026-11-01迁入。原日期、级别与复审结论仅作历史记录，不是当前发布闸门；当前以[STATUS](../../STATUS.md)、[DECISIONS](../../DECISIONS.md)及根目录规则为准。

# Said：Sprint 3.2 交付与复审记录

日期：2026-10-31
状态：Cline完成R1/R2修复，**Codex已独立复审通过**，见[最新结论](REVIEW-3.2-RESULT.md)。下文保留各轮交付与修复证据；本次允许保存GitHub检查点，未部署、未进入2.2。
基线：`7e2d5d9`（工作区含本轮修改和新文件）。
约束：保留已复审的 `history.ts` 读取核心、2.1 未签名模拟和已确认视觉；没有新增签名/发送、主网、后台、数据库或依赖。

## 范围

本单把既有的真实 Devnet 历史读取接入产品界面：未连接也可读公共板级流；连接后按当前完整公钥独立查询“我的留言”；当前范围已加载内容可搜索；详情复用内存记录并给出可核验字段与 Devnet Explorer 链接；支持显式分页、刷新和不可得签名重试。原先明确标注的示例流不再进入首页、搜索或详情路径；编辑预览保持本地模拟并继续标注“未上链”。

## 主要实现

### `src/historyFeed.ts`（新）

- 状态字段：`phase`（disabled/loading/ready/error）、去重后的 `messages`、`unavailable`、`nextCursor`、`exhausted`、`scanned`、`busy`（initial/refresh/more/retry）、`error`、`actionError`、`loopStopped`、`hasMore`。
- 范围键：`board` 或 `author:<完整公钥>`。渲染时立即按 key 派生正确范围的状态；范围变化首帧即显示空内容/新 loading，不等待 effect。请求 generation 与 AbortController 同时隔离旧回调，迟到成功、错误与 finally 均不能覆盖新范围。卸载或 effect 重建时取消 hook 当前拥有的 controller（含最新手动刷新/翻页/重试），cleanup 先于新 effect 执行，不误取消新范围/新挂载请求。
- 解锁条件：同一 generation 且同一 action 序号；旧请求的 finally 不能释放新请求锁，连点刷新/翻页/重试只发一次。
- 初次读取：失败进入整体 error 并保留重试入口，不显示空历史；成功后记录本页 `scanned`/`filtered` 并合并本页不可得项；`scanned` 跨页累计，刷新成功后从新首页重置。
- 加载更多：保持已有内容，失败保留原 `nextCursor` 与错误，重试从原边界继续；按签名去重并按 slot 新到旧稳定合并，已显示同 slot 相对顺序和 RPC 页内顺序不变；本页已验证消息统一核销对应不可得签名，其余未解决项保留。整页被过滤但仍有 cursor 时提示可继续，不能显示成“全部读完”。
- 刷新：保留旧内容直到成功；成功后重置消息/游标/扫描数，但把**尚未解决**的不可得签名带入新结果；返回消息及刷新前已验证记录统一核销对应不可得项，避免同一签名同时显示为有效和待重试；失败保留旧内容、旧游标和旧队列，不伪造空历史。
- 游标保护：记录已见 cursor；A→B→A 循环时明确 `loopStopped`，不无限翻页。源结束与“仍有不可得项”分开显示。
- 重试不可得：按队列最多 20 个；成功恢复记录与后续分页统一按 slot 新到旧稳定合并，同 slot 保持已显示顺序与页内顺序；已验证消息核销对应不可得项，本批未返回消息/原因的明确无效候选可移除，真正未解决项保留；重试结果不覆盖分页 cursor、`exhausted` 或扫描数；失败保留整批队列。
- 公共首页 feed 与作者 feed 独立；作者 feed 只在已连接且进入“我的”时启用，未连接不请求、不复用公共首页结果。

### `src/HistoryViews.tsx`（新）

- 卡片沿用现有公共流布局：作者短公钥、`title` 完整公钥、纯文本正文、Devnet 链上徽标、44×44 详情按钮。
- 顶部明确“链上留言 · Devnet 只读”和范围说明，并提供刷新；区分初次读取、空范围、全过滤页、源末尾、整体错误、刷新/翻页错误。
- 不可得项单独面板：显示数量、可展开的签名与原因、显式重试；失败文案明确“未解决签名已保留”。
- 详情展示完整作者、纯文本正文、`slot`（明确非区块高度）、`blockTime`（未知时不伪造）、实际 `feeLamports` 与对应 SOL、完整交易签名，以及仅由固定官方域名生成的 Devnet Explorer 链接（`target=_blank`、`rel=noopener noreferrer`）。详情不重新请求 RPC。
- 搜索只过滤当前 feed 已加载的真实记录（正文与作者公钥），显示当前范围与已加载条数，明确“不请求额外 RPC，不是全链搜索”；开详情/返回不清空分页和不可得队列。

### 应用接入

- 首页挂载公共 feed；已连接进入“我的”时启用作者 feed；未连接该页只提示连接，不显示其他账户残留，也不发作者查询。
- 编辑预览仍由 `PreviewEditor` 提供，草稿与本地预览行为不变；App 中不可达的旧 `PreviewDetail` 产品分支已移除，`Preview.tsx` 的样例导出未删除，便于保留测试样例，但首页/搜索/详情没有样例数据兜底。
- 切账户时作者 feed 首帧由范围键同步隔离；详情/搜索记录打开时的账户，并在渲染时校验，旧账户弹层在切换首帧即不渲染，应用层随后清空旧状态、查询并取消旧范围请求。主题/语言变化、连接/切钱包不会重查公共板级流。
- `src/i18n.ts` 补齐 zh-CN、zh-TW、en 三套文案；`src/styles.css` 增加 feed、不可得面板、详情、错误和移动端布局样式。

## 复审限定修复（R1/R2）

- R1：原有 cleanup 只取消初次读取 controller，手动 refresh/loadMore/retryUnavailable 替换 `abortRef` 后，卸载时实际在途信号未取消。修复为 cleanup 取消 hook 当前拥有的 controller，并在同一处使 generation 失效；范围切换仍先取消旧手动请求，新 effect 在 cleanup 之后建立自己的 controller，不误取消新范围请求。
- R1 回归先实际失败：三个手动操作 pending 时 unmount，传入客户端的 `signal.aborted` 均为 false；修复后均为 true。随后让 provider 忽略取消、迟到 resolve/reject，渲染次数不再增加；另覆盖旧范围手动刷新 pending 时切到 author，旧信号取消、迟到结果不写入新范围、新范围 loading 期间不能再发请求。
- R2：`loadMore` 原先把新页追加到尾部，用户刷新后先重试恢复更旧记录时会产生 `[120,70,110]`。修复为统一按 slot 新到旧稳定合并：保持已显示同 slot 相对顺序和页内顺序，仍按 signature 去重；刷新、翻页、重试都通过已合并消息核销对应不可得签名，只删除真正已验证的项。
- R2 回归先实际失败：`[120,70]` 后加载 110 得到 `[120,70,110]`；重叠页已成功返回的 U 仍留在 unavailable。修复后分别为 `[120,110,70]` 和只保留未解决项；另覆盖恢复记录后连续两页加载、同 slot 稳定、相同正文不同签名仍是两条，以及刷新返回已验证消息时同时核销旧队列与本页重复不可得项。
- 因合并语义从“请求顺序追加”改为“slot 稳定合并”，既有两项分页断言由 `[A,B]` 更新为 `[B,A]`（B 的 slot 更新），并加注释说明业务变化，不删除断言或测试。


| 工单要求 | 实现/证据 |
| --- | --- |
| 公共流真实记录、无缓存 | 未连接全新浏览器首屏读回 3 条真实 Devnet 留言；无“示例留言”标签 |
| “我的”独立查询 | App 假钱包集成测试断言作者完整公钥与 `null` cursor；未连接不发作者请求 |
| 当前范围搜索 | 只过滤 feed 已加载数组，组件测试断言 `readPage` 调用数不增加 |
| 详情字段与安全链接 | 浏览器逐条核对 3 条详情；测试覆盖纯文本、未知时间、slot、实际费用、官方域名/rel |
| 分页/游标循环 | hook 测试覆盖去重、全过滤页、A→B→A 停止；浏览器点击加载更多到源末尾 |
| 刷新保留与失败 | hook 测试覆盖成功保留旧不可得队列、失败保留旧内容/游标 |
| 不可得重试 | hook 测试覆盖最多 20 个、失败保留整批、恢复顺序、不覆盖分页 |
| R1 卸载取消 | 三个手动操作 pending 时 unmount 均断言 `signal.aborted=true`，迟到 resolve/reject 不回写；范围切换取消旧手动请求 |
| R2 合并/核销 | 刷新→恢复旧记录→加载中间页按 slot 稳定排序；重叠成功签名从队列移除、其他项保留；同文不同签名不合并 |
| 账户首帧隔离 | hook 测试断言 rerender 首帧清空；App 测试覆盖切账户关闭旧详情/搜索，详情/搜索弹层按打开时账户渲染校验 |
| 无签名/发送/部署 | 本轮只读 RPC；未新增相关入口、依赖或网络服务 |

## 变更文件

新增：

- `src/historyFeed.ts`：范围隔离、竞态锁、分页/刷新/不可得队列/游标循环状态机。
- `src/HistoryViews.tsx`：公共/作者 feed 视图、搜索、不可得面板和详情。
- `src/historyFeed.test.tsx`：18 项 hook 回归（R1/R2 新增 8 项；其中 6 项在修复前实际失败，另含范围切换与刷新核销边界）。
- `docs/evidence/review-3.2-browser.json`：最终页面机器可读只读证据。
- 本文件与 README/README.en、DECISIONS、ROADMAP、VALIDATION 的本轮记录。

修改：

- `src/App.tsx`：接入公共/作者 feed、搜索/详情、账户切换隔离；移除不可达的样例详情分支。编辑预览入口保留。
- `src/App.test.tsx`：新增/扩展 3.2 集成回归，含“首页连接并切换钱包不重查公共历史”。
- `src/i18n.ts`、`src/styles.css`：三语文案与 feed/详情/错误/响应式样式。

未改：`src/history.ts`、`src/wallet.ts`、`src/network.ts`、`src/message.ts`、`src/simulation.ts`、`src/Preview.tsx`、依赖与 lockfile。

## 自动验证

本轮最终代码实际执行：

```text
npm run typecheck                                exit 0
npm test                                         7 files / 132 tests passed
npm run build                                    exit 0, 70 modules
git diff --check                                 exit 0
```

构建产物：`dist/assets/index-DqHusx3n.js` 341.90 kB（gzip 106.85），CSS 15.68 kB（gzip 4.04），HTML 0.94 kB（gzip 0.52）。测试分布：wallet 18、message 11、simulation 13、network 11、history 34、App 27、historyFeed 18。

3.2 回归重点：

- feed 范围切换首帧无旧内容；旧范围迟到 resolve/reject 和 finally 不改变新范围；刷新/翻页/重试连点只发一次；旧锁不释放新锁；三个手动操作在卸载时当前 signal 立即取消，迟到结果不回写。
- 刷新成功重置消息/游标并保留旧不可得队列；刷新失败保留旧内容/游标；翻页失败从原 cursor 重试；整过滤页仍可继续；A→B→A 明确停止。
- 翻页/重试/刷新统一按 slot 稳定合并并核销已验证不可得项；刷新后先恢复旧记录再加载中间页保持新到旧；同 slot 已显示顺序和页内顺序稳定；跨页累计本次已扫描候选，空末页不把已扫描数显示成 0；重试最多 20 个、失败保留整批、不覆盖分页边界。
- App 真实历史客户端仅被替换为 mock：公共流无钱包自动读取；未连接“我的”不发作者请求；按当前完整公钥独立查询；切账户首帧清空旧作者内容并加载新账户；搜索不增加 RPC；详情纯文本/未知时间/slot/费用/签名/Explorer 属性；首页连接并切钱包不重查公共流。

## 真实浏览器只读验证

设置：R1/R2 修复后的最终源码、`npm run dev`、全新 headless Chrome 用户目录、未连接钱包、无注入夹具；通过页面正常 history 客户端访问 Devnet。时刻 `2026-10-31T12:38:22.826Z`（构建 `index-DqHusx3n.js`），完整数据见 `docs/evidence/review-3.2-browser.json`。

- 首屏：`链上留言 · Devnet 只读`，3 条真实记录、2 位作者（Aq7g…4yG2 1 条，Hs1N…k31S 2 条）；无“示例留言 · 未上链”，无读取错误；`本次扫描候选 3 条`，有“加载更多”。
- 逐条详情：正文均为 `阶段0验证：你好，Solana 🚀`；时间 2026-10-30 11:46/11:24/11:23；slot 516644546/516639135/516638664；实际费用均 80000 lamports = 0.00008 SOL，标注 Devnet；签名为 BiMx…Rox / 4koz…DXE / 5yCs…TnJ；三个 Explorer 链接均为 `https://explorer.solana.com/tx/<签名>?cluster=devnet`，`target=_blank`，`rel=noopener noreferrer`。返回后列表仍为 3 条。
- 刷新：点击后 `aria-busy=true`，完成后 3 条、无错误，扫描候选仍 3 条。加载更多：点击后 `aria-busy=true`，完成后 3 条、无动作错误，显示“已到达本次可读取范围的末尾”，按钮消失且无重复；空末页后扫描候选仍显示 3 条，不被清零。
- 响应式（设备指标模拟，非真机）：320×800 client/scroll 305/305、390×844 390/390、768×1024 768/768、1440×900 1440/1440、844×390 829/829，均无横向溢出；详情按钮 44×44，刷新 56×44。
- 搜索：输入 16px，弹层无横向溢出；范围“公共留言”，提示“仅过滤当前范围已加载的 3 条真实记录（正文与作者公钥），不请求额外 RPC，不是全链搜索”。
- 语言/主题：English、繁體中文、简体中文实际切换，3 条记录均保留；切到浅色主题后 3 条保留。
- CDP Runtime/Log 的页面异常为空。Chrome 进程日志仅有 macOS CVDisplayLink/Crashpad 平台噪声，不是应用异常。
- 开发服务器、headless Chrome、临时探针均已停止；未保留临时 profile 到仓库。

## 未验证 / 边界

- 本轮浏览器只验证未连接公共流；真实钱包连接后的作者历史、真实钱包切账户/断开未在本轮浏览器操作中验证。账户隔离由 App 假钱包集成测试覆盖，不能替代真机。
- 真实公共 RPC 的 429、单笔不可得重试、恢复合并和游标循环未在真实网络构造；由注入 RPC/假客户端测试覆盖。
- 真实 iPhone/Android 钱包内置浏览器、软键盘、安全区、字体放大、横屏输入未验证；Chrome 设备模拟不能替代真机。
- 搜索是当前已加载范围过滤，不是全链搜索；范围为空/加载中时可能只显示“未加载任何记录可搜索”，不声称链上没有留言。
- `blockTime` 按浏览器本地时区格式化；`null` 显示“时间未知”，不伪造时间。
- 主网、签名、发送、部署均未执行；2.2 继续关闭。

## 停点

Cline 不提交、不推送、不进入 2.2，等待 Codex 再审。复审建议重点检查：R1 cleanup 是否只取消当前 hook 拥有的 controller、是否误取消新范围/新挂载；R2 `mergeBySlot`/`reconcileUnavailable` 的 slot 稳定顺序、签名去重、重试批次移除与 refresh 保留语义；`history.ts` 未改动的假设、App 账户/弹层首帧隔离、无样例兜底和无签名路径。
