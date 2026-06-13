# DAK 文档

精简到一组标准文档；过程性/历史快照在 [`archive/`](archive/)，**不得**作为当前边界依据。

## 常青规则

- [架构](architecture.md)：数据流、组件职责、v3 ZIP seam、评分三层。
- [模块边界](module-boundaries.md)：每个模块做什么、不做什么、唯一 owner。
- [设计语言](design-language.md)：Tactical Slate，Studio 所有页面强制遵守。

## 设计与排期

- [Studio 完整模块设计](design/studio-redesign.md)：九模块最终形态（唯一设计真相源）。
- [路线图](roadmap.md)：0.5 / 0.6 / 0.7 时间排序。
- [稳定性等级](stability-tiers.md)：各指标 Stable / Beta / Experimental。
- [RR 评分模型](design/rr-model.md)：RR v1 / 六账户 / PRISM 唯一设计文档。
- [RR / PRISM Roadmap](rr-roadmap.md)：评分阶段顺序与现状速查。

## 集成与发布

- [产品集成](integration.md)：RivalHub 分阶段数据接缝、CS2 Insight Agent 消费链路。
- [发布流程](release.md)：桌面（git tag）与 npm（changesets）双版本流。
