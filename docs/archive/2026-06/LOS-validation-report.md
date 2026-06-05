# NJU 55 场空间验证 — LOS 启用后对比报告

> Generated: 2026-06-05
> Input: 55 NJU 联赛 demo（fixtures/output/nju-rivals-2026）
> TRI source: `awpy get tris` → `~/.awpy/tris/`（7 图，207MB 展开）
> Model: `route-nav-los-v1`

---

## 1. 总体结论

**LOS 启用后空间信号变得更保守、更可信。**

| 指标 | 之前 (nav only) | 现在 (nav + LOS) | 变化 |
|---|---:|---:|---:|
| TRI 覆盖 | 0/55 图 | **55/55 图** | — |
| 空间覆盖率 | 100% | 100% | — |
| Free/lurker 候选 | 12 | **10** | −2 |
| 候选平均 spatial delta | +0.0211 RR | **+0.0161 RR** | −0.0050 (−23.7%) |
| 建议 MapControl multiplier | 1 | **1** | — |

**LOS 过滤掉了约 24% 的虚假空间信号**，主要来自 blocked LOS 下的 contested-control 事件（两方在不同掩体后 → 不算真正的争夺）和 route-denial 的 LOS 折扣（blocked → ×0.75）。

---

## 2. LOS 对空间指标的影响机制

LOS 启用后在三个关键路径施加约束：

| 路径 | 机制 | 效果 |
|------|------|------|
| **contested-control** | T/CT 在同一 route 但 LOS blocked → **不产生事件** | 直接削减虚高争夺秒数 |
| **route-denial** | CT 占深位但 LOS blocked → **×0.75 折扣** | 保守化阻断秒数 |
| **grenade utility** | 烟/火 LOS 加权：`Math.max(0.35, losClearPairs / 2)` | 道具效果与视线质量挂钩 |

每条事件附带 `geometry` 证据：`navAreaId`、`navPathLength`、`losChecked`、`losClear`、`losClearPairs`。

---

## 3. RR Delta 分布

LOS 启用后 delta 分布整体左移：

| 分位 | 之前 (est.) | 现在 | 变化 |
|---|---:|---:|---:|
| p50 (中位) | ~0.019 | **0.0164** | −0.0026 |
| p95 | ~0.024 | **0.0201** | −0.0039 |
| mean | 0.0211 | **0.0161** | −0.0050 |
| std | — | 0.0028 | — |

delta 的分布非常紧凑（std=0.0028），说明空间信号在 NJU 级别的差异性不大，以微调为主——这符合预期：非职业选手的空间贡献不够极端。

---

## 4. 地图维度

7 图 MapControl 均值差异小，但存在排序：

| Map | Maps | Mean RR Delta | Mean MapControl |
|---|---:|---:|---:|
| de_ancient | 17 | 0.0186 | 0.0125 |
| de_mirage | 11 | 0.0164 | 0.0116 |
| de_anubis | 3 | 0.0162 | 0.0108 |
| de_dust2 | 11 | 0.0154 | 0.0109 |
| de_inferno | 4 | 0.0150 | 0.0097 |
| de_overpass | 3 | 0.0149 | 0.0105 |
| de_nuke | 6 | **0.0115** | **0.0080** |

- **de_ancient** 空间影响最大（delta 最高），可能与其大范围长距离路线结构有关。
- **de_nuke** 空间影响最小，多层结构 + 封闭空间导致 LOS blocked 比例最高，有效降低了空间信号。
- de_inferno 尽管是最大的 tri 文件（92MB / 最复杂碰撞几何），但按 route-callout 判定后 delta 温和。

---

## 5. Free/Lurker 候选审查

10 个候选全部被模型识别为 `low-trade-space` 角色。逐个审查：

### 高信号候选

| # | Player | Maps | RR Δ | Trade | MapCtrl | HLTV2 | 审查判断 |
|---|---|---|---|---|---|---|---|
| 1 | **𝑴𝒊𝒔𝒂𝒌𝒖** | 13 | +0.0173 | −0.0030 | 0.0114 | 0.997 | ✅ 13 图跨图稳定，低 trade + 高 MapCtrl，HLTV 接近 1.0，**典型目标用户** |
| 2 | **Falcons.流萤** | 10 | +0.0167 | −0.0031 | 0.0113 | 0.881 | ✅ 10 图稳定，HLTV 仅 0.88 但 MapCtrl 高，**MapControl 精准回收的盲区选手** |
| 3 | **17T** | 9 | +0.0165 | −0.0036 | 0.0120 | 0.828 | ✅ 最低 trade（−0.0036），最高 MapCtrl（0.0120），**最典型的"孤儿死亡不碍事"型** |
| 4 | **我是i4b** | 15 | +0.0162 | −0.0035 | 0.0111 | 1.189 | ✅ 15 图最大样本，trade 极低但 HLTV 高 → MapControl 为已有高分提供空间解释 |
| 5 | **Herald** | 9 | +0.0159 | −0.0027 | 0.0118 | 1.467 | ⚠️ HLTV 1.47 已是顶级，MapControl 锦上添花而非补盲区 |

