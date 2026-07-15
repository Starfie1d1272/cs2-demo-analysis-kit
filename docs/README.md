# DAK 文档

精简到一组标准文档；过程性/历史快照在 [`archive/`](archive/)，**不得**作为当前边界依据。

## 常青规则

- [架构](architecture.md)：数据流、组件职责、v3 ZIP seam、评分三层。
- [模块边界](module-boundaries.md)：每个模块做什么、不做什么、唯一 owner。
- [设计语言](design-language.md)：Tactical Slate，Studio 所有页面强制遵守。
- [组件登记表](design/studio-components.md)：可复用组件与 token 速查，新增 UI 前必查。
- [地图语义](design/map-semantics.md)：callout 倾向、默认位、进点入口七图表与分类合同。

## 设计与排期

- [Studio 完整模块设计](design/studio-redesign.md)：九模块最终形态（唯一设计真相源）。
- [路线图](roadmap.md)：0.5 / 0.6 / 0.7 时间排序。
- [稳定性等级](stability-tiers.md)：各指标 Stable / Beta / Experimental。
- [RR 评分模型](design/rr-model.md)：RR v1 / 六账户 / PRISM 唯一设计文档。
- [RR / PRISM Roadmap](rr-roadmap.md)：评分阶段顺序与现状速查。
- [HLTV Rating 3.0 科隆参考表](research/hltv-rating-3.0-iem-cologne-major-2026.md)：外部评分对照数据，供后续 RR 校准参考。
- [科隆 Major CT/T 职责研究冻结](research/cologne-major-role-reference/)：202 地图职责特征充分性、身份口径、候选规格与外部验证边界。
- [地图控制数据模型](research/map-control-model.md)：四层控制 / T·CT 语义不对称 / 雷达场→区域→解释 / 真实数据可行性（活文档）。

## 产品发现与决策

- [Discovery Inbox](product/discovery-inbox.md)：开发中发现但本轮不做的 Invalidation / Improvement / Idea。
- [Decision Log](decisions/)：影响产品方向、模块边界、数据口径或发布策略的重要决定。

## 功能模块设计

- [赛事资源包](design/event-packages.md)：Event Package 格式、Gallery 与 Maker 工作流。
- [教练回放 UI](design/coach-replay-ui.md)：Coach 页 2D 回放与视频导出设计。
- [自动更新](design/auto-update.md)：manifest 方案、R2 镜像与 Windows 接力替换。

## 集成与发布

- [产品集成](integration.md)：RivalHub 分阶段数据接缝、CS2 Insight Agent 消费链路。
- [发布流程](release.md)：桌面（git tag）与 npm（changesets）双版本流。
