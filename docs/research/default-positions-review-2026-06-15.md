# Default Positions Review

扫描 ZIP：110
统计窗口：freezeEnd + 30s

## de_ancient

样本 ZIP：23

### 当前推荐（人工修订 v1）
#### T 默认位
- t_outside / 匪口:
  - Outside / 匪口: T=147437, CT=3003, T占比=98.0%, 倾向=T
- a_hall / A厅:
  - MainHall / A厅: T=39180, CT=8667, T占比=81.9%, 倾向=T
- b_outer / B外:
  - Ruins / B外: T=80924, CT=448, T占比=99.4%, 倾向=T
- b_short / B小:
  - TSideLower / B小: T=53966, CT=3323, T占比=94.2%, 倾向=T

#### CT 默认位
- a_site / A包/甜甜圈:
  - BombsiteA / A包: T=11797, CT=81070, T占比=12.7%, 倾向=CT
  - SideHall / 甜甜圈: T=3078, CT=24528, T占比=11.1%, 倾向=CT
- mid / 中路/中远:
  - Middle / 中路: T=28784, CT=72678, T占比=28.4%, 倾向=CT
  - TopofMid / 中远: T=745, CT=8440, T占比=8.1%, 倾向=CT
- b_site / B包/底线/VIP:
  - BombsiteB / B包: T=14919, CT=71388, T占比=17.3%, 倾向=CT
  - Alley / 底线: T=1216, CT=84272, T占比=1.4%, 倾向=CT
  - House / VIP: T=923, CT=59525, T占比=1.5%, 倾向=CT
- black_house / 黑屋:
  - SideEntrance / 黑屋: T=10767, CT=55244, T占比=16.3%, 倾向=CT

#### 争夺区/通道（不作为默认位）
- Middle / 中路: T=28784, CT=72678, T占比=28.4%, 倾向=CT
- TSideUpper / 跳台: T=29539, CT=13467, T占比=68.7%, 倾向=T
- SideEntrance / 黑屋: T=10767, CT=55244, T占比=16.3%, 倾向=CT
- Ramp / B坡: T=14794, CT=5013, T占比=74.7%, 倾向=T
- MainHall / A厅: T=39180, CT=8667, T占比=81.9%, 倾向=T

### 数据证据：高频占有
- T:
  - Outside / 匪口: T=147437, CT=3003, T占比=98.0%, 倾向=T
  - TSpawn / 匪家: T=89614, CT=298, T占比=99.7%, 倾向=T
  - Ruins / B外: T=80924, CT=448, T占比=99.4%, 倾向=T
  - TSideLower / B小: T=53966, CT=3323, T占比=94.2%, 倾向=T
  - MainHall / A厅: T=39180, CT=8667, T占比=81.9%, 倾向=T
  - Tunnel / 隧道: T=31790, CT=236, T占比=99.3%, 倾向=T
  - TSideUpper / 跳台: T=29539, CT=13467, T占比=68.7%, 倾向=T
  - Middle / 中路: T=28784, CT=72678, T占比=28.4%, 倾向=CT
- CT:
  - CTSpawn / 警家: T=92, CT=94174, T占比=0.1%, 倾向=CT
  - Alley / 底线: T=1216, CT=84272, T占比=1.4%, 倾向=CT
  - BombsiteA / A包: T=11797, CT=81070, T占比=12.7%, 倾向=CT
  - Middle / 中路: T=28784, CT=72678, T占比=28.4%, 倾向=CT
  - BombsiteB / B包: T=14919, CT=71388, T占比=17.3%, 倾向=CT
  - House / VIP: T=923, CT=59525, T占比=1.5%, 倾向=CT
  - SideEntrance / 黑屋: T=10767, CT=55244, T占比=16.3%, 倾向=CT
  - SideHall / 甜甜圈: T=3078, CT=24528, T占比=11.1%, 倾向=CT

### 相邻证据
同一玩家在开局窗口内发生 callout 变化时记录一条有向边。
- CTSpawn / 警家 -> House / VIP: T=1, CT=2153, T占比=0.0%, 倾向=CT
- TSpawn / 匪家 -> Tunnel / 隧道: T=1396, CT=5, T占比=99.6%, 倾向=T
- Tunnel / 隧道 -> Water / 水路: T=1358, CT=3, T占比=99.8%, 倾向=T
- Water / 水路 -> Ruins / B外: T=1352, CT=3, T占比=99.8%, 倾向=T
- House / VIP -> Alley / 底线: T=8, CT=1346, T占比=0.6%, 倾向=CT
- TSpawn / 匪家 -> Outside / 匪口: T=1349, CT=3, T占比=99.8%, 倾向=T
- Ruins / B外 -> TSideLower / B小: T=1144, CT=0, T占比=100.0%, 倾向=T
- Alley / 底线 -> BombsiteB / B包: T=5, CT=1109, T占比=0.4%, 倾向=CT
- House / VIP -> TopofMid / 中远: T=1, CT=731, T占比=0.1%, 倾向=CT
- TopofMid / 中远 -> Middle / 中路: T=4, CT=700, T占比=0.6%, 倾向=CT
- CTSpawn / 警家 -> BombsiteA / A包: T=0, CT=645, T占比=0.0%, 倾向=CT
- TSideLower / B小 -> Ramp / B坡: T=622, CT=22, T占比=96.6%, 倾向=T
- BombsiteB / B包 -> SideEntrance / 黑屋: T=27, CT=579, T占比=4.5%, 倾向=CT
- TSideLower / B小 -> TSideUpper / 跳台: T=488, CT=30, T占比=94.2%, 倾向=T
- Outside / 匪口 -> MainHall / A厅: T=470, CT=3, T占比=99.4%, 倾向=T
- Outside / 匪口 -> Middle / 中路: T=411, CT=11, T占比=97.4%, 倾向=T

### 运行时资产片段
```ts
de_ancient: {
  "t": {
    "anchors": {
      "t_outside": {
        "name": "匪口",
        "callouts": [
          "Outside"
        ]
      },
      "a_hall": {
        "name": "A厅",
        "callouts": [
          "MainHall"
        ]
      },
      "b_outer": {
        "name": "B外",
        "callouts": [
          "Ruins"
        ]
      },
      "b_short": {
        "name": "B小",
        "callouts": [
          "TSideLower"
        ]
      }
    }
  },
  "ct": {
    "anchors": {
      "a_site": {
        "name": "A包/甜甜圈",
        "callouts": [
          "BombsiteA",
          "SideHall"
        ]
      },
      "mid": {
        "name": "中路/中远",
        "callouts": [
          "Middle",
          "TopofMid"
        ]
      },
      "b_site": {
        "name": "B包/底线/VIP",
        "callouts": [
          "BombsiteB",
          "Alley",
          "House"
        ]
      },
      "black_house": {
        "name": "黑屋",
        "callouts": [
          "SideEntrance"
        ]
      }
    }
  },
  "contested": [
    "Middle",
    "TSideUpper",
    "SideEntrance",
    "Ramp",
    "MainHall"
  ]
},
```
## de_anubis

