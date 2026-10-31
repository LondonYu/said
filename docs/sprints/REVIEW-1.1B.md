> 历史归档：2026-11-01迁入。原日期、级别与复审结论仅作历史记录，不是当前发布闸门；当前以[STATUS](../../STATUS.md)、[DECISIONS](../../DECISIONS.md)及根目录规则为准。

# Said：1.1B.1 临时 HTTPS 静态预览记录

日期：2026-10-30。执行者：Cline。状态：临时入口已建立并核对，待 Codex 复审后交用户做 1.1B.2 真机钱包只读验证。未提交、未推送、未部署。

## 范围
- 仅按 SPRINT-1.1B 的 1.1B.1 准备 `dist` 临时 HTTPS 测试入口，不改产品源码、依赖或已确认设计。
- 保持 Devnet 只读，不签名、不构造/发送交易、不真实历史查询、不主网、不数据库、不后端、不生产发布。

## 构建与自动检查
- `npm run typecheck`：退出0。
- `npm test`：3 个文件、44 项通过（wallet 18，network 11，App 15）。
- `npm run build`：退出0，65 modules；`dist/assets/index-CvHDh2h9.js` 282.74 kB（gzip 90.05 kB），`dist/assets/index-DjATmW_d.css` 13.12 kB（gzip 3.56 kB）。
- `git diff --check`：退出0。

## dist 文件与 SHA-256
| 文件 | SHA-256 |
| --- | --- |
| dist/assets/index-CvHDh2h9.js | a90f06753cffcbcc80ba6c600183ec7f6ee0324fc25fae95b89914c2d3dac8ba |
| dist/assets/index-DjATmW_d.css | 614e6202916cbf090a1e325fa222c4136f2a147e9d2555bfd63f7b7f8b43016b |
| dist/index.html | c01435af7bb3bfbe47e2e0f7355e1026587e54a350d551cbd60e887c27df89cc |
| dist/said-favicon.svg | 8c19ed56849372680707a2337c02b48f888c45e242e1d686fc6f824a34911f58 |

dist 未发现 `.env`、密钥、私钥、助记词、日志、源码映射或意外文件。

## cloudflared 获取
- 系统 PATH 未发现 `cloudflared`/`vercel`/`wrangler`。按工单从 Cloudflare 官方 GitHub Releases 临时下载 `cloudflared-darwin-arm64.tgz`，未安装到全局，未修改现有 Cloudflare 配置。
- 版本：`cloudflared version 2026.10.6`。
- 官方资产 URL：`https://github.com/cloudflare/cloudflared/releases/download/2026.10.6/cloudflared-darwin-arm64.tgz`。
- 下载 tgz SHA-256：`ea1e5105d35bbe16cee5b2f7b4742059ada341fbd35938ed827c24b85efa51c8`。

## 静态服务
- 命令：`python3 -m http.server 5181 --bind 127.0.0.1 --directory dist`
- PID：857；启动时间：2026-10-30T21:46:40+0800。
- 只绑定 127.0.0.1；5181 与 5173 启动前均为空闲。

## 临时隧道
- 命令：`/tmp/said-cloudflared/cloudflared tunnel --url http://127.0.0.1:5181 --no-autoupdate --protocol http2`
- PID：2686；启动时间：2026-10-30T21:47:36+0800。
- 首次默认 QUIC 连接失败并返回 530，改用 `--protocol http2` 后成功注册连接。日志见 `/tmp/said-tunnel-http2.log`。
- 临时 HTTPS 入口：`https://bargain-wives-battle-dealt.trycloudflare.com`（链接重启会变化，无可用性保证，不用于生产）。

## HTTPS 入口核对
- `GET /`：HTTP/2 200；引用的 `/assets/index-CvHDh2h9.js` 与 `/assets/index-DjATmW_d.css` 均 200；`/said-favicon.svg` 200。
- 无头 Chrome + CDP 实际打开 HTTPS 页面（390×844）：
  - `window.isSecureContext === true`。
  - 首页包含「示例留言 · 未上链」。
  - 打开编辑预览包含「本地预览，未上链」，`computed font-size` 为 16px。
  - 页面内 fetch Devnet 公共 RPC：`status:200`，`genesis:EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`，与固定值一致。

## 停止与复开
- 停止本次临时入口：`kill $(cat /tmp/said-tunnel.pid)` 后再 `kill $(cat /tmp/said-http.pid)`；仅停止本次进程，不使用批量 kill。停止后 HTTPS 入口返回 530，5181/20241 已释放。
- 复开：重新构建后启动静态服务与 `cloudflared tunnel --url http://127.0.0.1:5181 --no-autoupdate --protocol http2`；新链接需要重新做钱包 origin 授权。

## 未验证
- 1.1B.2 真机 iPhone + Phantom 内置浏览器打开、发现/连接、拒绝/取消、Devnet 余额、返回、断开/切账户、键盘/布局、横屏/200% 缩放均未执行。
- 未操作系统设置、未把旧站点授权当作新站点成功。

## 2026-10-30：Codex复审与1.1B.2入口恢复

