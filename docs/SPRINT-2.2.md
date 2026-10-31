# Said：Sprint 2.2 Devnet 单条发布工单（规划稿）

日期：2026-10-31。基线：3.2已复审通过并推送6b084d9。**本轮仅完成规划，A/B均未执行，产品签名与发送继续关闭。** 未来由CLINE-NEXT明确当前执行段，不因读到本文件就开放写入。Cline实现，Codex分段复审；真实钱包操作由持有者点击并在钱包确认。

## 目标、边界与拆分

闭环：原文校验 → 准备并模拟同一笔交易 → 审阅Devnet/完整作者/正文/实际估费 → 用户主动请求钱包签名 → 验证返回交易 → 单次广播 → 确认原签名 → 从链上读回 → 更新公共流及原作者历史。

只用Devnet测试SOL，不使用主网或真实资产，不收私钥/助记词/钱包密码，不新建业务后端、数据库、合约或链协议；保留Said视觉、3.1读取与3.2生命周期保护。没有点赞、回复、多链、代付或商业收费。

| 审查点 | 允许实现的内容 | 真实钱包/真实广播 |
| --- | --- | --- |
| 2.2A 发布核心与恢复契约 | 捕获钱包会话/能力、不可变待签交易、签名返回校验、提交/确认状态机、最小回执与测试；独立模块及必要接口，不接发布UI | 禁止调用真实钱包签名或真实sendTransaction；使用注入钱包/RPC测试，实际网络仅只读 |
| 2.2B 页面接入与持有者验收 | A复审通过后另行明确接入，审阅/签名/结果/回执恢复与只读流整合，沿用当前UI | 仅用户显式点击及钱包确认的单笔Devnet交易；Codex/Cline不代点钱包签名 |

先交A及REVIEW-2.2A，复审通过后再执行B。当前两个审查点都只是规划，不能一次交整套后声称验收。

## 已核实的缺口与首版取舍

- wallet.ts目前只暴露walletName/accountAddress等连接快照，未保存可供安全签名的会话接口；不能按显示名在注册表find一个钱包就当作当前签名者。
- simulation.checkTransaction当前只返回费用/余额/blockhash等结果，不返回本次实际模拟的wire/message字节。发送前必须获得同一份待签快照，不能拿旧摘要另建一笔最新交易去签。
- 首版只接Wallet Standard `solana:signTransaction` 1.0.0且支持版本0的账户，显式传chain=`solana:devnet`，拿回完整signedTransaction后由固定Devnet RPC提交。只支持signAndSend的钱包显示当前发布不支持，仍可连接/只读；不偷偷回退到签发合一、legacy、其他链或非标准注入API。
- 标准允许钱包修改返回交易；Said首版更严格：返回messageBytes必须与已审阅/模拟的一字节不差。钱包追加ComputeBudget、改blockhash等均拒绝并显示未发送；不把它视为钱包恶意，也不声称所有已连接钱包都能发布。兼容扩展需另有工单，不能放宽校验顺手兼容。
- 2.2B签名前先记录实际钱包/版本/能力；Bitget/Phantom此前只读通过不等于发布兼容已通过。无支持钱包时如实记录，不为“跑通”绕过能力或钱包警告。

## A1 钱包会话与待签快照

1. 先读AI交接、AGENTS/CLINE-NEXT、2.1及3.1/3.2最新复审、wallet/message/simulation/history/historyFeed现有接口，检查git状态。新增最小发布模块（如publisher.ts及测试），不重写已有控制器/读取器。
2. 钱包控制器最小扩展保存真正连接成功的Wallet对象及WalletAccount；签名会话需有可失效的revision/token，连同作者地址与publicKey、支持能力一并绑定。账户publicKey须为32字节且编码等于address；钱包/账户features都要支持该签名特性，supportedTransactionVersions包含0，chain包含devnet。
3. 连接请求更新、取消/断开、账户变化、钱包注销和相关能力变化使旧签名会话失效；同名钱包不能混淆。每次真正调用钱包前、返回后及广播前重新核对会话/账户/能力。不要为了签名失效去破坏现有连接generation与事件订阅规则。
4. 复用统一正文规则并确保well-formed Unicode，避免把读取器会拒绝的孤立代理项签上链。原文不trim修改；保留140 grapheme/560 UTF-8字节与整笔1232字节上限。
5. 准备结果保留本次实际估费/模拟所用的unsigned wire、message字节、作者/原文、blockhash/lastValidBlockHeight、费用与余额、Devnet标识和会话revision。可用不可变base64字符串与私有字节副本，不能靠Object.freeze(typedArray)或TS readonly假装内容不可变。
6. 估费、模拟与签名必须使用同一消息。费用null、余额不足、模拟程序错误/超时、错误genesis、区块哈希过期或不完整摘要都不能进入签名；显示过的静态2.1快照不能无限期当作有效。每次RPC前后检查caller/操作/单RPC信号，迟到成功也拒绝。
7. A可小幅扩展simulation的准备输出或抽取最小复用函数，但不能更换blockhash后沿用旧费用/模拟结果，也不能只加一个“通过=true”标记。所有必要接口/旧测试调整写入交付，默认不增依赖。

