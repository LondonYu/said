> 历史归档：2026-11-01迁入。原日期、级别与复审结论仅作历史记录，不是当前发布闸门；当前以[STATUS](../../STATUS.md)、[DECISIONS](../../DECISIONS.md)及根目录规则为准。

# Sprint 3.2：Codex 独立复审

日期：2026-10-31。**最新结论：3.2复审通过，R1/R2关闭**。下文保留首轮问题与证据，最新结果见末尾通过节。Codex未修改产品逻辑或测试逻辑，仅提交前清理末尾空行；2.2签名/发送继续关闭，本次不部署。

## 独立检查与证据边界

- typecheck退出0；7文件124项测试通过；build输出/tmp/said-review-3.2-dist，70 modules，index-DhRB2lJY.js 341.77 kB/gzip106.83、index-DEn8a_P7.css 15.68 kB/gzip4.04；git diff --check退出0。
- history.ts、wallet.ts、network.ts、message.ts、simulation.ts和依赖/lock对基线无改动，符合范围约束。正文是React文本节点，详情链接为固定官方域名、cluster=devnet及noopener/noreferrer，未发现本轮新增签名/发送入口。
- 已核读Cline的review-3.2-browser.json：其记录的公共流、详情、分页、响应式、主题语言为Cline实际浏览器交付证据，**本轮Codex未独立重跑真实浏览器或真机**。真实钱包个人历史与切换、429/不可得恢复、真机键盘/安全区保持未验证。
- 以下是Codex在独立Node+jsdom进程中使用实际useHistoryFeed、注入客户端复现的组合场景，不冒充真实RPC。机器可读结果见[evidence/review-3.2-codex-probes.json](evidence/review-3.2-codex-probes.json)。

## R1 [P2] 卸载只取消初次读取，未取消当前刷新/翻页/重试

位置：src/historyFeed.ts:152-168、205-211、217-235。

effect cleanup闭包中的abort属于初次读取；用户手动refresh/loadMore/retryUnavailable时，begin会把abortRef.current改为新controller。卸载时cleanup只abort原初次controller，且新controller与它不相等，因此实际手动操作信号仍未取消。generation守卫虽然阻止迟到结果更新视图，但底层RPC仍可能继续读取和派发详情，不符合工单的卸载取消要求。

独立复现：分别在初次加载成功后发起refresh、loadMore、retryUnavailable，让新操作保持pending；捕获传给客户端的signal，再unmount。三个操作的signal.aborted均为false。迟到resolve未更新界面不是“当前请求已取消”的证据。

最小修复：清理本hook当前拥有的在途controller（包括手动操作），同时保持generation/key和锁隔离；不能误取消新范围/新挂载的请求。保留已有首帧账户隔离、板级独立性、连点保护与晚到结果守卫，不重写钱包或读取核心。

必要回归：三个手动操作各自pending时unmount，立即断言传入signal.aborted=true；再让provider忽略取消后迟到resolve/reject，确认无状态回写。范围切换同样验证旧操作取消且不解锁新操作。现有“旧结果迟到”测试先resolve同一Promise、切换后再resolve同一Promise，第二次resolve不会生效；应补真正未决旧请求在切换后仅resolve/reject一次的场景，不能用重复resolve声称覆盖竞态。

## R2 [P2] 分页合并与恢复记录、不可得队列未完全协调

位置：src/historyFeed.ts:56-68、94-108、255-280、293-320。

loadMore始终将新页追加到current尾部。成功刷新只保留新首页，却按约定保留旧unavailable队列；用户先重试补回更旧记录后，再加载中间页，新页会被放到这条更旧记录之后。与此同时loadMore只合并unavailable，不核销本页已经验证成功的旧不可得签名，重叠页会令同一签名同时显示为有效记录和待重试项。

独立复现：

1. 旧结果有slot100记录和一个不可得签名U；成功刷新首页变为slot120，保留U；显式重试恢复U(slot70)，当前是[120,70]；再加载下一页slot110，实际变成**[120,70,110]**，正确应为[120,110,70]。这符合“旧不可得队列跨刷新保留、旧记录先恢复、中间页稍后读取”的正常流程。
2. 前页签名U为unavailable，后续重叠页已成功返回U：messages里有U，unavailable里也仍有U，界面继续宣称该条暂不可读。