### 中信号候选

| # | Player | Maps | RR Δ | Trade | MapCtrl | HLTV2 | 审查判断 |
|---|---|---|---|---|---|---|---|
| 6 | who1s2sq | 9 | +0.0162 | −0.0027 | 0.0110 | 1.370 | ⚠️ 类似 Herald，HLTV 已高 |
| 7 | Trop1X_L | 11 | +0.0159 | −0.0025 | 0.0116 | 0.823 | ✅ 低 HLTV + 高 MapCtrl，与 Falcons.流萤同型 |
| 8 | 香菜圆子 | 16 | +0.0155 | −0.0033 | 0.0114 | 1.159 | ⚠️ 最大 maps 数，trade 低但样本覆盖好 |
| 9 | 鹿衔草✧ | 6 | +0.0153 | −0.0027 | 0.0114 | 0.948 | ✅ 6 图样本偏少但模式清晰 |
| 10 | 大肠教父 | 4 | +0.0148 | −0.0031 | 0.0117 | 1.305 | ⚠️ 4 图样本最少，模式与我是i4b 类似 |

### 被 LOS 淘汰的 2 个候选

| Player | 淘汰原因 |
|---|---|
| **BonneNuiTzt** | LOS enabled → MapControl 或 Utility 掉到中位以下，不再满足候选阈值 |
| **XXXTECH** | Cluster 0（唯一非 low-trade-space），LOS 后 mapCtrl 大跌 |

这两个候选在 nav-only 模式下被虚高的 contested-control 事件（无 LOS 判定）抬高了 MapControl 得分。LOS 启用后正确排除。

---

## 6. MapControl Multiplier 建议

```
当前建议: multiplier = 1（保持不变）
```

**理由**：

1. **LOS 已使信号保守化**（delta −24%）——在 multiplier 调高之前，先让 LOS 的"冷却效应"沉淀
2. **候选 delta 绝对值小**（+0.016 RR）——在单个账户内影响力有限，10 个候选的最大收益仅 ~+0.017 RR
3. **候选质量高但样本有限**（NJU = 业余联赛 55 场）——其中 5 个候选的 HLTV2 已在 1.15 以上，MapControl 是解释而非修正
4. **先看职业数据**——Jame/sh1ro 效应在 Tier-1 职业场景更显著，NJU 级别空间贡献方差小

**推荐路径**：
```
现在: multiplier = 1（LOS 启用后稳定观察）
  ↓ 收集职业 demo 空间信号（>100 图）
  ↓ 对比 NJU vs 职业 MapControl 分布
  ↓ 职业数据支撑后: multiplier ∈ [1.1, 1.3]
```

---

## 7. LOS 资产质量评估

| 地图 | Tri 文件大小 | BVH 构建时间 (est.) | 备注 |
|---|---|---|---|
| de_inferno | 92.7 MB | ~3-5s | 最大，碰撞几何最复杂 |
| de_ancient | 33.4 MB | ~1-2s | — |
| de_anubis | 27.7 MB | ~1s | — |
| de_overpass | 23.5 MB | ~1s | — |
| de_dust2 | 17.6 MB | ~0.5s | — |
| de_nuke | 7.0 MB | ~0.3s | 多层结构，nav 面积大但 tri 少 |
| de_mirage | 4.7 MB | ~0.2s | 最小 tri |

BVH 构建只在首次访问该地图时执行一次，结果缓存在内存中。55 场 NJU 验证（7 种地图）的总 tri 加载开销约 8-12 秒（首次）或 0 秒（缓存命中）。

---

## 8. 后续行动清单

| # | 行动 | 优先级 | 依赖 |
|---|---|---|---|
| 1 | ~~LOS .tri 资产集成~~ | ✅ 已完成 | — |
| 2 | ~~NJU 55 场 LOS-enabled 验证~~ | ✅ 已完成 | — |
| 3 | **人工审查 Top-5 候选**（𝑴𝒊𝒔𝒂𝒌𝒖、Falcons.流萤、17T、我是i4b、Trop1X_L）| 🔴 下一步 | 需打开 demo 看回放 |
| 4 | **职业 demo 空间信号采集**（>100 图 Tier-1 LAN） | 🟡 中期 | Phase D0/D1 demo lake |
| 5 | **决定 MapControl multiplier** | 🟡 中期 | #3 + #4 |
| 6 | Nav JSON chunk 拆分（demo-lab 6.6MB → 按需加载） | 🟢 低 | — |
| 7 | 区域多边形标定（zone polygon） | 🟢 低 | 人工 |
| 8 | 文档更新（map-control.md / rr-roadmap.md） | ✅ 已完成 | — |

---

## 9. 技术验证清单

- [x] `pnpm typecheck` ✅
- [x] `pnpm test` ✅（27 files / 126 tests）
- [x] CLI 单场 LOS-enabled 分析 ✅（`model: route-nav-los-v1`）
- [x] NJU 55 场 LOS-enabled 批量验证 ✅（55 图 / 550 player-map / TRI 全命中）
- [x] demo-lab build 通过 ✅
