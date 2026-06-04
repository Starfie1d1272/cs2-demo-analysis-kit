# DAK 模块能力地图

本文基于 2026-06-04 全仓审计，记录各模块的现有能力、目标能力和应迁出内容。
模块职责以 [module-boundaries.md](module-boundaries.md) 为准；本文不描述具体实施步骤。

## 审计结论

- 已扫描全部 tracked 源码、公开导出、包依赖、调用方、测试、脚本、fixtures 和设计文档。
- 当前基线：TypeScript 40 项测试、Python 25 项测试、全工作区 typecheck 通过。
- RR/PRISM 运行时公式均来自 `@rivalhub/rival-rating`；DAK 没有复制正式评分公式。
- 展示模型和中文叙事已从 `core` 迁入 `presentation`；Python GUI 与 demo-lab 已解除产品入口耦合。
- `buildMatchWorkspaceModel` 已复用 `analyzeDemoPackage`，单场分析只有一条标准管线。
- v1 normalize 主路径已删除；v2 DemoPackage 是唯一分析输入。
- 单场与 cohort 已输出版本、来源哈希和可重算 provenance；导入批次仍由消费产品持久化。

## 外部真相源

| 模块 | 现有能力 | 目标能力 | DAK 内禁止 |
|---|---|---|---|
| `cs2-demo-format` | v2 ZIP schema、类型和 strict validator | 持续演进 DemoPackage 合同与 provenance 字段 | fork schema、放入分析逻辑 |
| `@rivalhub/rival-rating` | RR v1、Value Accounts、cohort balance、PRISM、冻结职业基准能力 | 固定职业标尺、尾部饱和、后续权重与 Round Swing 校准 | 复制公式、硬编码权重 |

## 数据生产与入口

| 模块 | 现有能力 | 目标新增 | 应删除或迁出 |
|---|---|---|---|
| Python exporter | `.dem` 解析；回合、经济、统计、富事件、空间与 replay 导出；批处理；strict validate | 稳定 parser capability report；完整导出 provenance；更清晰的领域 builders | 单文件巨型 exporter |
| Python CLI / GUI | 单场和批量导出、校验、桌面导出器、打开最近 ZIP 查看器 | 保留轻量 exporter 操作入口；向 Studio 提供导出能力 | 产品级分析查看器；RivalHub 专属文案与样式 |
| Node CLI | `analyze`、`cohort`、identity map、JSON 产物输出 | QA/inspect、可选能力产物、版本与 provenance 输出 | 业务分析实现；固定输出旧 View Model |
| `apps/demo-lab` | fixture/sample ZIP 加载、拖入 ZIP、Match Workspace 预览 | 组件目录、fixture gallery、视觉验收与回归 | 个人 Demo 管理；共享逻辑 owner；产品入口 |
| DAK Studio | 尚未实现 | Demo Library、批量导入、索引检索、比较、个人档案、本地持久化 | 复制 exporter、core、cohort 或评分公式 |

## TypeScript 公共模块

| 模块 | 现有能力 | 目标新增 | 应删除或迁出 |
|---|---|---|---|
| `@cs2dak/contract` | 聚合上游 DemoPackage；定义 QA、单场分析、cohort、Workspace、replay 合同 | Player、Team、Season、Leaderboard、provenance 合同 | 重复字段；错误默认值；单文件集中定义 |
| `@cs2dak/core` | ZIP 加载与标准化；QA；回合事实；RR 信号；scoreboard；时间线、经济、热图；单场 RR/PRISM 预览 | damage context、包点目标、武器经济纪律、Area/Utility/Aim 事实、统一分析管线 | v1 兼容主路径；Workspace/View Model；中文标签和故事；重复分析编排 |
| `@cs2dak/cohort` | identity map；跨场 counts 汇总与 rate 重算；赛季 RR/PRISM；confidence；per-match 明细 | 时间窗口、地图/对手拆分、队伍聚合、分布与缺失率 QA、职业基准接线 | 展示排序规则；与外部评分包重复的数学逻辑 |
| `@cs2dak/maps` | 7 图 radar 标定、world-to-radar、zone 类型与几何、Mirage 模板 | 正式 zone 数据集、地图版本、区域校验、空间查询能力 | UI 路径与产品文案；战术评分结论 |
| `@cs2dak/presentation` | Match Workspace、展示标签、武器和经济文案 | Player、Team、Season、Leaderboard View Models；故事、MVP 与解释模型 | 数据解析、评分公式、数据库与 React |
| `@cs2dak/react` | Match Workspace、scoreboard、timeline、economy、heatmap、replay、kill feed、QA 组件 | Match/Player/Team/Season/Leaderboard 组件族；视觉回归；可组合基础组件 | 分析 helper；重复标签；直接依赖 `core` |