样本 ZIP：5

### 当前推荐（人工修订 v1）
#### T 默认位
- b_long / B外:
  - Ruins / B外: T=25965, CT=0, T占比=100.0%, 倾向=T
  - OutsideLong / B外: T=11445, CT=611, T占比=94.9%, 倾向=T
- mid_bridge / 中桥:
  - Bridge / 中桥: T=17222, CT=683, T占比=96.2%, 倾向=T
- street_stairs / 街道/匪梯:
  - Street / 街道: T=14018, CT=0, T占比=100.0%, 倾向=T
  - TStairs / 匪梯: T=5967, CT=0, T占比=100.0%, 倾向=T
- canal / 水下:
  - Canal / 水下: T=12982, CT=3294, T占比=79.8%, 倾向=T
- t_upper / 匪跳:
  - TSideUpper / 匪跳: T=8202, CT=0, T占比=100.0%, 倾向=T

#### CT 默认位
- a_site / A包/A连/天堂:
  - BombsiteA / A包: T=63, CT=7700, T占比=0.8%, 倾向=CT
  - Walkway / A连: T=0, CT=6237, T占比=0.0%, 倾向=CT
  - Heaven / 天堂: T=0, CT=1767, T占比=0.0%, 倾向=CT
- mid / 中路/中门/黑屋:
  - Middle / 中路: T=684, CT=23917, T占比=2.8%, 倾向=CT
  - MidDoors / 中门: T=610, CT=4010, T占比=13.2%, 倾向=CT
  - Connector / 黑屋: T=58, CT=10411, T占比=0.6%, 倾向=CT
- b_site / B包/B连:
  - BombsiteB / B包: T=331, CT=21515, T占比=1.5%, 倾向=CT
  - PalaceInterior / B连: T=73, CT=7707, T占比=0.9%, 倾向=CT
  - BackofB / B包台上: T=0, CT=3968, T占比=0.0%, 倾向=CT
  - Bricks / B连阳光房: T=0, CT=2283, T占比=0.0%, 倾向=CT
- ct_spawn / 警家:
  - CTSideUpper / 警家: T=58, CT=9449, T占比=0.6%, 倾向=CT
  - Alley / 警家: T=0, CT=5560, T占比=0.0%, 倾向=CT
  - LowerTunnel / 警家隧道: T=0, CT=3143, T占比=0.0%, 倾向=CT

#### 争夺区/通道（不作为默认位）
- Main / A厅: T=1780, CT=6524, T占比=21.4%, 倾向=CT
- MidDoors / 中门: T=610, CT=4010, T占比=13.2%, 倾向=CT
- Middle / 中路: T=684, CT=23917, T占比=2.8%, 倾向=CT
- Canal / 水下: T=12982, CT=3294, T占比=79.8%, 倾向=T
- PalaceInterior / B连: T=73, CT=7707, T占比=0.9%, 倾向=CT
- Connector / 黑屋: T=58, CT=10411, T占比=0.6%, 倾向=CT
- Walkway / A连: T=0, CT=6237, T占比=0.0%, 倾向=CT

### 数据证据：高频占有
- T:
  - Ruins / B外: T=25965, CT=0, T占比=100.0%, 倾向=T
  - TSpawn / 匪家: T=20459, CT=0, T占比=100.0%, 倾向=T
  - Bridge / 中桥: T=17222, CT=683, T占比=96.2%, 倾向=T
  - Street / 街道: T=14018, CT=0, T占比=100.0%, 倾向=T
  - Canal / 水下: T=12982, CT=3294, T占比=79.8%, 倾向=T
  - OutsideLong / B外: T=11445, CT=611, T占比=94.9%, 倾向=T
  - TSideUpper / 匪跳: T=8202, CT=0, T占比=100.0%, 倾向=T
  - TStairs / 匪梯: T=5967, CT=0, T占比=100.0%, 倾向=T
- CT:
  - Middle / 中路: T=684, CT=23917, T占比=2.8%, 倾向=CT
  - BombsiteB / B包: T=331, CT=21515, T占比=1.5%, 倾向=CT
  - Connector / 黑屋: T=58, CT=10411, T占比=0.6%, 倾向=CT
  - CTSideUpper / 警家: T=58, CT=9449, T占比=0.6%, 倾向=CT
  - PalaceInterior / B连: T=73, CT=7707, T占比=0.9%, 倾向=CT
  - BombsiteA / A包: T=63, CT=7700, T占比=0.8%, 倾向=CT
  - Main / A厅: T=1780, CT=6524, T占比=21.4%, 倾向=CT
  - Walkway / A连: T=0, CT=6237, T占比=0.0%, 倾向=CT

### 相邻证据
同一玩家在开局窗口内发生 callout 变化时记录一条有向边。
- CTSideUpper / 警家 -> PalaceInterior / B连: T=0, CT=304, T占比=0.0%, 倾向=CT
- PalaceInterior / B连 -> Middle / 中路: T=1, CT=288, T占比=0.3%, 倾向=CT
- TSpawn / 匪家 -> Ruins / B外: T=279, CT=0, T占比=100.0%, 倾向=T
- TSpawn / 匪家 -> Street / 街道: T=253, CT=0, T占比=100.0%, 倾向=T
- Alley / 警家 -> BombsiteB / B包: T=0, CT=219, T占比=0.0%, 倾向=CT
- CTSideUpper / 警家 -> LowerTunnel / 警家隧道: T=0, CT=169, T占比=0.0%, 倾向=CT
- LowerTunnel / 警家隧道 -> Alley / 警家: T=0, CT=167, T占比=0.0%, 倾向=CT
- TStairs / 匪梯 -> Canal / 水下: T=152, CT=0, T占比=100.0%, 倾向=T
- Street / 街道 -> TStairs / 匪梯: T=149, CT=0, T占比=100.0%, 倾向=T
- Middle / 中路 -> Walkway / A连: T=0, CT=145, T占比=0.0%, 倾向=CT
- Ruins / B外 -> Bridge / 中桥: T=144, CT=0, T占比=100.0%, 倾向=T
- BombsiteB / B包 -> Connector / 黑屋: T=0, CT=120, T占比=0.0%, 倾向=CT
- Walkway / A连 -> BombsiteA / A包: T=0, CT=115, T占比=0.0%, 倾向=CT
- Ruins / B外 -> OutsideLong / B外: T=110, CT=0, T占比=100.0%, 倾向=T
- Street / 街道 -> TSideUpper / 匪跳: T=94, CT=0, T占比=100.0%, 倾向=T
- BombsiteA / A包 -> Main / A厅: T=0, CT=78, T占比=0.0%, 倾向=CT

