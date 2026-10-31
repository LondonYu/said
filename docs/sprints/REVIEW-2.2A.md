> 历史归档：2026-11-01迁入。原日期、级别与复审结论仅作历史记录，不是当前发布闸门；当前以[STATUS](../../STATUS.md)、[DECISIONS](../../DECISIONS.md)及根目录规则为准。

# Sprint 2.2A 交付记录：发布核心、签名校验与回执恢复

日期：2026-10-31。状态：**A 已实现并通过本地针对性验证，等待 Codex 独立复审。** B 页面接入、真实钱包签名、真实 `sendTransaction`、主网、后台、数据库与部署均未执行；产品界面仍没有发布入口。

Codex后续独立复审：**暂不通过，R1–R5待修复**。205项既有测试通过，但额外9项契约断言复现并发签名、超时/取消、回执结算、钱包能力与非法Unicode缺口。详见[最新复审及修复工单](REVIEW-2.2A-RESULT.md)；下文保留Cline原交付表述，不作为通过结论。

**2026-10-31更新：Cline已按R1–R5完成限定修复并补回归，工作区停交Codex复审；A尚未宣布通过，B继续关闭。修复后实际状态见文末第十节及[VALIDATION.md](VALIDATION.md)。**

## 范围与未做事项

- 新增 `src/publisher.ts` 与 `src/publisher.test.ts`；小幅扩展 `src/wallet.ts` 的签名会话能力、`src/simulation.ts` 的同一笔待签字节输出，并更新既有测试夹具。
- 未在 `App.tsx`、`HistoryViews.tsx` 或其他页面实例化 publisher；当前 UI 仍只做编辑预览和 2.1 未签名模拟。
- 未调用真实钱包 `signTransaction`，未调用真实 `sendTransaction`，未生成产品钱包或保存任何私密凭据。测试中的一次性 Ed25519 密钥只存在进程内存，测试结束即丢弃，没有写入源码、日志或夹具。
- 未新增依赖，继续使用 `@solana/kit` 8.6.0；未进入 2.2B。

## 一、钱包签名会话（`src/wallet.ts`）

- `WalletSnapshot.signing` 新增 `{ available, reason, revision }`；`WalletController.getSigningSession()` 返回当前唯一会话或 `null`。
- 会话绑定真正连接成功的 `Wallet` 对象、`WalletAccount` 对象、地址、32 字节公钥、明确 `solana:devnet` 链、`standard:signTransaction` 能力与支持交易版本，不按显示名重新查找钱包。
- 只有同时满足以下条件才生成可用会话：钱包声明 Devnet、存在签名特性、支持 v0、账户声明 Devnet、账户声明签名特性、公钥 32 字节且 Base58 编码等于 `address`。
- 连接开始、取消、断开、账户变化、钱包注销、控制器销毁、能力/链变化都会递增 `revision` 并使旧会话失效；同名不同 Wallet 对象不做身份合并。
- `sameAccountIdentity` 同时比较地址、公钥字节、chains 与 features；仅地址相同但能力变化时刷新会话 revision。
- 该能力只描述“当前账户可签名”，不表示钱包“当前网络”已经切换；界面仍以独立 RPC 的 Devnet genesis 为准。

## 二、准备快照与字节一致性（`publisher.prepare`）

- 输入当前会话和原文；先复核会话，再要求非空正文。
- 通过 `simulationClient.checkTransaction` 取得同一笔未签名交易的 `wireTransactionBase64`、`messageBase64`、大小、费用、余额、blockhash、`lastValidBlockHeight` 与高度。
- 拒绝付款者不一致、正文不一致、费用未知、余额不足、模拟错误、blockhash 已过期/高度不可得、缺字节或缺大小的结果。
- 用 `buildUnsignedGuestbookTransaction` 重建交易，逐项比较 wire Base64、message Base64 与字节长度；再解码确认 message 字节、唯一作者占位签名槽和全零占位签名。
- 返回冻结的 `PreparedPublication`，保留作者、原文、费用/余额、blockhash/有效高度、会话 revision、钱包名与时间戳。`validatePrepared` 在签名和提交前重复执行，并校验数值类型/范围、blockhash 长度与交易长度，因此伪造/拼接对象不能进入钱包。

## 三、签名与真实 Ed25519 验签（`publisher.sign`）

