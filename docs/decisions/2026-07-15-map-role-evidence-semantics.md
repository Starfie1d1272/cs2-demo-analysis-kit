# Decision: Map-role 先修结构再校准阈值

Date: 2026-07-15

## Problem

地图职责链把逐场累计 rejoin、并列最大 component、跨场重复 player rows 和末帧手持 AWP 直接投影为角色、冲突与保枪结论。这些输出会系统性污染 Team Matrix、headline 和双 AWP 展示。

## Previous Assumption

- 最大多人 component 可近似视为主体组。
- `rejoinCount >= 1/2` 能区分 late join 与 rotator。
- Team Matrix 可以直接拼接逐场 player evidence。
- 败方存活且末帧手持 AWP 可作为保枪近似。
- Support / Rotator / Active control / Map-control 可作为互斥主职责。

## New Evidence

对冻结的 202 个 Cologne Major 地图 ZIP（4362 回合）运行旧模型后发现：

- T 侧 movement sync 的 `0.04` 与 `0.08` 门槛均为 100% 通过；
- rejoin 的 `>= 1` 几乎全量通过；
- 53.0% opening coverage 没有唯一且至少三人的绝对多数 core；
- 326 个 Team Matrix cells 中有 236 个包含重复 player rows，187 条 overlap 不足两个唯一选手；
- 167 个强 AWP 跨回合连续候选中，末帧持狙漏掉 32 个。

这批数据没有人工角色真值，因此只能证明结构污染、区分力不足和敏感性，不能选出最佳阈值。

## Options Considered

1. 继续调整现有阈值。
2. 删除整条地图职责能力。
3. 保留底层事实，先修结构与语义，再用同一冻结语料回归。

## Decision

- unique core 必须唯一最大、至少三人且占当前有效人数绝对多数；否则显式记录 `no_unique_core` coverage。
- 保留原始 `rejoinTicks/rejoinCount`，但职责不再直接消费累计次数。新增保守的逐回合 delayed convergence：先独立至少 2 秒，加入此前稳定存在的至少三人 component，加入后持续至少 2 秒，并排除存活成员变化。
- movement sync 暂时只保留为连续解释性事实，不再作为职责硬门槛。
- Team Matrix 在计算队内相对值、overlap 和 confidence 前，先聚合为唯一 `player × team × map × side` cell。
- 删除 `responsibilityConflict`，只输出中性的 `positionOverlap` 与 `positionConcentration`。
- 主结构职责降级为可观察空间描述；utility、稳定、孤立和 component mobility 独立输出为 modifiers。
- headline 直接从连续 evidence 计算，字段和 UI 统一称为“倾向分”，不再重复叠加离散职责标签，也不解释为概率。
- 删除末帧持狙事实、双 AWP saves 汇总和 UI 展示。精确保枪需等待 weapon entity 级合同。
- 普通用户声明只维护当前队伍主角色、可选副角色和可选武器职责；地图/日期作用域仍保留在公共合同中，仅供可信 metadata producer。

## Why

这些改动处理的是已被真实语料证实的系统性污染，同时保留位置、队形、utility 和 AWP 使用等可解释事实。阈值仍需人工 sanity set 校准，不能由无标签的 202 ZIP 自动决定。

## Frozen-corpus Recheck

使用相同的 202 个 ZIP 重跑新模型后：

- 202 个 ZIP 全部成功，仍覆盖 4362 回合；
- Team Matrix 重复 player cells 从 236 降至 0，唯一选手不足两人的 overlap 从 187 降至 0；
- `-10% / +10%` 阈值扰动下的标签变化率从 `14.6% / 14.1%` 降至 `11.9% / 9.9%`；
- 跨地图标签变化率从 87.5% 降至 76.6%；
- 同一 map/side 的前后半一致率从 65.3% 降至 61.9%；
- strict unique core coverage 为 47.0%，其余 53.0% 明确记录为 no unique core，不再分配主体组 credit；
- delayed convergence 不再像累计 rejoin 一样近乎全量通过，但 T 侧仍有 73.0% evidence cells 至少出现一次；
- headline 仅 86/160 个 profile 达到 ready，另 74 个保持 Mixed，不再强制给出主角色。

因此本次重跑确认了去重、unique core、保枪删除与阈值敏感性方面的结构收益，也确认了离散 map/side 职责仍不稳定。当前标签只能作为观察性 drill-down；恢复更强职业语义或继续调阈值，必须等待人工 sanity set。

## Reopen When

- v3 或后续 ZIP 提供稳定的 weapon entity、丢枪、捡枪与购买链路；
- 建立经过人工审核的角色 sanity set，可评估准确率与阈值；
- 地图防区、离区时机和跨区路线事实足以支持更强的 Rotator / Active control 语义。
