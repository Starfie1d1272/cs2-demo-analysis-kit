# CS2 Demo Analysis Kit

[English](./README.md) | 简体中文

`cs2-demo-analysis-kit` 从 CS2 `.dem` 生成 `cs2-demo-format/2.0` 导出包，再把导出包转换成可复用的分析结果、面向 UI 的展示模型、数据质量报告，以及可预览的 React 组件。目标消费者包括赛事网站、个人 demo 分析工具、CS2 Insight Agent、本地研究工作流。

它**不负责赛事业务逻辑**。赛事、赛季、队伍、选手、比赛状态应该留给 RivalHub 这样的产品。ZIP 合同继续由 `cs2-demo-format` 维护，评分模型继续由 `rival-rating` 维护。

> **当前状态。** exporter（`python/`）、分析（`@cs2dak/core`）、contract、maps、CLI 和预览工作台都已可用并通过测试。`demo-lab` 渲染带总览、回合、选手、经济、地图和 2D 回放的比赛工作台，并作为嵌入式查看器运行在 pywebview GUI 桌面应用中。**`@cs2dak/react` 组件库**（MatchWorkspace、HeatmapCanvas、EconomyPanel、KillFeed、ScoreboardTable）功能完备，可复用。

## 这个仓库生成什么

输入一份 `cs2-demo-format/2.0` 包后，本仓库生成：

- Python exporter：`cs2dak` 包，负责 `.dem -> cs2-demo-format/2.0 ZIP`。
- `analysis-bundle.json`：标准化后的比赛、回合、选手、经济、时间线、空间点位分析。
- `view-model.json`：可直接给 UI 消费的展示模型。
- `qa-report.json`：数据质量检查，包括缺文件、回合不连续、经济覆盖不足、玩家未映射、空间数据缺失等。
- 预览 UI：用 demo-lab 展示可复用的比赛工作台、分析模块、地图图层和 2D 回放。

## 包结构

| 包 | 职责 |
|---|---|
| `@cs2dak/contract` | 共享 TypeScript 类型和 Zod schema，覆盖输入、分析输出、UI view model、QA report。 |
| `@cs2dak/maps` | 地图标定、世界坐标到 radar 坐标转换、轻量 callout helper。 |
| `@cs2dak/core` | 纯分析逻辑：标准化、scoreboard、经济、时间线、热力图点位、QA。 |
| `@cs2dak/react` | 只消费 `DemoViewModel` / `MatchWorkspaceModel` 的 React 预览组件。 |
| `@cs2dak/cli` | 分析 JSON 或 ZIP 包，并输出 analysis/view-model/QA 文件。 |
| `@cs2dak/demo-lab` | 用 fixtures 预览分析模块和统一设计语言的 Vite 应用。 |
| `python/src/cs2dak` | Python exporter、CLI、GUI 资源和打包配置，负责 `.dem -> v2 ZIP`。 |

## 快速开始

```bash
pnpm install
pnpm python:test
pnpm analyze:sample
pnpm dev
```

示例分析会输出到 `fixtures/output/sample/`，预览应用通过 `pnpm dev` 启动。

## 设计语言

默认主题参考 RivalHub 的克制型赛事运营界面：深色战术面板、细网格、低圆角、橙蓝双方对比、紧凑字体、信息密度高但可扫描。组件保持产品中立，方便 RivalHub、CS2 Insight Agent 和未来独立 demo 工具复用或重写。

## 参考项目

本仓库会参考但不直接复制这些项目：

- [CS Demo Manager](https://github.com/akiver/cs-demo-manager)：成熟的比赛工作台、热力图、经济页、2D viewer 结构。
- [AWPy](https://github.com/pnxenopoulos/awpy)：parser output、统计、绘图和数据分析严谨性。
- [CS2 2D Demo Viewer](https://github.com/sparkoo/csgo-2d-demo-viewer)：面向回放的 frame model。
- [pr1maly](https://github.com/pr1malator/pr1maly)：local-first 个人分析产品思路。它是非商业 license，只适合作产品研究。

## 边界

- `cs2-demo-format` 定义导出包合同。
- `cs2-demo-analysis-kit` 生成 v2 ZIP，并把导出包转换成分析模型和展示模型。
- `rival-rating` 负责 RR/PRISM 评分公式与校准。
- `CS2-insight-agent` 可以消费或继续贡献 exporter refinements，但独立 exporter 的 home 已迁到本仓库。
- `RivalHub` 负责赛事、赛季、队伍、选手、比赛业务流程。
