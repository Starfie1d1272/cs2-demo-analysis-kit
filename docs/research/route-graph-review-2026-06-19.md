# Observed Route Graph Review

扫描 ZIP：110
候选限制：maxHops=12，minEdgeCount=3，minRouteSupport=3 player-round；不限制候选条数。
聚类口径：`entryChokeId` 决定 route family；同一最终入口下的全部完整走法保留为 variants。
统计窗口：每回合 freezeEndTick 至 endTick；只统计存活玩家的 replay place。
去抖口径：连续 callout 合并为 visit；少于 2 帧的 visit 丢弃；死亡或缺失 callout 截断序列。

> 本报告只证明 demo 中出现过的相邻转换。未出现的边不代表不可达；本版不使用 nav/tri/callout-grid 补边。
> 候选完全由 demo 的单个 T 方 player-round 完整序列生成；人工 `map-routes` 不参与生成、聚类或排序。

## 人工审查顺序

1. 先检查高频边是否符合地图方向，特别留意跨层 callout 或死亡附近的假转换。
2. 检查 corridor 的共同骨架是否表达同一地图控制方向，而不是只看入口 callout 是否相同。
3. 检查 variants 是否保留不同入口、转点和夹击走向；不应为了合并而删除真实路径。
4. JSON 块包含全部 corridor 与 variants，人工确认前不要写入 runtime 资产。

## de_ancient

样本 ZIP：23；回合：518；observed 有向边：45

### 高频有向边

| from | to | T | CT | T占比 | 涉及回合 |
|---|---|---:|---:|---:|---:|
| CTSpawn / 警家 | House / VIP | 63 | 2498 | 2.5% | 516 |
| House / VIP | Alley / 底线 | 67 | 1740 | 3.7% | 511 |
| Alley / 底线 | BombsiteB / B包 | 98 | 1477 | 6.2% | 508 |
| Ruins / B外 | TSideLower / B小 | 1503 | 19 | 98.8% | 445 |
| TSpawn / 匪家 | Tunnel / 隧道 | 1490 | 25 | 98.3% | 468 |
| Water / 水路 | Ruins / B外 | 1484 | 31 | 98.0% | 465 |
| Tunnel / 隧道 | Water / 水路 | 1473 | 28 | 98.1% | 466 |
| TSpawn / 匪家 | Outside / 匪口 | 1465 | 21 | 98.6% | 461 |
| TSideLower / B小 | Ramp / B坡 | 1276 | 89 | 93.5% | 358 |
| CTSpawn / 警家 | BombsiteA / A包 | 58 | 1029 | 5.3% | 485 |
| BombsiteB / B包 | SideEntrance / 黑屋 | 144 | 767 | 15.8% | 473 |
| House / VIP | TopofMid / 中远 | 31 | 807 | 3.7% | 408 |
| TopofMid / 中远 | Middle / 中路 | 49 | 787 | 5.9% | 402 |
| TSideLower / B小 | TSideUpper / 跳台 | 703 | 116 | 85.8% | 372 |
| Ramp / B坡 | TSideLower / B小 | 633 | 153 | 80.5% | 300 |
| Outside / 匪口 | MainHall / A厅 | 726 | 33 | 95.7% | 271 |
| Ramp / B坡 | BombsiteB / B包 | 627 | 114 | 84.6% | 295 |
| MainHall / A厅 | BombsiteA / A包 | 660 | 65 | 91.0% | 252 |
| Middle / 中路 | SideHall / 甜甜圈 | 256 | 459 | 35.8% | 333 |
| BombsiteB / B包 | Alley / 底线 | 196 | 514 | 27.6% | 367 |
| TSideUpper / 跳台 | SideEntrance / 黑屋 | 466 | 225 | 67.4% | 321 |
| SideEntrance / 黑屋 | BombsiteB / B包 | 211 | 449 | 32.0% | 357 |
| Outside / 匪口 | Middle / 中路 | 607 | 49 | 92.5% | 331 |
| House / VIP | CTSpawn / 警家 | 101 | 554 | 15.4% | 315 |
| SideHall / 甜甜圈 | BombsiteA / A包 | 169 | 377 | 31.0% | 299 |
| BombsiteA / A包 | CTSpawn / 警家 | 66 | 477 | 12.2% | 322 |
| Alley / 底线 | House / VIP | 64 | 475 | 11.9% | 294 |
| SideEntrance / 黑屋 | TSideUpper / 跳台 | 186 | 341 | 35.3% | 318 |
| Middle / 中路 | TSideUpper / 跳台 | 207 | 266 | 43.8% | 291 |
| BombsiteB / B包 | Ramp / B坡 | 160 | 272 | 37.0% | 261 |
| TSideUpper / 跳台 | Middle / 中路 | 214 | 204 | 51.2% | 250 |
| BombsiteA / A包 | SideHall / 甜甜圈 | 106 | 282 | 27.3% | 250 |
| BombsiteA / A包 | MainHall / A厅 | 198 | 184 | 51.8% | 205 |
| TSideUpper / 跳台 | TSideLower / B小 | 235 | 138 | 63.0% | 237 |
| Middle / 中路 | TopofMid / 中远 | 156 | 191 | 45.0% | 220 |
| TSideLower / B小 | Ruins / B外 | 273 | 59 | 82.2% | 187 |
| TopofMid / 中远 | House / VIP | 128 | 199 | 39.1% | 217 |
| SideHall / 甜甜圈 | Middle / 中路 | 81 | 218 | 27.1% | 196 |
| Outside / 匪口 | TSpawn / 匪家 | 244 | 40 | 85.9% | 192 |
| Ruins / B外 | Water / 水路 | 211 | 42 | 83.4% | 149 |

### A 包 Route Corridors

| corridor | entryChokeId | 共同骨架 | variants | player-round | round | demo | team-round |
|---|---|---|---:|---:|---:|---:|---:|
| a_main | a_main | TSpawn / 匪家 → Outside / 匪口 → MainHall / A厅 → BombsiteA / A包 | 2 | 549 | 207 | 23 | 207 |
| a_side_hall | a_side_hall | TSpawn / 匪家 → Middle / 中路 → SideHall / 甜甜圈 → BombsiteA / A包 | 2 | 146 | 69 | 23 | 69 |
| a_ct_spawn | a_ct_spawn | TSpawn / 匪家 → Middle / 中路 → TopofMid / 中远 → House / VIP → CTSpawn / 警家 → BombsiteA / A包 | 2 | 22 | 16 | 12 | 16 |

#### a_main

共同骨架：TSpawn / 匪家 → Outside / 匪口 → MainHall / A厅 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 匪口 → MainHall / A厅 → BombsiteA / A包 | 540 | 207 | 23 | 207 | 660 | 91.0% |
| 2 | TSpawn / 匪家 → Tunnel / 隧道 → Water / 水路 → Ruins / B外 → TSideLower / B小 → TSideUpper / 跳台 → Middle / 中路 → Outside / 匪口 → MainHall / A厅 → BombsiteA / A包 | 9 | 8 | 7 | 8 | 133 | 51.2% |

#### a_side_hall

共同骨架：TSpawn / 匪家 → Middle / 中路 → SideHall / 甜甜圈 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 匪口 → Middle / 中路 → SideHall / 甜甜圈 → BombsiteA / A包 | 100 | 56 | 21 | 56 | 169 | 31.0% |
| 2 | TSpawn / 匪家 → Tunnel / 隧道 → Water / 水路 → Ruins / B外 → TSideLower / B小 → TSideUpper / 跳台 → Middle / 中路 → SideHall / 甜甜圈 → BombsiteA / A包 | 46 | 38 | 21 | 38 | 169 | 31.0% |

#### a_ct_spawn

共同骨架：TSpawn / 匪家 → Middle / 中路 → TopofMid / 中远 → House / VIP → CTSpawn / 警家 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 匪口 → Middle / 中路 → TopofMid / 中远 → House / VIP → CTSpawn / 警家 → BombsiteA / A包 | 17 | 12 | 11 | 12 | 58 | 5.3% |
| 2 | TSpawn / 匪家 → Tunnel / 隧道 → Water / 水路 → Ruins / B外 → TSideLower / B小 → TSideUpper / 跳台 → Middle / 中路 → TopofMid / 中远 → House / VIP → CTSpawn / 警家 → BombsiteA / A包 | 5 | 5 | 5 | 5 | 58 | 5.3% |

### B 包 Route Corridors

| corridor | entryChokeId | 共同骨架 | variants | player-round | round | demo | team-round |
|---|---|---|---:|---:|---:|---:|---:|
| b_ramp | b_ramp | TSpawn / 匪家 → TSideLower / B小 → Ramp / B坡 → BombsiteB / B包 | 2 | 588 | 243 | 23 | 243 |
| b_side_entrance | b_side_entrance | TSpawn / 匪家 → TSideUpper / 跳台 → SideEntrance / 黑屋 → BombsiteB / B包 | 2 | 148 | 96 | 23 | 96 |
| b_alley | b_alley | TSpawn / 匪家 → Outside / 匪口 → Middle / 中路 → TopofMid / 中远 → House / VIP → Alley / 底线 → BombsiteB / B包 | 1 | 15 | 12 | 9 | 12 |

#### b_ramp

共同骨架：TSpawn / 匪家 → TSideLower / B小 → Ramp / B坡 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Tunnel / 隧道 → Water / 水路 → Ruins / B外 → TSideLower / B小 → Ramp / B坡 → BombsiteB / B包 | 566 | 240 | 23 | 240 | 627 | 84.6% |
| 2 | TSpawn / 匪家 → Outside / 匪口 → Middle / 中路 → TSideUpper / 跳台 → TSideLower / B小 → Ramp / B坡 → BombsiteB / B包 | 22 | 21 | 13 | 21 | 207 | 43.8% |

#### b_side_entrance

共同骨架：TSpawn / 匪家 → TSideUpper / 跳台 → SideEntrance / 黑屋 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Tunnel / 隧道 → Water / 水路 → Ruins / B外 → TSideLower / B小 → TSideUpper / 跳台 → SideEntrance / 黑屋 → BombsiteB / B包 | 102 | 75 | 21 | 75 | 211 | 32.0% |
| 2 | TSpawn / 匪家 → Outside / 匪口 → Middle / 中路 → TSideUpper / 跳台 → SideEntrance / 黑屋 → BombsiteB / B包 | 46 | 37 | 19 | 37 | 207 | 32.0% |

#### b_alley

共同骨架：TSpawn / 匪家 → Outside / 匪口 → Middle / 中路 → TopofMid / 中远 → House / VIP → Alley / 底线 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 匪口 → Middle / 中路 → TopofMid / 中远 → House / VIP → Alley / 底线 → BombsiteB / B包 | 15 | 12 | 9 | 12 | 67 | 3.7% |

### Corridor 候选 JSON

```json
[
  {
    "id": "a_main",
    "target": "a",
    "entryChokeId": "a_main",
    "sharedCallouts": [
      "TSpawn",
      "Outside",
      "MainHall",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Outside",
      "MainHall",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 549,
    "roundSupport": 207,
    "demoSupport": 23,
    "teamRoundSupport": 207,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "MainHall",
          "BombsiteA"
        ],
        "playerRoundSupport": 540,
        "roundSupport": 207,
        "demoSupport": 23,
        "teamRoundSupport": 207
      },
      {
        "callouts": [
          "TSpawn",
          "Tunnel",
          "Water",
          "Ruins",
          "TSideLower",
          "TSideUpper",
          "Middle",
          "Outside",
          "MainHall",
          "BombsiteA"
        ],
        "playerRoundSupport": 9,
        "roundSupport": 8,
        "demoSupport": 7,
        "teamRoundSupport": 8
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_side_hall",
    "target": "a",
    "entryChokeId": "a_side_hall",
    "sharedCallouts": [
      "TSpawn",
      "Middle",
      "SideHall",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Outside",
      "Middle",
      "SideHall",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 146,
    "roundSupport": 69,
    "demoSupport": 23,
    "teamRoundSupport": 69,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Middle",
          "SideHall",
          "BombsiteA"
        ],
        "playerRoundSupport": 100,
        "roundSupport": 56,
        "demoSupport": 21,
        "teamRoundSupport": 56
      },
      {
        "callouts": [
          "TSpawn",
          "Tunnel",
          "Water",
          "Ruins",
          "TSideLower",
          "TSideUpper",
          "Middle",
          "SideHall",
          "BombsiteA"
        ],
        "playerRoundSupport": 46,
        "roundSupport": 38,
        "demoSupport": 21,
        "teamRoundSupport": 38
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_ct_spawn",
    "target": "a",
    "entryChokeId": "a_ct_spawn",
    "sharedCallouts": [
      "TSpawn",
      "Middle",
      "TopofMid",
      "House",
      "CTSpawn",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Outside",
      "Middle",
      "TopofMid",
      "House",
      "CTSpawn",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 22,
    "roundSupport": 16,
    "demoSupport": 12,
    "teamRoundSupport": 16,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Middle",
          "TopofMid",
          "House",
          "CTSpawn",
          "BombsiteA"
        ],
        "playerRoundSupport": 17,
        "roundSupport": 12,
        "demoSupport": 11,
        "teamRoundSupport": 12
      },
      {
        "callouts": [
          "TSpawn",
          "Tunnel",
          "Water",
          "Ruins",
          "TSideLower",
          "TSideUpper",
          "Middle",
          "TopofMid",
          "House",
          "CTSpawn",
          "BombsiteA"
        ],
        "playerRoundSupport": 5,
        "roundSupport": 5,
        "demoSupport": 5,
        "teamRoundSupport": 5
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_ramp",
    "target": "b",
    "entryChokeId": "b_ramp",
    "sharedCallouts": [
      "TSpawn",
      "TSideLower",
      "Ramp",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Tunnel",
      "Water",
      "Ruins",
      "TSideLower",
      "Ramp",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 588,
    "roundSupport": 243,
    "demoSupport": 23,
    "teamRoundSupport": 243,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Tunnel",
          "Water",
          "Ruins",
          "TSideLower",
          "Ramp",
          "BombsiteB"
        ],
        "playerRoundSupport": 566,
        "roundSupport": 240,
        "demoSupport": 23,
        "teamRoundSupport": 240
      },
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Middle",
          "TSideUpper",
          "TSideLower",
          "Ramp",
          "BombsiteB"
        ],
        "playerRoundSupport": 22,
        "roundSupport": 21,
        "demoSupport": 13,
        "teamRoundSupport": 21
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_side_entrance",
    "target": "b",
    "entryChokeId": "b_side_entrance",
    "sharedCallouts": [
      "TSpawn",
      "TSideUpper",
      "SideEntrance",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Tunnel",
      "Water",
      "Ruins",
      "TSideLower",
      "TSideUpper",
      "SideEntrance",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 148,
    "roundSupport": 96,
    "demoSupport": 23,
    "teamRoundSupport": 96,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Tunnel",
          "Water",
          "Ruins",
          "TSideLower",
          "TSideUpper",
          "SideEntrance",
          "BombsiteB"
        ],
        "playerRoundSupport": 102,
        "roundSupport": 75,
        "demoSupport": 21,
        "teamRoundSupport": 75
      },
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Middle",
          "TSideUpper",
          "SideEntrance",
          "BombsiteB"
        ],
        "playerRoundSupport": 46,
        "roundSupport": 37,
        "demoSupport": 19,
        "teamRoundSupport": 37
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_alley",
    "target": "b",
    "entryChokeId": "b_alley",
    "sharedCallouts": [
      "TSpawn",
      "Outside",
      "Middle",
      "TopofMid",
      "House",
      "Alley",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Outside",
      "Middle",
      "TopofMid",
      "House",
      "Alley",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 15,
    "roundSupport": 12,
    "demoSupport": 9,
    "teamRoundSupport": 12,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Middle",
          "TopofMid",
          "House",
          "Alley",
          "BombsiteB"
        ],
        "playerRoundSupport": 15,
        "roundSupport": 12,
        "demoSupport": 9,
        "teamRoundSupport": 12
      }
    ],
    "confidence": "observed-complete-path-cluster"
  }
]
```

