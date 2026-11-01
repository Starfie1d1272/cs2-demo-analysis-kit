---
"@cs2dak/contract": major
"@cs2dak/presentation": major
"@cs2dak/react": major
---

将展示合同、分析计算和 Demo 执行编排拆为独立消费边界。

- 展示模型从 contract 移至 presentation；删除原导出。
- 原 presentation 分析 API 移至新包 analytics；删除 tournament-compat 入口。
- 原 buildMatchWorkspaceModel 删除，改用新包 pipeline 的 analyzeMatchWorkspace。
- React 仅消费展示数据，新增 scoreboard、table、replay 子入口；回放组件独立于完整工作台。
- workspace-0.2 要求预计算经济结果、选手回合汇总与报告高光；地图图片 URL 由宿主传入。
- UI 安装与声明依赖闭包移除 contract、core、cohort、tournament、rating、format 和 JSZip。
