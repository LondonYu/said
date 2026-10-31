> 历史归档：2026-11-01迁入。原日期、级别与复审结论仅作历史记录，不是当前发布闸门；当前以[STATUS](../../STATUS.md)、[DECISIONS](../../DECISIONS.md)及根目录规则为准。

# Sprint 3.1：Codex 独立复审结果

日期：2026-10-31。**最新结论：3.1复审通过，R1/R2/R3已关闭**。下文保留首轮/二审问题与复现历史，最新证据见末尾通过节。Codex未修改产品源码、依赖或测试逻辑；3.2另行工单，2.2签名/发送继续关闭。

## 本轮实际检查

- npm run typecheck：退出0。
- npm test：6文件88项通过，history为15项；通过不代表下面未覆盖分支正确。
- npm run build -- --outDir /tmp/said-review-3.1-dist：退出0，67 modules；JS 312.93 kB / gzip 98.67 kB，CSS 13.66 kB / gzip 3.67 kB，产物文件名与Cline交付一致。使用临时目录以免改动现有dist。
- git diff --check：退出0；本轮产品源码、依赖与UI未改。工作区保留Cline交付及本复审文档，未提交/推送/部署。
- 真实Devnet查询结果沿用Cline交付证据；本轮未重跑公网读取，下面为独立进程、可注入RPC与公开真实交易夹具的定向复现，不冒充真机/真实RPC验证。

## R1 [P1] 取消/整次超时未传到详情池，单笔超时丢失部分结果

位置：src/history.ts:282-293、334-360、363-384、399-432、474-488。

readPage/retrySignatures创建baseSignal，但runPool另建poolController，其signal未与baseSignal合并；fetchTransaction拿到的只有池信号。因此进入详情阶段后，caller取消和30秒operation timeout都不影响请求或后续派发。各阶段缺少取消后的检查，provider忽略取消时仍可能返回迟到成功。单笔RPC timeout又被直接throw到runPool作为fatal，导致已成功的其他详情一并无法交付。

独立复现：

- 在详情请求后中止caller，详情延迟25ms返回：传入详情的signal.aborted=false，readPage最终messages=1（caller.aborted=true）。
- operationTimeoutMs=5、rpcTimeoutMs=100、详情延迟20ms：仍成功返回messages=1。
- caller调用前已abort，注入RPC即时返回：仍发起genesis并成功返回一条。
- 两笔候选一笔成功、另一笔10ms详情timeout：整页reject `交易读取失败：The operation was aborted due to timeout`，没有返回成功条目或不可得签名。

修复要求：把caller/operation/pool信号贯穿genesis、列表、详情和任务派发；发请求前、每次await后及返回前检查有效性，取消后不继续派发或接受迟到成功。明确区分caller取消、整操作超时、单RPC超时与普通RPC错误；单笔详情超时按可重试unavailable保留签名与其他有效消息，caller/整操作取消则终止本次操作。列表/genesis失败仍是操作失败。readPage与retrySignatures必须同样覆盖，不以UI未来会处理取消代替模块契约。

必要回归：预取消零RPC、详情中取消且不再派发剩余任务、详情阶段整操作超时、provider迟到成功、重试入口取消、单笔timeout保留部分结果及重试恢复。使用可控Promise/短测试超时，检查实际调用次数与返回/拒绝，不仅检查signal字段。

## R2 [P2] 解析器未完整封住unknown边界，部分畸形数据崩溃或误收

位置：src/history.ts:89-108、128-165、188-261。

decodeBase58和元数据规范化会throw，但导出的parseGuestbookTransaction未捕获，fetchTransaction也未将解析异常转为无效候选。历史页中一笔坏数据因此能让runPool整页reject；与“无效候选不让整页崩溃”不符。另有工单要求的边界只做了类型断言或未校验，现有测试标题虽然写“非法base58”，正文未实际覆盖非法base58字符串。

独立复现（每项均克隆公开夹具后仅修改指定字段）：

- Memo数据改为`!notbase58`或查询/交易签名同改为`!notbase58`：解析器直接throw。
- 同页一笔正常、一笔Memo数据为`!`：readPage整体reject，正常消息也无法返回。
- 所有programIdIndex改为字符串：仍kind=message；numReadonlyUnsignedAccounts删除也被接收。
- addressTableLookups改为对象而非数组：仍kind=message；negative bigint slot=-1n仍kind=message。
- Memo正文用JSON转义表达孤立高代理项（U+D800）：仍kind=message；UTF-8原始JSON合法不等于JSON解码后的正文为well-formed Unicode。

