# 设计：PRISM（八维风格画像）

> 定位：**风格指纹，不是评分。** 跨场 cohort 计算。
> 铁律：PRISM 表达"你扮演什么角色"，不表达"你强不强"——强弱由颜色（RR 百分位）单独编码。
>
> 公式所有权：[`@rivalhub/rival-rating`](https://github.com/Starfie1d1272/rival-rating)
> 的 `computePrism`，权重 `weights/prism-v1.json`。本 kit 只做信号派生 + 接线。

## 双编码：形状 = 风格，颜色 = 水平

```
雷达图形状（八轴半径） = 风格指纹：这根轴伸多长 = 多大程度扮演这个角色
整体颜色 / 亮度        = RR 百分位：水平高低
```

两者互不干扰。所以"AWP 打得一般但 sniping 轴很高"是**正常的**——sniping 轴首先表示
角色暴露度（你是不是承担 AWP 位），不直接表示狙击水平。

## 八轴

`firepower / opening / clutch / sniping / survival / utility / trading / entry`

对立角色放对角：`opening ↔ clutch`（早期 vs 后期），`entry ↔ survival`（送死 vs 保命）。

> ⚠️ 已知重叠风险：`opening` 与 `entry` 在缺少空间/接触顺序数据时容易互为副本。
> 定义上 opening = 首杀对枪倾向，entry = 进攻端第一接触/进点倾向。彻底区分需要
> 阶段 4 的地图语义层，见 [roadmap](../rr-roadmap.md)。

## 计算（rival-rating 内，本文述结构）

每根轴：`axis_z = α · z(participation) + (1−α) · z(efficiency)`

- **α 高**（如 sniping ≈ 0.85）→ 近乎纯风格标签：打不打 AWP 比打得好不好更重要。
- **α 低**（如 survival ≈ 0.2）→ 近乎纯水平：活得下来才算。

后续：**冷启动收缩** `z' = z · n/(n+k)`（n = 参与地图数）→ 转经验百分位（样本小时退化到正态 CDF）。

## 链路

```
DemoPackage
  → buildPlayerIndicators()          [core] 复用 RR v1 的 RRIndicators
  → computePrism(cohort, prismWeightsV1) [rival-rating] → PrismResult[]
  → PlayerIndicatorRow.prism
```

## 跨场是本质要求（重要现状）

`computePrism` 接收**整个赛季所有选手的 cohort**，做跨人 z-score。
当前 `analyzeDemoPackage` 一次只跑单场，所以 cohort 退化为"场内 10 人"：

> ⚠️ **单场 PRISM 只是预览**：比较基准只有场内这 10 个人，z-score 失去跨场意义。
> 严肃的 PRISM 必须等阶段 2 的跨场聚合层把整季 cohort 喂进来。

## 现状与 TODO

- ✅ 八轴、α 融合、冷启动收缩、百分位均已接线。
- ⬜ 跨场 cohort（阶段 2）——这是 PRISM 真正可用的前置。
- ⬜ opening/entry 去重叠（阶段 4 地图语义层）。
- ⬜ 把 Area v1 的控图/空间信号接入 entry/trading/survival 轴（阶段 4）。
