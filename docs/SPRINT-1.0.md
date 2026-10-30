# 留言板：Sprint 1.0 工程工单

日期：2026-10-30。执行者：VS Code 中的 Cline；审查者：Codex；体验验收：用户。

## AI 交接与执行边界
- 当前交付：正式仓库的最小前端骨架、依赖锁文件和工单。钱包模块尚未实现，不能报告 Sprint 1.0 完成。
- 用户已授权按工单分阶段开发。执行本工单不必每改一个文件都请求许可；范围外需求先记待办。
- 同一时刻只有一个执行者修改这个仓库；开始前运行 git status，保留用户已有修改。
- 先读本文件、AGENTS.md、docs/DECISIONS.md。不得把阶段0实验页直接改名当成正式产品。
- 本轮产品名称只用「留言板」。不做主网，不签名，不发送交易，不增加留言输入或历史列表。

## 1. 目标与前置证据
用户能发现钱包、明确选择钱包并连接，看到完整公钥、断开和当前 Devnet 查询状态；拒绝连接、切换账户和 RPC 异常后可以恢复。

阶段0已证明：两个签名地址、三笔真实Devnet留言可通过板级地址独立读回，16项实验测试通过。未验证的真实拒签、手机、OKX与界面刷新保留待办；它们不阻止准备仓库，但不能因此声明已验收。

阶段0曾漏掉钱包端 Testnet Mode 指引，也曾误过滤钱包附加的 ComputeBudget 指令；本工单必须明确区分钱包能力、钱包当前显示和应用RPC网络。

## 2. 固定技术选型
| 项目 | 版本 / 规则 |
| --- | --- |
| Node / npm | 本机验证基线 Node 26.12.1 / npm 11.20.0 |
| React / React DOM | 19.3.1 / 19.3.1 |
| TypeScript | 7.0.2，strict=true |
| Vite | 8.3.5，纯静态前端，开发地址仅127.0.0.1:5173 |
| @solana/kit | 8.6.0，仅用于本工单的类型及只读RPC |
| @wallet-standard/app | 1.1.1，已在阶段0验证发现Phantom |
| React类型 | @types/react / @types/react-dom 均19.3.0 |
| 测试 | 实现功能时加入 vitest 5.0.5，精确版本并更新lock；使用node环境测试独立逻辑，不先装整套端到端框架 |

使用 Wallet Standard 原生发现、连接和账户事件，封装在一个小模块中；本次不引入旧版wallet-adapter、Next.js、数据库、钱包厂商嵌入式登录或服务端。React开发插件当前未引入，Vite原生支持TSX；可为Fast Refresh单独提出必要变更，不能为此重建脚手架。

## 3. 文件职责和可改范围
| 文件 | 职责 |
| --- | --- |
| src/App.tsx | 组合钱包选择、连接/断开、完整地址、网络与余额状态 |
| src/styles.css | 基础暗色布局、可读状态及窄屏排版；不做完整视觉设计 |
| src/network.ts | 固定Devnet参数、读取并核验genesis、读取指定地址余额 |
| src/wallet.ts | Wallet Standard发现与连接生命周期、事件清理、异步请求失效 |
| src/wallet.test.ts | 钱包生命周期与竞态的针对性测试 |
| src/network.test.ts | 错网、RPC错误与余额读取的针对性测试 |
| package.json / package-lock.json | 仅加入上述测试工具和必要脚本，精确锁定版本 |
| docs/VALIDATION.md | 记录真实运行结果与人工验收状态 |

已有main.tsx、Vite配置、TypeScript配置仅在必要时修改。不复制实验的交易构造、Memo解析、发币、水龙头或签名发送代码。

## 4. 接口与状态约束

### 网络
- 固定RPC：`https://api.devnet.solana.com`。
- 固定预期genesis：`EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`。
- `verifyDevnet(signal: AbortSignal): Promise<void>`：getGenesisHash不匹配即抛错，不能继续读取余额并显示“就绪”。
- `readBalance(address: string, signal: AbortSignal): Promise<bigint>`：先核验地址，返回lamports；RPC失败不得返回0冒充余额。
- RPC超时10秒；本阶段只允许用户显式重试，不无限自动循环。
- 网络状态：checking / ready / error。ready只说明应用RPC确为Devnet，文案写“应用查询网络：Devnet”，不冒充钱包主动网络检测。
- 某WalletAccount.chains包含solana:devnet只表示支持能力，不能据此显示“钱包已切Devnet”。
- 页面始终提供指引：Phantom设置→开发者设置→Testnet Mode→Solana Devnet。不得开启自动确认。