修复要求：纯解析入口对unknown输入稳定返回message/invalid/unavailable，不让解码/规范化异常逸出；null/meta缺失继续是unavailable。按工单校验header全部计数字段、整数/范围及账户角色的一致性，校验指令索引为整数且在静态账户范围内；ALT字段存在时须为合法空数组，否则拒绝，不把类型断言当运行时校验。slot/fee的bigint与number路径都拒绝非法负值，安全保留有效bigint；正文验证isWellFormed并复用既有长度规则，原文不改写。保持当前v0/唯一作者/零转账/Memo作者/ComputeBudget兼容范围，勿通过放宽协议消除报错。

必要回归：直接调用解析入口的非法base58（签名/预算/System/Memo）、无效元数据、header/索引畸形、ALT字段畸形、负bigint及孤立代理项；同页混入无效条目仍返回有效消息；真实公开夹具与中文/emoji/ZWJ/原始空白继续正确。测试应断言不throw及拒绝分类，不能只覆盖正常路径。

## R3 [P2] 游标无进展和候选硬预算未实现，坏列表会静默卡住

位置：src/history.ts:317-327、395-451。

列表返回后仅验证Array；normalizeRows静默跳过坏行、先去重后取尾部，未检查返回规模，也未对nextCursor与输入before做无进展检查。当前pageSize只是发给RPC的请求参数，未形成客户端硬防线。

独立复现：

- 请求before等于服务器回传的唯一签名：调用成功，nextCursor仍等于before、sourceExhausted=false，后续加载可永久重复该页。
- pageSize=1而RPC回21条有效签名：实际发起21次getTransaction，scanned=21，突破本轮20上限。
- RPC回非空列表但唯一签名是非法字符串：返回scanned=0、nextCursor=null、sourceExhausted=false、unavailable=[]，既无错误也无法继续分页。

修复要求：在派发详情前严格校验候选列表和大小；超出请求limit/硬预算的响应明确失败，不静默截断后跳过未读数据。无效候选行不能无提示消失并产生无法前进的成功页；页内签名可去重，但nextCursor必须来自校验后的原始尾行，不能因去重改变原始分页边界。检测before==nextCursor/明显无进展并明确报错；保持空页才sourceExhausted、全过滤页仍按原始尾签名推进。跨调用的去重/循环防护需要3.2状态层配合，3.1至少不能将相同边界作为成功返回。

必要回归：空页、全无效交易页、畸形候选行、重复/重叠签名、原始末行重复、before无进展、超量响应在详情请求前失败、默认/上限/非法pageSize与重试签名上限、真实RPC参数（板级/作者地址及before/commitment/version）断言。不能只用fake忽略参数的测试证明个人历史查询正确。

## 执行范围与下一步

Cline只修上述三类问题及必要回归，保留既有工作区和已确认UI；不更改协议标识、不重写钱包/模拟、不新增依赖或产品范围。新增测试先复现失败再修，运行typecheck、全部测试、build及diff检查，更新REVIEW-3.1与VALIDATION的实际证据并保留未验证项。已有真实公开夹具仍须通过；公网只读核验按预算进行，限流时记录原始结果，不以反复请求制造成功。

修复后交Codex再审，不提交推送、不接UI、不进入3.2/2.2，不签名发送或部署。测试数量由有意义的覆盖决定，不以凑数替代上述行为。

## R1/R2/R3修复后二审（2026-10-31）

结论：**仍暂不通过，仅剩下列边界修复**。独立重跑typecheck、6文件100项测试、build（/tmp/said-review-3.1-r123-dist）及diff检查均退出0。构建67 modules，产物文件名/体积与交付一致。未改源码/测试、未提交推送；真实Devnet页读取为Cline本轮交付证据，Codex未重跑公网。

已确认通过：readPage与retrySignatures的详情取消链路；整操作信号进入详情池；预取消零RPC；单笔详情超时保留不可得；解析异常封装、非法base58/负bigint/孤立代理项拒绝、同页坏数据隔离；超量候选与非法签名行明确失败。不要回退或重写这些部分。

### R1剩余 [P2] genesis/列表阶段仍接受单RPC超时后的成功，阶段间缺取消检查

位置：src/history.ts:324-335、447-464；retrySignatures同样调用verifyGenesis。

verifyGenesis只在send拒绝时处理错误，没有在await后检查requestSignal/baseSignal；readPage也没有在genesis结束后、发列表前检查有效性。列表await后只检查baseSignal，没有检查它自己的listSignal。因此provider忽略abort或发生迟到成功时，每RPC10秒的限制在这两个阶段失效。

