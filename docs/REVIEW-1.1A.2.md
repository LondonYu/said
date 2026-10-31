# Said：1.1A.2 交付记录

日期：2026-10-30。实现：Cline；复审：Codex（R1/R2 已通过）；体验验收：用户（未执行）。未提交、未推送、未部署。

## 工单与范围
- 只执行 SPRINT-1.1A.md 的 1.1A.2：首页静态示例信息流、示例详情、仅过滤本地示例的搜索，以及本地编辑预览。
- 保留 1.1A.1 的真实钱包弹层、主题/语言设置、Devnet 只读网络校验，以及 R1 取消等待、R2 切账户余额隔离。
- 未请求签名、未构造或发送交易、未做真实留言写入或历史查询、未接后端/数据库、未使用主网、未新增依赖或重建脚手架。

## 已实现
- `src/Preview.tsx`：静态 `samplePosts`、`draftStats`（`Intl.Segmenter` 计 grapheme，`TextEncoder` 计 UTF-8 字节，空白 `trim` 校验）、`PreviewFeed`、`PreviewSearch`、`PreviewEditor`、`PreviewDetail`。
- `src/App.tsx`：首页示例流、详情弹层、搜索弹层、编辑预览弹层；草稿只保存在 `App` 内存状态，关闭弹层保留，刷新不保留。
- `src/i18n.ts`：补齐三语言（简中/繁中/英文）示例流、搜索、编辑预览、详情、限制与提示文案。
- `src/styles.css`：示例流、编辑器、计数、详情与搜索的响应式样式。
- 预览始终标注「本地预览，未上链」；不伪造交易哈希或链上验证标志，不把示例账户归属给真实钱包。
- 首页示例流标注「示例留言 · 未上链」，并说明是静态示例、不代表真实用户。

## 实际检查（本轮输出）
- `npm run typecheck`：退出0。
- `npm test`：3 个文件、44 项通过（wallet 18，network 11，App 15）。
- `npm run build`：退出0，65 modules transformed；`dist/assets/index-Du_61bB_.js` 282.74 kB（gzip 90.05 kB），`index-B6jXdZp1.css` 13.05 kB（gzip 3.56 kB）。
- `git diff --check`：退出0。
- 依赖无变化：package.json 与 package-lock.json 未在 1.1A.2 修改。
- 首次 App 定向测试 15 项中 2 项因“弹层打开后首页示例仍在 DOM”导致 `getByText` 命中多处而失败；这是测试查询作用域问题，改为 `within(dialog)` 后 15/15 通过，产品实现未因该失败改动。

## 新增回归
- 首页示例流标记清晰，不出现“交易哈希/已上链/签名成功”等文案。
- 本地搜索只过滤示例文本与账户名，无匹配显示空结果。
- 示例详情显示“本地预览，未上链”，不出现链式哈希。
- 编辑预览：空白禁用；超过140个 grapheme 禁用；140个 ZWJ 图文字符（grapheme 未超、UTF-8 字节超过560）禁用；预览可返回修改；关闭弹层后草稿保留。
- 示例流与编辑预览随语言切换为英文。

## 未验证 / 待用户人工验收
- 真实 Phantom/OKX 取消、切账户、断开和余额体验。
- 手机钱包内置浏览器、真机软键盘/安全区/200%缩放/横屏；本轮未重新做浏览器 320–1440px 或真机检查。
- 系统主题真实切换、减少动态效果与键盘 Esc/焦点恢复未重新人工操作。
- 示例流仅本地样例；真实历史读取属于阶段3，不把本交付描述为链上记录通过。

## 改动文件
- 修改：`src/App.tsx`、`src/styles.css`、`src/i18n.ts`、`AGENTS.md`、`README.md`、`docs/DECISIONS.md`、`docs/VALIDATION.md`、`docs/ROADMAP.md`、`docs/SPRINT-1.1A.md`。
- 新增：`src/Preview.tsx`、`docs/REVIEW-1.1A.2.md`。

## 交给 Codex 复审
请按 `npm ci && npm run typecheck && npm test && npm run build && git diff --check` 独立复核；真实钱包与真机仍由用户验收，不把自动检查通过当成用户体验通过。

## R1/R2 复审修复补充（2026-10-30）
Codex 复审发现详情点击区 44×36px、输入字号 15px。已仅修改 `src/styles.css`：详情目标改为固定 44×44，作者行允许收缩；搜索框与编辑框设置 `font-size:16px`。
实际页面无头 Chrome + CDP 测量：320/390/768/1440/844×390 五个视口，6个详情按钮均为 `[44,44]`，两个输入计算字号均为 `16px`；简中/繁中/英文作者行无横向溢出。自动检查仍为 typecheck 退出0、44项测试通过、build 退出0（`index-CvHDh2h9.js` 282.74 kB / gzip 90.05 kB，`index-DjATmW_d.css` 13.12 kB / gzip 3.56 kB）、`git diff --check` 退出0。未提交、未推送、未部署，待 Codex 复审。

## Codex独立复审（2026-10-30）
按锁安装143包后44测试、类型、构建及diff检查均通过；浏览器发现详情44×36px与输入15px，列为R1/R2，整体待修复。详见[复审工单](REVIEW-1.1A.2-RESULT.md)。Codex未改产品源码。

## Codex R1/R2 复审结论（2026-10-30）
- `src/styles.css` 仅针对 R1/R2 做必要修改：详情入口固定为 44×44px；搜索框和编辑框显式设置为 16px。
- Codex 在实际 5173 页面独立复测 320×800、390×844、768×1024、1440×900、844×390：首页与搜索结果中的 6 个详情入口均为 44×44px，两个输入框计算字号均为 16px。
- 在 320px 和 390px 下分别切换简体中文、繁体中文、英文，首页与搜索结果作者行 `scrollWidth - clientWidth` 均为 0；弹层宽度未溢出。
- 独立重跑 `npm run typecheck`（退出 0）、`npm test`（3 文件、44 项通过）、`npm run build`（退出 0，65 modules；CSS 13.12 kB、JS 282.74 kB）和 `git diff --check`（退出 0）。
- 结论：R1/R2 修复通过，无新增代码阻塞项。真机钱包、软键盘、安全区、200% 缩放和手机钱包内置浏览器仍未验收，不能据此标记 1.1A 或 1.1B 整体完成。