## de_anubis

样本 ZIP：5；回合：104；observed 有向边：77

### 高频有向边

| from | to | T | CT | T占比 | 涉及回合 |
|---|---|---:|---:|---:|---:|
| PalaceInterior / B连 | Middle / 中路 | 6 | 379 | 1.6% | 103 |
| CTSideUpper / 警家 | PalaceInterior / B连 | 2 | 312 | 0.6% | 103 |
| Alley / 警家 | BombsiteB / B包 | 6 | 290 | 2.0% | 101 |
| TSpawn / 匪家 | Ruins / B外 | 286 | 0 | 100.0% | 98 |
| TSpawn / 匪家 | Street / 街道 | 257 | 1 | 99.6% | 98 |
| Middle / 中路 | Walkway / A连 | 39 | 201 | 16.3% | 96 |
| TStairs / 匪梯 | Canal / 水下 | 214 | 1 | 99.5% | 82 |
| BombsiteB / B包 | Connector / 黑屋 | 32 | 182 | 15.0% | 98 |
| Ruins / B外 | Bridge / 中桥 | 205 | 6 | 97.2% | 79 |
| Connector / 黑屋 | BombsiteB / B包 | 69 | 140 | 33.0% | 91 |
| Ruins / B外 | OutsideLong / B外 | 197 | 6 | 97.0% | 79 |
| Walkway / A连 | BombsiteA / A包 | 37 | 159 | 18.9% | 92 |
| CTSideUpper / 警家 | LowerTunnel / 警家隧道 | 7 | 184 | 3.7% | 102 |
| LowerTunnel / 警家隧道 | Alley / 警家 | 6 | 184 | 3.2% | 101 |
| Middle / 中路 | PalaceInterior / B连 | 33 | 152 | 17.8% | 80 |
| Street / 街道 | TStairs / 匪梯 | 178 | 2 | 98.9% | 85 |
| Canal / 水下 | Main / A厅 | 150 | 29 | 83.8% | 69 |
| OutsideLong / B外 | BombsiteB / B包 | 134 | 21 | 86.5% | 64 |
| Main / A厅 | BombsiteA / A包 | 63 | 84 | 42.9% | 72 |
| BombsiteB / B包 | BackofB / B包台上 | 26 | 110 | 19.1% | 78 |
| BombsiteB / B包 | Bricks / B连阳光房 | 15 | 119 | 11.2% | 75 |
| BombsiteA / A包 | Walkway / A连 | 35 | 92 | 27.6% | 71 |
| PalaceInterior / B连 | Bricks / B连阳光房 | 18 | 108 | 14.3% | 65 |
| Street / 街道 | TSideUpper / 匪跳 | 122 | 1 | 99.2% | 65 |
| Bricks / B连阳光房 | PalaceInterior / B连 | 12 | 111 | 9.8% | 70 |
| Walkway / A连 | Heaven / 天堂 | 20 | 99 | 16.8% | 58 |
| BombsiteA / A包 | Main / A厅 | 18 | 101 | 15.1% | 69 |
| Bricks / B连阳光房 | BombsiteB / B包 | 16 | 101 | 13.7% | 67 |
| Canal / 水下 | Connector / 黑屋 | 71 | 38 | 65.1% | 57 |
| TSideUpper / 匪跳 | Canal / 水下 | 104 | 0 | 100.0% | 59 |
| BackofB / B包台上 | BombsiteB / B包 | 13 | 86 | 13.1% | 63 |
| Bridge / 中桥 | MidDoors / 中门 | 82 | 15 | 84.5% | 47 |
| Bridge / 中桥 | Ruins / B外 | 86 | 8 | 91.5% | 50 |
| Canal / 水下 | TStairs / 匪梯 | 88 | 5 | 94.6% | 42 |
| Middle / 中路 | MidDoors / 中门 | 4 | 86 | 4.4% | 59 |
| BombsiteB / B包 | Alley / 警家 | 8 | 80 | 9.1% | 49 |
| CTSideUpper / 警家 | SnipersNest / 警家狙位 | 4 | 84 | 4.5% | 67 |
| SnipersNest / 警家狙位 | Alley / 警家 | 4 | 79 | 4.8% | 65 |
| Street / 街道 | Bridge / 中桥 | 77 | 4 | 95.1% | 47 |
| MidDoors / 中门 | Middle / 中路 | 40 | 41 | 49.4% | 51 |

### A 包 Route Corridors

| corridor | entryChokeId | 共同骨架 | variants | player-round | round | demo | team-round |
|---|---|---|---:|---:|---:|---:|---:|
| a_main | a_main | TSpawn / 匪家 → Street / 街道 → Canal / 水下 → Main / A厅 → BombsiteA / A包 | 7 | 68 | 33 | 5 | 33 |
| a_walkway | a_walkway | TSpawn / 匪家 → Bridge / 中桥 → Middle / 中路 → Walkway / A连 → BombsiteA / A包 | 4 | 23 | 15 | 5 | 15 |

#### a_main

共同骨架：TSpawn / 匪家 → Street / 街道 → Canal / 水下 → Main / A厅 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Street / 街道 → TSideUpper / 匪跳 → Canal / 水下 → Main / A厅 → BombsiteA / A包 | 33 | 25 | 5 | 25 | 63 | 42.9% |
| 2 | TSpawn / 匪家 → Street / 街道 → TStairs / 匪梯 → Canal / 水下 → Main / A厅 → BombsiteA / A包 | 11 | 10 | 4 | 10 | 63 | 42.9% |
| 3 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → Street / 街道 → TSideUpper / 匪跳 → Canal / 水下 → Main / A厅 → BombsiteA / A包 | 6 | 5 | 3 | 5 | 56 | 42.9% |
| 4 | TSpawn / 匪家 → Street / 街道 → TStairs / 匪梯 → Canal / 水下 → Main / A厅 → Fountain / 喷泉 → BombsiteA / A包 | 6 | 6 | 4 | 6 | 16 | 41.0% |
| 5 | TSpawn / 匪家 → Street / 街道 → TSideUpper / 匪跳 → Canal / 水下 → Main / A厅 → Fountain / 喷泉 → BombsiteA / A包 | 5 | 5 | 3 | 5 | 16 | 41.0% |
| 6 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → Street / 街道 → TStairs / 匪梯 → Canal / 水下 → Main / A厅 → BombsiteA / A包 | 4 | 4 | 2 | 4 | 56 | 42.9% |
| 7 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → Street / 街道 → TStairs / 匪梯 → Canal / 水下 → Main / A厅 → Fountain / 喷泉 → BombsiteA / A包 | 3 | 3 | 3 | 3 | 16 | 41.0% |

#### a_walkway

共同骨架：TSpawn / 匪家 → Bridge / 中桥 → Middle / 中路 → Walkway / A连 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → MidDoors / 中门 → Middle / 中路 → Walkway / A连 → BombsiteA / A包 | 9 | 8 | 3 | 8 | 37 | 16.3% |
| 2 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → Middle / 中路 → Walkway / A连 → BombsiteA / A包 | 8 | 7 | 4 | 7 | 37 | 16.3% |
| 3 | TSpawn / 匪家 → Street / 街道 → Bridge / 中桥 → Middle / 中路 → Walkway / A连 → BombsiteA / A包 | 3 | 3 | 2 | 3 | 37 | 16.3% |
| 4 | TSpawn / 匪家 → Street / 街道 → Bridge / 中桥 → MidDoors / 中门 → Middle / 中路 → Walkway / A连 → BombsiteA / A包 | 3 | 3 | 3 | 3 | 37 | 16.3% |

### B 包 Route Corridors

| corridor | entryChokeId | 共同骨架 | variants | player-round | round | demo | team-round |
|---|---|---|---:|---:|---:|---:|---:|
| b_outside | b_outside | TSpawn / 匪家 → Ruins / B外 → OutsideLong / B外 → BombsiteB / B包 | 2 | 122 | 53 | 5 | 53 |
| b_connector | b_connector | TSpawn / 匪家 → Street / 街道 → Canal / 水下 → Connector / 黑屋 → BombsiteB / B包 | 3 | 48 | 30 | 5 | 30 |
| b_bricks | b_bricks | TSpawn / 匪家 → Bridge / 中桥 → Middle / 中路 → PalaceInterior / B连 → Bricks / B连阳光房 → BombsiteB / B包 | 3 | 11 | 7 | 4 | 7 |

#### b_outside

共同骨架：TSpawn / 匪家 → Ruins / B外 → OutsideLong / B外 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Ruins / B外 → OutsideLong / B外 → BombsiteB / B包 | 113 | 52 | 5 | 52 | 134 | 86.5% |
| 2 | TSpawn / 匪家 → Street / 街道 → Bridge / 中桥 → Ruins / B外 → OutsideLong / B外 → BombsiteB / B包 | 9 | 9 | 5 | 9 | 77 | 86.5% |

#### b_connector

共同骨架：TSpawn / 匪家 → Street / 街道 → Canal / 水下 → Connector / 黑屋 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Street / 街道 → TStairs / 匪梯 → Canal / 水下 → Connector / 黑屋 → BombsiteB / B包 | 31 | 24 | 5 | 24 | 69 | 33.0% |
| 2 | TSpawn / 匪家 → Street / 街道 → TSideUpper / 匪跳 → Canal / 水下 → Connector / 黑屋 → BombsiteB / B包 | 11 | 11 | 4 | 11 | 69 | 33.0% |
| 3 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → Street / 街道 → TStairs / 匪梯 → Canal / 水下 → Connector / 黑屋 → BombsiteB / B包 | 6 | 5 | 5 | 5 | 56 | 33.0% |

#### b_bricks

共同骨架：TSpawn / 匪家 → Bridge / 中桥 → Middle / 中路 → PalaceInterior / B连 → Bricks / B连阳光房 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → Middle / 中路 → PalaceInterior / B连 → Bricks / B连阳光房 → BombsiteB / B包 | 5 | 4 | 2 | 4 | 16 | 13.7% |
| 2 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → MidDoors / 中门 → Middle / 中路 → PalaceInterior / B连 → Bricks / B连阳光房 → BombsiteB / B包 | 3 | 3 | 3 | 3 | 16 | 13.7% |
| 3 | TSpawn / 匪家 → Street / 街道 → Bridge / 中桥 → Middle / 中路 → PalaceInterior / B连 → Bricks / B连阳光房 → BombsiteB / B包 | 3 | 3 | 3 | 3 | 16 | 13.7% |

### Corridor 候选 JSON

```json
[
  {
    "id": "a_main",
    "target": "a",
    "entryChokeId": "a_main",
    "sharedCallouts": [
      "TSpawn",
      "Street",
      "Canal",
      "Main",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Street",
      "TSideUpper",
      "Canal",
      "Main",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 68,
    "roundSupport": 33,
    "demoSupport": 5,
    "teamRoundSupport": 33,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Street",
          "TSideUpper",
          "Canal",
          "Main",
          "BombsiteA"
        ],
        "playerRoundSupport": 33,
        "roundSupport": 25,
        "demoSupport": 5,
        "teamRoundSupport": 25
      },
      {
        "callouts": [
          "TSpawn",
          "Street",
          "TStairs",
          "Canal",
          "Main",
          "BombsiteA"
        ],
        "playerRoundSupport": 11,
        "roundSupport": 10,
        "demoSupport": 4,
        "teamRoundSupport": 10
      },
      {
        "callouts": [
          "TSpawn",
          "Ruins",
          "Bridge",
          "Street",
          "TSideUpper",
          "Canal",
          "Main",
          "BombsiteA"
        ],
        "playerRoundSupport": 6,
        "roundSupport": 5,
        "demoSupport": 3,
        "teamRoundSupport": 5
      },
      {
        "callouts": [
          "TSpawn",
          "Street",
          "TStairs",
          "Canal",
          "Main",
          "Fountain",
          "BombsiteA"
        ],
        "playerRoundSupport": 6,
        "roundSupport": 6,
        "demoSupport": 4,
        "teamRoundSupport": 6
      },
      {
        "callouts": [
          "TSpawn",
          "Street",
          "TSideUpper",
          "Canal",
          "Main",
          "Fountain",
          "BombsiteA"
        ],
        "playerRoundSupport": 5,
        "roundSupport": 5,
        "demoSupport": 3,
        "teamRoundSupport": 5
      },
      {
        "callouts": [
          "TSpawn",
          "Ruins",
          "Bridge",
          "Street",
          "TStairs",
          "Canal",
          "Main",
          "BombsiteA"
        ],
        "playerRoundSupport": 4,
        "roundSupport": 4,
        "demoSupport": 2,
        "teamRoundSupport": 4
      },
      {
        "callouts": [
          "TSpawn",
          "Ruins",
          "Bridge",
          "Street",
          "TStairs",
          "Canal",
          "Main",
          "Fountain",
          "BombsiteA"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 3,
        "teamRoundSupport": 3
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_walkway",
    "target": "a",
    "entryChokeId": "a_walkway",
    "sharedCallouts": [
      "TSpawn",
      "Bridge",
      "Middle",
      "Walkway",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Ruins",
      "Bridge",
      "MidDoors",
      "Middle",
      "Walkway",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 23,
    "roundSupport": 15,
    "demoSupport": 5,
    "teamRoundSupport": 15,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Ruins",
          "Bridge",
          "MidDoors",
          "Middle",
          "Walkway",
          "BombsiteA"
        ],
        "playerRoundSupport": 9,
        "roundSupport": 8,
        "demoSupport": 3,
        "teamRoundSupport": 8
      },
      {
        "callouts": [
          "TSpawn",
          "Ruins",
          "Bridge",
          "Middle",
          "Walkway",
          "BombsiteA"
        ],
        "playerRoundSupport": 8,
        "roundSupport": 7,
        "demoSupport": 4,
        "teamRoundSupport": 7
      },
      {
        "callouts": [
          "TSpawn",
          "Street",
          "Bridge",
          "Middle",
          "Walkway",
          "BombsiteA"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 2,
        "teamRoundSupport": 3
      },
      {
        "callouts": [
          "TSpawn",
          "Street",
          "Bridge",
          "MidDoors",
          "Middle",
          "Walkway",
          "BombsiteA"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 3,
        "teamRoundSupport": 3
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_outside",
    "target": "b",
    "entryChokeId": "b_outside",
    "sharedCallouts": [
      "TSpawn",
      "Ruins",
      "OutsideLong",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Ruins",
      "OutsideLong",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 122,
    "roundSupport": 53,
    "demoSupport": 5,
    "teamRoundSupport": 53,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Ruins",
          "OutsideLong",
          "BombsiteB"
        ],
        "playerRoundSupport": 113,
        "roundSupport": 52,
        "demoSupport": 5,
        "teamRoundSupport": 52
      },
      {
        "callouts": [
          "TSpawn",
          "Street",
          "Bridge",
          "Ruins",
          "OutsideLong",
          "BombsiteB"
        ],
        "playerRoundSupport": 9,
        "roundSupport": 9,
        "demoSupport": 5,
        "teamRoundSupport": 9
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_connector",
    "target": "b",
    "entryChokeId": "b_connector",
    "sharedCallouts": [
      "TSpawn",
      "Street",
      "Canal",
      "Connector",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Street",
      "TStairs",
      "Canal",
      "Connector",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 48,
    "roundSupport": 30,
    "demoSupport": 5,
    "teamRoundSupport": 30,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Street",
          "TStairs",
          "Canal",
          "Connector",
          "BombsiteB"
        ],
        "playerRoundSupport": 31,
        "roundSupport": 24,
        "demoSupport": 5,
        "teamRoundSupport": 24
      },
      {
        "callouts": [
          "TSpawn",
          "Street",
          "TSideUpper",
          "Canal",
          "Connector",
          "BombsiteB"
        ],
        "playerRoundSupport": 11,
        "roundSupport": 11,
        "demoSupport": 4,
        "teamRoundSupport": 11
      },
      {
        "callouts": [
          "TSpawn",
          "Ruins",
          "Bridge",
          "Street",
          "TStairs",
          "Canal",
          "Connector",
          "BombsiteB"
        ],
        "playerRoundSupport": 6,
        "roundSupport": 5,
        "demoSupport": 5,
        "teamRoundSupport": 5
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_bricks",
    "target": "b",
    "entryChokeId": "b_bricks",
    "sharedCallouts": [
      "TSpawn",
      "Bridge",
      "Middle",
      "PalaceInterior",
      "Bricks",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Ruins",
      "Bridge",
      "Middle",
      "PalaceInterior",
      "Bricks",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 11,
    "roundSupport": 7,
    "demoSupport": 4,
    "teamRoundSupport": 7,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Ruins",
          "Bridge",
          "Middle",
          "PalaceInterior",
          "Bricks",
          "BombsiteB"
        ],
        "playerRoundSupport": 5,
        "roundSupport": 4,
        "demoSupport": 2,
        "teamRoundSupport": 4
      },
      {
        "callouts": [
          "TSpawn",
          "Ruins",
          "Bridge",
          "MidDoors",
          "Middle",
          "PalaceInterior",
          "Bricks",
          "BombsiteB"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 3,
        "teamRoundSupport": 3
      },
      {
        "callouts": [
          "TSpawn",
          "Street",
          "Bridge",
          "Middle",
          "PalaceInterior",
          "Bricks",
          "BombsiteB"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 3,
        "teamRoundSupport": 3
      }
    ],
    "confidence": "observed-complete-path-cluster"
  }
]
```

