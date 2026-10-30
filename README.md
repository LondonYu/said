# 留言板

基于Solana Devnet的兴趣项目。当前处于Sprint 1.0准备阶段：此仓库只有可构建的React/TypeScript前端骨架，钱包功能尚未实现。

## 开始

使用Node 26.12.1（本次验证环境）和npm 11.20.0。

```sh
npm ci
npm run typecheck
npm run build
npm run dev
```

开发地址为 http://127.0.0.1:5173 。阶段0实验仍位于另一个目录与4173端口，不要混用。

## 当前工单

先读 [AGENTS.md](AGENTS.md)、[Sprint 1.0](docs/SPRINT-1.0.md)、[技术决策](docs/DECISIONS.md) 和 [验证记录](docs/VALIDATION.md)。

VS Code中打开本文件夹。Cline按当前工单实现，Codex审查，用户验收。钱包功能的实现和测试完成后再更新本段状态；不要把脚手架构建成功当成钱包验收通过。

## 文档分工

Obsidian唯一「知识库」中的「项目/留言板-项目档案与开发大纲」保存项目背景、进度和交接；本仓库的docs保存精确工程规格与验证证据。阶段0源实验未复制入产品，关键结论已写在DECISIONS.md。

本仓库不含密钥、API key、真实资产或生产部署。
