# 设计：职业基准曲线（固定参照系）

> 本文是阶段 R（评分参照系重设计）的技术设计。
> 整体方案见 [rating-model.md](rating-model.md)「当前方案 vs 未来方案」，工程阶段见 [rr-roadmap.md](../rr-roadmap.md)。

---

## 目标

冻结一条**职业平均 = 1.0** 的固定标准曲线，使任意 demo 对同一把尺子量，分数可跨场/跨赛季移植。

当前 cohort z-score 方案的三个痛点：
1. 换一批人，同样发挥得不同分——不可移植。
2. 单张 demo 无法绝对评分（cohort 只有 10 人）。
3. 1.0 语义浮动，说不清"职业均值"还是"天梯均值"。

---

## 数据来源

**主源：HLTV 职业 GOTV demo**

- 时代：CS2 MR12，优先 2025–2026。
- 赛事：Tier-1 LAN（Major、IEM Katowice/Cologne、BLAST、ESL Pro League、PGL 等）。
- 阶段：淘汰赛 > 小组/瑞士轮 > 预选赛。
- 队伍：覆盖 HLTV Top 5/10/20/30——避免"职业均值 = 冠军队均值"偏差。
- 地图：优先 Mirage/Inferno/Nuke/Ancient/Anubis/Dust2/Train。
- 排除：加时异常过多、技术重赛、CS:GO 旧 demo。

**入库量**
- v0：100–200 张 map-demo（3–5 个 Tier-1 赛事），可跑出初版曲线。
- v1+：500+ 张，分布稳定；后续按版本切片维护（见"曲线版本化"节）。

**获取方式**
- demo 本体从 HLTV 下载（2022 年已取消单线程限制）。
- match URL 半自动维护（C9WIN Demo Downloader 按 event 批量拉取，或手动补录）；**不做绕 Cloudflare 的全自动爬虫**。
- 下载完后全部进 manifest.sqlite 做校验，不直接信任文件。

---

## Demo Lake 目录结构

本仓库已有完整的 `.dem → v2 ZIP` 管道（`python/src/cs2dak`），v2 ZIP 内已包含所有事件文件（players / rounds / kills / damages / grenades / positions-1s 等）。Demo Lake 直接以 v2 ZIP 作为存储格式，**不另建 parquet 层**。

```
rr-demo-lake/
  manifest.sqlite          ← map-demo 元数据与解析状态
  dem/
    hltv/
      2025_IEM_Cologne/
        match_237xxxx_nuke.dem     ← 原始 demo
  export/
    hltv/
      2025_IEM_Cologne/
        match_237xxxx_nuke.zip     ← cs2dak 产出的 v2 ZIP
```

### manifest.sqlite 字段

| 字段 | 说明 |
|---|---|
| `event_id` / `event_name` | 赛事 |
| `match_id` | HLTV match ID |
| `date` | 比赛日期 |
| `team_a` / `team_b` | 队伍名 |
| `map_name` | 地图 |
| `match_url` | HLTV match 页面 |
| `demo_url` | demo 下载链接 |
| `dem_path` | dem 层相对路径 |
| `export_path` | v2 ZIP 相对路径 |
| `export_status` | `pending / ok / error` |
| `checksum` | SHA-256 校验（.dem） |

### ingestion pipeline

```
download .dem
  → write manifest (export_status=pending)
  → cs2dak export <dem> --out export/hltv/<event>/
  → validate v2 ZIP (cs2dak validate)
  → update manifest (export_status=ok, export_path=...)
```

核心解析由 `cs2dak` 完成，ingestion 层只负责编排和 manifest 状态追踪。

---

## Normalizer Strategy 接口

阶段 R0 的关键设计：把归一化从 cohort 硬编码改成策略接口，支持两套实现平滑切换。

```typescript
interface AccountNormalizer {
  /**
   * 把六账户 raw 值映射到 accountRR（1.0 = 该 normalizer 定义的均值）。
   * @param signals  RRSignals（每回合事实信号）
   * @param cohort   可选：cohort 统计，cohort normalizer 必传，pro baseline 可忽略
   */
  normalize(signals: RRSignals, cohort?: CohortStats): AccountRRResult;
}

// 现有实现（保持不变）
class CohortNormalizer implements AccountNormalizer { ... }

// 新增实现（阶段 R1 填充）
class FrozenProBaselineNormalizer implements AccountNormalizer {
  constructor(private baseline: ProBaselineConfig) {}
  normalize(signals: RRSignals): AccountRRResult { ... }
}
```

`computeCohortAccountsRR` 和 `computeFrozenProBaselineRR`
（`@rivalhub/rival-rating`）分别覆盖 cohort-relative 与 frozen-pro-baseline 两种归一化路径。

---

## 职业曲线冻结方案

### 原始账户分布统计

对 D1 样本中每个 player-map 行，用现有公式算出六账户 raw（每回合）：

```
combat_raw  trade_raw  clutch_raw  utility_raw  objective_raw
```

跨所有 player-map 行统计：

```
median / mean / std / p05 / p25 / p75 / p95
```