## de_dust2

样本 ZIP：26；回合：539；observed 有向边：74

### 高频有向边

| from | to | T | CT | T占比 | 涉及回合 |
|---|---|---:|---:|---:|---:|
| CTSpawn / 警家 | UnderA / 警家 | 24 | 2108 | 1.1% | 533 |
| CTSpawn / 警家 | MidDoors / 中门 | 33 | 2028 | 1.6% | 538 |
| UnderA / 警家 | LongA / A大 | 39 | 1869 | 2.0% | 504 |
| MidDoors / 中门 | BDoors / B门 | 162 | 1436 | 10.1% | 525 |
| TSpawn / 匪家 | TopofMid / 中远匪口 | 1430 | 17 | 98.8% | 500 |
| TopofMid / 中远匪口 | OutsideLong / A门外 | 1341 | 98 | 93.2% | 467 |
| Catwalk / A小 | ShortStairs / A小楼梯 | 885 | 377 | 70.1% | 372 |
| ShortStairs / A小楼梯 | ExtendedA / A小过点 | 708 | 516 | 57.8% | 371 |
| UnderA / 警家 | ExtendedA / A小过点 | 47 | 1175 | 3.8% | 375 |
| OutsideTunnel / B洞外 | UpperTunnel / B洞 | 1154 | 6 | 99.5% | 421 |
| OutsideLong / A门外 | LongDoors / A门 | 1048 | 67 | 94.0% | 333 |
| TSpawn / 匪家 | OutsideTunnel / B洞外 | 1100 | 3 | 99.7% | 421 |
| LongA / A大 | UnderA / 警家 | 36 | 1061 | 3.3% | 419 |
| OutsideLong / A门外 | TopofMid / 中远匪口 | 943 | 106 | 89.9% | 403 |
| LongA / A大 | ARamp / A斜坡 | 318 | 703 | 31.1% | 384 |
| TunnelStairs / B洞楼梯 | LowerTunnel / B1 | 902 | 101 | 89.9% | 391 |
| ExtendedA / A小过点 | UnderA / 警家 | 96 | 783 | 10.9% | 278 |
| UpperTunnel / B洞 | TunnelStairs / B洞楼梯 | 794 | 73 | 91.6% | 387 |
| ExtendedA / A小过点 | ShortStairs / A小楼梯 | 240 | 625 | 27.7% | 370 |
| UnderA / 警家 | CTSpawn / 警家 | 33 | 808 | 3.9% | 406 |
| MidDoors / 中门 | CTSpawn / 警家 | 76 | 760 | 9.1% | 388 |
| Middle / 中路 | Catwalk / A小 | 647 | 186 | 77.7% | 344 |
| LowerTunnel / B1 | Middle / 中路 | 714 | 112 | 86.4% | 361 |
| LongDoors / A门 | LongA / A大 | 559 | 254 | 68.8% | 330 |
| BDoors / B门 | BombsiteB / B包 | 50 | 762 | 6.2% | 464 |
| ARamp / A斜坡 | BombsiteA / A包 | 311 | 457 | 40.5% | 324 |
| BDoors / B门 | MidDoors / 中门 | 68 | 690 | 9.0% | 398 |
| ShortStairs / A小楼梯 | Catwalk / A小 | 343 | 406 | 45.8% | 331 |
| Middle / 中路 | MidDoors / 中门 | 569 | 179 | 76.1% | 300 |
| Hole / 狗洞 | BombsiteB / B包 | 130 | 584 | 18.2% | 343 |
| MidDoors / 中门 | Middle / 中路 | 229 | 473 | 32.6% | 333 |
| LowerTunnel / B1 | TunnelStairs / B洞楼梯 | 520 | 179 | 74.4% | 323 |
| UpperTunnel / B洞 | BombsiteB / B包 | 567 | 95 | 85.6% | 238 |
| ExtendedA / A小过点 | BombsiteA / A包 | 308 | 349 | 46.9% | 293 |
| Middle / 中路 | LowerTunnel / B1 | 395 | 231 | 63.1% | 302 |
| BDoors / B门 | Hole / 狗洞 | 82 | 540 | 13.2% | 359 |
| TopofMid / 中远匪口 | Middle / 中路 | 546 | 50 | 91.6% | 302 |
| LongA / A大 | LongDoors / A门 | 177 | 411 | 30.1% | 344 |
| ARamp / A斜坡 | LongA / A大 | 156 | 423 | 26.9% | 285 |
| BombsiteA / A包 | ARamp / A斜坡 | 250 | 287 | 46.6% | 251 |

### A 包 Route Corridors

| corridor | entryChokeId | 共同骨架 | variants | player-round | round | demo | team-round |
|---|---|---|---:|---:|---:|---:|---:|
| a_short | a_short | TSpawn / 匪家 → Catwalk / A小 → ShortStairs / A小楼梯 → ExtendedA / A小过点 → BombsiteA / A包 | 5 | 242 | 119 | 26 | 119 |
| a_long | a_long | TSpawn / 匪家 → OutsideLong / A门外 → LongDoors / A门 → LongA / A大 → ARamp / A斜坡 → BombsiteA / A包 | 4 | 171 | 90 | 25 | 90 |

#### a_short

共同骨架：TSpawn / 匪家 → Catwalk / A小 → ShortStairs / A小楼梯 → ExtendedA / A小过点 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → OutsideTunnel / B洞外 → UpperTunnel / B洞 → TunnelStairs / B洞楼梯 → LowerTunnel / B1 → Middle / 中路 → Catwalk / A小 → ShortStairs / A小楼梯 → ExtendedA / A小过点 → BombsiteA / A包 | 80 | 61 | 23 | 61 | 308 | 46.9% |
| 2 | TSpawn / 匪家 → TopofMid / 中远匪口 → Catwalk / A小 → ShortStairs / A小楼梯 → ExtendedA / A小过点 → BombsiteA / A包 | 78 | 62 | 26 | 62 | 308 | 46.9% |
| 3 | TSpawn / 匪家 → TopofMid / 中远匪口 → Middle / 中路 → Catwalk / A小 → ShortStairs / A小楼梯 → ExtendedA / A小过点 → BombsiteA / A包 | 53 | 48 | 22 | 48 | 308 | 46.9% |
| 4 | TSpawn / 匪家 → OutsideLong / A门外 → TopofMid / 中远匪口 → Catwalk / A小 → ShortStairs / A小楼梯 → ExtendedA / A小过点 → BombsiteA / A包 | 20 | 18 | 14 | 18 | 308 | 46.9% |
| 5 | TSpawn / 匪家 → OutsideLong / A门外 → TopofMid / 中远匪口 → Middle / 中路 → Catwalk / A小 → ShortStairs / A小楼梯 → ExtendedA / A小过点 → BombsiteA / A包 | 11 | 10 | 9 | 10 | 308 | 46.9% |

#### a_long

共同骨架：TSpawn / 匪家 → OutsideLong / A门外 → LongDoors / A门 → LongA / A大 → ARamp / A斜坡 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → TopofMid / 中远匪口 → OutsideLong / A门外 → LongDoors / A门 → LongA / A大 → ARamp / A斜坡 → BombsiteA / A包 | 104 | 68 | 25 | 68 | 311 | 31.1% |
| 2 | TSpawn / 匪家 → OutsideLong / A门外 → LongDoors / A门 → LongA / A大 → ARamp / A斜坡 → BombsiteA / A包 | 56 | 46 | 23 | 46 | 311 | 31.1% |
| 3 | TSpawn / 匪家 → TopofMid / 中远匪口 → OutsideLong / A门外 → LongDoors / A门 → Pit / 大坑 → LongA / A大 → ARamp / A斜坡 → BombsiteA / A包 | 6 | 6 | 6 | 6 | 88 | 31.1% |
| 4 | TSpawn / 匪家 → OutsideLong / A门外 → LongDoors / A门 → Pit / 大坑 → LongA / A大 → ARamp / A斜坡 → BombsiteA / A包 | 5 | 5 | 3 | 5 | 88 | 31.1% |

### B 包 Route Corridors

| corridor | entryChokeId | 共同骨架 | variants | player-round | round | demo | team-round |
|---|---|---|---:|---:|---:|---:|---:|
| b_upper_tunnel | b_upper_tunnel | TSpawn / 匪家 → UpperTunnel / B洞 → BombsiteB / B包 | 6 | 523 | 201 | 26 | 201 |
| b_mid_doors | b_mid_doors | TSpawn / 匪家 → Middle / 中路 → MidDoors / 中门 → BDoors / B门 → BombsiteB / B包 | 8 | 88 | 58 | 22 | 58 |

#### b_upper_tunnel

共同骨架：TSpawn / 匪家 → UpperTunnel / B洞 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → OutsideTunnel / B洞外 → UpperTunnel / B洞 → BombsiteB / B包 | 438 | 181 | 26 | 181 | 567 | 85.6% |
| 2 | TSpawn / 匪家 → TopofMid / 中远匪口 → Middle / 中路 → LowerTunnel / B1 → TunnelStairs / B洞楼梯 → UpperTunnel / B洞 → BombsiteB / B包 | 44 | 38 | 19 | 38 | 395 | 63.1% |
| 3 | TSpawn / 匪家 → TRamp / 后花 → OutsideTunnel / B洞外 → UpperTunnel / B洞 → BombsiteB / B包 | 14 | 14 | 12 | 14 | 30 | 75.0% |
| 4 | TSpawn / 匪家 → TopofMid / 中远匪口 → Catwalk / A小 → Middle / 中路 → LowerTunnel / B1 → TunnelStairs / B洞楼梯 → UpperTunnel / B洞 → BombsiteB / B包 | 13 | 12 | 10 | 12 | 278 | 63.1% |
| 5 | TSpawn / 匪家 → OutsideLong / A门外 → TopofMid / 中远匪口 → Middle / 中路 → LowerTunnel / B1 → TunnelStairs / B洞楼梯 → UpperTunnel / B洞 → BombsiteB / B包 | 10 | 9 | 8 | 9 | 395 | 63.1% |
| 6 | TSpawn / 匪家 → OutsideLong / A门外 → TopofMid / 中远匪口 → Catwalk / A小 → Middle / 中路 → LowerTunnel / B1 → TunnelStairs / B洞楼梯 → UpperTunnel / B洞 → BombsiteB / B包 | 4 | 4 | 4 | 4 | 278 | 63.1% |

#### b_mid_doors

共同骨架：TSpawn / 匪家 → Middle / 中路 → MidDoors / 中门 → BDoors / B门 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → OutsideTunnel / B洞外 → UpperTunnel / B洞 → TunnelStairs / B洞楼梯 → LowerTunnel / B1 → Middle / 中路 → MidDoors / 中门 → BDoors / B门 → Hole / 狗洞 → BombsiteB / B包 | 22 | 20 | 14 | 20 | 82 | 10.1% |
| 2 | TSpawn / 匪家 → TopofMid / 中远匪口 → Middle / 中路 → MidDoors / 中门 → BDoors / B门 → Hole / 狗洞 → BombsiteB / B包 | 21 | 19 | 13 | 19 | 82 | 10.1% |
| 3 | TSpawn / 匪家 → OutsideTunnel / B洞外 → UpperTunnel / B洞 → TunnelStairs / B洞楼梯 → LowerTunnel / B1 → Middle / 中路 → MidDoors / 中门 → BDoors / B门 → BombsiteB / B包 | 17 | 13 | 10 | 13 | 50 | 6.2% |
| 4 | TSpawn / 匪家 → TopofMid / 中远匪口 → Middle / 中路 → MidDoors / 中门 → BDoors / B门 → BombsiteB / B包 | 13 | 12 | 8 | 12 | 50 | 6.2% |
| 5 | TSpawn / 匪家 → TopofMid / 中远匪口 → Catwalk / A小 → Middle / 中路 → MidDoors / 中门 → BDoors / B门 → BombsiteB / B包 | 5 | 5 | 5 | 5 | 50 | 6.2% |
| 6 | TSpawn / 匪家 → OutsideLong / A门外 → TopofMid / 中远匪口 → Middle / 中路 → MidDoors / 中门 → BDoors / B门 → BombsiteB / B包 | 4 | 4 | 4 | 4 | 50 | 6.2% |
| 7 | TSpawn / 匪家 → TopofMid / 中远匪口 → Catwalk / A小 → Middle / 中路 → MidDoors / 中门 → BDoors / B门 → Hole / 狗洞 → BombsiteB / B包 | 3 | 3 | 3 | 3 | 82 | 10.1% |
| 8 | TSpawn / 匪家 → OutsideLong / A门外 → TopofMid / 中远匪口 → Catwalk / A小 → Middle / 中路 → MidDoors / 中门 → BDoors / B门 → BombsiteB / B包 | 3 | 3 | 3 | 3 | 50 | 6.2% |

### Corridor 候选 JSON

