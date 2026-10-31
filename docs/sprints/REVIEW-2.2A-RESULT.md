> 历史归档：2026-11-01迁入。原日期、级别与复审结论仅作历史记录，不是当前发布闸门；当前以[STATUS](../../STATUS.md)、[DECISIONS](../../DECISIONS.md)及根目录规则为准。

# Sprint 2.2A：Codex独立复审与限定修复

**最新结论（2026-11-01）：2.2A复审通过，R1–R5全部关闭。** 252项项目测试、16项独立断言、类型/构建/diff通过。历史问题与各轮证据保留；最终通过证据见末尾。B未开始，产品页面签名/发送继续关闭。

**最新二审（2026-10-31）：R1/R2/R5关闭，R3/R4各剩边界未通过。** 239项项目测试和上一轮9项独立断言均通过；本轮组合探针仍复现确认级别/缺失err及事件后能力替换问题。下一次只修本文件末尾“二审剩余工单”，不重做已关闭项，不进入B。以下首轮结论保留为历史。

**Cline后续已提交R3/R4修复回执（见文件末尾），252项测试通过；Codex复审通过前，上述“A未通过”和B关闭结论继续有效。**

日期：2026-10-31。基线：a13956e，审查工作区未提交的2.2A交付。**结论：暂不通过，R1–R5待修复；不进入B，页面签名/发送继续关闭。** Codex本轮只写审查文档与证据，未修改产品实现或既有测试，不提交推送本次未通过的交付。

## 独立验证及证据范围

- typecheck退出0；项目原有8文件205项测试通过。构建以相同npm脚本输出到/tmp/said-review-2.2A-dist成功：70 modules、index-tJ58LKdO.js 344.44 kB/gzip107.59、CSS15.68 kB/gzip4.04。首次默认dist构建被沙箱写权限阻止，不是产品编译失败。git diff --check退出0。
- 页面未引用或实例化publisher；simulation仅新增实际待签字节输出，没有新增依赖。工作区另有未跟踪tsconfig.tsbuildinfo，是构建缓存，不应作为产品交付提交。
- 在临时文件复用交付中的注入夹具、增加独立断言，9项预期契约均失败，分属以下5类；未访问用户钱包、未真实签名或广播。机器证据：[review-2.2A-codex-probes.json](evidence/review-2.2A-codex-probes.json)。临时探针位于/tmp/said-review-2.2A/probes.test.ts，未加入产品测试集；现有205项通过与额外9项失败是两套不同检查。
- 没有把Node验签当真实浏览器/真机兼容证据，未重复真实RPC探针。此前真实钱包个人历史、429及真机未验证项仍保留。

## R1 [P1] 签名锁在异步复核后才设置，可并发弹窗

