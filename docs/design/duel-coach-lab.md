# Duel & Mechanics Lab（模块 4）+ Coach / Analyst Workbench（模块 8）设计

> 2026-06-12 制定。对应 [roadmap.md](../roadmap.md) 八模块框架中的模块 4 与模块 8。
> 本文档只定**功能边界、数据口径与组件归属**，不做具体代码设计。
> 实施拆分见文末「实施模块拆分」。

## 共同原则

1. **Query-first**：每个统计结论可点击 → 跳到具体回合 2D 回放并定位 tick
   （复用模块 2 的跳转接口，见 `apps/dak-studio/src/views/TrailsView.tsx`）。
2. **全链路四层走现成管道**：core 信号派生 → presentation view model →
   studio 视图。数据源全部来自已导出的 v2 ZIP，**不动 Python 导出器**
   （`shots.json` 已在导出，见 `python/src/cs2dak/exporter.py:782`
   `_build_shots`、`exporter.py:104` 写入）。
3. **可解释，不做黑箱**：每个指标 UI 带 ⓘ 说明（计算公式、窗口参数、已知误差）；
   做不准的指标宁可标 beta 或不做，不给黑箱数。A/B/C 评级必须标注
   「联赛前 X%」的 percentile 依据。

## 可用数据源（均已就位）

| 数据                  | 关键字段                                                                   | 出处                                                        |
| --------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `shots.json`          | 每发 tick / weapon / position / velocity / yaw / pitch                     | `exporter.py:782`                                           |
| `kills.json`          | killerActiveWeapon / throughSmoke / noScope / penetratedObjects / headshot | 合同 v2.2+                                                  |
| `damages.json`        | hitgroup / victimHealthBefore/After / armorDamage                          | 合同 v2.0+                                                  |
| `replay`（8Hz 列式）  | 每帧 position + **yaw** + hp                                               | `exporter.py:985`                                           |
| `positions-1s`        | 每秒 position + yaw + lastPlaceName                                        | `exporter.py:843`                                           |
| `grenades` / `blinds` | 道具时序 / 致盲秒数                                                        | 合同 v2.0+                                                  |
| LOS 几何地基          | tri-BVH + `staticLineOfSight`                                              | `packages/core/src/spatial/`、`packages/maps`（visibility） |
| 动线 / callout        | `MapRoute` + `CALLOUT_NAME_CN`                                             | `@cs2dak/maps`                                              |

---

# 模块 4 — Duel & Mechanics Lab（单场为主）

## 4a. 对枪重构（Duel Finder）— 地基

core 新增交火（engagement）派生，4b/4c 都消费它。

### 口径定义（写死为常量，UI ⓘ 公开）

- **engagement 切分**：killer→victim 的连续伤害事件，相邻间隔 ≤ **1.5s**
  算同一次交火；超过即重置。
- **对枪配对**：双方在 **±2s** 窗口内互有伤害 → 一次「对枪」；
  仅单向伤害 → 按下方三分类归类，不进对枪胜率。
- **burst 切分**：同玩家同武器相邻 shot 间隔 < **250ms** 算同一 burst。
- **TTK（burst 锚定）**：击杀 tick − 产生击杀伤害的那个 burst 的第一发 shot tick。
  AK 一枪头 TTK ≈ 0ms（真实瞬杀）。呈现用**中位数 + 分布直方图**，不只给均值。
- **一枪致命率**：burst 仅 1 发即击杀的占比，单列指标（即"预瞄/定位快"的直接度量），
  不搅进 TTK。

### 受害者状态三分类（区分「偷」vs「正面秒人」）

用受害者死亡时刻的还手行为 + 朝向（replay 8Hz yaw，死亡 tick 取最近帧，
误差 ≤ 125ms）：

| 分类                  | 判据                                         | 去向                  |
| --------------------- | -------------------------------------------- | --------------------- |
| 有来有回 contested    | 受害者 ±1.5s 内对击杀者有开枪或伤害          | 对枪胜率              |
| 正面被秒 outaimed     | 未还手，死亡帧朝向与击杀者方向夹角 ≤ **60°** | 击杀者「正面秒人数」  |
| 被偷 caught off-guard | 未还手，夹角 > 60°，或高速移动未开镜         | 受害者 Mistake Review |

