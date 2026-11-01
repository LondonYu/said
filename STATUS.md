# Said STATUS

更新：2026-11-01，Asia/Shanghai。**v0.1只读演示已通过用户最终验收，SPRINT-4.0结束。** 当前无新的执行工单，2.2B和其他后置功能不自动开始。

## 当前发布

- 正式地址：[https://londonyu.github.io/said/](https://londonyu.github.io/said/)，GitHub Pages托管，无本地服务器/隧道依赖。
- 线上提交：`ea2f60e46d851b38806009dcee81d2c9afb3c5bb`；[部署运行41273238142](https://github.com/LondonYu/said/actions/runs/41273238142)成功，2026-11-01T12:29:12+08:00。后续文档提交未重新部署。
- 既有基线：252项项目测试、16项独立注入断言；本轮只记录用户验收，不新增/重跑测试，不改产品、依赖或视觉，不运行交易或再次部署。
- 唯一治理入口：本文件管当前状态/待办/backlog；[DECISIONS](DECISIONS.md)管决策；[docs/sprints/](docs/sprints/)管历史。

## v0.1逐条最终验收

| ID | 标准与证据 | 用户最终结果 |
| --- | --- | --- |
| V01 | URL独立于电脑/本地进程；采用用户认可的等效方法：电脑彻底断网，手机关闭Wi-Fi、使用移动数据刷新同一URL。现有[HTTP输出](docs/sprints/SPRINT-4.0/evidence/pages-http.json)、[部署状态](docs/sprints/SPRINT-4.0/evidence/pages-deployment-status.json)与[用户最终反馈](docs/sprints/SPRINT-4.0/evidence/pages-user-final-acceptance.json)共同留证；用户答“确认完成正常” | 通过，用户确认 |
| V02 | 未连接钱包读3条真实Devnet留言；2026-11-01T12:31:50.085+08:00[公网观测](docs/sprints/SPRINT-4.0/evidence/pages-browser-observation.json)、[截图](docs/sprints/SPRINT-4.0/evidence/pages-public.png)、[3条不同签名详情](docs/sprints/SPRINT-4.0/evidence/pages-details.json)留证；用户针对“页面和3条留言正常加载”答“确认完成正常” | 通过，用户确认 |
| V03 | 连接真实钱包显示自身完整地址；用户此前直接答“显示了，地址一致”，[反馈记录](docs/sprints/SPRINT-4.0/evidence/pages-wallet-user-confirmation.json)时间2026-11-01T12:36:04.375194+08:00 | 通过，用户确认 |

本次V01/V02反馈记录时间：2026-11-01T13:54:56.766708+08:00。用户操作的精确时刻/设备网络画面未提供，代理未独立观察用户手机或钱包；如实记录为用户最终确认，未以测试替代。验收范围只含三条，不含签名发送、永久可用性或全设备兼容承诺。

## 当前待办与工单

- [x] Pages公网演示和三条证据已交付，V01/V02/V03均由用户最终确认。
- [x] SPRINT-4.0结束，按约定删除过渡docs/CLINE-NEXT.md并修正活跃入口。
- [x] [完整SPRINT-4.0工单与执行记录](docs/sprints/SPRINT-4.0/SPRINT-4.0.md)归档，证据保留。
- 当前没有新的执行工单；后续目标由用户决定，不自动续做2.2B或重启已关闭验收。

## backlog（不阻断已验收v0.1）

当前没有已登记未解决的P0/P1；以下为后置功能或未验证项，不冒充已复现缺陷。新P2一律在本节登记，不阻断；升降级按AGENTS的证据制度执行。

| ID | 类型 | 后置内容与理由 |
| --- | --- | --- |
| B01 | 范围外功能 | 2.2B签名发送/回执页面；v0.1不含写入，待用户另定目标 |
| B02 | 未验证项 | 个人历史、切账户/拒绝/取消、多钱包和全机型矩阵；不自动扩大本次三条标准 |
| B03 | 未验证项 | 浏览器Ed25519、真实广播/确认、发送响应丢失；属于后置写入路径 |
| B04 | 后续体验 | 横屏/200%缩放/全语言完整矩阵；未作为v0.1闸门 |

## 构建与部署回滚

- 构建配置仅vite.config.ts中的`base: './'`，使资源适配Pages `/said/`路径；业务源码/依赖/视觉不因此改变。
- 恢复配置前状态可撤销该配置并重建，但默认`base='/'`不能直接覆盖项目子路径站点，以免资源404。
- 已发布版本回滚：在Actions重新执行上一个成功的Pages运行，恢复其提交/构建；手动main-only和github-pages环境约束保留。本次未执行回滚。

## 本轮不建议修

- 无新增已复现缺陷；用户已按三条完成验收，不重复索要或追加条件。
- 2.2B、全钱包/机型矩阵、写入异常与新增测试数继续后置，因为超出v0.1范围。
- 用户新接入的规则/技能/记忆/钩子保持原样，不借收尾整理或提交。
