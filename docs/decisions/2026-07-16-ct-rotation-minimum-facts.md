# Decision: CT 职责先物化轮转事实，不直接输出角色

Date: 2026-07-16

## Problem

当前 CT 职责主要依赖位置稳定、空间分离和 component mobility。稳定连接位与固定包点位可能产生相似数值，导致非主狙职责大量塌缩为 Anchor；继续调阈值无法解释玩家何时、为何以及向哪里响应。

## Previous Assumption

地图级位置集中度和移动代理足以直接区分 Anchor / Rotator。

## New Evidence

冻结的 Cologne 160 人同赛事参考显示，现有统计特征能提供方向信号，但缺少本侧/对侧接触、离开初始责任区、跨防区响应和队内响应顺序。CT 的候选诊断模型因此不能直接转为生产分类器。

## Options Considered

1. 继续在现有聚合特征上调整 Anchor 阈值。
2. 在 cohort 中直接加入一套 CT 线性分类器。
3. 先在 core 物化最小可回查的 player-round 轮转事实，验证语义后再设计分类器。

## Decision

- `@cs2dak/maps` 继续拥有 Position Group 与 `a` / `b` / `mid` 区域语义；core 不自建地图防区。
- 开局责任位取冻结 opening responsibility window 内的 dominant CT Position Group。
- 敌方正数生命伤害构成 contact，kill 作为后备；优先用 T 方参与者的 replay callout 定位接触区域。
- 离区只有在玩家随后稳定进入另一个 Position Group 至少两秒时才成立；允许中间经过未解析区域。
- `crossedResponsibilityArea` 仅在目标的地图区域与初始区域不同时为真，不使用未经校准的距离阈值。
- 记录队内响应顺序、初始区域是否仍有人覆盖、回区情况和死亡截尾；缺失或被截尾的结论保持 `null`，完整存活观察且没有跨区响应则明确记录 `false`。
- core 只输出 `CtRotationRoundFact`，不输出 Anchor / Rotator。Studio 持久化紧凑事实，但不增加 UI。
- map-intelligence producer 与 Studio facts storage 同步升版，旧事实从已保存的 v3 ZIP 重建，无需重新导出 `.dem`。

## Why

该边界让系统先回答“可观察到什么”，再回答“这是否足以支持角色”。它保留证据回查、地图 owner 和 missing/censored 语义，避免把又一组未验证代理包装成角色结论。

## Reopen When

- 代表性 Anchor / Rotator 时间线已人工复核；
- 新事实按完整队伍和地图分组显示稳定方向；
- 有新赛事可执行冻结参数的外部验证；
- contact 或地图责任区需要更精细但仍可观察的定义。