### 运行时资产片段
```ts
de_anubis: {
  "t": {
    "anchors": {
      "b_long": {
        "name": "B外",
        "callouts": [
          "Ruins",
          "OutsideLong"
        ]
      },
      "mid_bridge": {
        "name": "中桥",
        "callouts": [
          "Bridge"
        ]
      },
      "street_stairs": {
        "name": "街道/匪梯",
        "callouts": [
          "Street",
          "TStairs"
        ]
      },
      "canal": {
        "name": "水下",
        "callouts": [
          "Canal"
        ]
      },
      "t_upper": {
        "name": "匪跳",
        "callouts": [
          "TSideUpper"
        ]
      }
    }
  },
  "ct": {
    "anchors": {
      "a_site": {
        "name": "A包/A连/天堂",
        "callouts": [
          "BombsiteA",
          "Walkway",
          "Heaven"
        ]
      },
      "mid": {
        "name": "中路/中门/黑屋",
        "callouts": [
          "Middle",
          "MidDoors",
          "Connector"
        ]
      },
      "b_site": {
        "name": "B包/B连",
        "callouts": [
          "BombsiteB",
          "PalaceInterior",
          "BackofB",
          "Bricks"
        ]
      },
      "ct_spawn": {
        "name": "警家",
        "callouts": [
          "CTSideUpper",
          "Alley",
          "LowerTunnel"
        ]
      }
    }
  },
  "contested": [
    "Main",
    "MidDoors",
    "Middle",
    "Canal",
    "PalaceInterior",
    "Connector",
    "Walkway"
  ]
},
```
## de_dust2

样本 ZIP：26

### 当前推荐（人工修订 v1）
#### T 默认位
- a_doors / A门外/A门:
  - OutsideLong / A门外: T=113393, CT=1505, T占比=98.7%, 倾向=T
  - LongDoors / A门: T=65613, CT=27026, T占比=70.8%, 倾向=T
- top_mid / 中远:
  - TopofMid / 中远匪口: T=105479, CT=3313, T占比=97.0%, 倾向=T
- b1 / B1:
  - LowerTunnel / B1: T=30771, CT=8581, T占比=78.2%, 倾向=T
- b_tunnels / B洞:
  - OutsideTunnel / B洞外: T=39365, CT=524, T占比=98.7%, 倾向=T
  - UpperTunnel / B洞: T=87472, CT=5553, T占比=94.0%, 倾向=T

#### CT 默认位
- a_long / A大/大坑:
  - LongA / A大: T=8155, CT=106811, T占比=7.1%, 倾向=CT
  - Pit / 大坑: T=1790, CT=7684, T占比=18.9%, 倾向=CT
- a_short / A小:
  - Catwalk / A小: T=15299, CT=15509, T占比=49.7%, 倾向=均衡
  - ShortStairs / A小楼梯: T=2921, CT=28393, T占比=9.3%, 倾向=CT
  - ExtendedA / A小过点: T=1550, CT=16809, T占比=8.4%, 倾向=CT
- mid / 中门/警家:
  - MidDoors / 中门: T=3394, CT=99233, T占比=3.3%, 倾向=CT
  - UnderA / 警家: T=135, CT=76937, T占比=0.2%, 倾向=CT
  - CTSpawn / 警家: T=30, CT=70045, T占比=0.0%, 倾向=CT
- b_site / B包/B门:
  - BombsiteB / B包: T=9595, CT=93774, T占比=9.3%, 倾向=CT
  - BDoors / B门: T=133, CT=28245, T占比=0.5%, 倾向=CT

#### 争夺区/通道（不作为默认位）
- LongA / A大: T=8155, CT=106811, T占比=7.1%, 倾向=CT
- Catwalk / A小: T=15299, CT=15509, T占比=49.7%, 倾向=均衡
- Middle / 中路: T=17503, CT=5710, T占比=75.4%, 倾向=T
- TunnelStairs / B洞楼梯: T=17523, CT=1751, T占比=90.9%, 倾向=T
- BDoors / B门: T=133, CT=28245, T占比=0.5%, 倾向=CT
- ARamp / A斜坡: T=815, CT=10006, T占比=7.5%, 倾向=CT

### 数据证据：高频占有
- T:
  - OutsideLong / A门外: T=113393, CT=1505, T占比=98.7%, 倾向=T
  - TopofMid / 中远匪口: T=105479, CT=3313, T占比=97.0%, 倾向=T
  - TSpawn / 匪家: T=96108, CT=745, T占比=99.2%, 倾向=T
  - UpperTunnel / B洞: T=87472, CT=5553, T占比=94.0%, 倾向=T
  - LongDoors / A门: T=65613, CT=27026, T占比=70.8%, 倾向=T
  - OutsideTunnel / B洞外: T=39365, CT=524, T占比=98.7%, 倾向=T
  - LowerTunnel / B1: T=30771, CT=8581, T占比=78.2%, 倾向=T
  - TunnelStairs / B洞楼梯: T=17523, CT=1751, T占比=90.9%, 倾向=T
- CT:
  - LongA / A大: T=8155, CT=106811, T占比=7.1%, 倾向=CT
  - MidDoors / 中门: T=3394, CT=99233, T占比=3.3%, 倾向=CT
  - BombsiteB / B包: T=9595, CT=93774, T占比=9.3%, 倾向=CT
  - UnderA / 警家: T=135, CT=76937, T占比=0.2%, 倾向=CT
  - CTSpawn / 警家: T=30, CT=70045, T占比=0.0%, 倾向=CT
  - ShortStairs / A小楼梯: T=2921, CT=28393, T占比=9.3%, 倾向=CT
  - BDoors / B门: T=133, CT=28245, T占比=0.5%, 倾向=CT
  - LongDoors / A门: T=65613, CT=27026, T占比=70.8%, 倾向=T

