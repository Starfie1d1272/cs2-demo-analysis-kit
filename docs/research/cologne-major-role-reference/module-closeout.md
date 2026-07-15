# CT/T 职责研究模块当前阶段收尾

## Validation Report

### Overall Assessment: Ready to share with caveats

本分支已经达到当前数据条件下合理的工程收尾状态：T 方研究投影严格复现冻结配置；CT player-round facts 在 202 个地图 ZIP 上通过完整性、确定性、缓存与 `null/false` 语义检查；新增 CT facts 被证明具有稳定方向信号，但尚不足以支持新的 CT 分类器。

正式 CT/T 职责、presentation 和 Studio 主界面继续保持不变。

## T 方实现一致性

当前 TypeScript 实现与冻结 v1 逐玩家比较：

- 160/160 profiles 对齐；
- 15/15 特征顺序一致；
- 缺失值 mismatch 为 0；
- 最大特征绝对误差 `1.82e-12`；
- 独立 sklearn full-event 诊断分数最大误差 `4.93e-7`；
- 候选标签 mismatch 为 0。

实现曾因模型输入提前截到 6 位小数产生 `2.53e-6` 分数误差，本轮已改为特征保留 12 位、最终 score 保留 6 位。该核验只证明实现复现，不改变冻结的完整队伍留出 `0.8157` agreement，也不构成外部验证。

## CT facts 数据与语义审计

202 个 ZIP 共生成 21,810 条 CT player-round：

| 状态 | 行数 |
|---|---:|
| 开局责任位可解析 | 21,652 |
| 稳定跨区离位 | 4,917 |
| 完整观察且未跨区 | 12,222 |
| 死亡截尾 | 4,602 |
| unknown | 4,671 |

已验证：

- 0 提取失败、0 重复 grain；
- 死亡截尾行不会物化跨区 `true/false`；
- 完整存活、责任位可解析的行不会残留 unknown；
- 玩家死亡后的团队接触不会进入其个人观察窗口；
- 对侧接触到离位使用有符号时间差，负值明确表示先离位；
- 同 tick 跨区离位共享确定性的 competition rank，不用 player id 伪造先后；
- 序列化持久化保持 `null/false/true`；旧 `storage:4/mapIntelligence:5` facts 必定 stale，并从保存的 v3 ZIP 重建。

逐地图分布见 [`ct-rotation-map-distribution.csv`](ct-rotation-map-distribution.csv)。已知样本中的跨区占比从 Overpass 的 `19.1%` 到 Ancient 的 `42.7%`，没有全量或全空塌缩。高移动率集中在 Mirage VIP、Ancient VIP/mid、Anubis mid、Inferno top-mid、Nuke outside 和 Dust2 mid doors，方向上符合连接/响应位，但不应把这一点解释为人工真值验证。

## CT 增量诊断

保持冻结的完整队伍留出、线性模型、预处理和 `0.60` abstention，仅加入 6 个预先声明的轮转聚合：

| 指标 | 旧 15 特征 | + CT facts | 变化 |
|---|---:|---:|---:|
| core macro-F1 | 0.7734 | 0.8010 | +0.0275 |
| core coverage | 0.8235 | 0.9020 | +0.0784 |
| covered agreement | 0.8690 | 0.8478 | -0.0212 |
| Mixed abstention recall | 0.2800 | 0.0800 | -0.2000 |
| team-fold median agreement | 0.7500 | 0.5000 | -0.2500 |

跨区离位、对侧接触后跨区、队内首批离位和回区比例在 32 个留出队伍中都稳定指向 Rotator；原区仍有人覆盖则弱指向 Anchor。这证明新 facts 有解释价值。

但是 augmented 模型通过减少 abstention 获得更高 coverage，同时降低 covered agreement、Mixed recall 和队伍折稳定性。因此当前裁决是：

> 保留 CT facts 作为证据层，不实现 CT 研究投影，不替换正式分类器，也不继续在 Cologne 上调阈值。

## Issues Found

1. 已修复：T 模型输入过早截断精度。
2. 已修复：CT “response/rotation” 字段命名超过证据能力；已改为首次稳定目的地和跨区离位顺序。
3. 已修复：离位先于对侧接触时被错误写成 `null`；现在保留负时间差。
4. 已修复：玩家死亡后的接触曾可能进入个人接触字段；现在按死亡 tick 截断。
5. 已澄清：相对顺序只比较实际发生稳定跨区离位的可解析队员，不宣称谁“有资格响应”。

## Required Caveats

- Cologne 参与了特征发现，不能作为外部验证赛事。
- HLTV 是编辑参考，不是角色 ground truth。
- connector、Nuke 垂直空间等地图区域仍依赖较粗的 `a/b/mid` 语义；Position Group 明细应始终与 region 一起保留。
- `Mixed/Flex` 是 abstention，不是稳定第三类。

## Current Closure

当前模块无需继续增加规则、阈值或 UI。下一次重开 CT 分类研究只应由以下之一触发：

1. 新赛事的冻结参数外部验证；
2. 独立于 Cologne 结果设计并预先声明的 abstention 方法；
3. 真实反例证明某张地图的 Position Group / region 语义系统性错误。

可执行本地 notebook：`cologne-ct-rotation-closeout-audit.ipynb`。仓库内保留紧凑审计 JSON 与分布 CSV；原始 8 分片和 notebook 继续留在冻结研究工作区，不进入产品资产。