```json
[
  {
    "id": "a_short",
    "target": "a",
    "entryChokeId": "a_short",
    "sharedCallouts": [
      "TSpawn",
      "Catwalk",
      "ShortStairs",
      "ExtendedA",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "OutsideTunnel",
      "UpperTunnel",
      "TunnelStairs",
      "LowerTunnel",
      "Middle",
      "Catwalk",
      "ShortStairs",
      "ExtendedA",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 242,
    "roundSupport": 119,
    "demoSupport": 26,
    "teamRoundSupport": 119,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "OutsideTunnel",
          "UpperTunnel",
          "TunnelStairs",
          "LowerTunnel",
          "Middle",
          "Catwalk",
          "ShortStairs",
          "ExtendedA",
          "BombsiteA"
        ],
        "playerRoundSupport": 80,
        "roundSupport": 61,
        "demoSupport": 23,
        "teamRoundSupport": 61
      },
      {
        "callouts": [
          "TSpawn",
          "TopofMid",
          "Catwalk",
          "ShortStairs",
          "ExtendedA",
          "BombsiteA"
        ],
        "playerRoundSupport": 78,
        "roundSupport": 62,
        "demoSupport": 26,
        "teamRoundSupport": 62
      },
      {
        "callouts": [
          "TSpawn",
          "TopofMid",
          "Middle",
          "Catwalk",
          "ShortStairs",
          "ExtendedA",
          "BombsiteA"
        ],
        "playerRoundSupport": 53,
        "roundSupport": 48,
        "demoSupport": 22,
        "teamRoundSupport": 48
      },
      {
        "callouts": [
          "TSpawn",
          "OutsideLong",
          "TopofMid",
          "Catwalk",
          "ShortStairs",
          "ExtendedA",
          "BombsiteA"
        ],
        "playerRoundSupport": 20,
        "roundSupport": 18,
        "demoSupport": 14,
        "teamRoundSupport": 18
      },
      {
        "callouts": [
          "TSpawn",
          "OutsideLong",
          "TopofMid",
          "Middle",
          "Catwalk",
          "ShortStairs",
          "ExtendedA",
          "BombsiteA"
        ],
        "playerRoundSupport": 11,
        "roundSupport": 10,
        "demoSupport": 9,
        "teamRoundSupport": 10
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_long",
    "target": "a",
    "entryChokeId": "a_long",
    "sharedCallouts": [
      "TSpawn",
      "OutsideLong",
      "LongDoors",
      "LongA",
      "ARamp",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "TopofMid",
      "OutsideLong",
      "LongDoors",
      "LongA",
      "ARamp",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 171,
    "roundSupport": 90,
    "demoSupport": 25,
    "teamRoundSupport": 90,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "TopofMid",
          "OutsideLong",
          "LongDoors",
          "LongA",
          "ARamp",
          "BombsiteA"
        ],
        "playerRoundSupport": 104,
        "roundSupport": 68,
        "demoSupport": 25,
        "teamRoundSupport": 68
      },
      {
        "callouts": [
          "TSpawn",
          "OutsideLong",
          "LongDoors",
          "LongA",
          "ARamp",
          "BombsiteA"
        ],
        "playerRoundSupport": 56,
        "roundSupport": 46,
        "demoSupport": 23,
        "teamRoundSupport": 46
      },
      {
        "callouts": [
          "TSpawn",
          "TopofMid",
          "OutsideLong",
          "LongDoors",
          "Pit",
          "LongA",
          "ARamp",
          "BombsiteA"
        ],
        "playerRoundSupport": 6,
        "roundSupport": 6,
        "demoSupport": 6,
        "teamRoundSupport": 6
      },
      {
        "callouts": [
          "TSpawn",
          "OutsideLong",
          "LongDoors",
          "Pit",
          "LongA",
          "ARamp",
          "BombsiteA"
        ],
        "playerRoundSupport": 5,
        "roundSupport": 5,
        "demoSupport": 3,
        "teamRoundSupport": 5
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_upper_tunnel",
    "target": "b",
    "entryChokeId": "b_upper_tunnel",
    "sharedCallouts": [
      "TSpawn",
      "UpperTunnel",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "OutsideTunnel",
      "UpperTunnel",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 523,
    "roundSupport": 201,
    "demoSupport": 26,
    "teamRoundSupport": 201,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "OutsideTunnel",
          "UpperTunnel",
          "BombsiteB"
        ],
        "playerRoundSupport": 438,
        "roundSupport": 181,
        "demoSupport": 26,
        "teamRoundSupport": 181
      },
      {
        "callouts": [
          "TSpawn",
          "TopofMid",
          "Middle",
          "LowerTunnel",
          "TunnelStairs",
          "UpperTunnel",
          "BombsiteB"
        ],
        "playerRoundSupport": 44,
        "roundSupport": 38,
        "demoSupport": 19,
        "teamRoundSupport": 38
      },
      {
        "callouts": [
          "TSpawn",
          "TRamp",
          "OutsideTunnel",
          "UpperTunnel",
          "BombsiteB"
        ],
        "playerRoundSupport": 14,
        "roundSupport": 14,
        "demoSupport": 12,
        "teamRoundSupport": 14
      },
      {
        "callouts": [
          "TSpawn",
          "TopofMid",
          "Catwalk",
          "Middle",
          "LowerTunnel",
          "TunnelStairs",
          "UpperTunnel",
          "BombsiteB"
        ],
        "playerRoundSupport": 13,
        "roundSupport": 12,
        "demoSupport": 10,
        "teamRoundSupport": 12
      },
      {
        "callouts": [
          "TSpawn",
          "OutsideLong",
          "TopofMid",
          "Middle",
          "LowerTunnel",
          "TunnelStairs",
          "UpperTunnel",
          "BombsiteB"
        ],
        "playerRoundSupport": 10,
        "roundSupport": 9,
        "demoSupport": 8,
        "teamRoundSupport": 9
      },
      {
        "callouts": [
          "TSpawn",
          "OutsideLong",
          "TopofMid",
          "Catwalk",
          "Middle",
          "LowerTunnel",
          "TunnelStairs",
          "UpperTunnel",
          "BombsiteB"
        ],
        "playerRoundSupport": 4,
        "roundSupport": 4,
        "demoSupport": 4,
        "teamRoundSupport": 4
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_mid_doors",
    "target": "b",
    "entryChokeId": "b_mid_doors",
    "sharedCallouts": [
      "TSpawn",
      "Middle",
      "MidDoors",
      "BDoors",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "OutsideTunnel",
      "UpperTunnel",
      "TunnelStairs",
      "LowerTunnel",
      "Middle",
      "MidDoors",
      "BDoors",
      "Hole",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 88,
    "roundSupport": 58,
    "demoSupport": 22,
    "teamRoundSupport": 58,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "OutsideTunnel",
          "UpperTunnel",
          "TunnelStairs",
          "LowerTunnel",
          "Middle",
          "MidDoors",
          "BDoors",
          "Hole",
          "BombsiteB"
        ],
        "playerRoundSupport": 22,
        "roundSupport": 20,
        "demoSupport": 14,
        "teamRoundSupport": 20
      },
      {
        "callouts": [
          "TSpawn",
          "TopofMid",
          "Middle",
          "MidDoors",
          "BDoors",
          "Hole",
          "BombsiteB"
        ],
        "playerRoundSupport": 21,
        "roundSupport": 19,
        "demoSupport": 13,
        "teamRoundSupport": 19
      },
      {
        "callouts": [
          "TSpawn",
          "OutsideTunnel",
          "UpperTunnel",
          "TunnelStairs",
          "LowerTunnel",
          "Middle",
          "MidDoors",
          "BDoors",
          "BombsiteB"
        ],
        "playerRoundSupport": 17,
        "roundSupport": 13,
        "demoSupport": 10,
        "teamRoundSupport": 13
      },
      {
        "callouts": [
          "TSpawn",
          "TopofMid",
          "Middle",
          "MidDoors",
          "BDoors",
          "BombsiteB"
        ],
        "playerRoundSupport": 13,
        "roundSupport": 12,
        "demoSupport": 8,
        "teamRoundSupport": 12
      },
      {
        "callouts": [
          "TSpawn",
          "TopofMid",
          "Catwalk",
          "Middle",
          "MidDoors",
          "BDoors",
          "BombsiteB"
        ],
        "playerRoundSupport": 5,
        "roundSupport": 5,
        "demoSupport": 5,
        "teamRoundSupport": 5
      },
      {
        "callouts": [
          "TSpawn",
          "OutsideLong",
          "TopofMid",
          "Middle",
          "MidDoors",
          "BDoors",
          "BombsiteB"
        ],
        "playerRoundSupport": 4,
        "roundSupport": 4,
        "demoSupport": 4,
        "teamRoundSupport": 4
      },
      {
        "callouts": [
          "TSpawn",
          "TopofMid",
          "Catwalk",
          "Middle",
          "MidDoors",
          "BDoors",
          "Hole",
          "BombsiteB"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 3,
        "teamRoundSupport": 3
      },
      {
        "callouts": [
          "TSpawn",
          "OutsideLong",
          "TopofMid",
          "Catwalk",
          "Middle",
          "MidDoors",
          "BDoors",
          "BombsiteB"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 3,
        "teamRoundSupport": 3
      }
    ],
    "confidence": "observed-complete-path-cluster"
  }
]
```

## de_inferno

样本 ZIP：16；回合：346；observed 有向边：81

### 高频有向边

| from | to | T | CT | T占比 | 涉及回合 |
|---|---|---:|---:|---:|---:|
| TSpawn / 匪家 | LowerMid / 匪口 | 1761 | 0 | 100.0% | 346 |
| TRamp / 匪口 | Middle / 中路 | 1500 | 15 | 99.0% | 341 |
| Ruins / 警家教堂 | BombsiteB / B包 | 40 | 1390 | 2.8% | 344 |
| LowerMid / 匪口 | TRamp / 匪口 | 1377 | 4 | 99.7% | 343 |
| Middle / 中路 | Banana / 香蕉道 | 1214 | 79 | 93.9% | 298 |
| CTSpawn / 警家 | Ruins / 警家教堂 | 21 | 1228 | 1.7% | 344 |
| Banana / 香蕉道 | BombsiteB / B包 | 529 | 553 | 48.9% | 306 |
| BombsiteB / B包 | Banana / 香蕉道 | 141 | 801 | 15.0% | 325 |
| BombsiteB / B包 | Ruins / 警家教堂 | 96 | 758 | 11.2% | 303 |
| CTSpawn / 警家 | Library / 书房 | 12 | 773 | 1.5% | 327 |
| Library / 书房 | BombsiteA / A包 | 11 | 723 | 1.5% | 326 |
| Banana / 香蕉道 | Middle / 中路 | 570 | 110 | 83.8% | 261 |
| Middle / 中路 | TopofMid / 中路 | 601 | 73 | 89.2% | 230 |
| Arch / 拱门 | TopofMid / 中路 | 21 | 626 | 3.2% | 285 |
| TopofMid / 中路 | Arch / 拱门 | 187 | 434 | 30.1% | 270 |
| CTSpawn / 警家 | Arch / 拱门 | 6 | 580 | 1.0% | 307 |
| LowerMid / 匪口 | SecondMid / 侧道 | 543 | 1 | 99.8% | 305 |
| Ruins / 警家教堂 | CTSpawn / 警家 | 41 | 501 | 7.6% | 269 |
| Balcony / 阳台 | Apartments / 二楼 | 243 | 255 | 48.8% | 254 |
| Middle / 中路 | TRamp / 匪口 | 445 | 38 | 92.1% | 236 |
| Apartments / 二楼 | Balcony / 阳台 | 231 | 206 | 52.9% | 222 |
| TopofMid / 中路 | BombsiteA / A包 | 217 | 212 | 50.6% | 221 |
| Arch / 拱门 | BombsiteA / A包 | 106 | 297 | 26.3% | 205 |
| SecondMid / 侧道 | Middle / 中路 | 370 | 23 | 94.1% | 228 |
| BackAlley / 匪二楼 | Apartments / 二楼 | 311 | 22 | 93.4% | 201 |
| BombsiteA / A包 | Balcony / 阳台 | 33 | 266 | 11.0% | 228 |
| BombsiteA / A包 | TopofMid / 中路 | 53 | 243 | 17.9% | 200 |
| Arch / 拱门 | CTSpawn / 警家 | 42 | 254 | 14.2% | 189 |
| TopofMid / 中路 | Middle / 中路 | 123 | 162 | 43.2% | 148 |
| Apartments / 二楼 | TopofMid / 中路 | 131 | 143 | 47.8% | 197 |
| BombsiteA / A包 | Pit / 大坑 | 64 | 209 | 23.4% | 181 |
| TRamp / 匪口 | LowerMid / 匪口 | 247 | 18 | 93.2% | 163 |
| BombsiteA / A包 | Arch / 拱门 | 20 | 231 | 8.0% | 171 |
| Middle / 中路 | SecondMid / 侧道 | 215 | 35 | 86.0% | 146 |
| Pit / 大坑 | BombsiteA / A包 | 57 | 182 | 23.8% | 159 |
| TopofMid / 中路 | Apartments / 二楼 | 62 | 171 | 26.6% | 174 |
| Underpass / 下水道 | Middle / 中路 | 212 | 4 | 98.1% | 142 |
| BombsiteA / A包 | Library / 书房 | 28 | 180 | 13.5% | 152 |
| SecondMid / 侧道 | BackAlley / 匪二楼 | 194 | 7 | 96.5% | 149 |
| Apartments / 二楼 | BackAlley / 匪二楼 | 174 | 25 | 87.4% | 126 |

### A 包 Route Corridors

| corridor | entryChokeId | 共同骨架 | variants | player-round | round | demo | team-round |
|---|---|---|---:|---:|---:|---:|---:|
| a_mid | a_mid | TSpawn / 匪家 → LowerMid / 匪口 → TopofMid / 中路 → BombsiteA / A包 | 6 | 196 | 113 | 16 | 113 |
| a_arch | a_arch | TSpawn / 匪家 → LowerMid / 匪口 → Middle / 中路 → TopofMid / 中路 → Arch / 拱门 → BombsiteA / A包 | 3 | 86 | 50 | 15 | 50 |
| a_quad | a_quad | TSpawn / 匪家 → LowerMid / 匪口 → TopofMid / 中路 → Quad / 马棚 → BombsiteA / A包 | 4 | 69 | 57 | 14 | 57 |
| a_balcony | a_balcony | TSpawn / 匪家 → LowerMid / 匪口 → Apartments / 二楼 → Balcony / 阳台 → BombsiteA / A包 | 2 | 17 | 16 | 9 | 16 |
| a_pit | a_pit | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Apartments / 二楼 → Balcony / 阳台 → Pit / 大坑 → BombsiteA / A包 | 2 | 13 | 12 | 9 | 12 |

#### a_mid

共同骨架：TSpawn / 匪家 → LowerMid / 匪口 → TopofMid / 中路 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → TopofMid / 中路 → BombsiteA / A包 | 143 | 99 | 16 | 99 | 217 | 50.6% |
| 2 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Middle / 中路 → TopofMid / 中路 → BombsiteA / A包 | 23 | 22 | 12 | 22 | 217 | 50.6% |
| 3 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Balcony / 阳台 → Apartments / 二楼 → TopofMid / 中路 → BombsiteA / A包 | 19 | 18 | 10 | 18 | 131 | 47.8% |
| 4 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → SecondMid / 侧道 → Balcony / 阳台 → Apartments / 二楼 → TopofMid / 中路 → BombsiteA / A包 | 4 | 4 | 4 | 4 | 131 | 47.8% |
| 5 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → BackAlley / 匪二楼 → Apartments / 二楼 → TopofMid / 中路 → BombsiteA / A包 | 4 | 4 | 4 | 4 | 131 | 47.8% |
| 6 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Apartments / 二楼 → TopofMid / 中路 → BombsiteA / A包 | 3 | 3 | 3 | 3 | 87 | 47.8% |

