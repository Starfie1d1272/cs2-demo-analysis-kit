# Observed Route Graph Review

扫描 ZIP：110
路径限制：maxHops=8，minEdgeCount=3，minTShare=20.0%，topK=20
统计窗口：每回合 freezeEndTick 至 endTick；只统计存活玩家的 replay place。
去抖口径：连续 callout 合并为 visit；少于 2 帧的 visit 丢弃；死亡或缺失 callout 截断序列。

> 本报告只证明 demo 中出现过的相邻转换。未出现的边不代表不可达；本版不使用 nav/tri/callout-grid 补边。

## 人工审查顺序

1. 先检查高频边是否符合地图方向，特别留意跨层 callout 或死亡附近的假转换。
2. 再检查 A/B 候选是否构成有意义的 corridor，而非回防、转点或刻意绕路。
3. 对照人工路线的缺失边；缺失可能来自样本不足、callout 跨区跳跃或旧资产错误。
4. JSON 块只是候选摘录，人工确认前不要写入 runtime 资产。

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

### A 包候选路径

| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |
|---:|---|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 匪口 → MainHall / A厅 → BombsiteA / A包 | 660 | 2851 | 91.0% | 9.863 |
| 2 | TSpawn / 匪家 → Tunnel / 隧道 → Water / 水路 → Ruins / B外 → TSideLower / B小 → TSideUpper / 跳台 → Middle / 中路 → SideHall / 甜甜圈 → BombsiteA / A包 | 169 | 7292 | 31.0% | 8.324 |
| 3 | TSpawn / 匪家 → Outside / 匪口 → Middle / 中路 → SideHall / 甜甜圈 → BombsiteA / A包 | 169 | 2497 | 31.0% | 7.222 |

### B 包候选路径

| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |
|---:|---|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Tunnel / 隧道 → Water / 水路 → Ruins / B外 → TSideLower / B小 → Ramp / B坡 → BombsiteB / B包 | 627 | 7853 | 84.6% | 10.378 |
| 2 | TSpawn / 匪家 → Tunnel / 隧道 → Water / 水路 → Ruins / B外 → TSideLower / B小 → TSideUpper / 跳台 → SideEntrance / 黑屋 → BombsiteB / B包 | 211 | 7330 | 32.0% | 9.122 |
| 3 | TSpawn / 匪家 → Outside / 匪口 → Middle / 中路 → TSideUpper / 跳台 → TSideLower / B小 → Ramp / B坡 → BombsiteB / B包 | 207 | 4417 | 43.8% | 8.347 |
| 4 | TSpawn / 匪家 → Outside / 匪口 → Middle / 中路 → TSideUpper / 跳台 → SideEntrance / 黑屋 → BombsiteB / B包 | 207 | 2956 | 32.0% | 7.316 |

### 与现有人工路线对照

| 人工路线 | observed 边覆盖 | 缺失边 |
|---|---:|---|
| a_main / A厅进攻 | 3/3 | — |
| a_donut / 中路甜甜圈夹A | 4/4 | — |
| a_rotate_b_to_a / B区跳台转A | 8/8 | — |
| a_ct_invade / 入侵警家 | 6/6 | — |
| b_ramp / B坡进攻 | 5/5 | — |
| b_jump_side / 跳台控黑屋 | 5/5 | — |
| b_vip_lurk / VIP入侵B | 6/6 | — |
| b_jump_to_ramp / 黑屋夹B | 5/6 | TSideLower → SideEntrance |

### Corridor 候选 JSON