还需拟合：
- combat↔其余账户的 `corr` 系数（用于冻结残差化参数，不再 per-cohort 拟合）。
- 各账户的 saturation 点（建议 p95 作封顶参考）。

### 归一化形状

不用裸 z-score——尾部不饱和，偶发极端值会把总分打穿。

推荐方案：**percentile mapping + 线性插值**。

```
raw_value
  → 在职业分布里定位百分位 p ∈ [0,1]
  → mapped = 0.6 + (p_target_max - 0.6) * p
```

其中 `p_target_max` 设为 1.6（职业 p100 映射到 1.6，普通玩家上限自然低于此）。

- 职业 p50（均值）→ 1.0。
- 职业 p75（优秀） → 约 1.2。
- 职业 p95（顶尖） → 约 1.4–1.5。
- 天梯普通玩家落在 0.8–0.9 区间是有意为之。

也可用 sigmoid 替代，效果相近；percentile mapping 对异常输入更鲁棒。

### 冻结产物

```json
// rr-v2-pro-baseline.json
{
  "version": "pro_baseline_cs2_2025H2_v1",
  "generated": "2025-xx-xx",
  "mapCount": 180,
  "combat":    { "median": x, "mean": x, "std": x, "p05": x, "p95": x, "corr_with_combat": 1.0 },
  "trade":     { "median": x, "mean": x, "std": x, "p05": x, "p95": x, "corr_with_combat": x },
  "clutch":    { "median": x, "mean": x, "std": x, "p05": x, "p95": x, "corr_with_combat": x },
  "utility":   { "median": x, "mean": x, "std": x, "p05": x, "p95": x, "corr_with_combat": x },
  "objective": { "median": x, "mean": x, "std": x, "p05": x, "p95": x, "corr_with_combat": x },
  "percentileTable": { ... }   // 职业分布 CDF 插值表，供 FrozenProBaselineNormalizer 使用
}
```

`FrozenProBaselineNormalizer` 在构造时加载此文件；配置写死版本号，大版本更新时换文件、改版本号。

---

## 曲线版本化

CS2 经济/地图池/枪械/烟雾机制有重大版本时，冻结新版本曲线，用版本号区分：

```
pro_baseline_cs2_2025H2_v1
pro_baseline_cs2_2026H1_v1
```

评分记录附 `baselineVersion` 字段，下游产品可按版本区间筛选/比较。
PRISM 风格维度**不用**冻结基准——风格本就是相对的，继续 cohort z-score。

---

## 实施顺序

```
Phase D0  建目录 + manifest.sqlite schema + ingestion CLI 骨架
Phase D1  拉 100–200 张 map demo，全部入库并解析
R0        抽 normalizer strategy 接口，现有 cohort normalizer 不变，接口跑通
R1        用 D1 数据算六账户分布，生成 rr-v2-pro-baseline.json，
          FrozenProBaselineNormalizer 实现 + 集成测试
```

R0 可在 D1 完成前并行推进（接口不依赖真实职业数据）。

---

## v0 provisional 实现状态（2026-06，24 张职业 map spike）

用 24 张 Tier-1 LAN demo（240 player-map 行）跑通了**冻结 → 单 demo 绝对评分**的完整管线：

- **冻结脚本**：`packages/cohort/scripts/freeze-pro-baseline.ts` —— 对每个 player-map 用真实
  公式算 raw 账户，冻结每账户 `mean/std`、残差化 `slope`、全局 `scale`，并存 21 点分位表。
  产出 `fixtures/output/pro-spike/rr-v2-pro-baseline-v0.json`（版本 `pro_baseline_cs2_2026H1_v0_provisional`）。
- **归一化器（R0）**：`@rivalhub/rival-rating` 新增 `computeFrozenProBaselineRR`
  （`src/rr/models/frozen-pro-baseline.ts`）+ `ProBaselineConfig` 类型，吃**单个** signal、
  不需要 cohort。单测 5/5 通过（含「恰在基准 → 1.0」「可移植确定性」「clamp 下限」）。
- **端到端验证**：用真实 baseline 对 24 张 demo **逐张独立评分**，复现 mean=1.0001 / std=0.3717
  （= 冻结脚本自检），证明单 demo 绝对评分可移植。

**被数据证实的尾部问题**：稀有事件账户偏度严重右偏——clutch 1.47 / objective 1.43 /
utility 1.76，而 combat/trade 仅 0.38/0.21。裸 z-score（v0 现状）压不住胖尾，
某人一场道具/残局爆炸会刷高分 → **v1 必须上 percentile-mapping / sigmoid 尾部饱和**
（分位表已冻进 JSON，数据就绪）。

**待办**：
- 正式接线：rival-rating 提交 + re-pin `core`/`cohort` 的 commit → CLI 加「单 demo 绝对评分」入口。
- 扩样到 100–200 张出权威 v1，并把归一化形状从裸 z-score 换成分位映射。
- 当前 v0 标 `_provisional`，只用于工程验证，**非权威职业标尺**。

> 数据源 7 图池：ancient / anubis / dust2 / inferno / mirage / nuke / overpass（train 已出池）。
> spike 已全覆盖，但 overpass/anubis 各仅 1 张，扩样时优先补。