#### a_arch

共同骨架：TSpawn / 匪家 → LowerMid / 匪口 → Middle / 中路 → TopofMid / 中路 → Arch / 拱门 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → TopofMid / 中路 → Arch / 拱门 → BombsiteA / A包 | 57 | 40 | 15 | 40 | 106 | 26.3% |
| 2 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Middle / 中路 → TopofMid / 中路 → Arch / 拱门 → BombsiteA / A包 | 26 | 16 | 11 | 16 | 106 | 26.3% |
| 3 | TSpawn / 匪家 → LowerMid / 匪口 → Upstairs / 匪二楼 → Bridge / 匪桥 → SecondMid / 侧道 → Middle / 中路 → TopofMid / 中路 → Arch / 拱门 → BombsiteA / A包 | 3 | 3 | 3 | 3 | 26 | 26.3% |

#### a_quad

共同骨架：TSpawn / 匪家 → LowerMid / 匪口 → TopofMid / 中路 → Quad / 马棚 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → TopofMid / 中路 → Quad / 马棚 → BombsiteA / A包 | 46 | 39 | 13 | 39 | 94 | 50.3% |
| 2 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Middle / 中路 → TopofMid / 中路 → Quad / 马棚 → BombsiteA / A包 | 12 | 12 | 8 | 12 | 94 | 50.3% |
| 3 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Balcony / 阳台 → Apartments / 二楼 → TopofMid / 中路 → Quad / 马棚 → BombsiteA / A包 | 7 | 7 | 6 | 7 | 94 | 47.8% |
| 4 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → BackAlley / 匪二楼 → Apartments / 二楼 → TopofMid / 中路 → Quad / 马棚 → BombsiteA / A包 | 4 | 4 | 4 | 4 | 94 | 47.8% |

#### a_balcony

共同骨架：TSpawn / 匪家 → LowerMid / 匪口 → Apartments / 二楼 → Balcony / 阳台 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → BackAlley / 匪二楼 → Apartments / 二楼 → Balcony / 阳台 → BombsiteA / A包 | 14 | 13 | 7 | 13 | 29 | 24.4% |
| 2 | TSpawn / 匪家 → LowerMid / 匪口 → Upstairs / 匪二楼 → Bridge / 匪桥 → Apartments / 二楼 → Balcony / 阳台 → BombsiteA / A包 | 3 | 3 | 3 | 3 | 29 | 24.4% |

#### a_pit

共同骨架：TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Apartments / 二楼 → Balcony / 阳台 → Pit / 大坑 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → BackAlley / 匪二楼 → Apartments / 二楼 → Balcony / 阳台 → Pit / 大坑 → BombsiteA / A包 | 10 | 9 | 7 | 9 | 43 | 23.8% |
| 2 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Apartments / 二楼 → Balcony / 阳台 → Pit / 大坑 → BombsiteA / A包 | 3 | 3 | 3 | 3 | 43 | 23.8% |

### B 包 Route Corridors

| corridor | entryChokeId | 共同骨架 | variants | player-round | round | demo | team-round |
|---|---|---|---:|---:|---:|---:|---:|
| b_banana | b_banana | TSpawn / 匪家 → LowerMid / 匪口 → Banana / 香蕉道 → BombsiteB / B包 | 6 | 488 | 154 | 16 | 154 |
| b_ruins | b_ruins | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → TopofMid / 中路 → Arch / 拱门 → CTSpawn / 警家 → Ruins / 警家教堂 → BombsiteB / B包 | 1 | 6 | 6 | 4 | 6 |

#### b_banana

共同骨架：TSpawn / 匪家 → LowerMid / 匪口 → Banana / 香蕉道 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 409 | 153 | 16 | 153 | 529 | 48.9% |
| 2 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 34 | 30 | 14 | 30 | 370 | 48.9% |
| 3 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Underpass / 下水道 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 25 | 25 | 13 | 25 | 77 | 48.9% |
| 4 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Banana / 香蕉道 → BombsiteB / B包 | 14 | 13 | 9 | 13 | 38 | 48.9% |
| 5 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Balcony / 阳台 → Apartments / 二楼 → TopofMid / 中路 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 3 | 3 | 3 | 3 | 123 | 43.2% |
| 6 | TSpawn / 匪家 → LowerMid / 匪口 → Upstairs / 匪二楼 → Bridge / 匪桥 → SecondMid / 侧道 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 3 | 3 | 3 | 3 | 26 | 48.9% |

#### b_ruins

共同骨架：TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → TopofMid / 中路 → Arch / 拱门 → CTSpawn / 警家 → Ruins / 警家教堂 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → TopofMid / 中路 → Arch / 拱门 → CTSpawn / 警家 → Ruins / 警家教堂 → BombsiteB / B包 | 6 | 6 | 4 | 6 | 21 | 1.7% |

### Corridor 候选 JSON

```json
[
  {
    "id": "a_mid",
    "target": "a",
    "entryChokeId": "a_mid",
    "sharedCallouts": [
      "TSpawn",
      "LowerMid",
      "TopofMid",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "LowerMid",
      "TRamp",
      "Middle",
      "TopofMid",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 196,
    "roundSupport": 113,
    "demoSupport": 16,
    "teamRoundSupport": 113,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "TRamp",
          "Middle",
          "TopofMid",
          "BombsiteA"
        ],
        "playerRoundSupport": 143,
        "roundSupport": 99,
        "demoSupport": 16,
        "teamRoundSupport": 99
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "SecondMid",
          "Middle",
          "TopofMid",
          "BombsiteA"
        ],
        "playerRoundSupport": 23,
        "roundSupport": 22,
        "demoSupport": 12,
        "teamRoundSupport": 22
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "SecondMid",
          "Balcony",
          "Apartments",
          "TopofMid",
          "BombsiteA"
        ],
        "playerRoundSupport": 19,
        "roundSupport": 18,
        "demoSupport": 10,
        "teamRoundSupport": 18
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "TRamp",
          "Middle",
          "SecondMid",
          "Balcony",
          "Apartments",
          "TopofMid",
          "BombsiteA"
        ],
        "playerRoundSupport": 4,
        "roundSupport": 4,
        "demoSupport": 4,
        "teamRoundSupport": 4
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "SecondMid",
          "BackAlley",
          "Apartments",
          "TopofMid",
          "BombsiteA"
        ],
        "playerRoundSupport": 4,
        "roundSupport": 4,
        "demoSupport": 4,
        "teamRoundSupport": 4
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "SecondMid",
          "Apartments",
          "TopofMid",
          "BombsiteA"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 3,
        "teamRoundSupport": 3
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_arch",
    "target": "a",
    "entryChokeId": "a_arch",
    "sharedCallouts": [
      "TSpawn",
      "LowerMid",
      "Middle",
      "TopofMid",
      "Arch",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "LowerMid",
      "TRamp",
      "Middle",
      "TopofMid",
      "Arch",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 86,
    "roundSupport": 50,
    "demoSupport": 15,
    "teamRoundSupport": 50,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "TRamp",
          "Middle",
          "TopofMid",
          "Arch",
          "BombsiteA"
        ],
        "playerRoundSupport": 57,
        "roundSupport": 40,
        "demoSupport": 15,
        "teamRoundSupport": 40
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "SecondMid",
          "Middle",
          "TopofMid",
          "Arch",
          "BombsiteA"
        ],
        "playerRoundSupport": 26,
        "roundSupport": 16,
        "demoSupport": 11,
        "teamRoundSupport": 16
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "Upstairs",
          "Bridge",
          "SecondMid",
          "Middle",
          "TopofMid",
          "Arch",
          "BombsiteA"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 3,
        "teamRoundSupport": 3
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_quad",
    "target": "a",
    "entryChokeId": "a_quad",
    "sharedCallouts": [
      "TSpawn",
      "LowerMid",
      "TopofMid",
      "Quad",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "LowerMid",
      "TRamp",
      "Middle",
      "TopofMid",
      "Quad",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 69,
    "roundSupport": 57,
    "demoSupport": 14,
    "teamRoundSupport": 57,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "TRamp",
          "Middle",
          "TopofMid",
          "Quad",
          "BombsiteA"
        ],
        "playerRoundSupport": 46,
        "roundSupport": 39,
        "demoSupport": 13,
        "teamRoundSupport": 39
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "SecondMid",
          "Middle",
          "TopofMid",
          "Quad",
          "BombsiteA"
        ],
        "playerRoundSupport": 12,
        "roundSupport": 12,
        "demoSupport": 8,
        "teamRoundSupport": 12
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "SecondMid",
          "Balcony",
          "Apartments",
          "TopofMid",
          "Quad",
          "BombsiteA"
        ],
        "playerRoundSupport": 7,
        "roundSupport": 7,
        "demoSupport": 6,
        "teamRoundSupport": 7
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "SecondMid",
          "BackAlley",
          "Apartments",
          "TopofMid",
          "Quad",
          "BombsiteA"
        ],
        "playerRoundSupport": 4,
        "roundSupport": 4,
        "demoSupport": 4,
        "teamRoundSupport": 4
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_balcony",
    "target": "a",
    "entryChokeId": "a_balcony",
    "sharedCallouts": [
      "TSpawn",
      "LowerMid",
      "Apartments",
      "Balcony",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "LowerMid",
      "SecondMid",
      "BackAlley",
      "Apartments",
      "Balcony",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 17,
    "roundSupport": 16,
    "demoSupport": 9,
    "teamRoundSupport": 16,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "SecondMid",
          "BackAlley",
          "Apartments",
          "Balcony",
          "BombsiteA"
        ],
        "playerRoundSupport": 14,
        "roundSupport": 13,
        "demoSupport": 7,
        "teamRoundSupport": 13
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "Upstairs",
          "Bridge",
          "Apartments",
          "Balcony",
          "BombsiteA"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 3,
        "teamRoundSupport": 3
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_pit",
    "target": "a",
    "entryChokeId": "a_pit",
    "sharedCallouts": [
      "TSpawn",
      "LowerMid",
      "SecondMid",
      "Apartments",
      "Balcony",
      "Pit",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "LowerMid",
      "SecondMid",
      "BackAlley",
      "Apartments",
      "Balcony",
      "Pit",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 13,
    "roundSupport": 12,
    "demoSupport": 9,
    "teamRoundSupport": 12,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "SecondMid",
          "BackAlley",
          "Apartments",
          "Balcony",
          "Pit",
          "BombsiteA"
        ],
        "playerRoundSupport": 10,
        "roundSupport": 9,
        "demoSupport": 7,
        "teamRoundSupport": 9
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "SecondMid",
          "Apartments",
          "Balcony",
          "Pit",
          "BombsiteA"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 3,
        "teamRoundSupport": 3
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_banana",
    "target": "b",
    "entryChokeId": "b_banana",
    "sharedCallouts": [
      "TSpawn",
      "LowerMid",
      "Banana",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "LowerMid",
      "TRamp",
      "Middle",
      "Banana",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 488,
    "roundSupport": 154,
    "demoSupport": 16,
    "teamRoundSupport": 154,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "TRamp",
          "Middle",
          "Banana",
          "BombsiteB"
        ],
        "playerRoundSupport": 409,
        "roundSupport": 153,
        "demoSupport": 16,
        "teamRoundSupport": 153
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "SecondMid",
          "Middle",
          "Banana",
          "BombsiteB"
        ],
        "playerRoundSupport": 34,
        "roundSupport": 30,
        "demoSupport": 14,
        "teamRoundSupport": 30
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "SecondMid",
          "Underpass",
          "Middle",
          "Banana",
          "BombsiteB"
        ],
        "playerRoundSupport": 25,
        "roundSupport": 25,
        "demoSupport": 13,
        "teamRoundSupport": 25
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "TRamp",
          "Banana",
          "BombsiteB"
        ],
        "playerRoundSupport": 14,
        "roundSupport": 13,
        "demoSupport": 9,
        "teamRoundSupport": 13
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "SecondMid",
          "Balcony",
          "Apartments",
          "TopofMid",
          "Middle",
          "Banana",
          "BombsiteB"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 3,
        "teamRoundSupport": 3
      },
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "Upstairs",
          "Bridge",
          "SecondMid",
          "Middle",
          "Banana",
          "BombsiteB"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 3,
        "teamRoundSupport": 3
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_ruins",
    "target": "b",
    "entryChokeId": "b_ruins",
    "sharedCallouts": [
      "TSpawn",
      "LowerMid",
      "TRamp",
      "Middle",
      "TopofMid",
      "Arch",
      "CTSpawn",
      "Ruins",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "LowerMid",
      "TRamp",
      "Middle",
      "TopofMid",
      "Arch",
      "CTSpawn",
      "Ruins",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 6,
    "roundSupport": 6,
    "demoSupport": 4,
    "teamRoundSupport": 6,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "LowerMid",
          "TRamp",
          "Middle",
          "TopofMid",
          "Arch",
          "CTSpawn",
          "Ruins",
          "BombsiteB"
        ],
        "playerRoundSupport": 6,
        "roundSupport": 6,
        "demoSupport": 4,
        "teamRoundSupport": 6
      }
    ],
    "confidence": "observed-complete-path-cluster"
  }
]
```

## de_mirage

样本 ZIP：21；回合：458；observed 有向边：88

### 高频有向边

| from | to | T | CT | T占比 | 涉及回合 |
|---|---|---:|---:|---:|---:|
| TSpawn / 匪家 | SideAlley / 匪口 | 1751 | 28 | 98.4% | 426 |
| CTSpawn / 警家 | Shop / 超市 | 48 | 1213 | 3.8% | 444 |
| BombsiteB / B包 | Truck / 白车 | 64 | 1174 | 5.2% | 376 |
| SideAlley / 匪口 | TopofMid / 中远/匪口 | 1210 | 17 | 98.6% | 383 |
| Shop / 超市 | BombsiteB / B包 | 44 | 1077 | 3.9% | 442 |
| Truck / 白车 | BombsiteB / B包 | 97 | 996 | 8.9% | 335 |
| CTSpawn / 警家 | BombsiteA / A包 | 20 | 1054 | 1.9% | 443 |
| SideAlley / 匪口 | House / 匪二楼 | 955 | 27 | 97.3% | 378 |
| BombsiteA / A包 | Jungle / Jungle | 159 | 739 | 17.7% | 377 |
| House / 匪二楼 | BackAlley / B二楼 | 843 | 24 | 97.2% | 364 |
| Connector / 拱门 | BombsiteA / A包 | 264 | 501 | 34.5% | 342 |
| Jungle / Jungle | BombsiteA / A包 | 80 | 675 | 10.6% | 344 |
| TSpawn / 匪家 | PalaceAlley / A1 | 720 | 17 | 97.7% | 317 |
| Middle / 中路 | Connector / 拱门 | 367 | 351 | 51.1% | 307 |
| CTSpawn / 警家 | SnipersNest / VIP | 26 | 688 | 3.6% | 398 |
| PalaceAlley / A1 | TRamp / A1 | 658 | 42 | 94.0% | 296 |
| BombsiteA / A包 | Stairs / 跳台 | 165 | 535 | 23.6% | 307 |
| BackAlley / B二楼 | Apartments / B二楼 | 618 | 35 | 94.6% | 247 |
| PalaceInterior / A二楼 | BombsiteA / A包 | 499 | 141 | 78.0% | 289 |
| BombsiteA / A包 | Connector / 拱门 | 52 | 554 | 8.6% | 335 |
| TRamp / A1 | PalaceInterior / A二楼 | 535 | 59 | 90.1% | 267 |
| Stairs / 跳台 | BombsiteA / A包 | 137 | 450 | 23.3% | 281 |
| TopofMid / 中远/匪口 | SideAlley / 匪口 | 533 | 40 | 93.0% | 281 |
| BombsiteB / B包 | Catwalk / B小 | 76 | 478 | 13.7% | 352 |
| SnipersNest / VIP | CTSpawn / 警家 | 24 | 472 | 4.8% | 339 |
| TopofMid / 中远/匪口 | Middle / 中路 | 445 | 35 | 92.7% | 251 |
| BombsiteA / A包 | PalaceInterior / A二楼 | 157 | 318 | 33.1% | 255 |
| Jungle / Jungle | CTSpawn / 警家 | 75 | 399 | 15.8% | 306 |
| CTSpawn / 警家 | Jungle / Jungle | 35 | 426 | 7.6% | 309 |
| BombsiteB / B包 | Shop / 超市 | 113 | 335 | 25.2% | 279 |
| Shop / 超市 | CTSpawn / 警家 | 65 | 362 | 15.2% | 267 |
| Connector / 拱门 | Middle / 中路 | 66 | 318 | 17.2% | 234 |
| SideAlley / 匪口 | TSpawn / 匪家 | 326 | 29 | 91.8% | 194 |
| Catwalk / B小 | BombsiteB / B包 | 134 | 216 | 38.3% | 212 |
| BackAlley / B二楼 | Underpass / 下水道 | 316 | 30 | 91.3% | 230 |
| Apartments / B二楼 | BombsiteB / B包 | 240 | 99 | 70.8% | 207 |
| TSpawn / 匪家 | PalaceInterior / A二楼 | 320 | 15 | 95.5% | 254 |
| TopofMid / 中远/匪口 | Catwalk / B小 | 292 | 40 | 88.0% | 183 |
| Underpass / 下水道 | Middle / 中路 | 233 | 99 | 70.2% | 215 |
| Catwalk / B小 | Underpass / 下水道 | 35 | 251 | 12.2% | 198 |

