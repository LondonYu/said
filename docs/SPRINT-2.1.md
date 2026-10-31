# Said：Sprint 2.1 构造、费用检查与Devnet模拟

日期：2026-10-31。状态：用户同意先推进无签名模拟，本工单可由VS Code/Cline执行，Codex审查。2.2签名/发送尚未放行。1.1B未整体验收，不能更改为已通过。

## 开工与边界

先读唯一Obsidian项目档案AI交接、AGENTS、SPRINT-2-PREP、DECISIONS、VALIDATION及本工单。检查git status，保存变更清单；保留所有现有未提交成果。同一目录只允许Cline一名实现者。

本轮允许构造未签名交易及调用Devnet simulateTransaction，不新增任何签名/发送能力，不调用钱包signMessage、signTransaction或signAndSendTransaction；不领取测试币、不用主网、不增加业务后端/数据库，不发布生产站点。不重做设计、重写钱包控制器或扩展真实历史。

## 实现顺序

1. 对照阶段0实验源码、当前node_modules内@solana/kit 8.6.0类型及官方RPC文档，确定精确SDK调用，记录类型契约；不要臆造API。优先沿用已安装SDK；需Memo/System客户端时先核实兼容性，精确固定必要版本及lock，不拉取任意latest或整套钱包SDK。
2. 新增独立src/message.ts：复用/提取现有长度规则，严格验证140 grapheme、560 UTF-8字节、非空白；不偷偷trim修改正文。编码固定JSON app=cyber-guestbook、v=1、board=public-devnet-v1、text，界面Said不更改协议。
3. 纯构造模块生成v0未签名交易：付款者为当前连接账户，System向CDiRbgJmeDfUwAYXuoxbr9gYjKetA1UwsCsVLhzFRgKN转0 lamports，Memo4程序Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH写协议文本并要求付款者签名。标记地址非收费地址，不创建账户、不发非零转账。记录完整序列化交易字节数，校验当前协议交易上限；可用占位签名槽序列化，绝不创建私钥或临时签名者。
4. 新增隔离的模拟RPC模块（如src/simulation.ts），复用固定Devnet URL/genesis及取消超时语义；默认不修改network.ts/wallet.ts。每次显式操作先校验genesis，再获取同一commitment的latest blockhash和lastValidBlockHeight、查询余额、编译消息、getFeeForMessage估费。费用为null或请求失败显示未知/重试，不能填0。
5. 使用该消息的blockhash模拟，base64编码、sigVerify=false、replaceRecentBlockhash=false；区分RPC错误、超时和value.err程序执行错误。过期则令结果失效，用户重试时重新构建及估费；不悄悄替换blockhash后把旧费用与新结果混在一起。模拟结果必须明确不验证签名、不广播、不等于上链成功。
6. 余额不足时显示构造/费用结果及不足提示，禁止显示模拟成功。0 SOL用户无需为本轮马上领币；成功的真实RPC模拟可使用阶段0已确认且仍有余额的公开测试付款地址作为独立工程探针（仅sigVerify=false、不签名，不冒认为当前用户）。报告清楚标记探针地址来源、当前余额、构造消息与真实执行结果；若无可用地址，成功项保持未验证，单元mock不能充当真实模拟。
7. 在既有编辑预览中增加明确“检查交易”入口，接上述流程。只在主动点击后请求，不在输入时逐字请求；展示Devnet、完整付款公钥、实际正文、0 SOL转账、网络估费、大小、模拟结果和“未签名、未上链”。普通页面不展示内部协议调试细节，详细日志可在工程交付记录中。没有“确认发布”或签名按钮；示例列表仍为示例。
8. 一次仅一个检查，连点不并发；切账户、断开、正文修改/关闭弹层使当前结果失效并取消页面请求，旧结果不得覆盖新账户/草稿。取消页面等待不声称取消远端已发出的RPC。数据仅内存，保留现有草稿关闭/刷新语义。三语言覆盖新增状态，主题与窄屏沿用现有布局。

## 验证与交付

- meaningful tests：协议/程序/零转账/作者签名位；中文/emoji/ZWJ、空白、两种长度及完整大小边界；null费用、余额不足、模拟err、RPC超时、blockhash过期、取消/旧请求迟到/换账户隔离。保留已有44项回归，不以删断言换通过。
- 按锁安装，执行typecheck、test、build、git diff --check，记录实际输出。源码扫描不得出现调用签名或发送方法的产品路径。真实Devnet模拟独立记录，与mock清楚区分。
- 浏览器检查当前用户0 SOL分支、三语言/两主题、320/390px及横屏、关闭/修改/切账户状态；钱包私密信息不进入证据。未执行真机不写通过。
- 交付docs/REVIEW-2.1.md，包含变更清单、接口、必要依赖版本、检查输出、真实RPC结果/未验证项与恢复方法。更新VALIDATION、DECISIONS、ROADMAP、README及唯一Obsidian日志/交接。未经Codex复审不继续2.2，不提交、不推送；不自行重建隧道或让用户签名。

## 保留的手机限制

用户反馈新origin能打开但Bitget直接连接，无授权框。拒绝/取消路径未验证，不反复换域名；系统/钱包版本、切账户及横屏/缩放等仍待补。截图中钱包侧风险提示原因待核实，不绕过它做交易。2.2开始前另行审查这些关口。

## 核验来源

2026-10-31已核对：https://solana.com/docs/rpc/http/simulatetransaction （sigVerify=false允许未签名模拟，不广播；blockhash处理需明确）。费用RPC参考：https://solana.com/docs/rpc/http/getfeeformessage 。精确SDK实现以本地已安装类型和官方文档为准。