### 残血 vs 满血

engagement 首次伤害时 `victimHealthBefore` **≥ 80 HP → 完整对枪**（进 TTK /
对枪胜率）；**< 80 → 补枪/收残局**单独一档，不污染 TTK。同时记录己方血量
（可派生「残血反杀率」）。

### 筛选维度

地图区域（callout，经 positions-1s.lastPlaceName）/ 武器对位 / 先手方 /
血量档 / 是否残局 / 三分类。每条对枪可点击跳 2D 回放。

## 4b. Opening Duel 分析

每回合首次交火专项：

- 对位矩阵（谁常跟谁开局对枪）；
- FK/FD 位置散点（雷达图，复用 `@cs2dak/maps` 标定 + TrailsView 渲染模式）；
- 开局对枪胜率按 callout 拆分；首杀时间分布。

## 4c. Mechanics（个人机制画像，对齐完美世界用词）（区分不同武器和总的，看情况区分哪些可以聚合一下哪些分配给不同的武器单独聚类）

| 指标                | 计算逻辑                                                                                                 | 状态                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 击杀时间（TTK）     | 4a burst 锚定口径，按 killerActiveWeapon 分武器                                                          | 本期                                                                         |
| 爆头率              | kills.headshot / damages.hitgroup                                                                        | 本期（现成）                                                                 |
| 首发精准度          | 每 burst 第 1 发是否在 ±1 tick 匹配到该玩家 damage 事件                                                  | 本期                                                                         |
| 扫射精准度          | burst 第 4 发起的命中率（即压枪质量，不单列「压枪」指标）                                                | 本期                                                                         |
| 急停成功率          | shots.velocity 模长 ≤ 该武器精确移速阈值（步枪约最大移速 34%，按武器查表；霰弹/机枪另议）                | 本期                                                                         |
| 回均狙杀 / 场均击杀 | 现成聚合                                                                                                 | 本期                                                                         |
| 开枪节奏            | burst 长度分布（点射 vs 泼水），**风格描述不评分**                                                       | 本期                                                                         |
| A/B/C 评级          | 55 场联赛分布 percentile（如 A = 前 20%），UI 标「联赛前 X%」                                            | 本期                                                                         |
| 预瞄（preaim）      | 击杀前最后 N 发 yaw 修正量                                                                               | ⬜ 待办                                                                       |
| 反应时间            | 敌人可见（replay 8Hz + staticLineOfSight）→ 首发时间差；8Hz=125ms 分辨率与人类反应时间同量级，**误差大** | ⬜ 待办（beta / 低置信度；做准需导出器交火窗口高频采样，cs2-demo-format 3.x） |

已知误差写进 ⓘ：命中匹配按 tick 对齐，穿物体伤害可能漏配；霰弹多弹丸不适用
首发/扫射口径。

## 模块 4 组件归属

| 层           | 新增                                                                            | 挂载点                                                   |
| ------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| core         | `duels.ts`（engagement/对枪/三分类/TTK）、`mechanics.ts`（burst/命中匹配/急停） | `packages/core/src/`，模式同 `signals.ts`                |
| presentation | `buildDuelInsights` / `buildPlayerMechanics`（含 percentile 评级）              | `packages/presentation/src/`，模式同 `insights.ts:131`   |
| studio       | `DuelView`：子 tab Duel Finder / Opening / Mechanics                            | 替换 `apps/dak-studio/src/App.tsx:401` 的 ComingSoonView |

---

# 模块 8 — Coach / Analyst Workbench（跨场为主）

**双视角**：联赛主办方/分析师视角（看全联赛任意队）+ 队长/教练视角
（「我的队伍」vs 指定对手对阵视角）。「我的队伍」为 studio 本地设置
（IndexedDB，沿用 `apps/dak-studio/src/lib/library.ts` 资料库模式），
队伍身份归并复用 `apps/dak-studio/src/lib/identity.ts`。