### 相邻证据
同一玩家在开局窗口内发生 callout 变化时记录一条有向边。
- CTSpawn / 警家 -> UnderA / 警家: T=0, CT=1615, T占比=0.0%, 倾向=CT
- CTSpawn / 警家 -> MidDoors / 中门: T=0, CT=1478, T占比=0.0%, 倾向=CT
- UnderA / 警家 -> LongA / A大: T=1, CT=1460, T占比=0.1%, 倾向=CT
- TSpawn / 匪家 -> TopofMid / 中远匪口: T=1393, CT=1, T占比=99.9%, 倾向=T
- TopofMid / 中远匪口 -> OutsideLong / A门外: T=1134, CT=26, T占比=97.8%, 倾向=T
- TSpawn / 匪家 -> OutsideTunnel / B洞外: T=1027, CT=0, T占比=100.0%, 倾向=T
- OutsideTunnel / B洞外 -> UpperTunnel / B洞: T=1011, CT=0, T占比=100.0%, 倾向=T
- MidDoors / 中门 -> BDoors / B门: T=7, CT=953, T占比=0.7%, 倾向=CT
- OutsideLong / A门外 -> LongDoors / A门: T=774, CT=4, T占比=99.5%, 倾向=T
- LongA / A大 -> UnderA / 警家: T=2, CT=726, T占比=0.3%, 倾向=CT
- UnderA / 警家 -> ExtendedA / A小过点: T=1, CT=713, T占比=0.1%, 倾向=CT
- OutsideLong / A门外 -> TopofMid / 中远匪口: T=661, CT=11, T占比=98.4%, 倾向=T
- TunnelStairs / B洞楼梯 -> LowerTunnel / B1: T=607, CT=35, T占比=94.5%, 倾向=T
- UpperTunnel / B洞 -> TunnelStairs / B洞楼梯: T=593, CT=18, T占比=97.1%, 倾向=T
- BDoors / B门 -> BombsiteB / B包: T=0, CT=499, T占比=0.0%, 倾向=CT
- TSpawn / 匪家 -> OutsideLong / A门外: T=455, CT=1, T占比=99.8%, 倾向=T

### 运行时资产片段
```ts
de_dust2: {
  "t": {
    "anchors": {
      "a_doors": {
        "name": "A门外/A门",
        "callouts": [
          "OutsideLong",
          "LongDoors"
        ]
      },
      "top_mid": {
        "name": "中远",
        "callouts": [
          "TopofMid"
        ]
      },
      "b1": {
        "name": "B1",
        "callouts": [
          "LowerTunnel"
        ]
      },
      "b_tunnels": {
        "name": "B洞",
        "callouts": [
          "OutsideTunnel",
          "UpperTunnel"
        ]
      }
    }
  },
  "ct": {
    "anchors": {
      "a_long": {
        "name": "A大/大坑",
        "callouts": [
          "LongA",
          "Pit"
        ]
      },
      "a_short": {
        "name": "A小",
        "callouts": [
          "Catwalk",
          "ShortStairs",
          "ExtendedA"
        ]
      },
      "mid": {
        "name": "中门/警家",
        "callouts": [
          "MidDoors",
          "UnderA",
          "CTSpawn"
        ]
      },
      "b_site": {
        "name": "B包/B门",
        "callouts": [
          "BombsiteB",
          "BDoors"
        ]
      }
    }
  },
  "contested": [
    "LongA",
    "Catwalk",
    "Middle",
    "TunnelStairs",
    "BDoors",
    "ARamp"
  ]
},
```
## de_inferno

样本 ZIP：16

### 当前推荐（人工修订 v1）
#### T 默认位
- banana / 香蕉道:
  - Banana / 香蕉道: T=61001, CT=51128, T占比=54.4%, 倾向=均衡
- mid / 匪口/中路:
  - TRamp / 匪口: T=56041, CT=43, T占比=99.9%, 倾向=T
  - LowerMid / 匪口: T=48264, CT=0, T占比=100.0%, 倾向=T
  - Middle / 中路: T=50938, CT=2731, T占比=94.9%, 倾向=T
- second_mid / 侧道:
  - SecondMid / 侧道: T=57697, CT=139, T占比=99.8%, 倾向=T
- t_apps / 匪二楼:
  - BackAlley / 匪二楼: T=8452, CT=67, T占比=99.2%, 倾向=T
  - Upstairs / 匪二楼: T=3160, CT=0, T占比=100.0%, 倾向=T

#### CT 默认位
- a_site / A包/大坑/马棚:
  - BombsiteA / A包: T=1090, CT=57995, T占比=1.8%, 倾向=CT
  - Pit / 大坑: T=125, CT=5874, T占比=2.1%, 倾向=CT
  - Quad / 马鹏: T=165, CT=4726, T占比=3.4%, 倾向=CT
- arch_library / 拱门/书房:
  - Arch / 拱门: T=1262, CT=32110, T占比=3.8%, 倾向=CT
  - Library / 书房: T=35, CT=11963, T占比=0.3%, 倾向=CT
- b_site / B包/教堂:
  - BombsiteB / B包: T=1490, CT=69597, T占比=2.1%, 倾向=CT
  - Ruins / 警家教堂: T=3, CT=23815, T占比=0.0%, 倾向=CT
- ct_spawn / 警家:
  - CTSpawn / 警家: T=131, CT=75347, T占比=0.2%, 倾向=CT

#### 争夺区/通道（不作为默认位）
- Banana / 香蕉道: T=61001, CT=51128, T占比=54.4%, 倾向=均衡
- Apartments / 二楼: T=23286, CT=22970, T占比=50.3%, 倾向=均衡
- Balcony / 阳台: T=1452, CT=9388, T占比=13.4%, 倾向=CT
- TopofMid / 中路: T=4062, CT=35348, T占比=10.3%, 倾向=CT
- Arch / 拱门: T=1262, CT=32110, T占比=3.8%, 倾向=CT

### 数据证据：高频占有
- T:
  - TSpawn / 匪家: T=72683, CT=0, T占比=100.0%, 倾向=T
  - Banana / 香蕉道: T=61001, CT=51128, T占比=54.4%, 倾向=均衡
  - SecondMid / 侧道: T=57697, CT=139, T占比=99.8%, 倾向=T
  - TRamp / 匪口: T=56041, CT=43, T占比=99.9%, 倾向=T
  - Middle / 中路: T=50938, CT=2731, T占比=94.9%, 倾向=T
  - LowerMid / 匪口: T=48264, CT=0, T占比=100.0%, 倾向=T
  - Apartments / 二楼: T=23286, CT=22970, T占比=50.3%, 倾向=均衡
  - BackAlley / 匪二楼: T=8452, CT=67, T占比=99.2%, 倾向=T
- CT:
  - CTSpawn / 警家: T=131, CT=75347, T占比=0.2%, 倾向=CT
  - BombsiteB / B包: T=1490, CT=69597, T占比=2.1%, 倾向=CT
  - BombsiteA / A包: T=1090, CT=57995, T占比=1.8%, 倾向=CT
  - Banana / 香蕉道: T=61001, CT=51128, T占比=54.4%, 倾向=均衡
  - TopofMid / 中路: T=4062, CT=35348, T占比=10.3%, 倾向=CT
  - Arch / 拱门: T=1262, CT=32110, T占比=3.8%, 倾向=CT
  - Ruins / 警家教堂: T=3, CT=23815, T占比=0.0%, 倾向=CT
  - Apartments / 二楼: T=23286, CT=22970, T占比=50.3%, 倾向=均衡