- 结论：1.1B.1准备工作复审通过，允许进入真机只读验证。独立核对dist仅4个预期文件，SHA-256均与Cline记录一致；git diff --check通过。未改产品代码或依赖，未重跑类型/44项测试/构建（本轮仅文档及同一产物入口恢复）。此前自动检查是Cline交付证据。
- 独立恢复Python静态服务127.0.0.1:5181（PID 7316，exec session 34646）与cloudflared 2026.10.6 HTTP2（exec session 50559）；未使用旧PID记录。新入口：https://vacuum-marsh-pest-rocket.trycloudflare.com 。本次4个HTTPS资源均200且远端哈希与本地一致；Codex内置浏览器打开后显示Said、Devnet只读、6条明确标注的示例。
- 新链接目前为手机测试保持运行，电脑须保持运行；本次并非已停止。停止应先核对进程身份，再仅停止本次隧道/静态服务，复核入口失效；不要沿用Cline上一轮PID。隧道可通过exec session 50559终止，静态服务通过34646终止。
- 1.1B.2所有真机项仍未验证，下一步用户在iPhone Phantom内置浏览器打开新链接，先检查页面、主动连接、公钥及Devnet余额；随后逐项拒绝/取消/返回、断开/切账户、键盘/横屏。系统与钱包版本待记录。无签名、交易、主网或真实资金操作。
- 表述修正：已做临时HTTPS测试预览开放；未做生产部署、提交或推送。不要笼统称“未部署”而掩盖入口已开放。

## 2026-10-30：1.1B.2 用户手机反馈（Bitget）

- 用户确认手机Chrome可打开HTTPS页面；此项只证明页面可访问，不证明Chrome钱包连接。
- 用户随后使用Bitget手机钱包反馈：钱包被识别、DApp连接授权成功、页面显示完整公钥。按用户反馈记录这三个子项通过，非Codex直接观察；未取得设备系统/钱包版本、公钥比对或截图。
- 用户反馈网络和余额不显示，认为与钱包处于真实网络有关。该原因尚未证实：源码network.ts固定Devnet RPC并独立验证genesis，余额不读取主网；主网余额与Devnet余额独立。需取得页面确切错误/状态，不能直接判定切网即可修复。
- Bitget网络校验与余额项未通过/待诊断；拒绝、取消、返回、断开、切账户、键盘、安全区、横屏等未验证。Phantom/OKX均未据此通过；不进入交易写入。
- 未改产品源码、依赖；未签名或发送交易。下一步取得账户面板网络/余额错误原文或局部截图，再拆最小修复工单。

## 2026-10-30：Bitget手机只读验证后续反馈

- 证据补充：用户提供IMG_0954.PNG，明确显示Bitget已连接、完整公钥与“网络校验超时（10秒）”。不是主网/Devnet错配的证据。截图另有钱包侧钓鱼风险提示，原因未查明，继续保留问题，不指导绕过。
- 用户随后反馈网络恢复后成功显示Devnet余额0 SOL；据用户实测反馈将网络校验/余额读取子项更新为通过。此前超时已恢复，用户归因为网络不佳，未以技术测量确认具体网络原因；无需凭此修改超时或RPC。
- 对“断开后重连，以及搜索/编辑框弹出键盘是否遮挡按钮”的检查，用户回复“不会，都挺好的”；按此上下文记录断开重连正常、键盘无按钮遮挡，证据类型为用户反馈。
- 当前通过范围：手机Chrome页面访问；Bitget内置浏览器发现、授权连接、完整公钥显示、Devnet校验、0 SOL余额显示、断开重连、搜索/编辑键盘基本体验。未把其他钱包或整个1.1B标为通过。
- 剩余：真实拒绝/取消及返回、切账户隔离、横屏/缩放/安全区专项、系统及钱包版本；Phantom/OKX/Android未验证。下一步优先补拒绝/取消恢复与版本记录，再评估写入阶段关口。未签名、未转账、不进入Sprint2实现。
- 本次仅同步记录，不改代码/依赖、不重跑测试，临时入口状态本轮未重新核验。

## 下一阶段准备：Sprint2

用户同意Bitget拒绝路径记未验证并要求下一步。已整理docs/SPRINT-2-PREP.md，沿用阶段0板级标记/Memo4协议，拆为构造模拟和单次签名发送两次审查。当前仅规划，不绕过1.1B真实拒绝/取消及返回验收关口；未改源码、依赖、未执行交易。Bitget未找到已有DApp授权项目不等于没有连接权限，不指导清数据或重建钱包。下一步补手机异常路径及版本；正式放行后由Cline实现。

## 2026-10-30：临时入口失效恢复

用户反馈updated-planets-membrane-readily入口无法打开。独立检查公网530、本地5181返回200；隧道session81131日志先报TLS连接超时，后报Unauthorized: Tunnel not found。核对后仅停止该失效隧道PID8303，保留Python静态服务PID7316。重新建立HTTP2隧道（session12795），新入口https://fingers-glasses-live-arise.trycloudflare.com/ 。HTTPS实际获取成功，首页SHA-256为c01435af7bb3bfbe47e2e0f7355e1026587e54a350d551cbd60e887c27df89cc，与已复审产物一致。为用户拒绝连接测试保持运行，真机该项仍未验证。未修改产品代码或依赖；无签名或交易。复盘：临时隧道可失效，不应将上次检查成功当成持续可用保证。

## 2026-10-31：放行2.1无签名模拟工单

用户确认新origin能打开但Bitget直接连接、没有授权提示；拒绝/取消继续未验证，不再反复换域名。用户同意推进构造/模拟准备；已形成正式docs/SPRINT-2.1.md交Cline执行，仅允许未签名构造、Devnet费用检查和simulateTransaction，2.2签名/发送保持关闭。0 SOL不足不冒充模拟成功；真实模拟探针与用户状态分开。更新AGENTS、CLINE-NEXT与阶段准备稿；本次不改产品源码/依赖、不跑产品测试、不启动新入口或交易，工单尚未实现。既有Bitget通过项目保留，手机其余项和风险提示仍待核实。
