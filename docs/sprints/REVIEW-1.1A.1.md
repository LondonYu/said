> 历史归档：2026-11-01迁入。原日期、级别与复审结论仅作历史记录，不是当前发布闸门；当前以[STATUS](../../STATUS.md)、[DECISIONS](../../DECISIONS.md)及根目录规则为准。

# Said：1.1A.1交付记录

日期：2026-10-30。Codex本轮直接实现；代码与自动检查完成，真实钱包/手机体验待验收。未开始1.1A.2。

## 已实现
- 正式React项目接入Said页面框架、桌面侧栏、手机顶栏与四项悬浮导航。
- 用户SVG透明底、currentColor随主题变色，手机图标48px/字标60×24px，横屏相应缩小。
- 钱包弹层接实际Wallet Standard发现结果，连接、取消等待、断开、公钥、Devnet余额/错误/重试沿用原逻辑；未迁移原型的模拟连接。
- 深浅/系统主题、简中/繁中/英文，刷新保留；损坏/不可用存储可降级。外部错误原文保留在可展开详情，主提示本地化。
- 发布、搜索和留言历史仍明确未开放；没有签名、发送或真实历史查询。

## 实际检查
- 接入前34项回归、类型检查通过；适配新入口的10项App测试在旧界面上先失败。
- 最终npm test：39项通过，wallet18/network11/App10。
- npm run typecheck、npm run build通过；64 modules，JS 275.82kB / gzip87.95kB，CSS11.09kB / gzip3.18kB。
- wallet.ts、network.ts、package.json、package-lock.json与开工快照哈希一致；App原有控制器、action序号及网络地址归属代码保留。
- 浏览器320/360/390/430/768/1024/1440及844×390横屏均无横向溢出；可见图标触控目标均至少44px。证据work/Said-1.1A.1/responsive-checks.json。
- 浏览器观察无钱包提示、实际Devnet网络校验、Esc关闭与焦点回到原入口、英文/繁中切换、英文浅色刷新保留、390px全屏弹层及深浅Logo颜色。
- 手机设置入口因CSS优先级多出底栏第五项，已修复并重验八组视口。

## 未验证
真实Phantom/OKX取消、切账户、断开和余额体验；本轮IAB未发现钱包。真机键盘/安全区、200%缩放和HTTPS手机钱包入口尚未验收。系统主题变化通过单元回归，未操作系统主题。不得把上述模拟检查写为真机通过。

## 改动与恢复
修改App.tsx、App.test.tsx、styles.css、index.html、AGENTS.md、README.md；新增Brand.tsx、Icons.tsx、Modal.tsx、i18n.ts、usePreferences.ts及public/said-favicon.svg。工程文档同步本记录。
开工前完整src/docs及相关配置快照：work/Said-1.1A.1/before；Git状态及原有差异另存同级。恢复时先另存当前工作，再仅恢复本轮改动文件，新增文件移到备份目录；禁止reset --hard或覆盖原有未提交成果。

下一步：完成本批真实钱包体验验收；工程审查范围内未发现阻断项后进入1.1A.2示例信息流与编辑预览。1.1B仍负责HTTPS与真实手机钱包只读验证。未提交、推送或部署。