## 8a. Pattern Finder（规则开局聚类）— 地基

- 每回合开局 15/20/30s 的 5 人 callout 位置向量（positions-1s.lastPlaceName）
  + 道具投掷序列（grenades）→ **规则聚类**：按 `@cs2dak/maps` 动线归属
  （`MapRoute.zones` 链）+ 人数分布分桶，不用黑箱 k-means。
- 每个 cluster 展示：覆盖回合列表（可点回放）、雷达缩略图、胜率、道具时序、
  **聚类依据**（哪条动线 + 人数分布）。

## 8b. Playbook（战术本）

- 在 8a cluster 上手工命名 + 沉淀（IndexedDB），如「B 区快攻」。
- Timing Heatmap：同一战术按回合秒数拆关键事件（首接触/道具/下包）分布。

## 8c. Anti-Strat 报告

- 选定对手队伍 → 近 N 场倾向汇总：手枪局习惯、各图 T 侧出装与开局 cluster 分布、
  关键选手位置习惯（Personal Lab 动线复用）。
- 导出 Markdown，复用 `packages/presentation/src/insights.ts:1075`
  `buildMatchReportMarkdown` 的导出模式。
- 双视角：主办方视角任选两队对照；教练视角默认「我的队伍 vs 对手」。

## 8d. Series / BP / Veto Lite

1. **BO 系列聚合（地基，提前做）**：presentation 已有
   `buildSeriesSummary`（`packages/presentation/src/series.ts:111`），
   缺 studio 资料库的 series 分组——按文件名约定（队伍+日期）自动建议归组
   + 手工确认，存 IndexedDB（`apps/dak-studio/src/lib/season.ts` 旁）。
2. **BP 录入**：veto 数据 demo 里没有。studio 录入表单（ban/pick 顺序 +
   side 选择），挂在 series 上。
3. **RivalHub 接口**：录入格式定义为 `@cs2dak/contract` 的 Zod schema
   （`SeriesVeto`），studio 手工录入与 RivalHub API 推送共用同一 shape，
   接入时只换数据来源。
4. **Veto Lite**：双方地图池胜率、T/CT 半场拆分、近期趋势 → BO3/BO5
   ban/pick 建议表（纯统计展示，不做胜率预测模型）。

## 模块 8 组件归属

| 层           | 新增                                                                                                | 挂载点                                                   |
| ------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| contract     | `SeriesVeto` schema                                                                                 | `packages/contract/src/`                                 |
| core/cohort  | 开局向量提取（core 单场）、cluster 聚合（cohort 跨场）                                              | `packages/cohort/src/` 模式同现有聚合                    |
| presentation | `buildTeamPatterns` / `buildAntiStratReport` / `buildVetoTable`                                     | `packages/presentation/src/`                             |
| studio       | `CoachView`：子 tab Pattern / Playbook / Anti-Strat / Veto；series 分组 + BP 录入；「我的队伍」设置 | 替换 `apps/dak-studio/src/App.tsx:435` 的 ComingSoonView |

---

# 实施模块拆分（每块可独立落地）

| #   | 模块                  | 内容                                                      | 依赖                  |
| --- | --------------------- | --------------------------------------------------------- | --------------------- |
| M1  | core duels            | engagement/三分类/TTK/对枪（4a 信号层）+ 测试             | 无                    |
| M2  | core mechanics        | burst/命中匹配/急停/开枪节奏 + 测试                       | M1（共用 burst 切分） |
| M3  | Duel 视图             | presentation insights + DuelView 三 tab + ⓘ 说明 + 跳回放 | M1 M2                 |
| M4  | series + BP           | series 分组、BP 录入、`SeriesVeto` 合同、Veto Lite（8d）  | 无                    |
| M5  | Pattern Finder        | 开局向量 + 规则聚类 + cluster 视图（8a）                  | 无                    |
| M6  | Playbook + Anti-Strat | 命名沉淀、Timing Heatmap、报告导出、双视角（8b/8c）       | M4 M5                 |

待办（不进本期）：preaim、反应时间（beta）、交火窗口高频采样（format 3.x）。