### A 包 Route Corridors

| corridor | entryChokeId | 共同骨架 | variants | player-round | round | demo | team-round |
|---|---|---|---:|---:|---:|---:|---:|
| a_palace | a_palace | TSpawn / 匪家 → PalaceInterior / A二楼 → BombsiteA / A包 | 2 | 457 | 217 | 21 | 217 |
| a_connector | a_connector | TSpawn / 匪家 → SideAlley / 匪口 → Middle / 中路 → Connector / 拱门 → BombsiteA / A包 | 3 | 242 | 125 | 21 | 125 |
| a_scaffolding | a_scaffolding | TSpawn / 匪家 → PalaceInterior / A二楼 → Scaffolding / A2上下 → BombsiteA / A包 | 1 | 108 | 90 | 21 | 90 |
| a_jungle | a_jungle | TSpawn / 匪家 → SideAlley / 匪口 → Middle / 中路 → Jungle / Jungle → BombsiteA / A包 | 2 | 10 | 10 | 9 | 10 |

#### a_palace

共同骨架：TSpawn / 匪家 → PalaceInterior / A二楼 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → PalaceAlley / A1 → TRamp / A1 → PalaceInterior / A二楼 → BombsiteA / A包 | 436 | 209 | 21 | 209 | 499 | 78.0% |
| 2 | TSpawn / 匪家 → PalaceInterior / A二楼 → BombsiteA / A包 | 21 | 20 | 12 | 20 | 320 | 78.0% |

#### a_connector

共同骨架：TSpawn / 匪家 → SideAlley / 匪口 → Middle / 中路 → Connector / 拱门 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Middle / 中路 → Connector / 拱门 → BombsiteA / A包 | 146 | 95 | 21 | 95 | 264 | 34.5% |
| 2 | TSpawn / 匪家 → SideAlley / 匪口 → House / 匪二楼 → BackAlley / B二楼 → Underpass / 下水道 → Middle / 中路 → Connector / 拱门 → BombsiteA / A包 | 70 | 61 | 20 | 61 | 233 | 34.5% |
| 3 | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Catwalk / B小 → Middle / 中路 → Connector / 拱门 → BombsiteA / A包 | 26 | 24 | 14 | 24 | 112 | 34.5% |

#### a_scaffolding

共同骨架：TSpawn / 匪家 → PalaceInterior / A二楼 → Scaffolding / A2上下 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → PalaceInterior / A二楼 → Scaffolding / A2上下 → BombsiteA / A包 | 108 | 90 | 21 | 90 | 116 | 63.1% |

#### a_jungle

共同骨架：TSpawn / 匪家 → SideAlley / 匪口 → Middle / 中路 → Jungle / Jungle → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Middle / 中路 → SnipersNest / VIP → CTSpawn / 警家 → Jungle / Jungle → BombsiteA / A包 | 5 | 5 | 4 | 5 | 24 | 4.8% |
| 2 | TSpawn / 匪家 → SideAlley / 匪口 → House / 匪二楼 → BackAlley / B二楼 → Underpass / 下水道 → Middle / 中路 → Connector / 拱门 → Jungle / Jungle → BombsiteA / A包 | 5 | 5 | 5 | 5 | 17 | 10.6% |

### B 包 Route Corridors

| corridor | entryChokeId | 共同骨架 | variants | player-round | round | demo | team-round |
|---|---|---|---:|---:|---:|---:|---:|
| b_apartments | b_apartments | TSpawn / 匪家 → SideAlley / 匪口 → BackAlley / B二楼 → Apartments / B二楼 → BombsiteB / B包 | 2 | 232 | 129 | 21 | 129 |
| b_catwalk | b_catwalk | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Catwalk / B小 → BombsiteB / B包 | 2 | 114 | 64 | 21 | 64 |
| b_truck | b_truck | TSpawn / 匪家 → SideAlley / 匪口 → House / 匪二楼 → BackAlley / B二楼 → Apartments / B二楼 → Truck / 白车 → BombsiteB / B包 | 1 | 74 | 61 | 18 | 61 |

#### b_apartments

共同骨架：TSpawn / 匪家 → SideAlley / 匪口 → BackAlley / B二楼 → Apartments / B二楼 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → SideAlley / 匪口 → House / 匪二楼 → BackAlley / B二楼 → Apartments / B二楼 → BombsiteB / B包 | 227 | 127 | 21 | 127 | 240 | 70.8% |
| 2 | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Middle / 中路 → Underpass / 下水道 → BackAlley / B二楼 → Apartments / B二楼 → BombsiteB / B包 | 5 | 4 | 4 | 4 | 80 | 41.7% |

#### b_catwalk

共同骨架：TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Catwalk / B小 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Catwalk / B小 → BombsiteB / B包 | 93 | 56 | 20 | 56 | 134 | 38.3% |
| 2 | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Middle / 中路 → Catwalk / B小 → BombsiteB / B包 | 21 | 17 | 14 | 17 | 94 | 38.3% |

#### b_truck

共同骨架：TSpawn / 匪家 → SideAlley / 匪口 → House / 匪二楼 → BackAlley / B二楼 → Apartments / B二楼 → Truck / 白车 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → SideAlley / 匪口 → House / 匪二楼 → BackAlley / B二楼 → Apartments / B二楼 → Truck / 白车 → BombsiteB / B包 | 74 | 61 | 18 | 61 | 94 | 8.9% |

### Corridor 候选 JSON

```json
[
  {
    "id": "a_palace",
    "target": "a",
    "entryChokeId": "a_palace",
    "sharedCallouts": [
      "TSpawn",
      "PalaceInterior",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "PalaceAlley",
      "TRamp",
      "PalaceInterior",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 457,
    "roundSupport": 217,
    "demoSupport": 21,
    "teamRoundSupport": 217,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "PalaceAlley",
          "TRamp",
          "PalaceInterior",
          "BombsiteA"
        ],
        "playerRoundSupport": 436,
        "roundSupport": 209,
        "demoSupport": 21,
        "teamRoundSupport": 209
      },
      {
        "callouts": [
          "TSpawn",
          "PalaceInterior",
          "BombsiteA"
        ],
        "playerRoundSupport": 21,
        "roundSupport": 20,
        "demoSupport": 12,
        "teamRoundSupport": 20
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_connector",
    "target": "a",
    "entryChokeId": "a_connector",
    "sharedCallouts": [
      "TSpawn",
      "SideAlley",
      "Middle",
      "Connector",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "SideAlley",
      "TopofMid",
      "Middle",
      "Connector",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 242,
    "roundSupport": 125,
    "demoSupport": 21,
    "teamRoundSupport": 125,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "SideAlley",
          "TopofMid",
          "Middle",
          "Connector",
          "BombsiteA"
        ],
        "playerRoundSupport": 146,
        "roundSupport": 95,
        "demoSupport": 21,
        "teamRoundSupport": 95
      },
      {
        "callouts": [
          "TSpawn",
          "SideAlley",
          "House",
          "BackAlley",
          "Underpass",
          "Middle",
          "Connector",
          "BombsiteA"
        ],
        "playerRoundSupport": 70,
        "roundSupport": 61,
        "demoSupport": 20,
        "teamRoundSupport": 61
      },
      {
        "callouts": [
          "TSpawn",
          "SideAlley",
          "TopofMid",
          "Catwalk",
          "Middle",
          "Connector",
          "BombsiteA"
        ],
        "playerRoundSupport": 26,
        "roundSupport": 24,
        "demoSupport": 14,
        "teamRoundSupport": 24
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_scaffolding",
    "target": "a",
    "entryChokeId": "a_scaffolding",
    "sharedCallouts": [
      "TSpawn",
      "PalaceInterior",
      "Scaffolding",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "PalaceInterior",
      "Scaffolding",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 108,
    "roundSupport": 90,
    "demoSupport": 21,
    "teamRoundSupport": 90,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "PalaceInterior",
          "Scaffolding",
          "BombsiteA"
        ],
        "playerRoundSupport": 108,
        "roundSupport": 90,
        "demoSupport": 21,
        "teamRoundSupport": 90
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_jungle",
    "target": "a",
    "entryChokeId": "a_jungle",
    "sharedCallouts": [
      "TSpawn",
      "SideAlley",
      "Middle",
      "Jungle",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "SideAlley",
      "TopofMid",
      "Middle",
      "SnipersNest",
      "CTSpawn",
      "Jungle",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 10,
    "roundSupport": 10,
    "demoSupport": 9,
    "teamRoundSupport": 10,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "SideAlley",
          "TopofMid",
          "Middle",
          "SnipersNest",
          "CTSpawn",
          "Jungle",
          "BombsiteA"
        ],
        "playerRoundSupport": 5,
        "roundSupport": 5,
        "demoSupport": 4,
        "teamRoundSupport": 5
      },
      {
        "callouts": [
          "TSpawn",
          "SideAlley",
          "House",
          "BackAlley",
          "Underpass",
          "Middle",
          "Connector",
          "Jungle",
          "BombsiteA"
        ],
        "playerRoundSupport": 5,
        "roundSupport": 5,
        "demoSupport": 5,
        "teamRoundSupport": 5
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_apartments",
    "target": "b",
    "entryChokeId": "b_apartments",
    "sharedCallouts": [
      "TSpawn",
      "SideAlley",
      "BackAlley",
      "Apartments",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "SideAlley",
      "House",
      "BackAlley",
      "Apartments",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 232,
    "roundSupport": 129,
    "demoSupport": 21,
    "teamRoundSupport": 129,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "SideAlley",
          "House",
          "BackAlley",
          "Apartments",
          "BombsiteB"
        ],
        "playerRoundSupport": 227,
        "roundSupport": 127,
        "demoSupport": 21,
        "teamRoundSupport": 127
      },
      {
        "callouts": [
          "TSpawn",
          "SideAlley",
          "TopofMid",
          "Middle",
          "Underpass",
          "BackAlley",
          "Apartments",
          "BombsiteB"
        ],
        "playerRoundSupport": 5,
        "roundSupport": 4,
        "demoSupport": 4,
        "teamRoundSupport": 4
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_catwalk",
    "target": "b",
    "entryChokeId": "b_catwalk",
    "sharedCallouts": [
      "TSpawn",
      "SideAlley",
      "TopofMid",
      "Catwalk",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "SideAlley",
      "TopofMid",
      "Catwalk",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 114,
    "roundSupport": 64,
    "demoSupport": 21,
    "teamRoundSupport": 64,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "SideAlley",
          "TopofMid",
          "Catwalk",
          "BombsiteB"
        ],
        "playerRoundSupport": 93,
        "roundSupport": 56,
        "demoSupport": 20,
        "teamRoundSupport": 56
      },
      {
        "callouts": [
          "TSpawn",
          "SideAlley",
          "TopofMid",
          "Middle",
          "Catwalk",
          "BombsiteB"
        ],
        "playerRoundSupport": 21,
        "roundSupport": 17,
        "demoSupport": 14,
        "teamRoundSupport": 17
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_truck",
    "target": "b",
    "entryChokeId": "b_truck",
    "sharedCallouts": [
      "TSpawn",
      "SideAlley",
      "House",
      "BackAlley",
      "Apartments",
      "Truck",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "SideAlley",
      "House",
      "BackAlley",
      "Apartments",
      "Truck",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 74,
    "roundSupport": 61,
    "demoSupport": 18,
    "teamRoundSupport": 61,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "SideAlley",
          "House",
          "BackAlley",
          "Apartments",
          "Truck",
          "BombsiteB"
        ],
        "playerRoundSupport": 74,
        "roundSupport": 61,
        "demoSupport": 18,
        "teamRoundSupport": 61
      }
    ],
    "confidence": "observed-complete-path-cluster"
  }
]
```

## de_nuke

样本 ZIP：12；回合：256；observed 有向边：86

### 高频有向边