位置：[publisher.ts:696](../../src/publisher.ts#L696)–704。

sign先检查signingInFlight，再await四段RPC复核，最后才设置锁。同一帧两次调用都能读到false并进入复核，随后各调用一次钱包。现有测试等待第一次钱包调用后再发第二次，遗漏了这个窗口。

独立复现：两次sign不互相等待、共用一个被延迟的genesis Promise；释放genesis后，实际钱包调用次数为2，期望1。

最小修复：首次await前同步占有签名操作，失败时正确释放；若页面已取消而底层钱包Promise尚未结束，仍保留该钱包的等待锁。旧请求finally不得释放新操作；不依赖尚未实现的B页面按钮禁用来补核心漏洞。补同帧连点、前置失败后可重试、取消后底层仍pending及旧finally隔离回归。

## R2 [P1] 超时只是发送abort，缺少真正截止与贯穿取消

位置：[publisher.ts:289](../../src/publisher.ts#L289)–340、621–642、838–850、882–965、967–1052；Publisher类型183–208。

- readWithTimeout仅设置controller，直接await provider；不race也不在await后查signal。provider忽略abort时迟到成功仍继续下一段。独立设timeout=10ms、genesis在25ms返回，sign仍成功且调用钱包1次。
- send只race调用者signal，没有本身的10秒超时；默认调用无外部abort时可永久pending。独立timeout=10ms，40ms后submit仍未结束，释放迟到响应后返回accepted，而不是在期限内保留回执返回uncertain。
- check也只设置timer；10ms截止、25ms迟到confirmed被接受。confirm仅在check返回后检查总耗时，睡眠后也不检查剩余时间就发下一轮；独立35ms总预算实际70ms返回。prepare/check/confirm/recover/readBack没有调用者取消入口，recheck也未传播签名/提交caller信号。

最小修复：为各操作提供可组合的caller/总截止/单RPC信号，实际race并在每个await前后及下一段派发前检查，计时器/监听器/轮询等待均清理；忽略abort的迟到resolve/reject不能转为成功或继续派发。confirm截止包含在途RPC和轮间等待，recover/readBack同样有界并可停止页面等待。提交一旦派发后，超时/取消只保留本地原签名、返回不确定并允许查询，不能标未发送或重签重发。不要把“加长超时”当修复。

必要回归：预取消零RPC；在genesis/高度/费用/余额各阶段取消不派发后续；永不返回与忽略abort的迟到成功/失败；send无响应；check/recover/readBack取消；confirm在RPC/睡眠中到总截止。真实网络查询返回不确定并非交易撤回。

## R3 [P2] 链上确认没有结算本地回执，正常使用会耗尽容量

位置：[publisher.ts:882](../../src/publisher.ts#L882)–1017；存储终态清理433–450。

submit保存submitting，但check/confirm/recover只返回查询结果，从不把confirmed/finalized/可靠失败结算到存储。独立完整执行prepare→sign→submit→confirm，查询结果为confirmed，localStorage仍为submitting。10笔正常成功交易后都是“未解决”，第11笔无法落盘，因此零广播被阻止；现有容量测试手工塞终态，掩盖了正常流程无法产生终态的问题。

最小修复：在发布核心内明确结算与持久化责任，确认/恢复获得可靠终态后更新同一原签名回执，使容量策略可用；不可只等B页面自己补。写入失败保留回执并显式呈现存储结果，不伪造已持久化；未确定/expired未知仍保留，不作为可静默淘汰终态。恢复仍重新查链，不信任缓存成功，也不签名发送。

必要回归：使用实际browser receipt store跑至少11次成功提交/确认，最旧终态可清理而未解决记录保留；confirmed/finalized/确认失败及recover结算、写盘失败路径分别覆盖。

## R4 [P1] 钱包级能力事件被忽略，签名特性版本未校验

位置：[wallet.ts:135](../../src/wallet.ts#L135)–179、248附近同账户判断、309–317、471附近getSigningSession。

签名会话只在accounts事件变化时重建；standard:events允许单独发chains/features，当前回调发现没有accounts就直接返回。能力撤销、替换或版本变化后仍返回旧会话及旧feature。evaluateSigningSession也没要求feature.version为首版支持的1.0.0。

独立复现：删除钱包signTransaction能力并发features-only事件，getSigningSession仍available且与原对象相同；把特性版本改为2.0.0再连接，仍创建可用会话。现有“能力变化”测试仅覆盖账户features/chains，不能证明钱包级能力生命周期已覆盖。

最小修复：处理钱包级chains/features的标准事件，能力/版本/支持交易版本变化立即失效旧会话；每次获取或使用签名会话时确保当前能力仍一致，不只比较缓存对象。严格限制1.0.0/v0/Devnet，不能回退signAndSend或主网。保留现有账户及generation订阅，不以破坏旧连接保护的方式解决。补features-only、chains-only、能力撤销/替换、未知版本和签名pending期间能力变化回归。

依据：[Wallet Standard事件定义](https://github.com/wallet-standard/wallet-standard/blob/master/packages/core/features/src/events.ts)明确包含chains、features、accounts三种独立可选新值；本项目签名特性取舍见原2.2工单。

## R5 [P2] 准备阶段仍接受历史读取器拒绝的Unicode正文

位置：[publisher.ts:628](../../src/publisher.ts#L628)–639、478–509；[history.ts:293](../../src/history.ts#L293)。

prepare只检查trim空白；validatePrepared重用的正文规则也未检查well-formed Unicode。独立传String.fromCharCode(0xd800)，结果prepared且已模拟1次。JSON能把孤立代理项编码成转义，Memo模拟不必报错，但本项目history明确返回memo-text-wellformed无效，从而可能付费发布后被自己的公共流过滤。

最小修复：在发布入口及准备快照校验中统一拒绝孤立高/低代理项，复用或最小扩展正文规则；保持原文不trim、不替换成U+FFFD，保留长度/字节限制。不要放宽已审查历史解析器去接收非法文字。补孤立高/低代理项在准备前零RPC/零签名，合法代理对、emoji/ZWJ正常通过，以及伪造准备对象入口的相同防线。

## 限定修复与停点

- 仅修R1–R5与必要回归、文档；不接B/UI、不改视觉/链上协议/历史读取核心、不增依赖，不调用真实钱包签名或sendTransaction，不新建公网入口或部署。
- 更新交付、验证、交接及双语实际状态，运行typecheck/全部测试/build/diff；新增文件也检查，不把构建缓存纳入交付。记录实际结果与仍未验证项。
- 完成停工作区交Codex复审；不自行提交/推送，不以205项现有测试通过代替上述修复验收。Obsidian由Codex同步。

确认语义核对：[sendTransaction](https://solana.com/docs/rpc/http/sendtransaction)只证明RPC接受提交；[getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses)用于查询原签名。以上发现均来自本次代码与独立注入证据，不声称真实网络已出现相同故障。

## Cline修复回执（待Codex复审）

- 已按R1–R5修复发布核心并补必要回归：同步签名token锁、贯穿取消/截止、终态回执结算、钱包chains/features能力事件与会话惰性核验、well-formed Unicode入口校验。未接B/UI，未调用真实钱包签名或广播，未新增依赖/后台/数据库/主网/部署。
- 实际`npm run typecheck`退出0；`npm test` 8文件239项通过（publisher89、wallet34）；`npm run build`退出0（70 modules，JS 345.92 kB/gzip 108.09 kB）；`git diff --check`退出0。真实钱包、真实发送/确认、浏览器WebCrypto Ed25519与真机项仍未验证。
- 修复细节、覆盖范围与停留状态见[VALIDATION.md](VALIDATION.md)和[CLINE-NEXT.md](../CLINE-NEXT.md)。本文件原“暂不通过”结论保留；A是否通过以Codex复核为准，B在复审通过前继续关闭。工作区未提交、未推送。

## Codex二审验证与关闭项

- 独立typecheck退出0，8文件239项测试通过；相同npm构建脚本输出/tmp/said-review-2.2A-r1r5-dist成功，70 modules、index-BrnMhRVn.js345.92 kB/gzip108.09，CSS15.68 kB/gzip4.04；git diff --check退出0，构建缓存已不在工作区。
- 上轮同一套9项独立断言全部通过：并发钱包调用1次；发送超时按时返回uncertain；迟到genesis拒绝且零钱包调用；迟到状态保持pending；确认总预算35ms实际35ms；confirmed回执持久化；非法Unicode在模拟前拒绝；features-only撤销及未知版本拒绝。
- R1同步锁、R2实际截止/取消、R5统一Unicode检查关闭；R3正常确认落盘与11笔容量回归已实现，但可靠终态判定尚有缺口；R4标准事件与版本校验已实现，但事件后的实时复核尚有缺口。
- 新增临时组合断言4项失败，前三项形成下面两个剩余修复；第四项为同账户对象原地撤销features后旧会话仍有效的额外防御观察，不单独扩大范围。证据：[review-2.2A-codex-second-probes.json](evidence/review-2.2A-codex-second-probes.json)。均为注入钱包/RPC，没有真实签名、广播、浏览器或真机验收。

## 二审剩余工单：仅R3/R4

### R3剩余 [P2] 可靠终态必须先满足确认级别，成功必须显式err=null

当前位置：[publisher.ts:1137](../../src/publisher.ts#L1137)–1164，结算1075–1085。

checkWithDeadline先处理err，只要非空就failed，不管confirmationStatus是否只有processed或为null；settleCheck随后把failed写为可淘汰终态，confirm也提前结束。独立注入`{confirmationStatus:'processed',err:{InstructionError:...}}`，实际failed/persisted且存储failed。processed仍可能回滚，尚不能作为本项目confirmed目标下的可靠失败。另注入`{confirmationStatus:'confirmed'}`、省略err，实际被当成confirmed/persisted，违背原工单“err=null才成功”的明确约束。

最小修复：先验证响应与确认级别；只有confirmed/finalized才允许结算成功或执行失败，成功必须显式err===null，缺失/畸形err或未知级别保持待确认/明确查询异常。processed的错误可保留作为未确认观察，但不能failed终态落盘、释放容量或停止后续确认；不是要求增加新的确认等级。

必要回归：processed+err、null/未知级别+err不结算；确认轮询先processed错误后confirmed成功仍会继续；confirmed缺err不成功；confirmed/finalized明确err分别结算；待确认回执不被容量清理。保持原签名，不触发签名或广播。

依据：[Solana确认级别](https://solana.com/docs/rpc#configuring-state-commitment)说明processed可能回滚；本项目原工单已把目标定为confirmed并要求可靠终态。

### R4剩余 [P2] 发过能力事件后不能永久绕过实时能力复核

当前位置：[wallet.ts:280](../../src/wallet.ts#L280)–307、399–405、580–595。

walletFeaturesFromEvent一旦变true，isSessionStillCurrent就不再比较wallet.features实时值；activeWalletFeatures永久优先旧事件表。独立先发正常features事件，再把wallet.features替换成无signTransaction的新表且不再发事件，getSigningSession仍返回同一个有效会话。已有“未发事件的静默变更”测试只覆盖从未发生features事件的情况，所以没有证明所声明的每次惰性核验始终有效。chains路径有同样的永久绕过标记。

最小修复：每次获取/使用会话，均核对当前钱包/账户授权能力及不可变能力快照；曾收到事件不能成为永久信任旧值的理由。事件新值与实时getter不一致时保守失效，不保留签名授权；测试假钱包应同步真实属性再发事件，不能靠接受不一致来源来通过测试。只读连接可保留，不回退其他签名接口或网络，不改连接generation规则。可在同一守卫内拒绝当前账户已撤销的chains/features，无需新增功能。

必要回归：正常features事件→静默替换/删除特性；chains事件→静默撤销Devnet；每次都失效旧revision；事件与getter一致时正常签名；签名前/钱包返回后发生上述变化时零广播。已关闭的同帧锁、取消和Unicode断言保持通过。

### 修复停点

只修上述R3/R4剩余、必要回归与文档；不改R1/R2/R5已关闭实现，不接B/UI，不新增依赖，不调用真实钱包签名或sendTransaction，不部署、不提交推送。检查完成后停工作区交Codex复审。真实钱包/浏览器Ed25519/真实网络异常及真机项继续保留未验证。

## Cline剩余R3/R4修复回执（2026-10-31）

范围仅限上方二审剩余工单；R1/R2/R5已关闭实现未重做。

- R3：`checkWithDeadline`先规范化确认级别，只有`confirmed`/`finalized`进入终态判断。`err === null`才成功；非空且为对象的明确错误才`failed`；`processed`、null/未知级别、缺失或畸形`err`均保持`pending`/`not_terminal`，保留原签名与观察值，不写盘、不释放容量，`confirm`继续有界轮询。原回执存储、恢复、读回与写盘失败语义未改。
- R4：删除`walletChainsFromEvent`/`walletFeaturesFromEvent`永久信任标记。`getSigningSession()`每次同时核对事件期望值、钱包实时getter、当前账户chains/features、地址/公钥、`1.0.0`与v0；事件与getter不一致或账户原地撤销时保守返回无会话，但快照保持connected只读；一致事件仍提供正常签名会话。只读连接、generation、不回退`signAndSend`等已关闭规则未改。
- 新增13项回归：processed+err/未知级别+err不结算、processed→confirmed轮询、confirmed/finalized缺err、畸形err、明确err结算；一致features事件→静默删除/替换、chains事件→静默撤销Devnet、事件/getter不一致、同账户原地撤销+accounts事件，以及签名等待期静默撤销/账户撤销组合零广播。测试假钱包改为先同步公开属性再发事件，另有不配对探针验证保守失效。
- 实际检查：`npm run typecheck`退出0；`npm test` 8文件252项通过（publisher 98、wallet 38、message 13、simulation 13、network 11、history 34、App 27、historyFeed 18）；`npm run build`退出0（70 modules，`dist/assets/index-Byps-RCq.js` 346.16 kB/gzip 108.13 kB，CSS 15.68 kB/gzip 4.04 kB）；`git diff --check`退出0。
- 本轮未接B/UI，未调用真实钱包签名或`sendTransaction`，未新增依赖、后台、数据库、主网或部署，未提交/推送。真实钱包、浏览器WebCrypto Ed25519、真实广播/确认/429/响应丢失及真机项仍未验证。**A等待Codex复审，复审通过前不进入B。**

## 2026-11-01：Codex最终复审通过

- 独立核对可靠终态先满足confirmed/finalized，成功要求显式err=null；processed错误及缺失err保持pending/not_terminal，不落终态。钱包每次核对事件期望值、实时特性和账户授权，事件后替换及原地撤销均使旧会话失效。R3/R4剩余关闭，连同已关闭R1/R2/R5，A通过。
- 独立npm run typecheck退出0；npm test为8文件252项通过；npm run build -- --outDir /tmp/said-review-2.2A-final-dist退出0，70 modules、index-Byps-RCq.js346.16 kB/gzip108.13、CSS15.68 kB/gzip4.04，与Cline最终构建一致；git diff --check退出0。
- 原样重跑首轮9项、二审4项独立断言全部通过；再加3项组合断言通过：processed错误后第二轮confirmed并持久化；能力事件一致时能正常准备/验签且零广播；实际receipt store连续11次注入提交确认后保留10条confirmed且最旧清理。合计16项，不混入项目252项统计。
- 最终机器证据：[review-2.2A-codex-final-probes.json](evidence/review-2.2A-codex-final-probes.json)。首轮/二审失败证据保留，未覆盖成成功结果。探针用临时文件及注入夹具，没有访问真实钱包或真实写RPC。
- 页面没有实例化publisher，源协议/读取核心/视觉/依赖未扩展。Codex只改复审文档和交接，没有改产品/测试逻辑。新增文件EOF及行尾空白已检查，提交前再检查全部暂存差异；tsconfig缓存不在交付中。
- A通过仅代表核心、注入测试和代码复审关闭，不代表B或整体产品验收。真实钱包、浏览器WebCrypto Ed25519、真实广播/确认/历史读回、真实RPC异常和真机仍未验证。下一步B沿原工单另行开始，Cline当前无新实现任务，Codex按已授权流程提交推送检查点，不部署或自动请求钱包签名。