### 相邻证据
同一玩家在开局窗口内发生 callout 变化时记录一条有向边。
- TSpawn / 匪家 -> LowerMid / 匪口: T=1743, CT=0, T占比=100.0%, 倾向=T
- LowerMid / 匪口 -> TRamp / 匪口: T=1224, CT=0, T占比=100.0%, 倾向=T
- TRamp / 匪口 -> Middle / 中路: T=1165, CT=1, T占比=99.9%, 倾向=T
- Ruins / 警家教堂 -> BombsiteB / B包: T=0, CT=891, T占比=0.0%, 倾向=CT
- CTSpawn / 警家 -> Ruins / 警家教堂: T=0, CT=889, T占比=0.0%, 倾向=CT
- Middle / 中路 -> Banana / 香蕉道: T=747, CT=2, T占比=99.7%, 倾向=T
- BombsiteB / B包 -> Banana / 香蕉道: T=4, CT=612, T占比=0.6%, 倾向=CT
- CTSpawn / 警家 -> Library / 书房: T=0, CT=558, T占比=0.0%, 倾向=CT
- Library / 书房 -> BombsiteA / A包: T=1, CT=545, T占比=0.2%, 倾向=CT
- LowerMid / 匪口 -> SecondMid / 侧道: T=531, CT=0, T占比=100.0%, 倾向=T
- CTSpawn / 警家 -> Arch / 拱门: T=0, CT=436, T占比=0.0%, 倾向=CT
- Arch / 拱门 -> TopofMid / 中路: T=0, CT=421, T占比=0.0%, 倾向=CT
- Banana / 香蕉道 -> BombsiteB / B包: T=34, CT=278, T占比=10.9%, 倾向=CT
- Balcony / 阳台 -> Apartments / 二楼: T=123, CT=180, T占比=40.6%, 倾向=均衡
- TopofMid / 中路 -> Arch / 拱门: T=41, CT=241, T占比=14.5%, 倾向=CT
- Banana / 香蕉道 -> Middle / 中路: T=244, CT=14, T占比=94.6%, 倾向=T

### 运行时资产片段
```ts
de_inferno: {
  "t": {
    "anchors": {
      "banana": {
        "name": "香蕉道",
        "callouts": [
          "Banana"
        ]
      },
      "mid": {
        "name": "匪口/中路",
        "callouts": [
          "TRamp",
          "LowerMid",
          "Middle"
        ]
      },
      "second_mid": {
        "name": "侧道",
        "callouts": [
          "SecondMid"
        ]
      },
      "t_apps": {
        "name": "匪二楼",
        "callouts": [
          "BackAlley",
          "Upstairs"
        ]
      }
    }
  },
  "ct": {
    "anchors": {
      "a_site": {
        "name": "A包/大坑/马棚",
        "callouts": [
          "BombsiteA",
          "Pit",
          "Quad"
        ]
      },
      "arch_library": {
        "name": "拱门/书房",
        "callouts": [
          "Arch",
          "Library"
        ]
      },
      "b_site": {
        "name": "B包/教堂",
        "callouts": [
          "BombsiteB",
          "Ruins"
        ]
      },
      "ct_spawn": {
        "name": "警家",
        "callouts": [
          "CTSpawn"
        ]
      }
    }
  },
  "contested": [
    "Banana",
    "Apartments",
    "Balcony",
    "TopofMid",
    "Arch"
  ]
},
```
## de_mirage

样本 ZIP：21

### 当前推荐（人工修订 v1）
#### T 默认位
- a_ramp / A1:
  - PalaceAlley / A1: T=57524, CT=1512, T占比=97.4%, 倾向=T
  - TRamp / A1: T=15470, CT=1313, T占比=92.2%, 倾向=T
- a_palace / A二楼:
  - PalaceInterior / A二楼: T=49022, CT=14836, T占比=76.8%, 倾向=T
- mid_spawn / 匪口/中远:
  - SideAlley / 匪口: T=72414, CT=296, T占比=99.6%, 倾向=T
  - TopofMid / 中远/匪口: T=74393, CT=1610, T占比=97.9%, 倾向=T
- underpass / 下水道:
  - Underpass / 下水道: T=26029, CT=12877, T占比=66.9%, 倾向=T
- b_apps / 匪二楼/B二楼:
  - House / 匪二楼: T=25676, CT=73, T占比=99.7%, 倾向=T
  - BackAlley / B二楼: T=46128, CT=408, T占比=99.1%, 倾向=T

#### CT 默认位
- a_site / A包/跳台/Jungle:
  - BombsiteA / A包: T=7362, CT=110185, T占比=6.3%, 倾向=CT
  - Stairs / 跳台: T=145, CT=7823, T占比=1.8%, 倾向=CT
  - Jungle / Jungle: T=99, CT=14519, T占比=0.7%, 倾向=CT
- mid / VIP/拱门/B小/黑屋:
  - SnipersNest / VIP: T=188, CT=27035, T占比=0.7%, 倾向=CT
  - Connector / 拱门: T=1384, CT=21962, T占比=5.9%, 倾向=CT
  - Catwalk / B小: T=13265, CT=28887, T占比=31.5%, 倾向=CT
  - Ladder / 黑屋: T=278, CT=3431, T占比=7.5%, 倾向=CT
- b_site / B包/超市/白车:
  - BombsiteB / B包: T=3324, CT=61716, T占比=5.1%, 倾向=CT
  - Shop / 超市: T=64, CT=22529, T占比=0.3%, 倾向=CT
  - Truck / 白车: T=354, CT=24682, T占比=1.4%, 倾向=CT

#### 争夺区/通道（不作为默认位）
- Middle / 中路: T=24862, CT=13634, T占比=64.6%, 倾向=均衡
- Underpass / 下水道: T=26029, CT=12877, T占比=66.9%, 倾向=T
- Connector / 拱门: T=1384, CT=21962, T占比=5.9%, 倾向=CT
- Catwalk / B小: T=13265, CT=28887, T占比=31.5%, 倾向=CT
- PalaceInterior / A二楼: T=49022, CT=14836, T占比=76.8%, 倾向=T
- Apartments / B二楼: T=19170, CT=9690, T占比=66.4%, 倾向=T

### 数据证据：高频占有
- T:
  - TSpawn / 匪家: T=87332, CT=241, T占比=99.7%, 倾向=T
  - TopofMid / 中远/匪口: T=74393, CT=1610, T占比=97.9%, 倾向=T
  - SideAlley / 匪口: T=72414, CT=296, T占比=99.6%, 倾向=T
  - PalaceAlley / A1: T=57524, CT=1512, T占比=97.4%, 倾向=T
  - PalaceInterior / A二楼: T=49022, CT=14836, T占比=76.8%, 倾向=T
  - BackAlley / B二楼: T=46128, CT=408, T占比=99.1%, 倾向=T
  - Underpass / 下水道: T=26029, CT=12877, T占比=66.9%, 倾向=T
  - House / 匪二楼: T=25676, CT=73, T占比=99.7%, 倾向=T