## 产品级能力

| 能力域 | 现有能力 | 目标新增 | 归属 |
|---|---|---|---|
| 单场比赛 | scoreboard、回合事实、经济、时间线、热图、replay、基础故事 | 统一比赛摘要、关键回合、MVP、可解释评分、完整 provenance | `core` 事实 + `presentation` 展示 |
| 选手 | 单场 scoreboard、RR breakdown、回合事实；赛季 cohort 行 | 跨场趋势、地图拆分、风格画像、个人档案、账号归并解释 | `cohort` + `presentation` |
| 队伍 | DemoPackage 中有队伍与比分，暂无跨场模型 | 队伍赛季表现、地图池、经济与转化、成员贡献 | `cohort` + `presentation` |
| 赛季与排行榜 | season cohort 按评分排序；identity map | 可配置榜单、资格门槛、置信度、趋势、队伍榜与指标榜 | `cohort` + `presentation` |
| PRISM | 单场预览 + 赛季真实 cohort 计算 | 空间、武器、经济风格轴；稳定解释与版本化 | `core` 信号 + `cohort` + rating |
| RR | RR v1、v2-lite、赛季锚定、provisional 职业基准验证 | 正式固定职业标尺、校准与跨版本解释 | rating 公式 + DAK 信号接线 |
| 空间分析 | radar、热图、replay、zone 几何 | Area、Utility Block、Aim、区域复盘 | `maps` + `core` |
| 数据质量 | strict validator、core QA、field availability、confidence | parser capability、跨场分布 QA、provenance、可重算审计 | exporter + `core` + `cohort` |

## 已确认的清理对象

| 对象 | 审计结论 |
|---|---|
| `core/workspace.ts` | presentation 与分析混合，应拆出 core |
| `DemoAnalysisDashboard` | 已删除；由 Match Workspace 覆盖 |
| `AdminQaWorkspace`、`EconomyConversionPanel` | 已公开但仓库内无消费者，需在重构时重新决定公共面 |
| 多处 economy/side/weapon 展示标签 | 重复且归属分散，应由 presentation 统一 |
| `contract/src/index.ts`、`cohort/src/index.ts`、`MatchWorkspace.tsx`、`theme.css` | 职责过多，应按领域拆分 |
| `python/src/cs2dak/exporter.py` | 导出能力完整，但内部职责过度集中 |
| Python GUI + `demo-lab` viewer | 产品入口重叠，未来由 Studio 收敛 |
| `scripts/calibrate_value_accounts.py` | 已删除；评分校准归 `@rivalhub/rival-rating` |
| `normalizeV1Package` | 已删除；core 只接受 strict v2 DemoPackage |
| `fixtures/` | tracked golden 样本有效；31 GB 本地原始 demo 与输出不应继续使用 fixture 语义 |
| docs | 当前架构、历史计划和迁移快照混合，需要按常青文档与 archive 分离 |

## 测试与验证缺口

- `contract` 没有独立 schema 合同测试。
- React 仅直接测试 Match Workspace 与 Scoreboard；多数公开组件没有独立测试。
- Python 测试集中在回合边界、经济、武器和 roster 过滤；缺少完整真实 `.dem -> ZIP` golden 对比。
- maps 有几何测试，但没有正式 zone 数据与逐图验证。
- 当前测试验证输出可用，但没有统一验证分析版本与 provenance 的确定性。
