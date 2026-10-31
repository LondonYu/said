# Said：Sprint 3.1 Devnet 历史解析与分页读取核心交付记录

日期：2026-10-31。执行者：Cline；审查：Codex已独立复审通过，R1/R2/R3关闭，见[最新审查结论](REVIEW-3.1-RESULT.md)。下文按轮次保留交付与修复记录；本实现未接UI、未签名/发送。

## 范围
- 只实现 `src/history.ts` 及回归，不接首页，不将示例流换成链上结果。3.2 界面接入另行拆单，2.2 签名/发送继续关闭。
- 复用 `DEVNET_RPC_URL`、`DEVNET_GENESIS_HASH` 与 `message.ts` 的公开程序/标记/协议常量；不新增依赖、后台、数据库或部署。

## 新增/修改
- 新增 `src/history.ts`：严格解析 `getTransaction(json)`、`getSignaturesForAddress` 候选验证、公共/作者分页读取、显式重试。
- 新增 `src/history.test.ts`、`src/fixtures/real-wallet-transaction.json`（阶段0公开真实夹具）。
- 修改 `tsconfig.json`：新增 `resolveJsonModule`，仅用于测试 JSON 夹具。
- 未改 App/Preview/styles/wallet/network/message/simulation 及 package-lock。

## 解析契约
- 只接受 `version=0`、`meta` 存在且 `err=null`、查询签名与 `transaction.signatures[0]` 一致。
- 唯一签名槽、签名 base58 解码 64 字节且非全零、header 恰一个 required signer；作者取静态账户首个付款签名者，不取 JSON 自报作者或日志文本。
- 静态地址必须包含作者、板级标记、System、Memo4，且按需包含 ComputeBudget；不支持 ALT 地址表/legacy/多签/其他版本。
- 允许零至两条前置 ComputeBudget 指令（SetComputeUnitLimit/SetComputeUnitPrice），不允许重复或未知布局。
- System 指令必须是 12 字节 `Transfer` 且金额精确 0，两个账户；Memo4 必须引用付款作者签名账户；Memo 数据 base58 解码、严格 UTF-8、严格四字段 JSON、≤1024 字节、复用 140 grapheme/560 UTF-8 字节/非空白规则。
- 输出 `signature/author/text/slot/blockTime/feeLamports`；slot/fee 用 bigint，blockTime 允许 null，不伪造时间。

## 读取接口与预算
- `createHistoryClient(rpc?, options?)` 注入最小 `HistoryRpc`；`readPage(scope, before?, signal?, pageSize?)`，默认 10 条、硬上限 20，交易详情并发固定 2。
- `retrySignatures(signatures, scope, signal?)` 对不可得签名显式重试，最多 20 个唯一签名，复用同一解析器与作者范围。
- 每次 readPage/retry 先校验 Devnet genesis；`confirmed`；每 RPC 10 秒、整操作 30 秒；取消/超时停止后续派发并中止页面等待。
- genesis 或签名列表失败抛出操作错误；单笔 getTransaction null/RPC 失败进入 `unavailable`，明确失败进入 `filtered`，不伪装成空历史。
- `nextCursor` 取原始候选页最后一个有效签名；空候选页才 `sourceExhausted=true`，预算未尽/结果少/解析后空不等于全部读完。

## 自动检查
- `npm run typecheck`：退出0。
- `npm test`：6 个文件、88 项通过（wallet 18，network 11，message 11，simulation 13，history 15，App 20）。
- `npm run build`：退出0，67 modules；`index-BJFaEPRJ.js` 312.93 kB/gzip98.67，CSS13.66 kB/gzip3.67。
- `git diff --check`：退出0。

## 真实 Devnet 只读核验（新模块、无缓存）
- `pageSize=2` 板级第一页：2 条有效留言，作者分别为 `Aq7gd87cm9rwjuDeV17R1dwyP8DnvMbG3RkzM9T14yG2` 与 `Hs1NxWYZdXE6opzTY1wR9XCbq2QtNwrGdkWgSMeWk31S`，正文相同但签名不同，不合并。
- 第二页：1 条有效留言（Hs1N…），实现真实翻页。
- 独立作者查询：Aq7g… 返回 1 条；Hs1N… 返回 1 条并记录 4 条 `HTTP error (429)` 不可得签名；未把 429 当作“没有留言”。
- 实际费用均为 `80000` lamports；slot/blockTime 来自 RPC，未硬编码。

## 未验证 / 兼容限制
- 未接 UI、未做浏览器/真机验收；3.2 的跨页合并、状态隔离、刷新、详情、部分历史不可得重试等未实现。
- 429 限流不可得签名保留，可在下次重试恢复；Devnet 可能重置，不承诺永久可读。
- 未签名、未发送、未使用主网或真实资金。

## R1/R2/R3 复审修复（2026-10-31）

- R1：`caller`/整操作超时信号贯穿 genesis、列表、详情池与派发；预取消零 RPC；详情阶段取消/超时终止且忽略迟到成功；单笔详情超时按 `unavailable` 保留签名与其他有效消息，`retrySignatures` 同样覆盖。
- R1 二审剩余：genesis/list 单 RPC 超时后迟到成功被拒绝；genesis/list 之间增加取消检查；genesis 中取消不派发列表/详情。
- R2：`parseGuestbookTransaction` 对 unknown 稳定返回，不再抛异常；补 header 计数、指令索引范围、ALT 合法空数组、负 bigint、孤立代理项（well-formed Unicode）校验；非法 base58/畸形条目不拖垮同页其他消息。
- R2 二审剩余：header 计数上限与静态账户数核对；零转账标记账户必须处于可写非签名区域。
- R3：候选列表超过请求 `limit` 在详情前失败；无效候选行显式报错；`before == nextCursor` 报游标无进展；空页才 `sourceExhausted`。
- R3 二审剩余：`nextCursor` 取原始页尾签名，去重只影响详情请求与消息输出；`[A,B,A]` 边界与无进展检测覆盖。
- 修复后自动检查：typecheck 退出0；`npm test` 6文件107项通过（wallet18/network11/message11/simulation13/history34/App20）；build 退出0，67 modules，JS312.93 kB/gzip98.67，CSS13.66 kB/gzip3.67；`git diff --check` 退出0。
- 修复后真实 Devnet 板级 `pageSize=2` 探针：读回2条有效留言（Aq7g… 与 Hs1N…，同文不同签名，费用80000 lamports），`scanned=2/filtered=0/unavailable=[]`。
- 未签名、未发送、未提交/推送/部署；3.2 与 2.2 继续关闭。
