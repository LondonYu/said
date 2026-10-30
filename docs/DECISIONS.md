# 技术决策

## 2026-10-30：从实验转入正式项目准备

- 阶段0已有两位签名作者、三笔真实Devnet留言，通过板级标记独立发现与读回；实验测试16项通过。
- 这支持准备正式仓库和钱包工单。界面刷新、手机、其他钱包及异常交互未全部操作，继续保留验收项，不称整个MVP或全部阶段0通过。
- 采用Vite + React + TypeScript的静态前端，不引入Next.js、业务后端、数据库或自定义合约。
- SDK使用@solana/kit 8.6.0，钱包连接使用@wallet-standard/app 1.1.1。Wallet Standard原生发现与连接已在实验中使用；当前只读场景暂不增加完整交易插件体系。
- 依赖精确版本经npm元数据核实，最终以package-lock为可复现依据。验证环境Node 26.12.1、npm 11.20.0。
- 本次骨架没有测试性业务逻辑，因此只核验类型和生产构建；功能测试由Cline随钱包状态模块一起实现，测试工具固定vitest 5.0.5。不使用空测试通过标志掩盖未实现状态。
- 不引入React开发插件，Vite直接转译TSX；Fast Refresh不是当前验收条件。

## 阶段0必须延续的经验

1. Phantom需要明确的Testnet Mode → Solana Devnet指引；应用RPC为Devnet不等于钱包当前显示已核验。
2. 每次连接显示完整公钥，切换账户后旧余额和旧异步结果立即失效。
3. Memo4在本次实验的140中文/emoji样本中通过；旧Memo3默认计算预算曾失败。此结论留给后续写入工单，当前不引入Memo依赖。
4. 钱包会在发送时附加ComputeBudget指令和优先费，后续读取器不能假设交易只有两条指令；估算基础费不等于最终费用。
5. Devnet可能重置，公共RPC历史保留未知；不宣传永久可访问。

## 来源

- Solana前端：https://solana.com/docs/frontend
- Vite：https://vite.dev/guide/
- Phantom开发者设置：https://help.phantom.com/articles/28951369255699
- 阶段0详细签名、回归证据和剩余待办：唯一知识库的「项目/留言板-阶段0技术验证报告」。