- 单实例同一时刻只允许一个底层钱包签名 Promise 在途；连点会直接拒绝，不并发弹窗。
- 签名前与钱包返回后均复核：
  - RPC `getGenesisHash` 必须等于固定 Devnet genesis；
  - `getBlockHeight` 不得超过准备快照的 `lastValidBlockHeight`；
  - `getFeeForMessage` 必须仍等于准备费用；
  - `getBalance` 必须足以支付该费用；
  - 会话/账户/能力仍为同一个对象，页面 signal 未取消。
- 钱包返回值按 `unknown` 校验：恰好一个输出、`Uint8Array`、长度 1..1232、可解码、重新编码后与原始字节完全一致（拒绝尾随字节/结构偏移）、messageBytes 与准备快照逐字节相同、只有一个作者签名槽、签名长度 64、非全零。
- 使用安装版 `@solana/kit` 的 `getPublicKeyFromAddress`、`signatureBytes` 与 `verifySignature` 做真实 Ed25519 验签；验签失败、API 不可用或异常都拒绝，不跳过验证。
- 钱包迟到结果在页面取消后丢弃；不因页面取消声称关闭钱包弹窗或撤销授权。`sign` 本身不发送任何交易。

## 四、提交、回执与不确定结果（`publisher.submit`）

- 提交前重新验签并核对 signed.author/sessionRevision 与准备快照一致。
- 同一签名已有回执时不重发；同一签名正在提交时拒绝。签名槽在任何异步复核前占位，避免并发点击各自通过检查后重复广播。
- 广播前再次完整复核 Devnet、原 blockhash 高度、费用、余额、会话与 signal。
- 在 `sendTransaction` 之前同步写入 `submitting` 回执；写盘失败直接中止，零广播。回执写盘后再复核一次，失败则标为 `not_sent` 并零广播。
- 只调用一次固定 Devnet `sendTransaction`，参数为 `encoding: 'base64'`、`skipPreflight: false`、`preflightCommitment: 'confirmed'`、`maxRetries: 2n`；不自动重建、不换 blockhash、不重复发送新交易。
- RPC 返回签名与本地从已验签 wire 计算出的签名不一致、超时、传输错误、取消或响应丢失时，保留原签名并标为 `uncertain`，不覆盖、不重发。
- 仅将可识别的预检拒绝映射为 `preflight_rejected`；无法可靠分类的错误保守处理为待确认。
- 返回的 `receipt` 反映本次已知终态；若回执二次写盘失败，则保留磁盘上的 `submitting`，更不掩盖。

## 五、回执存储契约

- 键：`said.publication-receipts.v1`，版本化 JSON 数组，最多 10 条。
- 字段仅：`version`、`chain`、`author`、`signature`、`blockhash`、`lastValidBlockHeight`（十进制字符串）、`createdAt`、`status`；不保存正文、草稿、unsigned/signed wire、钱包对象或秘密。
- 读取时逐条严格校验版本、Devnet、作者地址、64 字节签名、32 字节 blockhash、十进制高度、安全整数时间与状态枚举；损坏显式报错，不猜测或伪造成功。
- 新回执满 10 条时优先删除最旧终态；没有终态时拒绝静默覆盖未解决记录。
- localStorage 读取、写入或隐私模式不可用都转为可控错误；默认 storage 在访问时才解析，避免 getter 抛错造成白屏。

## 六、确认、恢复与读回

- `check`、`confirm`、`readBack` 先把回执当作未受信输入重新校验；损坏字段显式拒绝且不发 RPC。
- `check(receipt)` 只用原签名 `getSignatureStatuses([sig], { searchTransactionHistory: true })`：
  - `confirmed`/`finalized` 且 `err=null` 才返回对应确认；
  - 有错误返回 `failed` 并保留错误对象；
  - `processed`、空状态、查询失败、高度查询失败保持 `pending`；
  - 仅在高度严格超过原始 `lastValidBlockHeight` 且未找到状态时返回 `expired`，不把它写成“从未执行”。
- `confirm` 受 `maxRounds`（默认 10，至少 1）、`intervalMs`（默认 3000）和 `totalTimeoutMs`（默认 45000）约束；终态/失败/过期即停止，不创建永久轮询。
- `recover()` 只读取本地回执并查询链上状态；不访问钱包、不签名、不调用 send，不信任存储中的成功状态作为本轮证据。
- `readBack(receipt)` 通过现有 history 客户端按原签名重试读取，校验消息签名与作者一致；不可得时显式返回 `unavailable` 与原因，不把当前草稿塞作结果。

