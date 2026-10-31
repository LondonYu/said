> 历史归档：2026-11-01迁入。原日期、级别与复审结论仅作历史记录，不是当前发布闸门；当前以[STATUS](../../STATUS.md)、[DECISIONS](../../DECISIONS.md)及根目录规则为准。

# Sprint 2.1：Codex独立复审结果

日期：2026-10-31。结论：暂不通过，修复R1/R2/R3后复审；2.2继续关闭。Codex未修改产品源码。

## 独立验证

- typecheck退出0；5文件66项测试通过；build退出0，67 modules，JS311.66kB/gzip98.21kB，CSS13.66kB/gzip3.67kB；git diff --check通过。
- 独立调用message.ts构造函数：空正文（validate结果empty）仍构造成功，size320；141个ASCII字符（validate结果too_many_graphemes）仍构造成功，size462。两者Memo账户均为空数组。
- 构造实际指令检查证实Memo未声明作者账户。现有message测试只检查整笔交易唯一签名槽，没有断言Memo自身的作者签名账户。
- Cline真实RPC探针是交付证据，本轮未重跑；即使err=null，也只证明该交易能模拟，不能证明其符合阶段0作者绑定协议。

## R1 [P1] Memo缺少付款作者签名账户

位置：src/message.ts:104-108，调用点133。

buildMemoInstruction仅写accounts:[]。System转账包含付款签名者并不能替代Memo指令自己的账户列表；与工单“Memo要求付款者签名”及阶段0读取协议不符。当前模拟可成功，未来严格读取器却会拒绝该消息，作者绑定也不符合约定。

修复：将当前feePayer传入Memo构造，作为签名账户明确包含；整笔仍只有一个付款占位签名槽，不添加私钥或真实签名。回归断言Memo账户地址及signer角色、编译后账户索引/唯一签名槽、序列化解码内容。重跑真实未签名Devnet模拟并更新大小/费用证据；无签名发送。

## R2 [P2] 构造入口没有强制正文/完整大小校验

位置：src/message.ts:124-144，src/simulation.ts:116-118。

validateMessageText只有单独定义/测试，构造函数和模拟入口均未调用；纯构造可接受空正文或超限正文，模拟入口也会先发RPC。当前UI校验不是模块契约的替代，后续其他调用者会绕过规则。sizeBytes只报告，没有对完整序列化大小进行限制。

修复：在构造边界强制校验，模拟入口在RPC前拒绝非法正文（复用同一规则，避免两套硬编码）。序列化后根据实际wire字节数检查完整交易上限，拒绝超限；不trim更改正文。保留预览统计，必要时提取复用。测试必须直接调用构造/模拟入口验证空白、141grapheme及超560字节被拒绝、非法输入RPC调用次数为0、中文/emoji/ZWJ边界通过、整笔wire大小与记录一致且有上限防线。不要只测试校验辅助函数。

## R3 [P2] 过期判定使用模拟前的高度快照

位置：src/simulation.ts:128-149、163，src/App.tsx:99。

高度仅在余额/估费/模拟之前读取；后续多次RPC可能耗时，返回给页面的仍是旧高度。UI始终比较这个固定值，未在模拟后或结果使用时重新验证。不能据此声称结果当前仍有效，也没有覆盖“检查期间跨越lastValidBlockHeight”的回归；模拟BlockhashNotFound仅显示通用程序错误，不提供明确过期状态。

修复：至少在返回成功前重新核验当前高度/原blockhash有效性，过期或核验失败不能当作当前有效；BlockhashNotFound映射为明确过期/需重试。结果标清检查时点，不将静态快照无限期表示为当前有效；可采用有限有效期/重新检查入口，无需搭建常驻全局轮询。重试重新取blockhash并重新估费。新增“初次高度未过期、后续已过期”“模拟BlockhashNotFound”“重新检查用新blockhash/费用”的测试。不得基于估计时间伪造链上高度。

## 非阻塞建议

src/App.tsx:116通过String(result.simulationErr)渲染结构化错误，可能仅显示[object Object]。可用受控JSON格式保留可诊断内容，避免错误详情丢失。

## 执行纪律

Cline仅修复上述范围及必要回归/三语言状态文案，保留现有设计、R1/R2钱包保护、已提交之外所有工作区成果。按现有lock运行必要检查，更新REVIEW-2.1、VALIDATION与DECISIONS。禁止签名、发送、主网、改协议标识、历史模块、后端或无关重构；不提交/推送/重新部署。修复交Codex再审，不以本报告放行2.2。

## 2026-10-31：R1/R2/R3 复审通过

结论：通过；2.2 签名/发送继续关闭。Codex 未修改产品源码。

### 逐项核验
- R1：`buildMemoInstruction` 显式包含付款作者账户，`role=AccountRole.READONLY_SIGNER`；独立 node 探针确认 Memo 指令 1 个账户（role=2），编译后整笔唯一签名槽为付款者地址、值为 null，符合阶段0作者绑定协议。
- R2：`buildUnsignedGuestbookTransaction` 与 `simulation.checkTransaction` 入口均强制 `validateMessageText`；独立复现空白、141 grapheme、ZWJ 超 560 字节均被构造抛错拒绝，`checkTransaction` 非法正文 RPC 调用数为 0。序列化后按 base64 解码字节数对照 1232 上限拒绝超限，测试用更小上限注入验证防线。
- R3：模拟返回前重新读取当前高度；`BlockhashNotFound` 与复核高度超过 `lastValidBlockHeight` 均标记 `blockhashExpired`；重试重新获取 blockhash 与费用。三类回归测试齐备。

### 独立检查（本轮实际输出）
- `npm run typecheck`：退出 0
- `npm test`：5 文件 73 项通过（wallet 18 / network 11 / message 11 / simulation 13 / App 20）
- `npm run build`（临时 outDir，因沙箱禁写 Desktop 的 dist）：67 modules，`index-BJFaEPRJ.js` 312.93 kB / gzip 98.67 kB，`index-oxa21TIy.css` 13.66 kB / gzip 3.67 kB，与 Cline 报告哈希一致
- `git diff --check`：退出 0
- 源码扫描：产品路径无 sign/send/mainnet/私钥/dangerouslySetInnerHTML 命中
- 三语 `tx*` 新增文案键在 zh-CN/zh-TW/en 均齐全

### 保留
- 真实 Devnet 只读模拟探针为 Cline 交付证据，本轮未重跑（网络受限）；R1/R2/R3 已用 node 独立复现代码级行为确认。
- 非阻塞建议仍开放：`App.tsx` 以 `String(result.simulationErr)` 渲染结构化错误，可能显示 `[object Object]`；建议后续用受控 JSON 格式保留可诊断内容，不阻塞 2.1。
- 2.2 签名/发送继续关闭；1.1B 真机拒绝/取消、切账户、系统/钱包版本等仍未验收。