| from | to | T | CT | T占比 | 涉及回合 |
|---|---|---:|---:|---:|---:|
| TSpawn / 匪家 | Outside / 外场 | 1324 | 2 | 99.8% | 256 |
| CTSpawn / 警家 | Outside / 外场 | 0 | 1285 | 0.0% | 255 |
| Outside / 外场 | Hell / 三楼下 | 11 | 1053 | 1.0% | 255 |
| Outside / 外场 | Lobby / 匪厅 | 745 | 11 | 98.5% | 242 |
| Heaven / 三楼 | Rafters / 三楼横梁 | 27 | 706 | 3.7% | 251 |
| Hell / 三楼下 | Heaven / 三楼 | 19 | 666 | 2.8% | 251 |
| Hell / 三楼下 | Admin / 铁板三楼下 | 7 | 587 | 1.2% | 253 |
| Admin / 铁板三楼下 | Ramp / 铁板 | 8 | 495 | 1.6% | 247 |
| Lobby / 匪厅 | Vending / 链接 | 398 | 70 | 85.0% | 173 |
| Vending / 链接 | Trophy / 奖杯房 | 371 | 78 | 82.6% | 159 |
| Outside / 外场 | Mini / 正门 | 118 | 304 | 28.0% | 212 |
| Trophy / 奖杯房 | Control / 链接 | 289 | 82 | 77.9% | 130 |
| Outside / 外场 | Secret / K1 | 287 | 43 | 87.0% | 126 |
| Lobby / 匪厅 | Squeaky / 铁门房 | 297 | 31 | 90.5% | 169 |
| Ramp / 铁板 | BombsiteB / B包 | 125 | 195 | 39.1% | 137 |
| Mini / 正门 | BombsiteA / A包 | 70 | 244 | 22.3% | 189 |
| Rafters / 三楼横梁 | BombsiteA / A包 | 8 | 304 | 2.6% | 204 |
| Control / 链接 | Ramp / 铁板 | 191 | 108 | 63.9% | 123 |
| Secret / K1 | Tunnels / K1地下 | 217 | 54 | 80.1% | 110 |
| Heaven / 三楼 | Catwalk / 外场三楼 | 11 | 247 | 4.3% | 120 |
| Rafters / 三楼横梁 | Heaven / 三楼 | 12 | 239 | 4.8% | 131 |
| Outside / 外场 | Garage / 大仓 | 53 | 195 | 21.4% | 152 |
| Lobby / 匪厅 | Hut / 黄房 | 207 | 37 | 84.8% | 132 |
| Vents / 管道 | Tunnels / K1地下 | 52 | 192 | 21.3% | 144 |
| Admin / 铁板三楼下 | Hell / 三楼下 | 15 | 227 | 6.2% | 154 |
| BombsiteA / A包 | Vents / 管道 | 37 | 203 | 15.4% | 153 |
| Outside / 外场 | Roof / 屋顶 | 236 | 1 | 99.6% | 176 |
| Tunnels / K1地下 | Decon / 死门 | 92 | 137 | 40.2% | 95 |
| Squeaky / 铁门房 | BombsiteA / A包 | 178 | 45 | 79.8% | 132 |
| Catwalk / 外场三楼 | Heaven / 三楼 | 18 | 205 | 8.1% | 103 |
| Hut / 黄房 | BombsiteA / A包 | 154 | 65 | 70.3% | 110 |
| Trophy / 奖杯房 | Vending / 链接 | 112 | 99 | 53.1% | 129 |
| Vending / 链接 | Lobby / 匪厅 | 129 | 75 | 63.2% | 128 |
| Garage / 大仓 | Outside / 外场 | 37 | 162 | 18.6% | 136 |
| BombsiteA / A包 | Hut / 黄房 | 81 | 111 | 42.2% | 113 |
| Mini / 正门 | Outside / 外场 | 39 | 143 | 21.4% | 122 |
| Ramp / 铁板 | Admin / 铁板三楼下 | 17 | 164 | 9.4% | 127 |
| BombsiteA / A包 | Mini / 正门 | 38 | 135 | 22.0% | 114 |
| Ramp / 铁板 | Control / 链接 | 13 | 156 | 7.7% | 121 |
| Lobby / 匪厅 | Outside / 外场 | 140 | 17 | 89.2% | 91 |

### A 包 Route Corridors

| corridor | entryChokeId | 共同骨架 | variants | player-round | round | demo | team-round |
|---|---|---|---:|---:|---:|---:|---:|
| a_squeaky | a_squeaky | TSpawn / 匪家 → Outside / 外场 → Lobby / 匪厅 → Squeaky / 铁门房 → BombsiteA / A包 | 2 | 154 | 96 | 12 | 96 |
| a_hut | a_hut | TSpawn / 匪家 → Outside / 外场 → Lobby / 匪厅 → Hut / 黄房 → BombsiteA / A包 | 2 | 103 | 65 | 12 | 65 |
| a_mini | a_mini | TSpawn / 匪家 → Outside / 外场 → Mini / 正门 → BombsiteA / A包 | 1 | 61 | 40 | 12 | 40 |
| a_vents | a_vents | TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → Vents / 管道 → BombsiteA / A包 | 1 | 14 | 11 | 8 | 11 |
| a_rafters | a_rafters | TSpawn / 匪家 → Outside / 外场 → Hell / 三楼下 → Heaven / 三楼 → Rafters / 三楼横梁 → BombsiteA / A包 | 2 | 6 | 6 | 4 | 6 |

#### a_squeaky

共同骨架：TSpawn / 匪家 → Outside / 外场 → Lobby / 匪厅 → Squeaky / 铁门房 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 外场 → Lobby / 匪厅 → Squeaky / 铁门房 → BombsiteA / A包 | 143 | 92 | 12 | 92 | 178 | 79.8% |
| 2 | TSpawn / 匪家 → Outside / 外场 → Roof / 屋顶 → Lobby / 匪厅 → Squeaky / 铁门房 → BombsiteA / A包 | 11 | 11 | 8 | 11 | 84 | 79.8% |

#### a_hut

共同骨架：TSpawn / 匪家 → Outside / 外场 → Lobby / 匪厅 → Hut / 黄房 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 外场 → Lobby / 匪厅 → Hut / 黄房 → BombsiteA / A包 | 87 | 60 | 12 | 60 | 154 | 70.3% |
| 2 | TSpawn / 匪家 → Outside / 外场 → Roof / 屋顶 → Lobby / 匪厅 → Hut / 黄房 → BombsiteA / A包 | 16 | 15 | 7 | 15 | 84 | 70.3% |

#### a_mini

共同骨架：TSpawn / 匪家 → Outside / 外场 → Mini / 正门 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 外场 → Mini / 正门 → BombsiteA / A包 | 61 | 40 | 12 | 40 | 70 | 22.3% |

#### a_vents

共同骨架：TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → Vents / 管道 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → Vents / 管道 → BombsiteA / A包 | 14 | 11 | 8 | 11 | 25 | 36.8% |

#### a_rafters

共同骨架：TSpawn / 匪家 → Outside / 外场 → Hell / 三楼下 → Heaven / 三楼 → Rafters / 三楼横梁 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 外场 → Lobby / 匪厅 → Vending / 链接 → Trophy / 奖杯房 → Control / 链接 → Ramp / 铁板 → Admin / 铁板三楼下 → Hell / 三楼下 → Heaven / 三楼 → Rafters / 三楼横梁 → BombsiteA / A包 | 3 | 3 | 3 | 3 | 8 | 2.6% |
| 2 | TSpawn / 匪家 → Outside / 外场 → LockerRoom / 更衣室 → Hell / 三楼下 → Heaven / 三楼 → Rafters / 三楼横梁 → BombsiteA / A包 | 3 | 3 | 2 | 3 | 7 | 2.6% |

### B 包 Route Corridors

| corridor | entryChokeId | 共同骨架 | variants | player-round | round | demo | team-round |
|---|---|---|---:|---:|---:|---:|---:|
| b_ramp | b_ramp | TSpawn / 匪家 → Outside / 外场 → Lobby / 匪厅 → Vending / 链接 → Trophy / 奖杯房 → Control / 链接 → Ramp / 铁板 → BombsiteB / B包 | 2 | 109 | 42 | 12 | 42 |
| b_decon | b_decon | TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → Decon / 死门 → BombsiteB / B包 | 1 | 53 | 31 | 11 | 31 |
| b_tunnels | b_tunnels | TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → BombsiteB / B包 | 1 | 36 | 25 | 11 | 25 |
| b_observation | b_observation | TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → Observation / 控制室 → BombsiteB / B包 | 1 | 34 | 29 | 9 | 29 |

#### b_ramp

共同骨架：TSpawn / 匪家 → Outside / 外场 → Lobby / 匪厅 → Vending / 链接 → Trophy / 奖杯房 → Control / 链接 → Ramp / 铁板 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 外场 → Lobby / 匪厅 → Vending / 链接 → Trophy / 奖杯房 → Control / 链接 → Ramp / 铁板 → BombsiteB / B包 | 103 | 40 | 12 | 40 | 125 | 39.1% |
| 2 | TSpawn / 匪家 → Outside / 外场 → Roof / 屋顶 → Lobby / 匪厅 → Vending / 链接 → Trophy / 奖杯房 → Control / 链接 → Ramp / 铁板 → BombsiteB / B包 | 6 | 6 | 4 | 6 | 84 | 39.1% |

#### b_decon

共同骨架：TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → Decon / 死门 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → Decon / 死门 → BombsiteB / B包 | 53 | 31 | 11 | 31 | 83 | 40.2% |

#### b_tunnels

共同骨架：TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → BombsiteB / B包 | 36 | 25 | 11 | 25 | 47 | 60.3% |

#### b_observation

共同骨架：TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → Observation / 控制室 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → Observation / 控制室 → BombsiteB / B包 | 34 | 29 | 9 | 29 | 45 | 78.9% |

### Corridor 候选 JSON

```json
[
  {
    "id": "a_squeaky",
    "target": "a",
    "entryChokeId": "a_squeaky",
    "sharedCallouts": [
      "TSpawn",
      "Outside",
      "Lobby",
      "Squeaky",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Outside",
      "Lobby",
      "Squeaky",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 154,
    "roundSupport": 96,
    "demoSupport": 12,
    "teamRoundSupport": 96,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Lobby",
          "Squeaky",
          "BombsiteA"
        ],
        "playerRoundSupport": 143,
        "roundSupport": 92,
        "demoSupport": 12,
        "teamRoundSupport": 92
      },
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Roof",
          "Lobby",
          "Squeaky",
          "BombsiteA"
        ],
        "playerRoundSupport": 11,
        "roundSupport": 11,
        "demoSupport": 8,
        "teamRoundSupport": 11
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_hut",
    "target": "a",
    "entryChokeId": "a_hut",
    "sharedCallouts": [
      "TSpawn",
      "Outside",
      "Lobby",
      "Hut",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Outside",
      "Lobby",
      "Hut",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 103,
    "roundSupport": 65,
    "demoSupport": 12,
    "teamRoundSupport": 65,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Lobby",
          "Hut",
          "BombsiteA"
        ],
        "playerRoundSupport": 87,
        "roundSupport": 60,
        "demoSupport": 12,
        "teamRoundSupport": 60
      },
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Roof",
          "Lobby",
          "Hut",
          "BombsiteA"
        ],
        "playerRoundSupport": 16,
        "roundSupport": 15,
        "demoSupport": 7,
        "teamRoundSupport": 15
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_mini",
    "target": "a",
    "entryChokeId": "a_mini",
    "sharedCallouts": [
      "TSpawn",
      "Outside",
      "Mini",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Outside",
      "Mini",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 61,
    "roundSupport": 40,
    "demoSupport": 12,
    "teamRoundSupport": 40,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Mini",
          "BombsiteA"
        ],
        "playerRoundSupport": 61,
        "roundSupport": 40,
        "demoSupport": 12,
        "teamRoundSupport": 40
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_vents",
    "target": "a",
    "entryChokeId": "a_vents",
    "sharedCallouts": [
      "TSpawn",
      "Outside",
      "Secret",
      "Tunnels",
      "Vents",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Outside",
      "Secret",
      "Tunnels",
      "Vents",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 14,
    "roundSupport": 11,
    "demoSupport": 8,
    "teamRoundSupport": 11,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Secret",
          "Tunnels",
          "Vents",
          "BombsiteA"
        ],
        "playerRoundSupport": 14,
        "roundSupport": 11,
        "demoSupport": 8,
        "teamRoundSupport": 11
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_rafters",
    "target": "a",
    "entryChokeId": "a_rafters",
    "sharedCallouts": [
      "TSpawn",
      "Outside",
      "Hell",
      "Heaven",
      "Rafters",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Outside",
      "Lobby",
      "Vending",
      "Trophy",
      "Control",
      "Ramp",
      "Admin",
      "Hell",
      "Heaven",
      "Rafters",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 6,
    "roundSupport": 6,
    "demoSupport": 4,
    "teamRoundSupport": 6,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Lobby",
          "Vending",
          "Trophy",
          "Control",
          "Ramp",
          "Admin",
          "Hell",
          "Heaven",
          "Rafters",
          "BombsiteA"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 3,
        "teamRoundSupport": 3
      },
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "LockerRoom",
          "Hell",
          "Heaven",
          "Rafters",
          "BombsiteA"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 2,
        "teamRoundSupport": 3
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_ramp",
    "target": "b",
    "entryChokeId": "b_ramp",
    "sharedCallouts": [
      "TSpawn",
      "Outside",
      "Lobby",
      "Vending",
      "Trophy",
      "Control",
      "Ramp",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Outside",
      "Lobby",
      "Vending",
      "Trophy",
      "Control",
      "Ramp",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 109,
    "roundSupport": 42,
    "demoSupport": 12,
    "teamRoundSupport": 42,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Lobby",
          "Vending",
          "Trophy",
          "Control",
          "Ramp",
          "BombsiteB"
        ],
        "playerRoundSupport": 103,
        "roundSupport": 40,
        "demoSupport": 12,
        "teamRoundSupport": 40
      },
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Roof",
          "Lobby",
          "Vending",
          "Trophy",
          "Control",
          "Ramp",
          "BombsiteB"
        ],
        "playerRoundSupport": 6,
        "roundSupport": 6,
        "demoSupport": 4,
        "teamRoundSupport": 6
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_decon",
    "target": "b",
    "entryChokeId": "b_decon",
    "sharedCallouts": [
      "TSpawn",
      "Outside",
      "Secret",
      "Tunnels",
      "Decon",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Outside",
      "Secret",
      "Tunnels",
      "Decon",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 53,
    "roundSupport": 31,
    "demoSupport": 11,
    "teamRoundSupport": 31,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Secret",
          "Tunnels",
          "Decon",
          "BombsiteB"
        ],
        "playerRoundSupport": 53,
        "roundSupport": 31,
        "demoSupport": 11,
        "teamRoundSupport": 31
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_tunnels",
    "target": "b",
    "entryChokeId": "b_tunnels",
    "sharedCallouts": [
      "TSpawn",
      "Outside",
      "Secret",
      "Tunnels",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Outside",
      "Secret",
      "Tunnels",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 36,
    "roundSupport": 25,
    "demoSupport": 11,
    "teamRoundSupport": 25,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Secret",
          "Tunnels",
          "BombsiteB"
        ],
        "playerRoundSupport": 36,
        "roundSupport": 25,
        "demoSupport": 11,
        "teamRoundSupport": 25
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_observation",
    "target": "b",
    "entryChokeId": "b_observation",
    "sharedCallouts": [
      "TSpawn",
      "Outside",
      "Secret",
      "Tunnels",
      "Observation",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Outside",
      "Secret",
      "Tunnels",
      "Observation",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 34,
    "roundSupport": 29,
    "demoSupport": 9,
    "teamRoundSupport": 29,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Outside",
          "Secret",
          "Tunnels",
          "Observation",
          "BombsiteB"
        ],
        "playerRoundSupport": 34,
        "roundSupport": 29,
        "demoSupport": 9,
        "teamRoundSupport": 29
      }
    ],
    "confidence": "observed-complete-path-cluster"
  }
]
```

## de_overpass

样本 ZIP：7；回合：114；observed 有向边：83

### 高频有向边