## 七、测试与调用次数证据

新增/更新后实际执行：

- `npx tsc -b --pretty false`：退出 0。
- `npx vitest run`：8 个测试文件、**205 项通过**；其中 publisher 62 项、wallet 29 项。
- `npm run typecheck`：退出 0。
- `npm run build`：退出 0，70 modules，JS 344.44 kB（gzip 107.59 kB），CSS 15.68 kB（gzip 4.04 kB）。
- `git diff --check`：退出 0（文档更新后再次执行）。

publisher 测试覆盖的注入边界：

- 准备：字节/费用/高度摘要保留；模拟返回被替换/篡改时拒绝；模拟期间会话失效拒绝；伪造准备对象及非 bigint 高度、负费用、非整数长度、无效 blockhash 均不能进入钱包。
- 签名：注入钱包真实签名通过 Ed25519；换消息、换私钥、全零签名、尾随字节、非 `Uint8Array`、超长字节、零/两条输出均拒绝；连点仅一次钱包调用；取消等待后迟到签名不发送；返回后会话变化拒绝；签名前 genesis/费用异常不调用钱包；返回后 blockhash 过期丢弃且不发送。
- 提交：回执先于 send 落盘、失败零广播；一次尝试一次 send（包括并发提交只广播一次）；广播前费用变化拒绝；回执后会话失效标 `not_sent` 零广播；响应丢失/取消/返回不同签名均保留原签名标 `uncertain`；预检拒绝单列；未知传输错误不自动重试。
- 确认/恢复/读回：`processed`/空状态不升级；`confirmed`/`finalized` 与错误分开；高度过期保留原签名；429/超时保持待确认；轮询有界；恢复零钱包零广播；读回作者核对与暂不可用显式返回；损坏回执在 check/confirm/readBack 前被拒绝且不发 RPC。
- 回执：固定键、版本化数组、逐字段校验、10 条上限、终态优先清理、未解决满额拒绝、读写异常可控。

## 八、真实只读核验（未写入）

本轮仅调用 Devnet 公共只读方法，未签名、未广播：

- `getGenesisHash` 返回 `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`，与仓库固定 Devnet 值一致。
- 用 3.1 公开真实夹具中的签名 `4kozshro…McDXE` 调用 `getSignatureStatuses`（`searchTransactionHistory=true`），返回 `confirmationStatus: "finalized"`、`err: null`、slot 516639135。
- `getBlockHeight`（confirmed）返回 504331612。

这些只证明公开 RPC 的读取形状与固定 genesis，不证明 `sendTransaction`、钱包签名或浏览器验签在真实环境通过。

## 九、未验证 / 明确不声称

- 未用 Phantom、Bitget、OKX 或任何真实钱包执行 `signTransaction`；A 的注入钱包不等于真实钱包兼容验收。
- 未广播任何交易；没有真实签名回执、确认或链上读回证据。
- 浏览器端 `verifySignature`/WebCrypto Ed25519 可用性未做真机验证；若不可用，产品必须显示不支持且零广播。
- 未验证真实 RPC 的 429、超时、响应丢失、并发和多标签行为。
- 未接入页面；没有发布按钮、审阅面板、状态文案或 UI 回归。
- 真机键盘、安全区、横屏、200% 缩放等既有未验证项继续保留。

A 的代码、测试和本地构建通过不代表 B 或整个 Sprint 2.2 已验收。下一步应由 Codex 独立复审本文件与代码；复审通过并明确授权后才进入 B。当前不提交、不推送、不部署，产品签名/发送继续关闭。

## 十、复审R1–R5限定修复（2026-10-31）

本节覆盖前文与R1–R5冲突的旧实现描述；范围仍限发布核心、必要回归与文档。

