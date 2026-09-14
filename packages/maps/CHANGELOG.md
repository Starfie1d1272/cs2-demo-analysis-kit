# @cs2dak/maps

## 1.0.0

### Major Changes

- 3982a44: 将默认位置语义从 `DefaultAnchor` 统一迁移为 `DefaultPositionGroup`，更新地图查询、战术 facts、跨场聚类和展示标签的公共字段与 API；保留既有七图 callout 归并内容，不提供旧命名兼容 alias。

### Minor Changes

- 5ed968a: 以 callout 倾向和默认站位为唯二静态地图语义，新增时间化战术空间内核、开局模式与跨回合战术聚类接口，并删除旧静态 contested/advanced 角色判断。统一回放回合边界与四阶段比赛时钟，支持按调用方设置 1:55/1:35 初始定位。
- 8c75daa: 分离开局默认职责窗口与全回合移动事实，补充经济资格、有效轨迹 AWP、开局队形、可观测 Support、完整比赛覆盖、样本加权角色、逐侧职责、地图候选审阅和产品中立位置显示。
