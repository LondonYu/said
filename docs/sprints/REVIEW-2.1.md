> 历史归档：2026-11-01迁入。原日期、级别与复审结论仅作历史记录，不是当前发布闸门；当前以[STATUS](../../STATUS.md)、[DECISIONS](../../DECISIONS.md)及根目录规则为准。

# Said：Sprint 2.1 未签名构造、费用检查与 Devnet 模拟交付记录

日期：2026-10-31。执行者：Cline；审查：Codex（待复审）。未签名、未发送、未提交、未推送、未部署。

## 范围
- 仅按 SPRINT-2.1.md 实现未签名交易构造、费用检查与 `sigVerify=false` 的 Devnet 模拟；未新增签名/发送能力。
- 未改 wallet.ts/network.ts，未新增依赖（沿用 `@solana/kit@8.6.0`），未接主网、真实历史、后端或数据库。
- 界面工作名 Said 不变，链上协议固定 `app=cyber-guestbook`、`v=1`、`board=public-devnet-v1`、`text`。

## 新增/修改文件
- 新增 `src/message.ts`：正文校验、协议 JSON 编码、v0 未签名交易构造、占位签名槽序列化与大小。
- 新增 `src/simulation.ts`：隔离的模拟 RPC 客户端，genesis 校验、最新 blockhash/高度、余额、`getFeeForMessage`、`simulateTransaction`。
- 新增 `src/message.test.ts`、`src/simulation.test.ts`。
- 修改 `src/App.tsx`、`src/Preview.tsx`、`src/i18n.ts`、`src/styles.css`、`src/App.test.tsx`：编辑预览增加「检查交易」入口与摘要。
- `package.json`、`package-lock.json` 未改。

## 接口
- `validateMessageText(text)`：空白/140 grapheme/560 UTF-8 字节，不 trim 修改正文。
- `encodeMessageText(text)`：固定顺序 JSON。
- `buildUnsignedGuestbookTransaction({ feePayer, text, lifetime })`：System 0 lamports 转账 + Memo4 协议文本；付款者为唯一占位签名者，不创建私钥。
- `createSimulationClient(rpc?, options?)` / `checkTransaction({ feePayer, text, signal })`：先 genesis，再同一 `confirmed` commitment 的 blockhash/高度/余额，编译消息、估费、模拟；费用 null 不填 0；区分 RPC 错误/超时/取消与 `value.err` 程序错误。

## 自动检查
- `npm run typecheck`：退出0。
- `npm test`：5 个文件、66 项通过（wallet 18，network 11，message 8，simulation 9，App 20）。
- `npm run build`：退出0，67 modules；`dist/assets/index-SjBtns4K.js` 311.66 kB（gzip 98.21 kB），`index-oxa21TIy.css` 13.66 kB（gzip 3.67 kB）。
- `git diff --check`：退出0。
- 源码扫描：产品源码未出现签名/发送/主网/私钥/dangerouslySetInnerHTML 命中。

## 真实 Devnet 只读模拟探针
- 使用阶段0已确认且仍有余额的公开测试付款地址 `4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T`（不是用户钱包，未签名，未广播）。
- 实际输出：`balanceLamports=4235100000`，`feeLamports=5000`，`transactionSizeBytes=347`，`simulationErr=null`。
- 模拟日志包含 `Program log: {"app":"cyber-guestbook","v":1,"board":"public-devnet-v1","text":"Sprint2.1真实模拟探针"}`；Memo4 与 System 均 `success`。
- 该结果仅证明构造与 `sigVerify=false` 模拟链路；不构成签名或上链成功。

## 未验证 / 保留
- 当前用户 0 SOL 分支、真实钱包签名/发送（2.2 未放行）、真实历史、主网、业务后端均未执行。
- Bitget 拒绝/取消路径、切账户、横屏/缩放等 1.1B 真机项继续保留未验证。
- 若公开测试付款地址余额变化，真实模拟成功项需重新探针，不把本次结果冒充当前用户或永久通过。

## 恢复
- 未提交；如需恢复仅撤销本轮新增/修改文件，禁止 reset --hard 覆盖既有未提交成果。2.2 未经 Codex 复审不继续。

## 2026-10-31：Sprint2.1独立复审待修复

Codex独立typecheck/66项测试/build/diff均通过，但审查不通过：R1 Memo accounts为空，缺少工单要求的作者签名账户；R2构造入口接受空正文与141字符（已独立复现），缺少强制输入/整笔大小防线；R3过期判断只用模拟前高度，无法覆盖执行期间过期。详见正式仓库docs/REVIEW-2.1-RESULT.md，CLINE-NEXT已更新。Codex只写复审文档，未改产品源码；真实RPC探针本轮未重跑，2.2签名发送继续关闭。下一步Cline按R1/R2/R3修复后复审。

## 2026-10-31：R1/R2/R3修复结果

- R1：Memo 指令显式包含付款作者账户（`READONLY_SIGNER`），整笔仍只有付款者一个占位签名槽；真实模拟日志出现 `Program log: Signed by:` 及付款地址。
- R2：`buildUnsignedGuestbookTransaction` 与 `simulation.checkTransaction` 入口都强制正文规则，非法输入不发 RPC；以实际 base64 解码字节数计算完整交易大小，超过 1232 字节拒绝构造（测试注入更小上限验证防线）。
- R3：模拟返回前重新读取当前高度；模拟 `BlockhashNotFound` 与复核高度超过 `lastValidBlockHeight` 都标记 `blockhashExpired`；重试会重新取 blockhash 与费用。
- 修复后自动检查：typecheck 退出0；`npm test` 5文件73项通过（wallet18/network11/message11/simulation13/App20）；build 退出0，`index-BJFaEPRJ.js` 312.93 kB/gzip98.67，CSS13.66 kB/gzip3.67；`git diff --check` 退出0。
- 修复后真实 Devnet 只读探针：余额4235100000 lamports、估费5000 lamports、交易357字节、`simulationErr:null`、`blockhashExpired:false`，日志含 `Signed by: 4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T` 与协议 JSON。
- 未签名、未发送、未提交、未推送、未部署；2.2 仍关闭，待 Codex 复审。