- CT:
  - CTSpawn / 警家: T=451, CT=146393, T占比=0.3%, 倾向=CT
  - BombsiteA / A包: T=7362, CT=110185, T占比=6.3%, 倾向=CT
  - BombsiteB / B包: T=3324, CT=61716, T占比=5.1%, 倾向=CT
  - Catwalk / B小: T=13265, CT=28887, T占比=31.5%, 倾向=CT
  - SnipersNest / VIP: T=188, CT=27035, T占比=0.7%, 倾向=CT
  - Truck / 白车: T=354, CT=24682, T占比=1.4%, 倾向=CT
  - Shop / 超市: T=64, CT=22529, T占比=0.3%, 倾向=CT
  - Connector / 拱门: T=1384, CT=21962, T占比=5.9%, 倾向=CT

### 相邻证据
同一玩家在开局窗口内发生 callout 变化时记录一条有向边。
- TSpawn / 匪家 -> SideAlley / 匪口: T=1604, CT=1, T占比=99.9%, 倾向=T
- SideAlley / 匪口 -> TopofMid / 中远/匪口: T=1053, CT=0, T占比=100.0%, 倾向=T
- CTSpawn / 警家 -> Shop / 超市: T=0, CT=897, T占比=0.0%, 倾向=CT
- CTSpawn / 警家 -> BombsiteA / A包: T=0, CT=890, T占比=0.0%, 倾向=CT
- Shop / 超市 -> BombsiteB / B包: T=1, CT=816, T占比=0.1%, 倾向=CT
- BombsiteB / B包 -> Truck / 白车: T=0, CT=777, T占比=0.0%, 倾向=CT
- SideAlley / 匪口 -> House / 匪二楼: T=765, CT=0, T占比=100.0%, 倾向=T
- House / 匪二楼 -> BackAlley / B二楼: T=652, CT=0, T占比=100.0%, 倾向=T
- Truck / 白车 -> BombsiteB / B包: T=13, CT=570, T占比=2.2%, 倾向=CT
- CTSpawn / 警家 -> SnipersNest / VIP: T=0, CT=532, T占比=0.0%, 倾向=CT
- TSpawn / 匪家 -> PalaceAlley / A1: T=512, CT=0, T占比=100.0%, 倾向=T
- BombsiteA / A包 -> Connector / 拱门: T=0, CT=354, T占比=0.0%, 倾向=CT
- SnipersNest / VIP -> CTSpawn / 警家: T=3, CT=333, T占比=0.9%, 倾向=CT
- TopofMid / 中远/匪口 -> SideAlley / 匪口: T=326, CT=6, T占比=98.2%, 倾向=T
- Jungle / Jungle -> BombsiteA / A包: T=0, CT=329, T占比=0.0%, 倾向=CT
- PalaceAlley / A1 -> TRamp / A1: T=303, CT=17, T占比=94.7%, 倾向=T

### 运行时资产片段
```ts
de_mirage: {
  "t": {
    "anchors": {
      "a_ramp": {
        "name": "A1",
        "callouts": [
          "PalaceAlley",
          "TRamp"
        ]
      },
      "a_palace": {
        "name": "A二楼",
        "callouts": [
          "PalaceInterior"
        ]
      },
      "mid_spawn": {
        "name": "匪口/中远",
        "callouts": [
          "SideAlley",
          "TopofMid"
        ]
      },
      "underpass": {
        "name": "下水道",
        "callouts": [
          "Underpass"
        ]
      },
      "b_apps": {
        "name": "匪二楼/B二楼",
        "callouts": [
          "House",
          "BackAlley"
        ]
      }
    }
  },
  "ct": {
    "anchors": {
      "a_site": {
        "name": "A包/跳台/Jungle",
        "callouts": [
          "BombsiteA",
          "Stairs",
          "Jungle"
        ]
      },
      "mid": {
        "name": "VIP/拱门/B小/黑屋",
        "callouts": [
          "SnipersNest",
          "Connector",
          "Catwalk",
          "Ladder"
        ]
      },
      "b_site": {
        "name": "B包/超市/白车",
        "callouts": [
          "BombsiteB",
          "Shop",
          "Truck"
        ]
      }
    }
  },
  "contested": [
    "Middle",
    "Underpass",
    "Connector",
    "Catwalk",
    "PalaceInterior",
    "Apartments"
  ]
},
```
## de_nuke

样本 ZIP：12

### 当前推荐（人工修订 v1）
#### T 默认位
- outside / 外场准备:
  - Outside / 外场: T=112614, CT=77005, T占比=59.4%, 倾向=均衡
  - Roof / 屋顶: T=12504, CT=107, T占比=99.2%, 倾向=T
  - Silo / 山上: T=12299, CT=0, T占比=100.0%, 倾向=T
- lobby / 匪厅:
  - Lobby / 匪厅: T=48452, CT=2005, T占比=96.0%, 倾向=T
- squeaky / 铁门:
  - Squeaky / 铁门房: T=7703, CT=1020, T占比=88.3%, 倾向=T
- trophy_link / 奖杯/链接:
  - Trophy / 奖杯房: T=6461, CT=839, T占比=88.5%, 倾向=T
  - Vending / 链接: T=13354, CT=764, T占比=94.6%, 倾向=T

#### CT 默认位
- outside / 外场/大仓:
  - Outside / 外场: T=112614, CT=77005, T占比=59.4%, 倾向=均衡
  - Garage / 大仓: T=465, CT=10787, T占比=4.1%, 倾向=CT
- a_site / A包/三楼/正门:
  - BombsiteA / A包: T=4688, CT=33009, T占比=12.4%, 倾向=CT
  - Rafters / 三楼横梁: T=0, CT=21442, T占比=0.0%, 倾向=CT
  - Mini / 正门: T=123, CT=13664, T占比=0.9%, 倾向=CT
  - Heaven / 三楼: T=0, CT=12031, T占比=0.0%, 倾向=CT
  - Hell / 三楼下: T=0, CT=13992, T占比=0.0%, 倾向=CT
- ramp / 铁板:
  - Ramp / 铁板: T=2107, CT=40490, T占比=4.9%, 倾向=CT
  - Admin / 铁板三楼下: T=0, CT=12218, T占比=0.0%, 倾向=CT
- b_site / B包/控制室/死门:
  - BombsiteB / B包: T=450, CT=1688, T占比=21.0%, 倾向=CT
  - Control / 链接: T=2336, CT=2985, T占比=43.9%, 倾向=均衡
  - Decon / 死门: T=4, CT=183, T占比=2.1%, 倾向=CT
  - Observation / 控制室: T=19, CT=777, T占比=2.4%, 倾向=CT