最小修复：让后续分页与已恢复记录进行稳定合并，保持slot新到旧、已显示同slot相对顺序和RPC页内顺序；仍按signature去重，不能按正文或blockTime重排。统一用已验证消息核销对应不可得项，保留真正尚未解决的其他签名；不要因为单页成功而抹掉整个队列。保留refresh/retry的分页边界语义、跨页扫描数累计、空末页不清零以及循环保护。

必要回归：上述“刷新→先恢复旧记录→再加载中间页”的完整链路；恢复记录跨多页加载且同slot稳定；重叠页解析成功后对应不可得项移除，其他待重试项保留；相同正文不同签名仍是不同消息。新增测试先失败再修复，不以删除现有断言掩盖回归。

## 修复范围与交付

Cline仅处理historyFeed状态清理与合并及必要回归，界面/钱包/协议/依赖和已审查history.ts保持原状；确需调整调用点时说明原因，禁止无关重构。运行typecheck、全部测试、build与diff检查，更新REVIEW-3.2、VALIDATION等实际证据；真机与真实异常项不伪装为通过。

当前复审不否定已完成的真实公共流、独立作者查询接入、首帧账户详情/搜索隔离、纯文本渲染和Devnet详情链接。修复后停在工作区交Codex再审，不签名发送、不部署、不提交推送，不进入2.2。

## R1/R2修复后独立复审：通过（2026-10-31）

- 独立typecheck退出0；7文件132项测试通过（historyFeed18）；build输出/tmp/said-review-3.2-final-dist，70 modules，index-DqHusx3n.js 341.90 kB/gzip106.85、CSS15.68 kB/gzip4.04，产物与交付一致；git diff --check通过。
- R1：cleanup取消本hook当前拥有的controller，保留generation/key隔离。独立重跑refresh/loadMore/retryUnavailable三类未决操作的unmount，signal.aborted全部为true；provider忽略取消的迟到resolve/reject不再回写。
- R2：分页与恢复使用稳定slot合并，独立完整链路刷新→恢复slot70→加载slot110得到[120,110,70]；同文不同签名保留。重叠页已验证签名核销不可得队列，其他未解决项仍在；分页cursor和累计扫描数语义保留。
- 5组独立断言通过，见[evidence/review-3.2-final-codex-probes.json](evidence/review-3.2-final-codex-probes.json)。新增回归另外覆盖真正未决的旧范围手动请求取消/迟到，不再依赖重复resolve已完成Promise。
- 独立浏览器：使用实际生产构建与新localhost origin，未连接钱包、未注入数据，正常客户端读回3条/2作者；第一条详情的完整作者/正文/slot/80000 lamports费用和Explorer Devnet href/rel正确；返回后加载更多至源末尾，3条/扫描数3保留，无DOM错误告警、无示例标签。见[evidence/review-3.2-codex-browser.json](evidence/review-3.2-codex-browser.json)。临时页与本地5183服务均已关闭，无公网发布。
- 证据边界：响应式矩阵、三语言主题/搜索/刷新完整浏览器操作沿用Cline修复后2026-10-31T12:38:22.826Z证据；Codex本轮独立浏览器覆盖公共流、首条详情与末页，不冒称重跑所有项。真实钱包个人历史/切换/断开、真实429/不可得恢复、真机键盘/安全区仍未验收。
- 原history/wallet/network/message/simulation及依赖未改；允许将本3.2检查点提交到现有GitHub仓库，2.2仍需独立工单，本次不新增签名发送或部署。
- 提交前全量版本文件及Markdown链接检查通过，常见凭据格式扫描无命中（非全面安全审计）。新文件EOF检查发现HistoryViews.tsx、historyFeed.ts、historyFeed.test.tsx和REVIEW-3.2.md多余末尾空行，Codex仅机械清理；最终暂存区检查覆盖全部新增文件，不以仅检查已跟踪diff代替。