```json
[
  {
    "id": "candidate_a_01",
    "target": "a",
    "callouts": [
      "TSpawn",
      "Outside",
      "MainHall",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 660
  },
  {
    "id": "candidate_a_02",
    "target": "a",
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
    "confidence": "observed",
    "bottleneckCount": 169
  },
  {
    "id": "candidate_a_03",
    "target": "a",
    "callouts": [
      "TSpawn",
      "Outside",
      "Middle",
      "SideHall",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 169
  },
  {
    "id": "candidate_b_01",
    "target": "b",
    "callouts": [
      "TSpawn",
      "Tunnel",
      "Water",
      "Ruins",
      "TSideLower",
      "Ramp",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 627
  },
  {
    "id": "candidate_b_02",
    "target": "b",
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
    "confidence": "observed",
    "bottleneckCount": 211
  },
  {
    "id": "candidate_b_03",
    "target": "b",
    "callouts": [
      "TSpawn",
      "Outside",
      "Middle",
      "TSideUpper",
      "TSideLower",
      "Ramp",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 207
  },
  {
    "id": "candidate_b_04",
    "target": "b",
    "callouts": [
      "TSpawn",
      "Outside",
      "Middle",
      "TSideUpper",
      "SideEntrance",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 207
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

### A 包候选路径

| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |
|---:|---|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Street / 街道 → TStairs / 匪梯 → Canal / 水下 → Main / A厅 → BombsiteA / A包 | 63 | 862 | 42.9% | 6.927 |
| 2 | TSpawn / 匪家 → Street / 街道 → TSideUpper / 匪跳 → Canal / 水下 → Main / A厅 → BombsiteA / A包 | 63 | 696 | 42.9% | 6.609 |
| 3 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → Street / 街道 → TStairs / 匪梯 → Canal / 水下 → Main / A厅 → BombsiteA / A包 | 56 | 1152 | 42.9% | 6.950 |
| 4 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → Street / 街道 → TSideUpper / 匪跳 → Canal / 水下 → Main / A厅 → BombsiteA / A包 | 56 | 986 | 42.9% | 6.723 |
| 5 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → Street / 街道 → TStairs / 匪梯 → Canal / 水下 → Main / A厅 → Fountain / 喷泉 → BombsiteA / A包 | 16 | 1152 | 41.0% | 6.542 |
| 6 | TSpawn / 匪家 → Street / 街道 → TStairs / 匪梯 → Canal / 水下 → Main / A厅 → Fountain / 喷泉 → BombsiteA / A包 | 16 | 862 | 41.0% | 6.387 |
| 7 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → Street / 街道 → TSideUpper / 匪跳 → Canal / 水下 → Main / A厅 → Fountain / 喷泉 → BombsiteA / A包 | 16 | 986 | 41.0% | 6.343 |
| 8 | TSpawn / 匪家 → Street / 街道 → TSideUpper / 匪跳 → Canal / 水下 → Main / A厅 → Fountain / 喷泉 → BombsiteA / A包 | 16 | 696 | 41.0% | 6.121 |
| 9 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → MidDoors / 中门 → Canal / 水下 → Main / A厅 → BombsiteA / A包 | 12 | 798 | 34.3% | 5.835 |
| 10 | TSpawn / 匪家 → Street / 街道 → Bridge / 中桥 → MidDoors / 中门 → Canal / 水下 → Main / A厅 → BombsiteA / A包 | 12 | 641 | 34.3% | 5.552 |
| 11 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → MidDoors / 中门 → Canal / 水下 → Main / A厅 → Fountain / 喷泉 → BombsiteA / A包 | 12 | 798 | 34.3% | 5.528 |
| 12 | TSpawn / 匪家 → Street / 街道 → Bridge / 中桥 → MidDoors / 中门 → Canal / 水下 → Main / A厅 → Fountain / 喷泉 → BombsiteA / A包 | 12 | 641 | 34.3% | 5.285 |

### B 包候选路径

| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |
|---:|---|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Ruins / B外 → OutsideLong / B外 → BombsiteB / B包 | 134 | 617 | 86.5% | 7.653 |
| 2 | TSpawn / 匪家 → Street / 街道 → Bridge / 中桥 → Ruins / B外 → OutsideLong / B外 → BombsiteB / B包 | 77 | 751 | 86.5% | 7.083 |
| 3 | TSpawn / 匪家 → Street / 街道 → TStairs / 匪梯 → Canal / 水下 → Connector / 黑屋 → BombsiteB / B包 | 69 | 789 | 33.0% | 6.503 |
| 4 | TSpawn / 匪家 → Street / 街道 → TSideUpper / 匪跳 → Canal / 水下 → Connector / 黑屋 → BombsiteB / B包 | 69 | 623 | 33.0% | 6.184 |
| 5 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → Street / 街道 → TStairs / 匪梯 → Canal / 水下 → Connector / 黑屋 → BombsiteB / B包 | 56 | 1079 | 33.0% | 6.647 |
| 6 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → Street / 街道 → TSideUpper / 匪跳 → Canal / 水下 → Connector / 黑屋 → BombsiteB / B包 | 56 | 913 | 33.0% | 6.419 |
| 7 | TSpawn / 匪家 → Ruins / B外 → Bridge / 中桥 → MidDoors / 中门 → Canal / 水下 → Connector / 黑屋 → BombsiteB / B包 | 12 | 725 | 33.0% | 5.481 |
| 8 | TSpawn / 匪家 → Street / 街道 → Bridge / 中桥 → MidDoors / 中门 → Canal / 水下 → Connector / 黑屋 → BombsiteB / B包 | 12 | 568 | 33.0% | 5.198 |

### 与现有人工路线对照

| 人工路线 | observed 边覆盖 | 缺失边 |
|---|---:|---|
| a_main / 水下A厅 | 5/5 | — |
| a_mid_walkway / 中路A连 | 6/6 | — |
| b_outside / B外进攻 | 3/3 | — |
| b_connector / 水下黑屋夹B | 5/5 | — |
| route_1780686289028 / 匪跳控 A | 5/5 | — |
| route_1780686325710 / B 连夹 B | 5/6 | TSpawn → Bridge |
| route_1780686369208 / 警家夹 B | 7/8 | TSpawn → Bridge |

### Corridor 候选 JSON

```json
[
  {
    "id": "candidate_a_01",
    "target": "a",
    "callouts": [
      "TSpawn",
      "Street",
      "TStairs",
      "Canal",
      "Main",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 63
  },
  {
    "id": "candidate_a_02",
    "target": "a",
    "callouts": [
      "TSpawn",
      "Street",
      "TSideUpper",
      "Canal",
      "Main",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 63
  },
  {
    "id": "candidate_a_03",
    "target": "a",
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
    "confidence": "observed",
    "bottleneckCount": 56
  },
  {
    "id": "candidate_a_04",
    "target": "a",
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
    "confidence": "observed",
    "bottleneckCount": 56
  },
  {
    "id": "candidate_a_05",
    "target": "a",
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
    "confidence": "observed",
    "bottleneckCount": 16
  },
  {
    "id": "candidate_b_01",
    "target": "b",
    "callouts": [
      "TSpawn",
      "Ruins",
      "OutsideLong",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 134
  },
  {
    "id": "candidate_b_02",
    "target": "b",
    "callouts": [
      "TSpawn",
      "Street",
      "Bridge",
      "Ruins",
      "OutsideLong",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 77
  },
  {
    "id": "candidate_b_03",
    "target": "b",
    "callouts": [
      "TSpawn",
      "Street",
      "TStairs",
      "Canal",
      "Connector",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 69
  },
  {
    "id": "candidate_b_04",
    "target": "b",
    "callouts": [
      "TSpawn",
      "Street",
      "TSideUpper",
      "Canal",
      "Connector",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 69
  },
  {
    "id": "candidate_b_05",
    "target": "b",
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
    "confidence": "observed",
    "bottleneckCount": 56
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

### A 包候选路径

| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |
|---:|---|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → TopofMid / 中远匪口 → OutsideLong / A门外 → LongDoors / A门 → LongA / A大 → ARamp / A斜坡 → BombsiteA / A包 | 311 | 5007 | 31.1% | 8.089 |
| 2 | TSpawn / 匪家 → OutsideLong / A门外 → LongDoors / A门 → LongA / A大 → ARamp / A斜坡 → BombsiteA / A包 | 311 | 2741 | 31.1% | 7.327 |
| 3 | TSpawn / 匪家 → TopofMid / 中远匪口 → Middle / 中路 → Catwalk / A小 → ShortStairs / A小楼梯 → ExtendedA / A小过点 → BombsiteA / A包 | 308 | 4524 | 46.9% | 8.132 |
| 4 | TSpawn / 匪家 → OutsideLong / A门外 → TopofMid / 中远匪口 → Middle / 中路 → Catwalk / A小 → ShortStairs / A小楼梯 → ExtendedA / A小过点 → BombsiteA / A包 | 308 | 4542 | 46.9% | 8.113 |
| 5 | TSpawn / 匪家 → OutsideLong / A门外 → TopofMid / 中远匪口 → Catwalk / A小 → ShortStairs / A小楼梯 → ExtendedA / A小过点 → BombsiteA / A包 | 308 | 3720 | 46.9% | 7.956 |
| 6 | TSpawn / 匪家 → TopofMid / 中远匪口 → Catwalk / A小 → ShortStairs / A小楼梯 → ExtendedA / A小过点 → BombsiteA / A包 | 308 | 3702 | 46.9% | 7.948 |
| 7 | TSpawn / 匪家 → TopofMid / 中远匪口 → OutsideLong / A门外 → LongDoors / A门 → Pit / 大坑 → LongA / A大 → ARamp / A斜坡 → BombsiteA / A包 | 88 | 4629 | 31.1% | 7.069 |
| 8 | TSpawn / 匪家 → OutsideLong / A门外 → LongDoors / A门 → Pit / 大坑 → LongA / A大 → ARamp / A斜坡 → BombsiteA / A包 | 88 | 2363 | 31.1% | 6.265 |
| 9 | TSpawn / 匪家 → TopofMid / 中远匪口 → OutsideLong / A门外 → LongDoors / A门 → LongA / A大 → BombsiteA / A包 | 9 | 4387 | 68.8% | 8.338 |
| 10 | TSpawn / 匪家 → OutsideLong / A门外 → LongDoors / A门 → LongA / A大 → BombsiteA / A包 | 9 | 2121 | 68.8% | 7.449 |
| 11 | TSpawn / 匪家 → TopofMid / 中远匪口 → OutsideLong / A门外 → LongDoors / A门 → Pit / 大坑 → LongA / A大 → BombsiteA / A包 | 9 | 4009 | 31.7% | 7.107 |
| 12 | TSpawn / 匪家 → OutsideLong / A门外 → LongDoors / A门 → Pit / 大坑 → LongA / A大 → BombsiteA / A包 | 9 | 1743 | 31.7% | 6.150 |
| 13 | TSpawn / 匪家 → OutsideLong / A门外 → TopofMid / 中远匪口 → Middle / 中路 → MidDoors / 中门 → Catwalk / A小 → ShortStairs / A小楼梯 → ExtendedA / A小过点 → BombsiteA / A包 | 4 | 4468 | 46.9% | 7.267 |
| 14 | TSpawn / 匪家 → TopofMid / 中远匪口 → Middle / 中路 → MidDoors / 中门 → Catwalk / A小 → ShortStairs / A小楼梯 → ExtendedA / A小过点 → BombsiteA / A包 | 4 | 4450 | 46.9% | 7.162 |

### B 包候选路径

| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |
|---:|---|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → OutsideTunnel / B洞外 → UpperTunnel / B洞 → BombsiteB / B包 | 567 | 2821 | 85.6% | 9.877 |
| 2 | TSpawn / 匪家 → TopofMid / 中远匪口 → Middle / 中路 → LowerTunnel / B1 → TunnelStairs / B洞楼梯 → UpperTunnel / B洞 → BombsiteB / B包 | 395 | 3857 | 63.1% | 8.395 |
| 3 | TSpawn / 匪家 → OutsideLong / A门外 → TopofMid / 中远匪口 → Middle / 中路 → LowerTunnel / B1 → TunnelStairs / B洞楼梯 → UpperTunnel / B洞 → BombsiteB / B包 | 395 | 3875 | 63.1% | 8.339 |
| 4 | TSpawn / 匪家 → TopofMid / 中远匪口 → Catwalk / A小 → Middle / 中路 → LowerTunnel / B1 → TunnelStairs / B洞楼梯 → UpperTunnel / B洞 → BombsiteB / B包 | 278 | 3960 | 63.1% | 8.063 |
| 5 | TSpawn / 匪家 → OutsideLong / A门外 → TopofMid / 中远匪口 → Catwalk / A小 → Middle / 中路 → LowerTunnel / B1 → TunnelStairs / B洞楼梯 → UpperTunnel / B洞 → BombsiteB / B包 | 278 | 3978 | 63.1% | 8.055 |
| 6 | TSpawn / 匪家 → TopofMid / 中远匪口 → Catwalk / A小 → MidDoors / 中门 → Middle / 中路 → LowerTunnel / B1 → TunnelStairs / B洞楼梯 → UpperTunnel / B洞 → BombsiteB / B包 | 35 | 3946 | 32.6% | 7.240 |
| 7 | TSpawn / 匪家 → TRamp / 后花 → OutsideTunnel / B洞外 → UpperTunnel / B洞 → BombsiteB / B包 | 30 | 1788 | 75.0% | 7.030 |

### 与现有人工路线对照

| 人工路线 | observed 边覆盖 | 缺失边 |
|---|---:|---|
| a_long / A大 | 5/5 | — |
| a_short / A小 | 6/6 | — |
| b_tunnels / B洞 | 4/4 | — |
| b_mid_lower / 中路夹B | 5/5 | — |
| route_1780679582506 / B1夹B | 9/9 | — |

### Corridor 候选 JSON

```json
[
  {
    "id": "candidate_a_01",
    "target": "a",
    "callouts": [
      "TSpawn",
      "TopofMid",
      "OutsideLong",
      "LongDoors",
      "LongA",
      "ARamp",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 311
  },
  {
    "id": "candidate_a_02",
    "target": "a",
    "callouts": [
      "TSpawn",
      "OutsideLong",
      "LongDoors",
      "LongA",
      "ARamp",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 311
  },
  {
    "id": "candidate_a_03",
    "target": "a",
    "callouts": [
      "TSpawn",
      "TopofMid",
      "Middle",
      "Catwalk",
      "ShortStairs",
      "ExtendedA",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 308
  },
  {
    "id": "candidate_a_04",
    "target": "a",
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
    "confidence": "observed",
    "bottleneckCount": 308
  },
  {
    "id": "candidate_a_05",
    "target": "a",
    "callouts": [
      "TSpawn",
      "OutsideLong",
      "TopofMid",
      "Catwalk",
      "ShortStairs",
      "ExtendedA",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 308
  },
  {
    "id": "candidate_b_01",
    "target": "b",
    "callouts": [
      "TSpawn",
      "OutsideTunnel",
      "UpperTunnel",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 567
  },
  {
    "id": "candidate_b_02",
    "target": "b",
    "callouts": [
      "TSpawn",
      "TopofMid",
      "Middle",
      "LowerTunnel",
      "TunnelStairs",
      "UpperTunnel",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 395
  },
  {
    "id": "candidate_b_03",
    "target": "b",
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
    "confidence": "observed",
    "bottleneckCount": 395
  },
  {
    "id": "candidate_b_04",
    "target": "b",
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
    "confidence": "observed",
    "bottleneckCount": 278
  },
  {
    "id": "candidate_b_05",
    "target": "b",
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
    "confidence": "observed",
    "bottleneckCount": 278
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

### A 包候选路径

| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |
|---:|---|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → TopofMid / 中路 → BombsiteA / A包 | 217 | 5456 | 50.6% | 9.451 |
| 2 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Middle / 中路 → TopofMid / 中路 → BombsiteA / A包 | 217 | 3492 | 50.6% | 8.700 |
| 3 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → SecondMid / 侧道 → BackAlley / 匪二楼 → Apartments / 二楼 → TopofMid / 中路 → BombsiteA / A包 | 131 | 5706 | 47.8% | 8.299 |
| 4 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → SecondMid / 侧道 → Balcony / 阳台 → Apartments / 二楼 → TopofMid / 中路 → BombsiteA / A包 | 131 | 5598 | 47.8% | 7.909 |
| 5 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → BackAlley / 匪二楼 → Apartments / 二楼 → TopofMid / 中路 → BombsiteA / A包 | 131 | 3157 | 47.8% | 7.800 |
| 6 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Balcony / 阳台 → Apartments / 二楼 → TopofMid / 中路 → BombsiteA / A包 | 131 | 3049 | 47.8% | 7.280 |
| 7 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → TopofMid / 中路 → Arch / 拱门 → BombsiteA / A包 | 106 | 5532 | 26.3% | 8.267 |
| 8 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Middle / 中路 → TopofMid / 中路 → Arch / 拱门 → BombsiteA / A包 | 106 | 3568 | 26.3% | 7.641 |
| 9 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → BackAlley / 匪二楼 → Apartments / 二楼 → TopofMid / 中路 → Arch / 拱门 → BombsiteA / A包 | 106 | 3233 | 26.3% | 7.021 |
| 10 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Balcony / 阳台 → Apartments / 二楼 → TopofMid / 中路 → Arch / 拱门 → BombsiteA / A包 | 106 | 3125 | 26.3% | 6.575 |
| 11 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → TopofMid / 中路 → Quad / 马棚 → BombsiteA / A包 | 94 | 5432 | 50.3% | 8.599 |
| 12 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Middle / 中路 → TopofMid / 中路 → Quad / 马棚 → BombsiteA / A包 | 94 | 3468 | 50.3% | 7.973 |
| 13 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → BackAlley / 匪二楼 → Apartments / 二楼 → TopofMid / 中路 → Quad / 马棚 → BombsiteA / A包 | 94 | 3133 | 47.8% | 7.306 |
| 14 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Balcony / 阳台 → Apartments / 二楼 → TopofMid / 中路 → Quad / 马棚 → BombsiteA / A包 | 94 | 3025 | 47.8% | 6.859 |
| 15 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → SecondMid / 侧道 → Apartments / 二楼 → TopofMid / 中路 → BombsiteA / A包 | 87 | 5288 | 47.8% | 8.143 |
| 16 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → SecondMid / 侧道 → Apartments / 二楼 → TopofMid / 中路 → Quad / 马棚 → BombsiteA / A包 | 87 | 5264 | 47.8% | 7.667 |
| 17 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Apartments / 二楼 → TopofMid / 中路 → BombsiteA / A包 | 87 | 2739 | 47.8% | 7.481 |
| 18 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Apartments / 二楼 → TopofMid / 中路 → Quad / 马棚 → BombsiteA / A包 | 87 | 2715 | 47.8% | 6.957 |
| 19 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → SecondMid / 侧道 → Apartments / 二楼 → TopofMid / 中路 → Arch / 拱门 → BombsiteA / A包 | 87 | 5364 | 26.3% | 7.418 |
| 20 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Apartments / 二楼 → TopofMid / 中路 → Arch / 拱门 → BombsiteA / A包 | 87 | 2815 | 26.3% | 6.625 |

### B 包候选路径

| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |
|---:|---|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 529 | 6381 | 48.9% | 9.871 |
| 2 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 370 | 4417 | 48.9% | 9.120 |
| 3 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → BackAlley / 匪二楼 → Apartments / 二楼 → TopofMid / 中路 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 123 | 4806 | 43.2% | 7.787 |
| 4 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Balcony / 阳台 → Apartments / 二楼 → TopofMid / 中路 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 123 | 4698 | 43.2% | 7.397 |
| 5 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Apartments / 二楼 → TopofMid / 中路 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 87 | 4388 | 43.2% | 7.558 |
| 6 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Underpass / 下水道 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 77 | 4336 | 48.9% | 8.564 |
| 7 | TSpawn / 匪家 → LowerMid / 匪口 → TRamp / 匪口 → Banana / 香蕉道 → BombsiteB / B包 | 38 | 3705 | 48.9% | 8.433 |
| 8 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Middle / 中路 → TRamp / 匪口 → Banana / 香蕉道 → BombsiteB / B包 | 38 | 3686 | 48.9% | 8.258 |
| 9 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Underpass / 下水道 → Middle / 中路 → TRamp / 匪口 → Banana / 香蕉道 → BombsiteB / B包 | 38 | 3605 | 48.9% | 7.905 |
| 10 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Apartments / 二楼 → TopofMid / 中路 → Middle / 中路 → TRamp / 匪口 → Banana / 香蕉道 → BombsiteB / B包 | 38 | 3657 | 43.2% | 7.106 |
| 11 | TSpawn / 匪家 → LowerMid / 匪口 → Upstairs / 匪二楼 → Bridge / 匪桥 → Apartments / 二楼 → TopofMid / 中路 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 33 | 3997 | 43.2% | 6.945 |
| 12 | TSpawn / 匪家 → LowerMid / 匪口 → Upstairs / 匪二楼 → Bridge / 匪桥 → Apartments / 二楼 → SecondMid / 侧道 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 29 | 4142 | 48.9% | 7.491 |
| 13 | TSpawn / 匪家 → LowerMid / 匪口 → Upstairs / 匪二楼 → Bridge / 匪桥 → SecondMid / 侧道 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 26 | 4106 | 48.9% | 7.778 |
| 14 | TSpawn / 匪家 → LowerMid / 匪口 → Upstairs / 匪二楼 → Bridge / 匪桥 → SecondMid / 侧道 → Underpass / 下水道 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 26 | 4025 | 48.9% | 7.529 |
| 15 | TSpawn / 匪家 → LowerMid / 匪口 → Upstairs / 匪二楼 → Bridge / 匪桥 → SecondMid / 侧道 → Middle / 中路 → TRamp / 匪口 → Banana / 香蕉道 → BombsiteB / B包 | 26 | 3375 | 48.9% | 7.299 |
| 16 | TSpawn / 匪家 → LowerMid / 匪口 → Upstairs / 匪二楼 → Kitchen / 厨房 → Deck / 匪二阳台 → SecondMid / 侧道 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 15 | 4063 | 48.9% | 7.154 |
| 17 | TSpawn / 匪家 → LowerMid / 匪口 → Upstairs / 匪二楼 → Kitchen / 厨房 → Deck / 匪二阳台 → Underpass / 下水道 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 8 | 3898 | 48.9% | 6.973 |
| 18 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → BackAlley / 匪二楼 → Apartments / 二楼 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 7 | 4559 | 48.9% | 7.984 |
| 19 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → Apartments / 二楼 → Middle / 中路 → Banana / 香蕉道 → BombsiteB / B包 | 7 | 4141 | 48.9% | 7.750 |
| 20 | TSpawn / 匪家 → LowerMid / 匪口 → SecondMid / 侧道 → BackAlley / 匪二楼 → Apartments / 二楼 → Middle / 中路 → TRamp / 匪口 → Banana / 香蕉道 → BombsiteB / B包 | 7 | 3828 | 48.9% | 7.480 |

### 与现有人工路线对照

| 人工路线 | observed 边覆盖 | 缺失边 |
|---|---:|---|
| a_mid / 中路A1强攻 | 4/6 | TSpawn → TRamp；LowerMid → Middle |
| a_arch / 中路链接夹A | 4/6 | TSpawn → TRamp；LowerMid → Middle |
| b_banana / B点正面 | 2/4 | TSpawn → TRamp；LowerMid → Banana |
| route_1780681085281 / 侧道A1强攻 | 2/4 | TSpawn → SecondMid；SecondMid → TopofMid |
| route_1780681126248 / 匪2二楼控制 | 4/7 | TSpawn → TRamp；TRamp → Bridge；Upstairs → BackAlley |
| route_1780681170948 / 侧道二楼控制 | 3/4 | TSpawn → SecondMid |
| route_1780681203714 / 中路警家夹B | 6/8 | TSpawn → TRamp；LowerMid → Middle |

### Corridor 候选 JSON

```json
[
  {
    "id": "candidate_a_01",
    "target": "a",
    "callouts": [
      "TSpawn",
      "LowerMid",
      "TRamp",
      "Middle",
      "TopofMid",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 217
  },
  {
    "id": "candidate_a_02",
    "target": "a",
    "callouts": [
      "TSpawn",
      "LowerMid",
      "SecondMid",
      "Middle",
      "TopofMid",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 217
  },
  {
    "id": "candidate_a_03",
    "target": "a",
    "callouts": [
      "TSpawn",
      "LowerMid",
      "TRamp",
      "Middle",
      "SecondMid",
      "BackAlley",
      "Apartments",
      "TopofMid",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 131
  },
  {
    "id": "candidate_a_04",
    "target": "a",
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
    "confidence": "observed",
    "bottleneckCount": 131
  },
  {
    "id": "candidate_a_05",
    "target": "a",
    "callouts": [
      "TSpawn",
      "LowerMid",
      "SecondMid",
      "BackAlley",
      "Apartments",
      "TopofMid",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 131
  },
  {
    "id": "candidate_b_01",
    "target": "b",
    "callouts": [
      "TSpawn",
      "LowerMid",
      "TRamp",
      "Middle",
      "Banana",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 529
  },
  {
    "id": "candidate_b_02",
    "target": "b",
    "callouts": [
      "TSpawn",
      "LowerMid",
      "SecondMid",
      "Middle",
      "Banana",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 370
  },
  {
    "id": "candidate_b_03",
    "target": "b",
    "callouts": [
      "TSpawn",
      "LowerMid",
      "SecondMid",
      "BackAlley",
      "Apartments",
      "TopofMid",
      "Middle",
      "Banana",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 123
  },
  {
    "id": "candidate_b_04",
    "target": "b",
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
    "confidence": "observed",
    "bottleneckCount": 123
  },
  {
    "id": "candidate_b_05",
    "target": "b",
    "callouts": [
      "TSpawn",
      "LowerMid",
      "SecondMid",
      "Apartments",
      "TopofMid",
      "Middle",
      "Banana",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 87
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

### A 包候选路径

| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |
|---:|---|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → PalaceAlley / A1 → TRamp / A1 → PalaceInterior / A二楼 → BombsiteA / A包 | 499 | 2412 | 78.0% | 8.955 |
| 2 | TSpawn / 匪家 → PalaceInterior / A二楼 → BombsiteA / A包 | 320 | 819 | 78.0% | 8.176 |
| 3 | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Middle / 中路 → Connector / 拱门 → BombsiteA / A包 | 264 | 4037 | 34.5% | 8.206 |
| 4 | TSpawn / 匪家 → SideAlley / 匪口 → House / 匪二楼 → BackAlley / B二楼 → Underpass / 下水道 → Middle / 中路 → Connector / 拱门 → BombsiteA / A包 | 233 | 4729 | 34.5% | 8.071 |
| 5 | TSpawn / 匪家 → PalaceAlley / A1 → TRamp / A1 → PalaceInterior / A二楼 → Scaffolding / A2上下 → BombsiteA / A包 | 116 | 2181 | 63.1% | 7.815 |
| 6 | TSpawn / 匪家 → PalaceInterior / A二楼 → Scaffolding / A2上下 → BombsiteA / A包 | 116 | 588 | 63.1% | 6.535 |
| 7 | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Catwalk / B小 → Middle / 中路 → Connector / 拱门 → BombsiteA / A包 | 112 | 3996 | 34.5% | 7.463 |
| 8 | TSpawn / 匪家 → SideAlley / 匪口 → House / 匪二楼 → BackAlley / B二楼 → Apartments / B二楼 → Underpass / 下水道 → Middle / 中路 → Connector / 拱门 → BombsiteA / A包 | 20 | 5051 | 34.5% | 7.660 |
| 9 | TSpawn / 匪家 → PalaceAlley / A1 → PalaceInterior / A二楼 → BombsiteA / A包 | 11 | 1230 | 78.0% | 7.064 |
| 10 | TSpawn / 匪家 → PalaceAlley / A1 → PalaceInterior / A二楼 → Scaffolding / A2上下 → BombsiteA / A包 | 11 | 999 | 63.1% | 6.112 |

### B 包候选路径

| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |
|---:|---|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → SideAlley / 匪口 → House / 匪二楼 → BackAlley / B二楼 → Apartments / B二楼 → BombsiteB / B包 | 240 | 4407 | 70.8% | 9.407 |
| 2 | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Catwalk / B小 → BombsiteB / B包 | 134 | 3387 | 38.3% | 8.451 |
| 3 | TSpawn / 匪家 → SideAlley / 匪口 → House / 匪二楼 → BackAlley / B二楼 → Underpass / 下水道 → Middle / 中路 → TopofMid / 中远/匪口 → Catwalk / B小 → BombsiteB / B包 | 134 | 4673 | 38.3% | 7.962 |
| 4 | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Middle / 中路 → Catwalk / B小 → BombsiteB / B包 | 94 | 3634 | 38.3% | 7.925 |
| 5 | TSpawn / 匪家 → SideAlley / 匪口 → House / 匪二楼 → BackAlley / B二楼 → Underpass / 下水道 → Middle / 中路 → Catwalk / B小 → BombsiteB / B包 | 94 | 4326 | 38.3% | 7.870 |
| 6 | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Middle / 中路 → Underpass / 下水道 → BackAlley / B二楼 → Apartments / B二楼 → BombsiteB / B包 | 80 | 4464 | 41.7% | 8.044 |
| 7 | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Catwalk / B小 → Middle / 中路 → Underpass / 下水道 → BackAlley / B二楼 → Apartments / B二楼 → BombsiteB / B包 | 80 | 4423 | 41.7% | 7.507 |
| 8 | TSpawn / 匪家 → SideAlley / 匪口 → House / 匪二楼 → BackAlley / B二楼 → Underpass / 下水道 → Apartments / B二楼 → BombsiteB / B包 | 20 | 4125 | 70.8% | 8.306 |
| 9 | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Middle / 中路 → Underpass / 下水道 → Apartments / B二楼 → BombsiteB / B包 | 20 | 3746 | 41.7% | 7.492 |
| 10 | TSpawn / 匪家 → SideAlley / 匪口 → TopofMid / 中远/匪口 → Catwalk / B小 → Middle / 中路 → Underpass / 下水道 → Apartments / B二楼 → BombsiteB / B包 | 20 | 3705 | 41.7% | 6.957 |
| 11 | TSpawn / 匪家 → SideAlley / 匪口 → House / 匪二楼 → BackAlley / B二楼 → Apartments / B二楼 → Underpass / 下水道 → Middle / 中路 → Catwalk / B小 → BombsiteB / B包 | 20 | 4648 | 38.3% | 7.484 |

### 与现有人工路线对照

| 人工路线 | observed 边覆盖 | 缺失边 |
|---|---:|---|
| a_palace / A二楼 | 3/3 | — |
| a_mid_connector / 中路拱门 | 6/6 | — |
| a_underpass_wrap / 下水道控中夹A | 5/6 | TSpawn → House |
| a_scaffold / A1 | 2/3 | TRamp → BombsiteA |
| b_apartments / B二楼 | 3/4 | TSpawn → House |
| b_catwalk / B小 | 4/4 | — |

### Corridor 候选 JSON

```json
[
  {
    "id": "candidate_a_01",
    "target": "a",
    "callouts": [
      "TSpawn",
      "PalaceAlley",
      "TRamp",
      "PalaceInterior",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 499
  },
  {
    "id": "candidate_a_02",
    "target": "a",
    "callouts": [
      "TSpawn",
      "PalaceInterior",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 320
  },
  {
    "id": "candidate_a_03",
    "target": "a",
    "callouts": [
      "TSpawn",
      "SideAlley",
      "TopofMid",
      "Middle",
      "Connector",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 264
  },
  {
    "id": "candidate_a_04",
    "target": "a",
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
    "confidence": "observed",
    "bottleneckCount": 233
  },
  {
    "id": "candidate_a_05",
    "target": "a",
    "callouts": [
      "TSpawn",
      "PalaceAlley",
      "TRamp",
      "PalaceInterior",
      "Scaffolding",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 116
  },
  {
    "id": "candidate_b_01",
    "target": "b",
    "callouts": [
      "TSpawn",
      "SideAlley",
      "House",
      "BackAlley",
      "Apartments",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 240
  },
  {
    "id": "candidate_b_02",
    "target": "b",
    "callouts": [
      "TSpawn",
      "SideAlley",
      "TopofMid",
      "Catwalk",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 134
  },
  {
    "id": "candidate_b_03",
    "target": "b",
    "callouts": [
      "TSpawn",
      "SideAlley",
      "House",
      "BackAlley",
      "Underpass",
      "Middle",
      "TopofMid",
      "Catwalk",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 134
  },
  {
    "id": "candidate_b_04",
    "target": "b",
    "callouts": [
      "TSpawn",
      "SideAlley",
      "TopofMid",
      "Middle",
      "Catwalk",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 94
  },
  {
    "id": "candidate_b_05",
    "target": "b",
    "callouts": [
      "TSpawn",
      "SideAlley",
      "House",
      "BackAlley",
      "Underpass",
      "Middle",
      "Catwalk",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 94
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

### A 包候选路径

| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |
|---:|---|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 外场 → Lobby / 匪厅 → Squeaky / 铁门房 → BombsiteA / A包 | 178 | 2544 | 79.8% | 8.835 |
| 2 | TSpawn / 匪家 → Outside / 外场 → Lobby / 匪厅 → Hut / 黄房 → BombsiteA / A包 | 154 | 2430 | 70.3% | 8.466 |
| 3 | TSpawn / 匪家 → Outside / 外场 → Roof / 屋顶 → Lobby / 匪厅 → Squeaky / 铁门房 → BombsiteA / A包 | 84 | 2119 | 79.8% | 8.061 |
| 4 | TSpawn / 匪家 → Outside / 外场 → Roof / 屋顶 → Lobby / 匪厅 → Hut / 黄房 → BombsiteA / A包 | 84 | 2005 | 70.3% | 7.766 |
| 5 | TSpawn / 匪家 → Outside / 外场 → Mini / 正门 → BombsiteA / A包 | 70 | 1512 | 22.3% | 5.860 |
| 6 | TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → Vents / 管道 → BombsiteA / A包 | 25 | 1897 | 36.8% | 6.381 |

### B 包候选路径

| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |
|---:|---|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Outside / 外场 → Lobby / 匪厅 → Vending / 链接 → Trophy / 奖杯房 → Control / 链接 → Ramp / 铁板 → BombsiteB / B包 | 125 | 3443 | 39.1% | 7.726 |
| 2 | TSpawn / 匪家 → Outside / 外场 → Roof / 屋顶 → Lobby / 匪厅 → Vending / 链接 → Trophy / 奖杯房 → Control / 链接 → Ramp / 铁板 → BombsiteB / B包 | 84 | 3018 | 39.1% | 7.381 |
| 3 | TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → Decon / 死门 → BombsiteB / B包 | 83 | 2003 | 40.2% | 6.878 |
| 4 | TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → BombsiteB / B包 | 47 | 1875 | 60.3% | 7.450 |
| 5 | TSpawn / 匪家 → Outside / 外场 → Secret / K1 → Tunnels / K1地下 → Observation / 控制室 → BombsiteB / B包 | 45 | 1942 | 78.9% | 7.201 |

### 与现有人工路线对照

| 人工路线 | observed 边覆盖 | 缺失边 |
|---|---:|---|
| b_secret / K1下B | 4/4 | — |
| b_ramp / 铁板下B | 7/7 | — |

### Corridor 候选 JSON

```json
[
  {
    "id": "candidate_a_01",
    "target": "a",
    "callouts": [
      "TSpawn",
      "Outside",
      "Lobby",
      "Squeaky",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 178
  },
  {
    "id": "candidate_a_02",
    "target": "a",
    "callouts": [
      "TSpawn",
      "Outside",
      "Lobby",
      "Hut",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 154
  },
  {
    "id": "candidate_a_03",
    "target": "a",
    "callouts": [
      "TSpawn",
      "Outside",
      "Roof",
      "Lobby",
      "Squeaky",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 84
  },
  {
    "id": "candidate_a_04",
    "target": "a",
    "callouts": [
      "TSpawn",
      "Outside",
      "Roof",
      "Lobby",
      "Hut",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 84
  },
  {
    "id": "candidate_a_05",
    "target": "a",
    "callouts": [
      "TSpawn",
      "Outside",
      "Mini",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 70
  },
  {
    "id": "candidate_b_01",
    "target": "b",
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
    "confidence": "observed",
    "bottleneckCount": 125
  },
  {
    "id": "candidate_b_02",
    "target": "b",
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
    "confidence": "observed",
    "bottleneckCount": 84
  },
  {
    "id": "candidate_b_03",
    "target": "b",
    "callouts": [
      "TSpawn",
      "Outside",
      "Secret",
      "Tunnels",
      "Decon",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 83
  },
  {
    "id": "candidate_b_04",
    "target": "b",
    "callouts": [
      "TSpawn",
      "Outside",
      "Secret",
      "Tunnels",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 47
  },
  {
    "id": "candidate_b_05",
    "target": "b",
    "callouts": [
      "TSpawn",
      "Outside",
      "Secret",
      "Tunnels",
      "Observation",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 45
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

### A 包候选路径

| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |
|---:|---|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → LowerPark / A小厕所 → BombsiteA / A包 | 66 | 1274 | 37.3% | 7.248 |
| 2 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Connector / 下水道 → LowerPark / A小厕所 → BombsiteA / A包 | 66 | 1070 | 37.3% | 6.762 |
| 3 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → UpperPark / A大厕所 → BombsiteA / A包 | 61 | 1300 | 68.5% | 7.639 |
| 4 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → UpperPark / A大厕所 → LowerPark / A小厕所 → BombsiteA / A包 | 46 | 1351 | 37.3% | 6.930 |
| 5 | TSpawn / 匪家 → Alley / 匪家B外 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → UpperPark / A大厕所 → BombsiteA / A包 | 45 | 1184 | 68.5% | 7.097 |
| 6 | TSpawn / 匪家 → Alley / 匪家B外 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → LowerPark / A小厕所 → BombsiteA / A包 | 45 | 1158 | 37.3% | 6.771 |
| 7 | TSpawn / 匪家 → Alley / 匪家B外 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → UpperPark / A大厕所 → LowerPark / A小厕所 → BombsiteA / A包 | 45 | 1235 | 37.3% | 6.567 |
| 8 | TSpawn / 匪家 → Alley / 匪家B外 → TStairs / 匪楼梯 → Tunnels / 下水道 → Connector / 下水道 → LowerPark / A小厕所 → BombsiteA / A包 | 45 | 954 | 37.3% | 6.366 |
| 9 | TSpawn / 匪家 → TStairs / 匪楼梯 → Alley / 匪家B外 → Canal / 长管 → Pipe / 短管 → Water / 工地 → Connector / 下水道 → LowerPark / A小厕所 → BombsiteA / A包 | 34 | 1209 | 37.3% | 6.340 |
| 10 | TSpawn / 匪家 → Alley / 匪家B外 → Canal / 长管 → Pipe / 短管 → Water / 工地 → Connector / 下水道 → LowerPark / A小厕所 → BombsiteA / A包 | 34 | 990 | 37.3% | 6.290 |
| 11 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Connector / 下水道 → LowerPark / A小厕所 → Fountain / 喷泉 → UpperPark / A大厕所 → BombsiteA / A包 | 30 | 1236 | 53.6% | 6.541 |
| 12 | TSpawn / 匪家 → Alley / 匪家B外 → TStairs / 匪楼梯 → Tunnels / 下水道 → Connector / 下水道 → LowerPark / A小厕所 → Fountain / 喷泉 → UpperPark / A大厕所 → BombsiteA / A包 | 30 | 1120 | 53.6% | 6.272 |
| 13 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → LowerPark / A小厕所 → Restroom / 厕所 → UpperPark / A大厕所 → BombsiteA / A包 | 23 | 1329 | 60.5% | 6.476 |
| 14 | TSpawn / 匪家 → Alley / 匪家B外 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → LowerPark / A小厕所 → Restroom / 厕所 → UpperPark / A大厕所 → BombsiteA / A包 | 23 | 1213 | 60.5% | 6.215 |
| 15 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Connector / 下水道 → LowerPark / A小厕所 → Restroom / 厕所 → UpperPark / A大厕所 → BombsiteA / A包 | 23 | 1125 | 60.5% | 6.129 |
| 16 | TSpawn / 匪家 → Alley / 匪家B外 → TStairs / 匪楼梯 → Tunnels / 下水道 → Connector / 下水道 → LowerPark / A小厕所 → Restroom / 厕所 → UpperPark / A大厕所 → BombsiteA / A包 | 23 | 1009 | 60.5% | 5.911 |
| 17 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → UpperPark / A大厕所 → Restroom / 厕所 → LowerPark / A小厕所 → BombsiteA / A包 | 18 | 1347 | 37.3% | 6.337 |
| 18 | TSpawn / 匪家 → Alley / 匪家B外 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → UpperPark / A大厕所 → Restroom / 厕所 → LowerPark / A小厕所 → BombsiteA / A包 | 18 | 1231 | 37.3% | 6.093 |

### B 包候选路径

| 排名 | callout 链 | 瓶颈 T 次数 | T 总支持 | 最低 T 占比 | 分数 |
|---:|---|---:|---:|---:|---:|
| 1 | TSpawn / 匪家 → Alley / 匪家B外 → Canal / 长管 → BombsiteB / B包 | 121 | 601 | 44.0% | 6.913 |
| 2 | TSpawn / 匪家 → Alley / 匪家B外 → Canal / 长管 → Pipe / 短管 → Water / 工地 → Construction / B小 → BombsiteB / B包 | 79 | 1007 | 47.9% | 6.835 |
| 3 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Connector / 下水道 → Water / 工地 → Construction / B小 → BombsiteB / B包 | 60 | 1181 | 47.9% | 6.678 |
| 4 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Fountain / 喷泉 → LowerPark / A小厕所 → Connector / 下水道 → Water / 工地 → Construction / B小 → BombsiteB / B包 | 60 | 1551 | 43.8% | 6.517 |
| 5 | TSpawn / 匪家 → TStairs / 匪楼梯 → Alley / 匪家B外 → Canal / 长管 → Pipe / 短管 → Water / 工地 → Construction / B小 → BombsiteB / B包 | 58 | 1226 | 47.9% | 6.815 |
| 6 | TSpawn / 匪家 → TStairs / 匪楼梯 → Alley / 匪家B外 → Canal / 长管 → BombsiteB / B包 | 58 | 820 | 44.0% | 6.858 |
| 7 | TSpawn / 匪家 → TStairs / 匪楼梯 → Tunnels / 下水道 → Connector / 下水道 → Water / 工地 → Pipe / 短管 → Canal / 长管 → BombsiteB / B包 | 47 | 1190 | 44.0% | 6.368 |
| 8 | TSpawn / 匪家 → Alley / 匪家B外 → TStairs / 匪楼梯 → Tunnels / 下水道 → Connector / 下水道 → Water / 工地 → Construction / B小 → BombsiteB / B包 | 45 | 1065 | 47.9% | 6.351 |
| 9 | TSpawn / 匪家 → Alley / 匪家B外 → TStairs / 匪楼梯 → Tunnels / 下水道 → Connector / 下水道 → Water / 工地 → Pipe / 短管 → Canal / 长管 → BombsiteB / B包 | 45 | 1074 | 44.0% | 6.120 |

### 与现有人工路线对照

| 人工路线 | observed 边覆盖 | 缺失边 |
|---|---:|---|
| a_park / 公园进A | 6/6 | — |
| b_canal / 长管进B | 3/3 | — |
| b_construction / 短管工地进B | 6/6 | — |

### Corridor 候选 JSON

```json
[
  {
    "id": "candidate_a_01",
    "target": "a",
    "callouts": [
      "TSpawn",
      "TStairs",
      "Tunnels",
      "Fountain",
      "LowerPark",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 66
  },
  {
    "id": "candidate_a_02",
    "target": "a",
    "callouts": [
      "TSpawn",
      "TStairs",
      "Tunnels",
      "Connector",
      "LowerPark",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 66
  },
  {
    "id": "candidate_a_03",
    "target": "a",
    "callouts": [
      "TSpawn",
      "TStairs",
      "Tunnels",
      "Fountain",
      "UpperPark",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 61
  },
  {
    "id": "candidate_a_04",
    "target": "a",
    "callouts": [
      "TSpawn",
      "TStairs",
      "Tunnels",
      "Fountain",
      "UpperPark",
      "LowerPark",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 46
  },
  {
    "id": "candidate_a_05",
    "target": "a",
    "callouts": [
      "TSpawn",
      "Alley",
      "TStairs",
      "Tunnels",
      "Fountain",
      "UpperPark",
      "BombsiteA"
    ],
    "confidence": "observed",
    "bottleneckCount": 45
  },
  {
    "id": "candidate_b_01",
    "target": "b",
    "callouts": [
      "TSpawn",
      "Alley",
      "Canal",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 121
  },
  {
    "id": "candidate_b_02",
    "target": "b",
    "callouts": [
      "TSpawn",
      "Alley",
      "Canal",
      "Pipe",
      "Water",
      "Construction",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 79
  },
  {
    "id": "candidate_b_03",
    "target": "b",
    "callouts": [
      "TSpawn",
      "TStairs",
      "Tunnels",
      "Connector",
      "Water",
      "Construction",
      "BombsiteB"
    ],
    "confidence": "observed",
    "bottleneckCount": 60
  },
  {
    "id": "candidate_b_04",
    "target": "b",
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
    "confidence": "observed",
    "bottleneckCount": 60
  },
  {
    "id": "candidate_b_05",
    "target": "b",
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
    "confidence": "observed",
    "bottleneckCount": 58
  }
]
```