| from | to | T | CT | T占比 | 涉及回合 |
|---|---|---:|---:|---:|---:|
| BombsiteA / A包 | BackofA / 垃圾桶 | 12 | 461 | 2.5% | 114 |
| BackofA / 垃圾桶 | Stairs / 楼梯 | 3 | 429 | 0.7% | 113 |
| Stairs / 楼梯 | UnderA / 一层 | 3 | 425 | 0.7% | 113 |
| TStairs / 匪楼梯 | Tunnels / 下水道 | 413 | 10 | 97.6% | 107 |
| TSpawn / 匪家 | TStairs / 匪楼梯 | 378 | 4 | 99.0% | 109 |
| Tunnels / 下水道 | Fountain / 喷泉 | 307 | 13 | 95.9% | 96 |
| UnderA / 一层 | Walkway / ABC | 0 | 293 | 0.0% | 109 |
| Canal / 长管 | BombsiteB / B包 | 121 | 154 | 44.0% | 90 |
| Alley / 匪家B外 | Canal / 长管 | 263 | 7 | 97.4% | 87 |
| BombsiteB / B包 | Canal / 长管 | 66 | 191 | 25.7% | 91 |
| BombsiteA / A包 | LowerPark / A小厕所 | 18 | 237 | 7.1% | 109 |
| TSpawn / 匪家 | Alley / 匪家B外 | 217 | 3 | 98.6% | 93 |
| Water / 工地 | BombsiteB / B包 | 18 | 192 | 8.6% | 104 |
| Water / 工地 | Construction / B小 | 144 | 47 | 75.4% | 68 |
| Walkway / ABC | UnderA / 一层 | 10 | 180 | 5.3% | 84 |
| Walkway / ABC | Water / 工地 | 17 | 170 | 9.1% | 90 |
| UnderA / 一层 | SnipersNest / B二楼 | 6 | 177 | 3.3% | 96 |
| Canal / 长管 | Pipe / 短管 | 164 | 13 | 92.7% | 72 |
| LowerPark / A小厕所 | BombsiteA / A包 | 66 | 111 | 37.3% | 79 |
| Construction / B小 | BombsiteB / B包 | 79 | 86 | 47.9% | 69 |
| Water / 工地 | Walkway / ABC | 29 | 126 | 18.7% | 73 |
| Pipe / 短管 | Water / 工地 | 140 | 14 | 90.9% | 69 |
| Fountain / 喷泉 | UpperPark / A大厕所 | 141 | 7 | 95.3% | 69 |
| Stairs / 楼梯 | BackofA / 垃圾桶 | 6 | 139 | 4.1% | 70 |
| BackofA / 垃圾桶 | BombsiteA / A包 | 5 | 140 | 3.4% | 81 |
| Connector / 下水道 | LowerPark / A小厕所 | 106 | 38 | 73.6% | 70 |
| UnderA / 一层 | Stairs / 楼梯 | 6 | 136 | 4.2% | 71 |
| LowerPark / A小厕所 | Connector / 下水道 | 60 | 77 | 43.8% | 75 |
| Fountain / 喷泉 | LowerPark / A小厕所 | 110 | 16 | 87.3% | 68 |
| SnipersNest / B二楼 | Water / 工地 | 3 | 123 | 2.4% | 85 |
| BombsiteB / B包 | Construction / B小 | 21 | 100 | 17.4% | 61 |
| BombsiteB / B包 | Water / 工地 | 35 | 84 | 29.4% | 66 |
| Construction / B小 | Water / 工地 | 51 | 67 | 43.2% | 62 |
| Tunnels / 下水道 | Connector / 下水道 | 107 | 10 | 91.5% | 73 |
| Walkway / ABC | Bridge / 桥 | 2 | 104 | 1.9% | 66 |
| BombsiteA / A包 | Lobby / 银行 | 8 | 90 | 8.2% | 50 |
| UpperPark / A大厕所 | BombsiteA / A包 | 61 | 28 | 68.5% | 50 |
| Lobby / 银行 | BombsiteA / A包 | 3 | 86 | 3.4% | 45 |
| BombsiteB / B包 | Bridge / 桥 | 23 | 65 | 26.1% | 63 |
| Playground / 游乐园 | Fountain / 喷泉 | 75 | 7 | 91.5% | 64 |

### A 包 Route Corridors

| corridor | entryChokeId | 共同骨架 | variants | player-round | round | demo | team-round |
|---|---|---|---:|---:|---:|---:|---:|
| a_lower_park | a_lower_park | TSpawn / 匪家 → LowerPark / A小厕所 → BombsiteA / A包 | 5 | 54 | 29 | 5 | 29 |
| a_upper_park | a_upper_park | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → UpperPark / A大厕所 → BombsiteA / A包 | 4 | 52 | 30 | 5 | 30 |

#### a_lower_park

共同骨架：TSpawn / 匪家 → LowerPark / A小厕所 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → LowerPark / A小厕所 → BombsiteA / A包 | 21 | 15 | 5 | 15 | 66 | 37.3% |
| 2 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Connector / 下水道 → LowerPark / A小厕所 → BombsiteA / A包 | 11 | 9 | 4 | 9 | 66 | 37.3% |
| 3 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → UpperPark / A大厕所 → LowerPark / A小厕所 → BombsiteA / A包 | 10 | 7 | 3 | 7 | 46 | 37.3% |
| 4 | TSpawn / 匪家 → Alley / 匪家B外 → Canal / 长管 → Pipe / 短管 → Water / 工地 → Connector / 下水道 → LowerPark / A小厕所 → BombsiteA / A包 | 7 | 6 | 4 | 6 | 34 | 37.3% |
| 5 | TSpawn / 匪家 → Alley / 匪家B外 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → LowerPark / A小厕所 → BombsiteA / A包 | 5 | 5 | 4 | 5 | 45 | 37.3% |

#### a_upper_park

共同骨架：TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → UpperPark / A大厕所 → BombsiteA / A包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → UpperPark / A大厕所 → BombsiteA / A包 | 33 | 23 | 5 | 23 | 61 | 68.5% |
| 2 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → LowerPark / A小厕所 → Restroom / 厕所 → UpperPark / A大厕所 → BombsiteA / A包 | 9 | 7 | 5 | 7 | 23 | 60.5% |
| 3 | TSpawn / 匪家 → Alley / 匪家B外 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → UpperPark / A大厕所 → BombsiteA / A包 | 6 | 5 | 2 | 5 | 45 | 68.5% |
| 4 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Connector / 下水道 → LowerPark / A小厕所 → Restroom / 厕所 → UpperPark / A大厕所 → BombsiteA / A包 | 4 | 1 | 1 | 1 | 23 | 60.5% |

### B 包 Route Corridors

| corridor | entryChokeId | 共同骨架 | variants | player-round | round | demo | team-round |
|---|---|---|---:|---:|---:|---:|---:|
| b_monster | b_monster | TSpawn / 匪家 → Alley / 匪家B外 → Canal / 长管 → BombsiteB / B包 | 2 | 77 | 36 | 6 | 36 |
| b_short | b_short | TSpawn / 匪家 → Water / 工地 → Construction / B小 → BombsiteB / B包 | 6 | 67 | 33 | 6 | 33 |

#### b_monster

共同骨架：TSpawn / 匪家 → Alley / 匪家B外 → Canal / 长管 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Alley / 匪家B外 → Canal / 长管 → BombsiteB / B包 | 55 | 32 | 6 | 32 | 121 | 44.0% |
| 2 | TSpawn / 匪家 → TStairs / 匪楼梯 → Alley / 匪家B外 → Canal / 长管 → BombsiteB / B包 | 22 | 17 | 6 | 17 | 58 | 44.0% |

#### b_short

共同骨架：TSpawn / 匪家 → Water / 工地 → Construction / B小 → BombsiteB / B包

| variant | 完整走向 | player-round | round | demo | team-round | 瓶颈 T 次数 | 最低 T 占比 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Alley / 匪家B外 → Canal / 长管 → Pipe / 短管 → Water / 工地 → Construction / B小 → BombsiteB / B包 | 37 | 23 | 6 | 23 | 79 | 47.9% |
| 2 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Connector / 下水道 → Water / 工地 → Construction / B小 → BombsiteB / B包 | 12 | 11 | 4 | 11 | 60 | 47.9% |
| 3 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → LowerPark / A小厕所 → Connector / 下水道 → Water / 工地 → Construction / B小 → BombsiteB / B包 | 5 | 4 | 3 | 4 | 60 | 43.8% |
| 4 | TSpawn / 匪家 → TStairs / 匪楼梯 → Alley / 匪家B外 → Canal / 长管 → Pipe / 短管 → Water / 工地 → Construction / B小 → BombsiteB / B包 | 5 | 4 | 2 | 4 | 58 | 47.9% |
| 5 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → UpperPark / A大厕所 → Restroom / 厕所 → LowerPark / A小厕所 → Connector / 下水道 → Water / 工地 → Construction / B小 → BombsiteB / B包 | 5 | 4 | 3 | 4 | 18 | 43.8% |
| 6 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → UpperPark / A大厕所 → LowerPark / A小厕所 → Connector / 下水道 → Water / 工地 → Construction / B小 → BombsiteB / B包 | 3 | 3 | 2 | 3 | 46 | 43.8% |

### Corridor 候选 JSON

```json
[
  {
    "id": "a_lower_park",
    "target": "a",
    "entryChokeId": "a_lower_park",
    "sharedCallouts": [
      "TSpawn",
      "LowerPark",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "TStairs",
      "Tunnels",
      "Fountain",
      "LowerPark",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 54,
    "roundSupport": 29,
    "demoSupport": 5,
    "teamRoundSupport": 29,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "TStairs",
          "Tunnels",
          "Fountain",
          "LowerPark",
          "BombsiteA"
        ],
        "playerRoundSupport": 21,
        "roundSupport": 15,
        "demoSupport": 5,
        "teamRoundSupport": 15
      },
      {
        "callouts": [
          "TSpawn",
          "TStairs",
          "Tunnels",
          "Connector",
          "LowerPark",
          "BombsiteA"
        ],
        "playerRoundSupport": 11,
        "roundSupport": 9,
        "demoSupport": 4,
        "teamRoundSupport": 9
      },
      {
        "callouts": [
          "TSpawn",
          "TStairs",
          "Tunnels",
          "Fountain",
          "UpperPark",
          "LowerPark",
          "BombsiteA"
        ],
        "playerRoundSupport": 10,
        "roundSupport": 7,
        "demoSupport": 3,
        "teamRoundSupport": 7
      },
      {
        "callouts": [
          "TSpawn",
          "Alley",
          "Canal",
          "Pipe",
          "Water",
          "Connector",
          "LowerPark",
          "BombsiteA"
        ],
        "playerRoundSupport": 7,
        "roundSupport": 6,
        "demoSupport": 4,
        "teamRoundSupport": 6
      },
      {
        "callouts": [
          "TSpawn",
          "Alley",
          "TStairs",
          "Tunnels",
          "Fountain",
          "LowerPark",
          "BombsiteA"
        ],
        "playerRoundSupport": 5,
        "roundSupport": 5,
        "demoSupport": 4,
        "teamRoundSupport": 5
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "a_upper_park",
    "target": "a",
    "entryChokeId": "a_upper_park",
    "sharedCallouts": [
      "TSpawn",
      "TStairs",
      "Tunnels",
      "UpperPark",
      "BombsiteA"
    ],
    "representativeCallouts": [
      "TSpawn",
      "TStairs",
      "Tunnels",
      "Fountain",
      "UpperPark",
      "BombsiteA"
    ],
    "totalPlayerRoundSupport": 52,
    "roundSupport": 30,
    "demoSupport": 5,
    "teamRoundSupport": 30,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "TStairs",
          "Tunnels",
          "Fountain",
          "UpperPark",
          "BombsiteA"
        ],
        "playerRoundSupport": 33,
        "roundSupport": 23,
        "demoSupport": 5,
        "teamRoundSupport": 23
      },
      {
        "callouts": [
          "TSpawn",
          "TStairs",
          "Tunnels",
          "Fountain",
          "LowerPark",
          "Restroom",
          "UpperPark",
          "BombsiteA"
        ],
        "playerRoundSupport": 9,
        "roundSupport": 7,
        "demoSupport": 5,
        "teamRoundSupport": 7
      },
      {
        "callouts": [
          "TSpawn",
          "Alley",
          "TStairs",
          "Tunnels",
          "Fountain",
          "UpperPark",
          "BombsiteA"
        ],
        "playerRoundSupport": 6,
        "roundSupport": 5,
        "demoSupport": 2,
        "teamRoundSupport": 5
      },
      {
        "callouts": [
          "TSpawn",
          "TStairs",
          "Tunnels",
          "Connector",
          "LowerPark",
          "Restroom",
          "UpperPark",
          "BombsiteA"
        ],
        "playerRoundSupport": 4,
        "roundSupport": 1,
        "demoSupport": 1,
        "teamRoundSupport": 1
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_monster",
    "target": "b",
    "entryChokeId": "b_monster",
    "sharedCallouts": [
      "TSpawn",
      "Alley",
      "Canal",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Alley",
      "Canal",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 77,
    "roundSupport": 36,
    "demoSupport": 6,
    "teamRoundSupport": 36,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Alley",
          "Canal",
          "BombsiteB"
        ],
        "playerRoundSupport": 55,
        "roundSupport": 32,
        "demoSupport": 6,
        "teamRoundSupport": 32
      },
      {
        "callouts": [
          "TSpawn",
          "TStairs",
          "Alley",
          "Canal",
          "BombsiteB"
        ],
        "playerRoundSupport": 22,
        "roundSupport": 17,
        "demoSupport": 6,
        "teamRoundSupport": 17
      }
    ],
    "confidence": "observed-complete-path-cluster"
  },
  {
    "id": "b_short",
    "target": "b",
    "entryChokeId": "b_short",
    "sharedCallouts": [
      "TSpawn",
      "Water",
      "Construction",
      "BombsiteB"
    ],
    "representativeCallouts": [
      "TSpawn",
      "Alley",
      "Canal",
      "Pipe",
      "Water",
      "Construction",
      "BombsiteB"
    ],
    "totalPlayerRoundSupport": 67,
    "roundSupport": 33,
    "demoSupport": 6,
    "teamRoundSupport": 33,
    "variants": [
      {
        "callouts": [
          "TSpawn",
          "Alley",
          "Canal",
          "Pipe",
          "Water",
          "Construction",
          "BombsiteB"
        ],
        "playerRoundSupport": 37,
        "roundSupport": 23,
        "demoSupport": 6,
        "teamRoundSupport": 23
      },
      {
        "callouts": [
          "TSpawn",
          "TStairs",
          "Tunnels",
          "Connector",
          "Water",
          "Construction",
          "BombsiteB"
        ],
        "playerRoundSupport": 12,
        "roundSupport": 11,
        "demoSupport": 4,
        "teamRoundSupport": 11
      },
      {
        "callouts": [
          "TSpawn",
          "TStairs",
          "Tunnels",
          "Fountain",
          "LowerPark",
          "Connector",
          "Water",
          "Construction",
          "BombsiteB"
        ],
        "playerRoundSupport": 5,
        "roundSupport": 4,
        "demoSupport": 3,
        "teamRoundSupport": 4
      },
      {
        "callouts": [
          "TSpawn",
          "TStairs",
          "Alley",
          "Canal",
          "Pipe",
          "Water",
          "Construction",
          "BombsiteB"
        ],
        "playerRoundSupport": 5,
        "roundSupport": 4,
        "demoSupport": 2,
        "teamRoundSupport": 4
      },
      {
        "callouts": [
          "TSpawn",
          "TStairs",
          "Tunnels",
          "Fountain",
          "UpperPark",
          "Restroom",
          "LowerPark",
          "Connector",
          "Water",
          "Construction",
          "BombsiteB"
        ],
        "playerRoundSupport": 5,
        "roundSupport": 4,
        "demoSupport": 3,
        "teamRoundSupport": 4
      },
      {
        "callouts": [
          "TSpawn",
          "TStairs",
          "Tunnels",
          "Fountain",
          "UpperPark",
          "LowerPark",
          "Connector",
          "Water",
          "Construction",
          "BombsiteB"
        ],
        "playerRoundSupport": 3,
        "roundSupport": 3,
        "demoSupport": 2,
        "teamRoundSupport": 3
      }
    ],
    "confidence": "observed-complete-path-cluster"
  }
]
```