独立复现：rpcTimeoutMs=5、operationTimeoutMs=500，分别令genesis或列表延迟20ms但最终成功，readPage仍返回1条消息并发起详情；在genesis期间取消caller后迟到返回正确genesis，最终虽然拒绝，但listCalls=1，仍派发了下一阶段。

最小修复：在genesis/list请求前后检查对应单RPC与整操作信号；genesis返回后先检查再派发列表/重试详情。单RPC超时要报告该阶段超时，caller取消和整操作超时保持操作失败，不把迟到结果当成功。补genesis迟到、列表迟到、genesis中取消且列表/详情调用数为0三个回归，并覆盖共享verifyGenesis的重试入口。无需重写已修好的详情池。

### R2剩余 [P2] header计数仍缺上限与标记账户可写一致性

位置：src/history.ts:158-177、251-254。

numReadonlyUnsignedAccounts目前只验证整数且非负，没有与accountKeys及required signer数量核对。公开夹具仅改numReadonlyUnsignedAccounts=999仍kind=message；改为accountKeys.length-1，使零转账目的标记账户落入只读区域，也仍kind=message。未完成首轮要求的header计数范围与账户角色一致性。

最小修复：验证全部header计数在静态账户数允许范围内，并据header的只读/可写分界确认付款作者与System转账标记账户具有约定角色。不要依赖畸形夹具中的meta.err=null替代结构校验；不要固定假设所有程序必须以某个账户次序出现。补越界、标记只读、有效无预算/有预算布局回归，真实公开夹具必须继续通过。

### R3剩余 [P2] nextCursor仍从去重列表取，重复尾行可绕过无进展检测

位置：src/history.ts:355-367、468、497-500。

normalizeRows先去重，nextCursor仍取rows尾部。原始页[A,B,A]变成[A,B]，返回cursor=B而不是原始尾A；若before=A，无进展检查也被绕过，当前调用仍成功。这是原工单明确要求的原始尾游标回归，不是新增功能。

最小修复：先校验原始页并保存原始尾签名，按该边界判断无进展；去重只影响详情请求与消息输出，不改变分页边界。补[A,B,A]分别在before=null/其他签名时cursor=A，以及before=A时明确无进展的回归；同一签名只取一次详情。扫描计数的原始候选/去重数量语义也写清楚，避免UI误读。

修完上述范围后重跑全部必要检查并更新交付记录，交Codex再审。3.2与2.2继续关闭；保持不签名、不发送、不部署、不提交推送。

## 二审剩余边界修复后：通过（2026-10-31）

- 独立检查：typecheck退出0；6文件107项测试通过（history34）；build输出/tmp/said-review-3.1-final-dist，67 modules，JS312.93 kB/gzip98.67、CSS13.66 kB/gzip3.67，产物文件名与交付一致；git diff --check通过。
- 额外独立断言8组通过：genesis/列表单RPC迟到拒绝；readPage与retrySignatures在genesis中取消不派发后续；header越界/标记只读拒绝且真实夹具仍通过；原始尾游标保留并去重详情；原始尾等于before时报无进展；作者查询实际地址/before/limit/commitment正确。
- R1：请求前后检查单RPC与操作信号，genesis后阶段检查生效；此前已通过的详情取消、操作超时、单笔timeout部分结果保护保留。
- R2：header只读未签名计数范围与标记可写角色校验生效；此前已通过的解析异常/UTF-8/Unicode/索引/负值校验保留。
- R3：原始尾签名与去重列表分离，重复尾行不再改变分页边界，before无进展识别正确。scanned为去重后候选数，UI不得当作全链总数。
- Codex真实Devnet独立核验：2026-10-31T11:46:27.266Z，使用正式history模块、新进程无缓存，pageSize=2的两页分别2条/1条，共3条、2作者，filtered=0、unavailable=[]，费用均80000 lamports；未签名或广播。完整只读证据见[evidence/review-3.1-devnet.json](evidence/review-3.1-devnet.json)。
- 证据边界：本轮公网独立核验覆盖公共流两页；作者独立查询的公网结果为Cline先前交付证据，Codex本轮另用注入RPC断言了查询参数/作者过滤。未声称重跑所有作者公网历史或真机验收。
- 结论允许保存3.1到现有GitHub仓库并准备3.2；当前首页仍为示例，未做UI接入或发布。兼容范围仍为约定的v0/唯一作者/空ALT及支持的ComputeBudget指令，不扩大到所有Solana交易。
- 提交前对包含未跟踪文件的暂存区执行diff检查，发现history.test.ts与REVIEW-3.1.md末尾多余空行，已机械清理；未改变测试逻辑或产品源码。此前普通git diff --check不包含未跟踪文件，最终以暂存区检查为准。
