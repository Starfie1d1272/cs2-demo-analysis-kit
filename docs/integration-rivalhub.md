# RivalHub Integration / RivalHub 集成

## English

Recommended flow:

1. RivalHub receives a `cs2-demo-format/2.0` ZIP from CS2 Insight Agent.
2. RivalHub calls `@cs2dak/core` or `cs2dak analyze`.
3. RivalHub persists the import record, QA report, and the product-specific rows it needs for season aggregation.
4. Match pages render from `DemoViewModel` or an equivalent server-side adapter.

The key change is that RivalHub should stop deriving presentation logic directly from scattered `demo_*` queries. The analysis kit should become the stable contract between imported demo data and UI presentation.

## 简体中文

推荐流程：

1. RivalHub 收到 CS2 Insight Agent 导出的 `cs2-demo-format/2.0` ZIP。
2. RivalHub 调用 `@cs2dak/core` 或 `cs2dak analyze`。
3. RivalHub 保存 import record、QA report，以及赛季聚合真正需要的产品侧行数据。
4. 比赛页面基于 `DemoViewModel` 或等价的 server-side adapter 渲染。

关键变化是：RivalHub 不应该继续从零散的 `demo_*` 查询里直接推导展示逻辑。analysis kit 应该成为 demo 导入数据和 UI 展示之间的稳定合同。
