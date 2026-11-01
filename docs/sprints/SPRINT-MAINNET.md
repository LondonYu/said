# SPRINT-MAINNET：将Said发布入口切到Solana主网

## 用户授权与最小目标

用户明确要求“用Solana真实币呀”，覆盖此前Devnet-only的产品边界。用户自己支付主网网络费，平台不额外收费，不新增转账收款、代付、代币或钱包托管。Codex拆单/确认/部署，Cline实现，用户自行操作真实钱包签名。代理不得代签、广播真实交易、购买SOL或转移资产。

目标：现有Pages发布明确标识主网的版本，用真实SOL网络费发布同样的短留言，再从主网读回。已验收的Devnet记录不迁移，v0.2验收保持关闭。先在工作区实现，交Codex确认；Cline不提交、推送或部署。

## 网络配置契约

1. 新增一个小的统一网络配置模块。只允许构建时VITE_SOLANA_NETWORK=devnet或mainnet；未指定时本地开发/既有测试默认Devnet，非法值明确拒绝，不做运行时URL/query切网或自动回退。
2. Mainnet：chain=solana:mainnet；RPC=https://solana-rpc.publicnode.com；genesis=5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d；board=public-mainnet-v1；Explorer固定https://explorer.solana.com/tx/且指向主网（可省略cluster）。
3. Devnet：保持现有RPC、genesis、solana:devnet和board=public-devnet-v1、Explorer cluster=devnet，既有记录可读。两个网络可共用既有公开marker地址CDiRbgJmeDfUwAYXuoxbr9gYjKetA1UwsCsVLhzFRgKN，因为账本独立并按board再校验；不生成密钥或创建付费账户。
4. wallet、network、message、simulation、publisher、history、explorer和App从同一配置取值。任何网络校验不一致即失败；不能仅更换RPC仍沿用Devnet身份、正文board、回执校验或文案。
5. 本地回执按chain/board隔离。Mainnet用新的明确命名key，不能把同origin旧Devnet回执当主网查询/恢复；Devnet继续读取原key，不丢失已有回执。主题/语言偏好可沿用。
6. Pages原手动main-only工作流保留，只在build命令处显式设置VITE_SOLANA_NETWORK=mainnet。npm run dev及正常npm test仍默认Devnet；不要让普通本地启动意外使用主网。不新增依赖、服务、密钥、账号或付费RPC。

## 交易与展示

- 原v0/System零转账/Memo、140 grapheme/560字节/1232完整大小、单一作者签名槽保持，只有board按网络选择。计算预算400000CU和优先费价格0继续在准备时定义，不引入主网动态优先费策略；基础网络费实际RPC估算，不承诺固定5000lamports。
- publisher现有同消息估费/模拟/签名、逐字节一致与实际Ed25519验签、网络/会话/高度/费用/余额复核、同步签名锁、单次广播、不确定结果原签名查询、回执恢复均保留。签名前后费用变化仍要求重新准备，不可自动加费或转额外SOL。
- 页面顶部、余额、发布审阅和钱包指引三语言明确“Solana主网”“真实SOL”，金额为实际主网余额及估费。只能用户显式点击“签名并发送”后钱包签名。旧“测试币/水龙头/Devnet设置”不能出现在主网使用流程。
- 主网公共流初始为空是正常状态，不能展示旧Devnet四条记录或示例伪装真实主网；详情与回执Explorer链接必须一致指向所选网络。Devnet旧数据仍在旧链，不称为迁移/删除。
- 更新中英文README说明线上主网、默认本地Devnet以及两种构建方法；保留作品定位、已有Logo/布局和已验收Devnet证据，主网真实签名未验前明确标注。

## 范围和执行

允许：一个网络配置模块、现有钱包/网络/消息/模拟/发布/历史/Explorer/三语言/App直接相关改动、Pages的build env、中英文README及直接受影响的既有测试引用/断言。不要重构其他模块、改视觉、增加钱包SDK或补P2。

先读AGENTS/STATUS/DECISIONS，检查git，保留用户AGENTS生成部分/.clinerules/.agents/.memory/.githooks/.workflow.lock。当前同目录只由Cline实现。用户主网授权已更新AGENTS人写范围，不因旧归档Devnet-only文字再次请求确认。

运行现有typecheck、npm test、build，另用VITE_SOLANA_NETWORK=mainnet npm run build确认目标构建。255项为既有基线，不增加测试数量要求；若有直接相关失败，说明原假设与新契约，不通过删断言造绿。

提供可复现截图或构建/只读RPC证据，注明模式和版本。公共RPC只读预检见SPRINT-MAINNET/evidence/rpc-preflight.json：官方端点对本次请求403，PublicNode HTTP200、allowOrigin=*、genesis正确、Memo可执行、marker历史为空；这些不能代替真实浏览器CORS/签名验证。不得悄悄切回Devnet或关闭genesis复核。若关键RPC/浏览器步骤仍阻断，报告具体错误与最小替代，不新增付费服务。

## 验收与停点

M01：公网页面明确主网/真实SOL；无钱包可读真实主网公共流或真实空状态，API网络身份正确。
M02：用户连接主网账户，显示一致的完整公钥与实际主网余额；审阅原正文、零额转账和实际网络费后，由用户自行确认一笔交易。
M03：原交易在主网Explorer/查询中确认且无错误，刷新或重新进入仍可读回该主网留言，旧Devnet消息/回执不混入。

Cline交工作区和STATUS实际结果，未验证项如实保留，不commit/push/deploy、不签名或广播。Codex一次审查，只有有证据P0/P1阻断，最多一轮修复加一轮确认；P2写backlog，不补齐设备/异常矩阵。主网真实钱包验收最终由用户完成，不用测试或模拟替代。

## 回退

保留已验收Devnet代码7216807及Pages运行41308454557。主网候选有问题可恢复上一成功Devnet部署，清楚标识网络；不重写/删除链上交易或跨网络重放回执。

## 本轮不建议修

首次超时B07、B05/B06、全钱包/机型矩阵、主网收费/代付和动态优先费均不在本单。仅切换所选网络并保留现有保护。