#### 争夺区/通道（不作为默认位）
- Outside / 外场: T=112614, CT=77005, T占比=59.4%, 倾向=均衡
- Hut / 黄房: T=2055, CT=2126, T占比=49.2%, 倾向=均衡
- Ramp / 铁板: T=2107, CT=40490, T占比=4.9%, 倾向=CT
- Secret / K1: T=3692, CT=869, T占比=80.9%, 倾向=T
- Tunnels / K1地下: T=1976, CT=4362, T占比=31.2%, 倾向=CT
- Control / 链接: T=2336, CT=2985, T占比=43.9%, 倾向=均衡
- Vending / 链接: T=13354, CT=764, T占比=94.6%, 倾向=T

### 数据证据：高频占有
- T:
  - Outside / 外场: T=112614, CT=77005, T占比=59.4%, 倾向=均衡
  - TSpawn / 匪家: T=63604, CT=13, T占比=100.0%, 倾向=T
  - Lobby / 匪厅: T=48452, CT=2005, T占比=96.0%, 倾向=T
  - Vending / 链接: T=13354, CT=764, T占比=94.6%, 倾向=T
  - Roof / 屋顶: T=12504, CT=107, T占比=99.2%, 倾向=T
  - Silo / 山上: T=12299, CT=0, T占比=100.0%, 倾向=T
  - Squeaky / 铁门房: T=7703, CT=1020, T占比=88.3%, 倾向=T
  - Trophy / 奖杯房: T=6461, CT=839, T占比=88.5%, 倾向=T
- CT:
  - Outside / 外场: T=112614, CT=77005, T占比=59.4%, 倾向=均衡
  - Ramp / 铁板: T=2107, CT=40490, T占比=4.9%, 倾向=CT
  - BombsiteA / A包: T=4688, CT=33009, T占比=12.4%, 倾向=CT
  - CTSpawn / 警家: T=0, CT=25131, T占比=0.0%, 倾向=CT
  - Rafters / 三楼横梁: T=0, CT=21442, T占比=0.0%, 倾向=CT
  - Hell / 三楼下: T=0, CT=13992, T占比=0.0%, 倾向=CT
  - Mini / 正门: T=123, CT=13664, T占比=0.9%, 倾向=CT
  - Admin / 铁板三楼下: T=0, CT=12218, T占比=0.0%, 倾向=CT

### 相邻证据
同一玩家在开局窗口内发生 callout 变化时记录一条有向边。
- TSpawn / 匪家 -> Outside / 外场: T=1304, CT=1, T占比=99.9%, 倾向=T
- CTSpawn / 警家 -> Outside / 外场: T=0, CT=1285, T占比=0.0%, 倾向=CT
- Outside / 外场 -> Hell / 三楼下: T=0, CT=903, T占比=0.0%, 倾向=CT
- Outside / 外场 -> Lobby / 匪厅: T=622, CT=2, T占比=99.7%, 倾向=T
- Hell / 三楼下 -> Heaven / 三楼: T=0, CT=534, T占比=0.0%, 倾向=CT
- Heaven / 三楼 -> Rafters / 三楼横梁: T=0, CT=510, T占比=0.0%, 倾向=CT
- Hell / 三楼下 -> Admin / 铁板三楼下: T=0, CT=412, T占比=0.0%, 倾向=CT
- Admin / 铁板三楼下 -> Ramp / 铁板: T=0, CT=368, T占比=0.0%, 倾向=CT
- Lobby / 匪厅 -> Vending / 链接: T=255, CT=10, T占比=96.2%, 倾向=T
- Rafters / 三楼横梁 -> BombsiteA / A包: T=0, CT=238, T占比=0.0%, 倾向=CT
- Outside / 外场 -> Mini / 正门: T=7, CT=212, T占比=3.2%, 倾向=CT
- Outside / 外场 -> Roof / 屋顶: T=209, CT=0, T占比=100.0%, 倾向=T
- Vending / 链接 -> Trophy / 奖杯房: T=183, CT=8, T占比=95.8%, 倾向=T
- Outside / 外场 -> Garage / 大仓: T=12, CT=129, T占比=8.5%, 倾向=CT
- Lobby / 匪厅 -> Squeaky / 铁门房: T=133, CT=6, T占比=95.7%, 倾向=T
- Outside / 外场 -> Secret / K1: T=115, CT=2, T占比=98.3%, 倾向=T

### 运行时资产片段
```ts
de_nuke: {
  "t": {
    "anchors": {
      "outside": {
        "name": "外场准备",
        "callouts": [
          "Outside",
          "Roof",
          "Silo"
        ]
      },
      "lobby": {
        "name": "匪厅",
        "callouts": [
          "Lobby"
        ]
      },
      "squeaky": {
        "name": "铁门",
        "callouts": [
          "Squeaky"
        ]
      },
      "trophy_link": {
        "name": "奖杯/链接",
        "callouts": [
          "Trophy",
          "Vending"
        ]
      }
    }
  },
  "ct": {
    "anchors": {
      "outside": {
        "name": "外场/大仓",
        "callouts": [
          "Outside",
          "Garage"
        ]
      },
      "a_site": {
        "name": "A包/三楼/正门",
        "callouts": [
          "BombsiteA",
          "Rafters",
          "Mini",
          "Heaven",
          "Hell"
        ]
      },
      "ramp": {
        "name": "铁板",
        "callouts": [
          "Ramp",
          "Admin"
        ]
      },
      "b_site": {
        "name": "B包/控制室/死门",
        "callouts": [
          "BombsiteB",
          "Control",
          "Decon",
          "Observation"
        ]
      }
    }
  },
  "contested": [
    "Outside",
    "Hut",
    "Ramp",
    "Secret",
    "Tunnels",
    "Control",
    "Vending"
  ]
},
```
## de_overpass

样本 ZIP：7

### 当前推荐（人工修订 v1）
#### T 默认位
- fountain / 喷泉/游乐园:
  - Fountain / 喷泉: T=19654, CT=1220, T占比=94.2%, 倾向=T
  - Playground / 游乐园: T=4153, CT=41, T占比=99.0%, 倾向=T
- underpass / 下水道:
  - Tunnels / 下水道: T=28742, CT=725, T占比=97.5%, 倾向=T
- canal / 匪家B外/长管:
  - Alley / 匪家B外: T=12585, CT=58, T占比=99.5%, 倾向=T
  - Canal / 长管: T=10775, CT=3988, T占比=73.0%, 倾向=T
- short_pipe / 匪楼梯/短管:
  - TStairs / 匪楼梯: T=5685, CT=13, T占比=99.8%, 倾向=T
  - Pipe / 短管: T=5035, CT=36, T占比=99.3%, 倾向=T

#### CT 默认位
- a_site / A厕所/A包:
  - LowerPark / A小厕所: T=2609, CT=29154, T占比=8.2%, 倾向=CT
  - UpperPark / A大厕所: T=3104, CT=8601, T占比=26.5%, 倾向=CT
  - BombsiteA / A包: T=0, CT=13424, T占比=0.0%, 倾向=CT
  - Restroom / 厕所: T=186, CT=759, T占比=19.7%, 倾向=CT
