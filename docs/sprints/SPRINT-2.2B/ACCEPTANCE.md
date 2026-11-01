# SPRINT-2.2B 最小发布闭环验收

记录时间：2026-11-01T22:44:04+08:00。线上版本72168077f97ed64cca0823e4284e28a3b72a1664，正式URL https://londonyu.github.io/said/ 。用户Chrome Phantom完成第二次签名发布，并确认刷新后仍看得到“测试”；独立只读RPC查到同作者/正文、finalized、err=null。本单最小W01-W03验收通过，作为v0.2 Devnet演示里程碑，不创建GitHub Release或tag、不新增功能。

| 标准 | 实际证据 | 结果 |
| --- | --- | --- |
| W01 审阅后由用户钱包签名 | 用户报告“第二次成功签名并发布 测试”；此前截图显示Devnet/完整付款地址/正文/费用 | 用户确认通过 |
| W02 真实广播与确认 | 签名[3gkgb4vK4xypp342nPGwEmJL5gwfhWysWGrcyKQLz1UDPdmeedp5gARgvARYdWyrSsGT5GMGbNV8pMz3iCZvr4nz](https://explorer.solana.com/tx/3gkgb4vK4xypp342nPGwEmJL5gwfhWysWGrcyKQLz1UDPdmeedp5gARgvARYdWyrSsGT5GMGbNV8pMz3iCZvr4nz?cluster=devnet)；RPC最终finalized、err=null，slot 517526468，作者Hs1NxWYZdXE6opzTY1wR9XCbq2QtNwrGdkWgSMeWk31S；费用5000lamports | 用户成功反馈＋链上实证 |
| W03 刷新可读回 | 用户对明确的刷新核对答“能看到‘测试’”；项目history客户端无缓存读回4条有效记录，其中1条新“测试”，无filtered/unavailable | 用户确认通过＋独立只读证据 |

链上blockTime换算：2026-11-01T22:35:34+08:00。这不是用户实际点击时间；用户反馈接收记录和RPC核验时间分别保存在证据中。

证据：[用户反馈](evidence/user-publication-confirmation.json)、[无缓存链上读回](evidence/user-post-chain-readback.json)、[原签名finalized状态](evidence/user-post-status.json)。既有部署/模拟/复审见同目录及[工单](../SPRINT-2.2B.md)。代理全程未操作真实钱包签名或sendTransaction。

## 首次超时

用户报告第一次失败显示超时、第二次成功。超时发生于准备/签名/提交/确认中的哪一步，以及第一笔签名均未提供，不能判定其根因或断言第一笔未广播。当前只读窗口看到一条新“测试”，不能代替第一次attempt的回执核对。按可恢复异常反馈后置到STATUS B07，不重发交易、不再扩展本轮修复。

## 本轮不建议修

B05/B06、B07首次超时根因、全钱包/版本/真机矩阵和旧核心重构继续后置。当前闭环已有真实成功及用户确认，不追加测试、功能、部署或新的验收条件。