## A2 签名、验证与提交边界

1. 实际签名只在B用户点击后发起，传captured WalletAccount对象、明确devnet chain和待签交易副本。每页一次一个尝试、同钱包底层签名Promise未结束前不并发弹窗；页面取消等待/关闭编辑不声称关闭钱包弹窗或撤销授权。草稿/账户/会话变化或卸载使未广播结果失效，晚到签名不得自动发送。
2. 签名前和签名返回后均复核Devnet genesis、原blockhash有效高度、原消息费用与余额；过期或报价改变需要重新准备/审阅，不自动更新消息或替用户再签。程序不调用signMessage、不生成产品钱包、不存私密凭据。
3. 返回值按unknown校验：单个输出、Uint8Array wire、大小合法、v0无ALT且唯一作者签名槽；用现有Kit decoder解码，messageBytes与私有准备快照精确一致。任何额外指令/替换正文/付款者/标记/金额/blockhash/签名槽都不能广播。
4. 作者签名必须非空、非全零并做Ed25519验签。当前Kit的assertIsFullySignedTransaction只是签名存在性检查，不能替代verifySignature；使用getPublicKeyFromAddress/verifySignature等已核实API，不手写密码学。浏览器不支持所需验签API时明确显示不支持且零广播，不能跳过验签。测试可生成一次性内存密钥进行验真，但禁止把私钥导出/写源码/日志/夹具或访问用户密钥。
5. 从已验证signed wire的首签名本地计算base58交易ID，在调用sendTransaction前已知它；RPC返回签名须一致。不因RPC返回不同签名就抹掉本地原签名或声明未发送。
6. 默认提交只调用一次固定Devnet sendTransaction，encoding=base64、skipPreflight=false、preflightCommitment=confirmed；原blockhash/估费/模拟采用一致confirmed策略。可显式设置有限节点重播（例如maxRetries=2n），它只重播同一字节/签名，不是重新签名；禁止客户端自动重建、换blockhash或重复发送新交易。
7. send开始后RPC超时、连接中断、响应丢失、账户切换或关闭页面，都可能已经进入网络。此后只允许保留原签名并查询，不把取消HTTP称为撤回交易。预检明确拒绝与传输不确定分开；无法可靠分类时保守标为待确认。

## A3 最小回执与确认恢复

- 广播前先同步保存最小版本化回执：仅devnet/版本/作者/本地签名/blockhash/lastValidBlockHeight（十进制字符串）及本地记录时刻/尝试状态；不保存原文草稿、unsigned/signed wire、钱包对象或秘密。记录时刻不是链上时间。状态进入“提交中”并落盘成功后才派发send；写入失败则未调用广播，明确提示，不先发送再尝试保存。
- 回执有界（建议最多10条，优先清理终态，不静默覆盖未解决记录）；localStorage不可用、损坏或配额不足不能白屏或伪造确认成功。恢复的数据是未受信输入，校验版本、devnet标识、地址/签名和数值；存储的“成功”标记也不当作本轮链上已验证证据。
- 页面刷新/重进后无需钱包就能显式查询原回执；恢复路径不得调用钱包或send，不依赖草稿仍在。每个attempt本页只提交一次，不承诺跨设备/多标签全局幂等，协议不新增nonce字段。
- 有界查询getSignatureStatuses（searchTransactionHistory=true），只查原签名；confirmed/finalized且err=null才可显示相应级别确认，processed/缺失/未知状态不提升为确认。confirmed的错误明确显示执行失败及实际网络费可能发生，不能写成“没有花费”。
- 初次提交后的主动确认建议最多10轮、轮间隔不少于3秒、整体最多45秒，单RPC默认10秒并可取消；不留永远运行的轮询、定时器或后台重签。超时/429/null保持待确认，提供显式“检查原交易”，每次同样有界。
- 高度到期看original lastValidBlockHeight，不能把slot或计时器当blockHeight；发送后到期结合finalized高度及历史状态再查，不把“超过有效高度+查不到”武断表述成从未执行过。记录“有效期已过，尚未查到确认”，保留回执，不自动重发。
- 同一尝试未解决时只恢复状态，不把“重试”按钮接到再次签名发送。若用户另开新留言，必须显式重新输入/审阅/签名，旧未确认回执保留提示，不能暗中把原草稿重签为另一笔。
- 确认与读回分开：确认达到confirmed后用现有history解析器按该签名读回并核对作者、协议与原文；getTransaction暂不可得时显示“交易已确认，留言读取暂未就绪”，保留重查入口，不能回到发送重试。恢复回执时正文取真实链上记录，不把当前草稿塞作结果。