- R1签名锁：`publisher.sign`在首次`await`前同步占有对象token；只有持有本次token的`finally`能释放。前置RPC/会话失败释放锁并可重试；页面取消但底层钱包Promise未结束时保留锁，防第二次钱包弹窗；迟到结果仍丢弃。
- R2截止/取消：发布核心统一使用caller signal+总截止+单RPC截止，所有RPC/钱包/读回等待均实际race并在await后复查；迟到resolve/reject不能继续下一段。`confirm`总截止覆盖在途查询和轮间睡眠；`recover`在总截止后对未查询回执显式保留待确认；取消在可中止路径立即以取消错误停止并保留取消原因，不伪装成查询失败。`submit`一旦派发send，超时/取消/传输错误/签名不一致只结算原签名回执为`uncertain`，不标未发送、不重新签名或广播。
- R3终态结算：`check`/`confirm`/`recover`在核心内把confirmed/finalized/可靠失败写回同一签名回执，新增`ReceiptPersistence`：`persisted`为写盘成功，`failed`保留链上查询结果并给出写盘原因，`not_terminal`不改存储。`expired`/未知不静默淘汰。实际浏览器存储连续11次成功prepare→sign→submit→confirm后保留10条confirmed，最旧终态被清理，容量策略可用。
- R4钱包能力：`standard:events`独立处理chains/features，不仅accounts；能力/版本/支持交易版本变化立即重算revision并失效旧会话。`getSigningSession()`每次读取都核对实时wallet/账户/链/特性，覆盖未发事件的静默替换；仅1.0.0、v0、Devnet可签，不回退`signAndSend`。
- R5 Unicode：`message`新增well-formed检查，孤立高/低代理项返回`not_well_formed`；`prepare`在模拟前拒绝，`validatePrepared`对伪造准备对象在钱包前拒绝；合法代理对、emoji与ZWJ保留原文通过，不trim、不替换U+FFFD。
- 实际自动检查：`npm run typecheck`退出0；`npm test` 8文件239项通过（publisher89、wallet34、message13、simulation13、network11、history34、App27、historyFeed18）；`npm run build`退出0（70 modules，JS 345.92 kB/gzip 108.09 kB）；`git diff --check`退出0。新增回归覆盖同帧连点、前置失败重试、取消时钱包仍pending、四阶段复核取消、无响应发送、迟到状态、确认轮间截止、多路径取消、终态结算/写盘失败/11笔容量、features-only/chains-only/未知版本/静默变更、Unicode高低代理项与合法序列。
- 仍未验证：真实Phantom/Bitget/OKX签名、真实`sendTransaction`/确认/读回、浏览器WebCrypto Ed25519、真实429/超时/响应丢失、2.2B UI及真机键盘/安全区。工作区未提交、未推送、未部署，A等待Codex复审，B继续关闭。

## Codex二审最新指引

独立239项测试及上轮9项断言通过，R1/R2/R5关闭，R3/R4尚有组合边界；A暂不通过，下一次只执行[REVIEW-2.2A-RESULT末尾二审工单](REVIEW-2.2A-RESULT.md)。原交付和首轮修复回执保留为历史，不声明真实钱包/浏览器/真机已验证，不进入B。Cline已按该工单完成剩余修复，见下节；Codex复审通过前A仍未通过。

## Cline二审剩余R3/R4修复回执（2026-10-31）

- 仅修R3/R4剩余并补13项组合回归，未重做R1/R2/R5，未接B/UI，未调用真实钱包签名或`sendTransaction`，未新增依赖/后台/数据库/主网/部署。
- R3：只有confirmed/finalized可结算；成功要求显式`err === null`，仅对象形态明确错误写failed；processed/null/未知级别/缺失或畸形err保持pending/not_terminal，不写盘、不释放容量，confirm继续轮询。
- R4：删除事件后的永久信任标记；每次取会话核对事件值、钱包实时chains/features、账户chains/features、地址/公钥、1.0.0与v0；不一致或原地撤销时保守失效但保留只读连接，一致事件仍可正常签名。
- 实际检查：typecheck退出0；`npm test` 8文件252项通过（publisher98、wallet38）；build退出0（70 modules，JS 346.16 kB/gzip108.13、CSS15.68 kB/gzip4.04）；`git diff --check`退出0。完整记录见[VALIDATION.md](VALIDATION.md)与[REVIEW-2.2A-RESULT.md](REVIEW-2.2A-RESULT.md)末尾回执。
- **A仍等待Codex复审，复审通过前不进入B。** 真实钱包、浏览器WebCrypto Ed25519、真实广播/确认/429/响应丢失及真机项继续未验证。

## 2026-11-01：Codex最终复审通过

R1–R5全部关闭，独立252项测试、16项额外断言、类型/构建/diff通过。详见[最终复审](REVIEW-2.2A-RESULT.md)与[机器证据](evidence/review-2.2A-codex-final-probes.json)。此前交付与等待复审表述保留为历史；最新A已通过，B尚未开始，页面签名/发送关闭，真实钱包/浏览器/真机限制继续保留。