- b_site / B包/ABC/B二楼:
  - BombsiteB / B包: T=1671, CT=13466, T占比=11.0%, 倾向=CT
  - Walkway / ABC: T=173, CT=13900, T占比=1.2%, 倾向=CT
  - SnipersNest / B二楼: T=0, CT=6328, T占比=0.0%, 倾向=CT
- construction / 工地/B小:
  - Water / 工地: T=5519, CT=11237, T占比=32.9%, 倾向=CT
  - Construction / B小: T=1598, CT=3920, T占比=29.0%, 倾向=CT
- connector / 下水道连接:
  - Connector / 下水道: T=4377, CT=5229, T占比=45.6%, 倾向=均衡

#### 争夺区/通道（不作为默认位）
- Restroom / 厕所: T=186, CT=759, T占比=19.7%, 倾向=CT
- Tunnels / 下水道: T=28742, CT=725, T占比=97.5%, 倾向=T
- Canal / 长管: T=10775, CT=3988, T占比=73.0%, 倾向=T
- Pipe / 短管: T=5035, CT=36, T占比=99.3%, 倾向=T
- Water / 工地: T=5519, CT=11237, T占比=32.9%, 倾向=CT
- Construction / B小: T=1598, CT=3920, T占比=29.0%, 倾向=CT
- UpperPark / A大厕所: T=3104, CT=8601, T占比=26.5%, 倾向=CT
- LowerPark / A小厕所: T=2609, CT=29154, T占比=8.2%, 倾向=CT

### 数据证据：高频占有
- T:
  - Tunnels / 下水道: T=28742, CT=725, T占比=97.5%, 倾向=T
  - TSpawn / 匪家: T=24011, CT=0, T占比=100.0%, 倾向=T
  - Fountain / 喷泉: T=19654, CT=1220, T占比=94.2%, 倾向=T
  - Alley / 匪家B外: T=12585, CT=58, T占比=99.5%, 倾向=T
  - Canal / 长管: T=10775, CT=3988, T占比=73.0%, 倾向=T
  - TStairs / 匪楼梯: T=5685, CT=13, T占比=99.8%, 倾向=T
  - Water / 工地: T=5519, CT=11237, T占比=32.9%, 倾向=CT
  - Pipe / 短管: T=5035, CT=36, T占比=99.3%, 倾向=T
- CT:
  - LowerPark / A小厕所: T=2609, CT=29154, T占比=8.2%, 倾向=CT
  - Walkway / ABC: T=173, CT=13900, T占比=1.2%, 倾向=CT
  - BombsiteB / B包: T=1671, CT=13466, T占比=11.0%, 倾向=CT
  - BombsiteA / A包: T=0, CT=13424, T占比=0.0%, 倾向=CT
  - Water / 工地: T=5519, CT=11237, T占比=32.9%, 倾向=CT
  - UpperPark / A大厕所: T=3104, CT=8601, T占比=26.5%, 倾向=CT
  - UnderA / 一层: T=0, CT=8386, T占比=0.0%, 倾向=CT
  - SnipersNest / B二楼: T=0, CT=6328, T占比=0.0%, 倾向=CT

### 相邻证据
同一玩家在开局窗口内发生 callout 变化时记录一条有向边。
- BombsiteA / A包 -> BackofA / 垃圾桶: T=0, CT=390, T占比=0.0%, 倾向=CT
- TStairs / 匪楼梯 -> Tunnels / 下水道: T=377, CT=0, T占比=100.0%, 倾向=T
- TSpawn / 匪家 -> TStairs / 匪楼梯: T=371, CT=0, T占比=100.0%, 倾向=T
- BackofA / 垃圾桶 -> Stairs / 楼梯: T=0, CT=343, T占比=0.0%, 倾向=CT
- Stairs / 楼梯 -> UnderA / 一层: T=0, CT=342, T占比=0.0%, 倾向=CT
- Tunnels / 下水道 -> Fountain / 喷泉: T=240, CT=0, T占比=100.0%, 倾向=T
- UnderA / 一层 -> Walkway / ABC: T=0, CT=220, T占比=0.0%, 倾向=CT
- TSpawn / 匪家 -> Alley / 匪家B外: T=209, CT=0, T占比=100.0%, 倾向=T
- BombsiteA / A包 -> LowerPark / A小厕所: T=0, CT=204, T占比=0.0%, 倾向=CT
- Alley / 匪家B外 -> Canal / 长管: T=198, CT=0, T占比=100.0%, 倾向=T
- Water / 工地 -> BombsiteB / B包: T=2, CT=140, T占比=1.4%, 倾向=CT
- UnderA / 一层 -> SnipersNest / B二楼: T=0, CT=128, T占比=0.0%, 倾向=CT
- Canal / 长管 -> Pipe / 短管: T=117, CT=0, T占比=100.0%, 倾向=T
- Walkway / ABC -> Water / 工地: T=1, CT=111, T占比=0.9%, 倾向=CT
- SnipersNest / B二楼 -> Water / 工地: T=0, CT=99, T占比=0.0%, 倾向=CT
- Pipe / 短管 -> Water / 工地: T=91, CT=0, T占比=100.0%, 倾向=T

### 运行时资产片段
```ts
de_overpass: {
  "t": {
    "anchors": {
      "fountain": {
        "name": "喷泉/游乐园",
        "callouts": [
          "Fountain",
          "Playground"
        ]
      },
      "underpass": {
        "name": "下水道",
        "callouts": [
          "Tunnels"
        ]
      },
      "canal": {
        "name": "匪家B外/长管",
        "callouts": [
          "Alley",
          "Canal"
        ]
      },
      "short_pipe": {
        "name": "匪楼梯/短管",
        "callouts": [
          "TStairs",
          "Pipe"
        ]
      }
    }
  },
  "ct": {
    "anchors": {
      "a_site": {
        "name": "A厕所/A包",
        "callouts": [
          "LowerPark",
          "UpperPark",
          "BombsiteA",
          "Restroom"
        ]
      },
      "b_site": {
        "name": "B包/ABC/B二楼",
        "callouts": [
          "BombsiteB",
          "Walkway",
          "SnipersNest"
        ]
      },
      "construction": {
        "name": "工地/B小",
        "callouts": [
          "Water",
          "Construction"
        ]
      },
      "connector": {
        "name": "下水道连接",
        "callouts": [
          "Connector"
        ]
      }
    }
  },
  "contested": [
    "Restroom",
    "Tunnels",
    "Canal",
    "Pipe",
    "Water",
    "Construction",
    "UpperPark",
    "LowerPark"
  ]
},
```