## B 页面接入契约（A通过后另行执行）

沿用编辑预览，加入实际Devnet/完整付款者/原文/估费及公开、广播后本站无法撤回的简洁说明，再由用户点击“签名并发送”。无连接/不支持能力/费用未知/余额不足/无效摘要时禁用并说明原因；不创建主网入口、不诱导转主网SOL。

状态至少区分准备、待签、等待钱包、验证签名、提交中、待确认、confirmed/finalized、链上失败、未发送/签前过期、确认后读回待就绪；每次只一个操作，同步锁/会话revision/请求序号防连点与旧finally解锁。已签但未广播的过时结果丢弃；广播后的原作者回执不能因切到账户B就显示为B的留言或被清空。

关闭编辑、切账户、刷新浏览器的取消语义分发送前/后处理；回执确认面板不能只活在会卸载的弹层内部。成功后只在仍为原账户/原草稿时清理该草稿；确认后重新读公共流及原作者历史，不乐观插入假链上记录、不因列表RPC失败再次发送，也不覆盖用户已经开始的新草稿。

新增状态文案覆盖简中/繁中/英文、保持主题/手机触控/键盘布局。Explorer只固定官方域名、cluster=devnet及noopener/noreferrer；正文纯文本。主网、生产部署和新的公网入口不在本规划的自动授权内，真机需要入口时单独按已有临时HTTPS流程安排。

## 必须验证与分段交付

| 类别 | A关键测试与B验收 |
| --- | --- |
| 会话与能力 | 同名钱包、不同账户对象、feature缺失/仅signAndSend/无v0、publicKey/address不一致、切账户/注销/断开，均不签错对象 |
| 审阅一致性 | 估费/模拟/wallet输入消息一致；篡改正文/金额/标记/付款者/blockhash/ComputeBudget/签名槽拒绝；空/假签名与验签失败拒绝 |
| 前置失败 | 非法正文（含孤立代理项）、未知费用、余额不足、genesis错、前后过期、请求超时或迟到，检查不调用签名/广播的次数 |
| 生命周期 | 连点、拒签、取消页面等待、钱包Promise迟到、签名前后草稿/会话变化、卸载，旧结果不发送或覆盖新操作 |
| 发送与恢复 | 回执写入先于send且失败零广播；一次尝试一次send；响应丢失/签名不一致用本地原签名恢复；刷新后查询零签名零广播；坏回执不假成功 |
| 确认与读回 | processed不假confirmed、confirmed err非null、null/429/超时/到期不自动重发、有界轮询清理、确认与列表暂不可读区分、原作者归属与新草稿保护 |
| 兼容与真机 | A只用注入测试和必要公开只读探针；B持有者在已核对钱包能力/网络的独立Devnet测试账户上显式操作，记录钱包/系统版本、拒签、成功Explorer及新会话无缓存读回 |

先有针对性失败测试再实现；保留现有132项回归。typecheck/全部测试/build、git diff --check及包含新增文件的暂存/空白检查均需记录实际输出；只读/模拟/假钱包不能替代真实签名验收。没有测试币或不支持的钱包，保留未验证，不申请真SOL、不自动领币、不绕过警告。

A交docs/REVIEW-2.2A.md，列明接口/状态、消息字节一致性、回执字段、调用次数及真实/注入证据；确认产品UI仍不可签名发送，未调用真实写RPC，交Codex复审后停。B另交REVIEW-2.2B与真实钱包证据。两段均由Codex审查后提交到同一GitHub仓库，Cline不自行提交/推送/部署。

## 核验来源与范围说明

- Wallet Standard类型：https://github.com/anza-xyz/wallet-standard/blob/master/packages/core/features/src/signTransaction.ts
- signAndSend区别：https://github.com/anza-xyz/wallet-standard/blob/master/packages/core/features/src/signAndSendTransaction.ts
- RPC提交语义：https://solana.com/docs/rpc/http/sendtransaction
- 状态查询：https://solana.com/docs/rpc/http/getsignaturestatuses
- 确认与到期：https://solana.com/developers/cookbook/transactions/confirmation
- 精确SDK：本地@solana/kit 8.6.0已核对getTransactionDecoder、getCompiledTransactionMessageDecoder、getPublicKeyFromAddress、verifySignature、getBase58Decoder等导出存在；getSignatureStatuses/sendTransaction配置按安装类型处理bigint，别套旧web3.js接口。

仅signTransaction、要求消息不变、单作者v0、回执先落盘和分段交付是Said首版工程取舍，不是Wallet Standard或Solana对所有应用的规定。当前仅完成资料核对与工单，不等于上述模块已实现或钱包兼容已验证。