### 钱包
- `createWalletController()`返回一个小型控制器，提供getSnapshot、subscribe、connect、disconnect、dispose；Wallet Standard注册表可作为可选依赖传入以做测试，不建立通用依赖注入框架。
- connect输入为用户所选Wallet对象；输出通过状态快照体现，不静默选择其他钱包或其他账户。
- 快照至少含wallets、status、walletName、accountAddress、error；status为disconnected / connecting / connected / error。所有错误值是适合显示的文字。
- connect仅调用standard:connect；disconnect仅调用standard:disconnect（若无此能力，清空本地连接状态并说明）。
- 账户筛选仅接收具有solana:devnet支持能力的Solana账户；如多个符合账户，明确选择或显示钱包返回的首个账户并允许用户在钱包中切换，不能猜测账户归属。
- 监听standard:events的change；账户改变时更新公钥，立即清空旧余额并重新核验网络和读取新余额；账户列表为空则变为disconnected。
- 用请求序号/AbortController让已过期的连接及余额请求失效。断开后返回的旧连接结果不能重新把页面设为已连接；旧地址余额不得覆盖新地址。
- dispose清理注册、取消注册、账户事件及订阅。React StrictMode重复挂载不能累积监听。
- 不自动连接、不记住钱包授权、不调用签名消息/交易/发送接口，也不把“仅连接”说成身份认证或登录授权。

## 5. 实现顺序与验收
1. 确认骨架基线：npm ci、npm run typecheck、npm run build；记录输出，不重建目录。
2. 加测试工具和钱包控制器。先写能复现拒绝、切账户、断开竞态的失败测试，再实现最小逻辑。
3. 实现固定网络只读模块与测试，覆盖genesis不匹配、RPC超时/错误、有效0余额和过期结果。
4. 接入React视图：标题「留言板」、Devnet说明、钱包列表、连接/断开、完整地址、余额/错误/重试。余额0不影响连接验收，本阶段不要求领币。
5. 运行typecheck、test、build并审查改动；把实际结果写入docs/VALIDATION.md。
6. 交给用户在Chrome做真实连接验收。未操作的项写“未验证”，不伪造截图或钱包事件。

| 编号 | 条件 | 预期结果 / 验证方式 |
| --- | --- | --- |
| W01 | 无钱包扩展 | 显示未发现钱包和安装后刷新指引；没有空白页或死按钮 |
| W02 | 钱包后注册/被取消注册 | 列表更新；已选钱包不存在时清空选择，已连接钱包消失时清理状态 |
| W03 | 连接成功 | 显示钱包名称及完整公钥；网络/余额独立显示加载状态 |
| W04 | 拒绝或关闭连接窗口 | 显示已取消/未连接，可再次点击；不是永久connecting |
| W05 | 连点连接 / 断开时连接仍在进行 | 不并发弹窗；旧请求不恢复已断开的状态 |
| W06 | 钱包切到另一个Solana账户 | 地址更新，旧余额立即失效，新余额属于新地址 |
| W07 | 钱包侧移除连接/清空账户 | 页面断开并清空地址、余额与错误遗留 |
| W08 | 页面卸载再挂载 | 监听已清理，一次事件只生效一次 |
| N01 | RPC genesis不是Devnet | 显示网络校验失败，不出现“就绪” |
| N02 | RPC限流、超时或异常 | 显示错误和重试；不显示假0余额 |
| N03 | 正常0余额 | 明确显示0测试SOL，钱包连接仍成功 |
| N04 | 切账户时旧余额稍后返回 | 不覆盖新账户余额 |
| S01 | 审查源码与浏览器操作 | 无签名/交易发送入口，无主网URL、私钥或API key |
| U01 | 390px窄屏 / 桌面 | 无横向溢出，完整地址可换行；窄屏布局不等于手机钱包已验收 |

## 6. 完成定义与回退
- typecheck、针对性测试、生产build实际通过，输出证据完整。
- 用户真实连接、拒绝、断开、切账户验收通过，或明确列出待用户操作项；未完成时状态保持“待验收”。
- Codex检查diff与证据，确认范围内无交易写入能力。
- 不执行git reset --hard或清理用户文件；在确认基线之后按小闭环提交，使用新提交回退变更。
- 不推送GitHub、不部署、不创建或导入钱包，不改用户的密码/浏览器配置。

## 7. Cline首条指令
请在当前VS Code项目中读取AGENTS.md、docs/SPRINT-1.0.md、docs/DECISIONS.md和docs/VALIDATION.md，先核对git状态和骨架基线，再逐项执行Sprint 1.0。只实现Devnet钱包连接、断开、账户事件、网络核验与余额读取；明确区分钱包能力与实际网络状态，禁止签名、交易发送、留言输入和历史列表。遇到依赖/规格矛盾先查实际版本和文档，记录取舍，不整套重写。完成后提供改动文件、实际检查输出、未完成项与人工验收步骤，不宣称未经操作的钱包体验已通过。
