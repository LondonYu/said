# SPRINT-2.2B R1：钱包能力getter兼容（唯一修复轮）

## 真实触发证据与级别

P1：用户公网截图“截圖 2026-11-01 下午8.20.10.png”显示Chrome连接账户后，Devnet模拟通过、余额0.00609 SOL、估费0.000005 SOL，但准备发布按钮禁用，原因“签名能力事件与钱包实时状态不一致，请重新连接”。用户补充确认钱包为电脑Chrome Phantom，扩展版本未提供；实际getter实现未直接观察。

本地无钱包探针可重现同一提示：get features每次构造新feature对象，方法引用、1.0.0版本、v0与Devnet能力均保持一致，连接仍被错误标为不可签名。参考官方Wallet Standard示例：https://github.com/wallet-standard/wallet-standard/blob/master/packages/example/wallets/src/solanaWallet.ts ，其features getter同样构造新对象。示例本身只声明legacy，不能当作该示例可签v0的证据；本探针明确声明v0。

## 范围与实现目标

- 先读AGENTS/STATUS/本单并检查git；保留用户原有规则、记忆、技能和钩子改动。
- 只修src/wallet.ts中的签名能力一致性判断，必要时调整受影响的src/wallet.test.ts既有假设。仅当会话契约确实需要，才对src/publisher.ts作最小适配并在交付解释；不要改网络、协议、UI、依赖、费用或交易字节逻辑。
- 不把features表/签名feature包装对象的引用相等当作签名能力有效的必要条件。相同方法和相关能力值返回新包装对象时，正常连接及getSigningSession必须可用，旧会话不应仅因此失效。
- 用不可变的相关能力快照核对事件期望、实时getter与会话：签名方法引用、特性版本、v0能力、Devnet授权、账户地址/公钥与账户签名能力。保留原有账户/断开/revision保护。真实方法替换、撤销、版本/v0/Devnet能力变化仍失效；单纯包装对象不同不算变化。不要通过删除实时复核或只信事件解决。
- 保留按原方法调用所需的上下文，不能因抽取方法造成钱包this绑定异常；以既有接口为准，不加通用适配层。
- 正向核验采用每次返回新feature包装对象、方法引用稳定的getter；负向核验保留方法替换/真实撤销的既有语义。若旧测试只要求包装对象替换就失效，按新契约修正断言，不能以维持该错误假设为理由保留误拦。

## 验证与停点

执行现有typecheck、npm test、build及diff检查，报告实际结果，不设新增测试数量门槛。复现探针不得连接真实钱包、签名或广播。可复现截图或探针输出必须明确为模拟，不冒充用户钱包验证。

这是2.2B的一轮修复，之后仅一轮确认；不得借此扩展异常矩阵。完成后更新STATUS并停在工作区交Codex确认，不commit/push/deploy；Codex确认后再安排候选更新与用户重试。P2/B05/B06继续后置，末尾列“本轮不建议修”。
