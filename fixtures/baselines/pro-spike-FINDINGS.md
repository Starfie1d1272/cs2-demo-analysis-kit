# 职业 demo spike — 发现记录

> 目的：手动下一批职业 demo，跑现有 `export-batch` + `cohort` 管线，看真实职业账户分布，
> 为阶段 R（固定职业基准）的归一化/曲线设计提供地基。零新代码。

## 样本

| 项 | 值 |
|---|---|
| 来源 | 8 个 HLTV `.rar`（2026 Tier-1 LAN：IEM Krakow/Atlanta、BLAST Rivals、PGL Astana、CS Asia Championships） |
| 解析出 | **24 张 map-demo**（11GB），覆盖 Nuke/Ancient/Mirage/Dust2/Inferno/Overpass/Anubis |
| 队伍 | Vitality / NAVI / Spirit / Falcons / MOUZ / FURIA / The MongolZ / Legacy / PARIVISION |
| 导出 | 24/24 成功，0 失败（`export-batch`，764.8s，14.9 MB/s） |
| cohort | 24 场聚合，**45 名选手** |

## 管线

```
HLTV .rar  --unar-->  dem/*.dem  --cs2-demo-exporter export-batch-->  bundle.zip
  --unzip exports/-->  export/*.zip  --cs2dak cohort-->  season-cohort.json
```

工作区：`fixtures/output/pro-spike/`（在 .gitignore 内）。

## 职业账户分布（45 选手，cohort 相对，mean 锚定 1.0）

| 量 | median | mean | std | p05 | p95 |
|---|---|---|---|---|---|
| accountRR (v2) | +1.012 | +1.000 | 0.221 | +0.624 | +1.338 |
| rrV1 | +0.984 | +1.001 | 0.221 | +0.691 | +1.334 |

accountBreakdown（残差化后跨选手贡献，Σ≈rr−1）：

| 账户 | median | std | p05 | p95 |
|---|---|---|---|---|
| combat | −0.044 | 0.175 | −0.270 | +0.278 |
| trade | +0.008 | 0.087 | −0.124 | +0.133 |
| clutch | −0.001 | 0.070 | −0.108 | +0.115 |
| utility | −0.010 | 0.052 | −0.051 | +0.081 |
| objective | −0.003 | 0.018 | −0.019 | +0.037 |

Top by accountRR：w0nderful 1.48 / latto 1.47 / donk 1.34 / Techno4K 1.32 / ZywOo 1.27 / b1t 1.22 …
（真实顶级选手排在前列，数据可信。）

## 关键结论（对阶段 R 设计）

1. **结构与 55 场 NJU 半职业数据高度一致**：账户 breakdown std 量级
   （combat 0.175 / trade 0.087 / clutch 0.070 / utility 0.052 / objective 0.018）
   几乎复刻 cohort.md 记录的 NJU 结果（0.186/0.093/0.075/0.056/0.019）。
   → 残差化模型在职业数据上行为稳定，combat 仍是主干。

2. **当前输出仍是 cohort 相对**：mean 被结构性锚定到 1.0（这 45 人内部）。
   这正是要换掉的——它不是冻结基准。

3. **冻结曲线需要的是 raw 账户分布**（standardize 之前的 `accounts[k]/w[k]`），
   而非这里的 post-anchoring breakdown。`computeCohortAccountsRR` 目前不导出中间 raw 值。
   → **R0 的具体工作**：让 rival-rating 导出/接受 raw 账户分布参数（每账户 mean/std）
   + 冻结残差化 slope，才能做 `FrozenProBaselineNormalizer`。

4. **样本量**：mapCount 中位数仅 4（min 2 / max 10），45 选手。作为 v0 够看趋势，
   要冻结稳定曲线需扩到 100–200 张（见 pro-baseline.md Phase D1）。

## 发现的导出器 BUG（已登记独立任务）

- **1/24** demo（`2026-05-17_de_mirage_Team_Falcons-vs-Team_Spirit`）的
  `positions-1s.json` + `replay.json` 含一个**非 roster steamId `76561198027104087`**
  （教练/观察者），其 `teamKey`/`side` = `"unknown"`。
- contract schema 要求 `t|ct` / `teamA|teamB` → `loadDemoPackageFromZip` 整包校验失败 →
  阻断 analyze/cohort。
- 42/18402 样本（~0.2%），单一人物，全程 unknown。
- **根因**：导出器把非首发 10 人写进了时空层（positions-1s/replay）。
- **修复方向**：`python/cs2_demo_exporter/exporter.py` 的时空层只保留 roster 内 steamId。
- **影响**：职业 demo 常有教练在线 → 扩量前必须修，否则大批职业 demo 无法进 cohort。
- spike 临时绕过：从 export 副本剥离 `replay.json` + `positions-1s.json`（两者皆 optional，
  账户层不依赖），不动任何生产代码。
- **已修复并验证**：导出器加 `_is_valid_teamkey/_is_valid_side` 守卫过滤非 roster 时空轨迹；
  用修复后导出器重导全 24 场（`bundle-v2.zip`），cohort **不剥离**即跑通，重导那场 0 unknown。

## 冻结 v0 结果（2026-06）

用修复后导出器重导的 24 场（240 player-map 行）冻结 `rr-v2-pro-baseline-v0.json`
（`pro_baseline_cs2_2026H1_v0_provisional`）：

- **自检通过**：用冻结参数回测职业集，frozenMean=1.0001（≈1.0）、frozenStd=0.3717（≈targetStd 0.3719）。
- **端到端可移植**：`computeFrozenProBaselineRR` 对 24 场**逐张独立评分**（无 cohort）复现同样的
  mean=1.0001 / std=0.3717，min=0.100（clamp 下限）/ max=2.163。

冻结参数：

| 账户 | mean | std | slope(vs combat) | skew |
|---|---|---|---|---|
| combat | 0.4136 | 0.2449 | — | 0.38 |
| trade | −0.0022 | 0.0680 | 0.532 | 0.21 |
| clutch | −0.0009 | 0.0224 | 0.223 | **1.47** |
| objective | 0.0205 | 0.0213 | 0.133 | **1.43** |
| utility | 0.0522 | 0.0618 | −0.061 | **1.76** |

- trade 与 combat 共线最高（slope 0.532）→ 残差化收益最大。
- **clutch/objective/utility 严重右偏**（skew>1.4）→ 裸 z-score 压不住尾部，v1 须上分位映射/sigmoid。

产物 / 代码：
- `packages/cohort/scripts/freeze-pro-baseline.ts`（冻结）+ `validate-frozen-baseline.ts`（验证）
- `rival-rating/src/rr/models/frozen-pro-baseline.ts`（+ 单测 5/5）
- `rr-v2-pro-baseline-v0.json`（含 21 点分位表，为 v1 尾部饱和预留）
</content>
