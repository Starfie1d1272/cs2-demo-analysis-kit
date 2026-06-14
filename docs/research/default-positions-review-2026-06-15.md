# Default Positions Review

扫描 ZIP：110
统计窗口：freezeEnd + 30s

## de_ancient

样本 ZIP：23

### 高频占有
- T: Outside T=147437 CT=3003; TSpawn T=89614 CT=298; Ruins T=80924 CT=448; TSideLower T=53966 CT=3323; MainHall T=39180 CT=8667; Tunnel T=31790 CT=236; TSideUpper T=29539 CT=13467; Middle T=28784 CT=72678
- CT: CTSpawn T=92 CT=94174; Alley T=1216 CT=84272; BombsiteA T=11797 CT=81070; Middle T=28784 CT=72678; BombsiteB T=14919 CT=71388; House T=923 CT=59525; SideEntrance T=10767 CT=55244; SideHall T=3078 CT=24528

### T 默认位草案
- a_hall / A厅: MainHall(A厅) T=39180 CT=8667; Outside(匪口) T=147437 CT=3003
- b_ramp / B坡/B外: Ruins(B外) T=80924 CT=448; Ramp(B坡) T=14794 CT=5013
- b_short / B小/跳台: TSideLower(B小) T=53966 CT=3323; TSideUpper(跳台) T=29539 CT=13467
- tunnel_water / 隧道/水路: Tunnel(隧道) T=31790 CT=236; Water(水路) T=13688 CT=127

### CT 默认位草案
- mid / 中路: Middle(中路) T=28784 CT=72678; TopofMid(中远) T=745 CT=8440
- a_site / A点: BombsiteA(A包) T=11797 CT=81070; SideHall(甜甜圈) T=3078 CT=24528; SideEntrance(黑屋) T=10767 CT=55244
- b_site / B点: BombsiteB(B包) T=14919 CT=71388; Alley(底线) T=1216 CT=84272; House(VIP) T=923 CT=59525
- ct_spawn / 警家: CTSpawn(警家) T=92 CT=94174

### 相邻证据
同一玩家在开局窗口内发生 callout 变化时记录一条有向边。
- CTSpawn(警家) -> House(VIP): T=1 CT=2153
- TSpawn(匪家) -> Tunnel(隧道): T=1396 CT=5
- Tunnel(隧道) -> Water(水路): T=1358 CT=3
- Water(水路) -> Ruins(B外): T=1352 CT=3
- House(VIP) -> Alley(底线): T=8 CT=1346
- TSpawn(匪家) -> Outside(匪口): T=1349 CT=3
- Ruins(B外) -> TSideLower(B小): T=1144 CT=0
- Alley(底线) -> BombsiteB(B包): T=5 CT=1109
- House(VIP) -> TopofMid(中远): T=1 CT=731
- TopofMid(中远) -> Middle(中路): T=4 CT=700
- CTSpawn(警家) -> BombsiteA(A包): T=0 CT=645
- TSideLower(B小) -> Ramp(B坡): T=622 CT=22
- BombsiteB(B包) -> SideEntrance(黑屋): T=27 CT=579
- TSideLower(B小) -> TSideUpper(跳台): T=488 CT=30
- Outside(匪口) -> MainHall(A厅): T=470 CT=3
- Outside(匪口) -> Middle(中路): T=411 CT=11

### TS 草案
```ts
de_ancient: {
    t: {
      anchors: {
              "a_hall": {
                      "name": "A厅",
                      "callouts": [
                              "MainHall",
                              "Outside"
                      ]
              },
              "b_ramp": {
                      "name": "B坡/B外",
                      "callouts": [
                              "Ruins",
                              "Ramp"
                      ]
              },
              "b_short": {
                      "name": "B小/跳台",
                      "callouts": [
                              "TSideLower",
                              "TSideUpper"
                      ]
              },
              "tunnel_water": {
                      "name": "隧道/水路",
                      "callouts": [
                              "Tunnel",
                              "Water"
                      ]
              }
      },
      roles: {
              "Alley": "ct",
              "BombsiteA": "terminal",
              "BombsiteB": "terminal",
              "CTSpawn": "terminal",
              "House": "ct",
              "Middle": "ct",
              "SideEntrance": "ct",
              "SideHall": "ct",
              "TopofMid": "ct",
              "TSpawn": "advanced"
      },
    },
    ct: {
      anchors: {
              "mid": {
                      "name": "中路",
                      "callouts": [
                              "Middle",
                              "TopofMid"
                      ]
              },
              "a_site": {
                      "name": "A点",
                      "callouts": [
                              "BombsiteA",
                              "SideHall",
                              "SideEntrance"
                      ]
              },
              "b_site": {
                      "name": "B点",
                      "callouts": [
                              "BombsiteB",
                              "Alley",
                              "House"
                      ]
              },
              "ct_spawn": {
                      "name": "警家",
                      "callouts": [
                              "CTSpawn"
                      ]
              }
      },
      roles: {
              "MainHall": "advanced",
              "Outside": "advanced",
              "Ramp": "advanced",
              "Ruins": "advanced",
              "TSideLower": "advanced",
              "TSideUpper": "advanced",
              "TSpawn": "terminal",
              "Tunnel": "advanced",
              "Water": "advanced"
      },
    },
  },
```
## de_anubis

样本 ZIP：5

### 高频占有
- T: Ruins T=25965 CT=0; TSpawn T=20459 CT=0; Bridge T=17222 CT=683; Street T=14018 CT=0; Canal T=12982 CT=3294; OutsideLong T=11445 CT=611; TSideUpper T=8202 CT=0; TStairs T=5967 CT=0
- CT: Middle T=684 CT=23917; BombsiteB T=331 CT=21515; Connector T=58 CT=10411; CTSideUpper T=58 CT=9449; PalaceInterior T=73 CT=7707; BombsiteA T=63 CT=7700; Main T=1780 CT=6524; Walkway T=0 CT=6237

### T 默认位草案
- a_hall / A厅: Main(A厅) T=1780 CT=6524
- mid / 中路: Bridge(中桥) T=17222 CT=683; Middle(中路) T=684 CT=23917; MidDoors(中门) T=610 CT=4010
- canal / 水下: Canal(水下) T=12982 CT=3294
- b_long / B外: Ruins(B外) T=25965 CT=0; OutsideLong(B外) T=11445 CT=611
- t_spawn_route / 匪路: Street(街道) T=14018 CT=0; TSideUpper(匪跳) T=8202 CT=0; TStairs(匪梯) T=5967 CT=0

### CT 默认位草案
- b_site / B点: BombsiteB(B包) T=331 CT=21515; BackofB(B包台上) T=0 CT=3968; PalaceInterior(B连) T=73 CT=7707; Bricks(B连阳光房) T=0 CT=2283
- mid / 中路: Middle(中路) T=684 CT=23917; Connector(黑屋) T=58 CT=10411; MidDoors(中门) T=610 CT=4010
- a_site / A点: BombsiteA(A包) T=63 CT=7700; Walkway(A连) T=0 CT=6237; Heaven(天堂) T=0 CT=1767
- ct_spawn / 警家: CTSideUpper(警家) T=58 CT=9449; Alley(警家) T=0 CT=5560; LowerTunnel(警家隧道) T=0 CT=3143; CTSpawn(警家后) T=0 CT=353; SnipersNest(警家狙位) T=25 CT=705

### 相邻证据
同一玩家在开局窗口内发生 callout 变化时记录一条有向边。
- CTSideUpper(警家) -> PalaceInterior(B连): T=0 CT=304
- PalaceInterior(B连) -> Middle(中路): T=1 CT=288
- TSpawn(匪家) -> Ruins(B外): T=279 CT=0
- TSpawn(匪家) -> Street(街道): T=253 CT=0
- Alley(警家) -> BombsiteB(B包): T=0 CT=219
- CTSideUpper(警家) -> LowerTunnel(警家隧道): T=0 CT=169
- LowerTunnel(警家隧道) -> Alley(警家): T=0 CT=167
- TStairs(匪梯) -> Canal(水下): T=152 CT=0
- Street(街道) -> TStairs(匪梯): T=149 CT=0
- Middle(中路) -> Walkway(A连): T=0 CT=145
- Ruins(B外) -> Bridge(中桥): T=144 CT=0
- BombsiteB(B包) -> Connector(黑屋): T=0 CT=120
- Walkway(A连) -> BombsiteA(A包): T=0 CT=115
- Ruins(B外) -> OutsideLong(B外): T=110 CT=0
- Street(街道) -> TSideUpper(匪跳): T=94 CT=0
- BombsiteA(A包) -> Main(A厅): T=0 CT=78

### TS 草案
```ts
de_anubis: {
    t: {
      anchors: {
              "a_hall": {
                      "name": "A厅",
                      "callouts": [
                              "Main"
                      ]
              },
              "mid": {
                      "name": "中路",
                      "callouts": [
                              "Bridge",
                              "Middle",
                              "MidDoors"
                      ]
              },
              "canal": {
                      "name": "水下",
                      "callouts": [
                              "Canal"
                      ]
              },
              "b_long": {
                      "name": "B外",
                      "callouts": [
                              "Ruins",
                              "OutsideLong"
                      ]
              },
              "t_spawn_route": {
                      "name": "匪路",
                      "callouts": [
                              "Street",
                              "TSideUpper",
                              "TStairs"
                      ]
              }
      },
      roles: {
              "Alley": "ct",
              "BackofB": "ct",
              "BombsiteA": "terminal",
              "BombsiteB": "terminal",
              "Bricks": "ct",
              "Connector": "ct",
              "CTSideUpper": "ct",
              "CTSpawn": "terminal",
              "Fountain": "ct",
              "Heaven": "ct",
              "LowerTunnel": "ct",
              "PalaceInterior": "ct",
              "SnipersNest": "ct",
              "TSpawn": "advanced",
              "Tunnel": "ct",
              "TunnelStairs": "ct",
              "Walkway": "ct"
      },
    },
    ct: {
      anchors: {
              "b_site": {
                      "name": "B点",
                      "callouts": [
                              "BombsiteB",
                              "BackofB",
                              "PalaceInterior",
                              "Bricks"
                      ]
              },
              "mid": {
                      "name": "中路",
                      "callouts": [
                              "Middle",
                              "Connector",
                              "MidDoors"
                      ]
              },
              "a_site": {
                      "name": "A点",
                      "callouts": [
                              "BombsiteA",
                              "Walkway",
                              "Heaven"
                      ]
              },
              "ct_spawn": {
                      "name": "警家",
                      "callouts": [
                              "CTSideUpper",
                              "Alley",
                              "LowerTunnel",
                              "CTSpawn",
                              "SnipersNest"
                      ]
              }
      },
      roles: {
              "Bridge": "advanced",
              "Canal": "advanced",
              "Fountain": "advanced",
              "Main": "advanced",
              "OutsideLong": "advanced",
              "TSpawn": "terminal",
              "Tunnel": "advanced",
              "TunnelStairs": "advanced"
      },
    },
  },
```
## de_dust2

样本 ZIP：26

### 高频占有
- T: OutsideLong T=113393 CT=1505; TopofMid T=105479 CT=3313; TSpawn T=96108 CT=745; UpperTunnel T=87472 CT=5553; LongDoors T=65613 CT=27026; OutsideTunnel T=39365 CT=524; LowerTunnel T=30771 CT=8581; TunnelStairs T=17523 CT=1751
- CT: LongA T=8155 CT=106811; MidDoors T=3394 CT=99233; BombsiteB T=9595 CT=93774; UnderA T=135 CT=76937; CTSpawn T=30 CT=70045; ShortStairs T=2921 CT=28393; BDoors T=133 CT=28245; LongDoors T=65613 CT=27026

### T 默认位草案
- a_long / A大: OutsideLong(A门外) T=113393 CT=1505; LongDoors(A门) T=65613 CT=27026; LongA(A大) T=8155 CT=106811
- mid_b1 / 中路/B1: TopofMid(中远匪口) T=105479 CT=3313; Middle(中路) T=17503 CT=5710; LowerTunnel(B1) T=30771 CT=8581
- b_tunnels / B洞: OutsideTunnel(B洞外) T=39365 CT=524; UpperTunnel(B洞) T=87472 CT=5553; TunnelStairs(B洞楼梯) T=17523 CT=1751

### CT 默认位草案
- a_long / A大: LongA(A大) T=8155 CT=106811; Pit(大坑) T=1790 CT=7684
- a_short / A小: Catwalk(A小) T=15299 CT=15509; ShortStairs(A小楼梯) T=2921 CT=28393; ExtendedA(A小过点) T=1550 CT=16809
- mid / 中门/警家: MidDoors(中门) T=3394 CT=99233; UnderA(警家) T=135 CT=76937; CTSpawn(警家) T=30 CT=70045
- b_site / B点: BombsiteB(B包) T=9595 CT=93774; BDoors(B门) T=133 CT=28245; Hole(狗洞) T=13 CT=5398

### 相邻证据
同一玩家在开局窗口内发生 callout 变化时记录一条有向边。
- CTSpawn(警家) -> UnderA(警家): T=0 CT=1615
- CTSpawn(警家) -> MidDoors(中门): T=0 CT=1478
- UnderA(警家) -> LongA(A大): T=1 CT=1460
- TSpawn(匪家) -> TopofMid(中远匪口): T=1393 CT=1
- TopofMid(中远匪口) -> OutsideLong(A门外): T=1134 CT=26
- TSpawn(匪家) -> OutsideTunnel(B洞外): T=1027 CT=0
- OutsideTunnel(B洞外) -> UpperTunnel(B洞): T=1011 CT=0
- MidDoors(中门) -> BDoors(B门): T=7 CT=953
- OutsideLong(A门外) -> LongDoors(A门): T=774 CT=4
- LongA(A大) -> UnderA(警家): T=2 CT=726
- UnderA(警家) -> ExtendedA(A小过点): T=1 CT=713
- OutsideLong(A门外) -> TopofMid(中远匪口): T=661 CT=11
- TunnelStairs(B洞楼梯) -> LowerTunnel(B1): T=607 CT=35
- UpperTunnel(B洞) -> TunnelStairs(B洞楼梯): T=593 CT=18
- BDoors(B门) -> BombsiteB(B包): T=0 CT=499
- TSpawn(匪家) -> OutsideLong(A门外): T=455 CT=1

### TS 草案
```ts
de_dust2: {
    t: {
      anchors: {
              "a_long": {
                      "name": "A大",
                      "callouts": [
                              "OutsideLong",
                              "LongDoors",
                              "LongA"
                      ]
              },
              "mid_b1": {
                      "name": "中路/B1",
                      "callouts": [
                              "TopofMid",
                              "Middle",
                              "LowerTunnel"
                      ]
              },
              "b_tunnels": {
                      "name": "B洞",
                      "callouts": [
                              "OutsideTunnel",
                              "UpperTunnel",
                              "TunnelStairs"
                      ]
              }
      },
      roles: {
              "ARamp": "ct",
              "BDoors": "ct",
              "BombsiteA": "terminal",
              "BombsiteB": "terminal",
              "Catwalk": "advanced",
              "CTSpawn": "terminal",
              "ExtendedA": "ct",
              "Hole": "ct",
              "MidDoors": "ct",
              "Pit": "ct",
              "ShortStairs": "ct",
              "Side": "advanced",
              "TRamp": "advanced",
              "TSpawn": "advanced",
              "UnderA": "ct"
      },
    },
    ct: {
      anchors: {
              "a_long": {
                      "name": "A大",
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
                      "name": "B点",
                      "callouts": [
                              "BombsiteB",
                              "BDoors",
                              "Hole"
                      ]
              }
      },
      roles: {
              "ARamp": "advanced",
              "BombsiteA": "advanced",
              "LongDoors": "advanced",
              "LowerTunnel": "advanced",
              "Middle": "advanced",
              "OutsideLong": "advanced",
              "OutsideTunnel": "advanced",
              "Side": "advanced",
              "TopofMid": "advanced",
              "TRamp": "advanced",
              "TSpawn": "terminal",
              "TunnelStairs": "advanced",
              "UpperTunnel": "advanced"
      },
    },
  },
```
## de_inferno

样本 ZIP：16

### 高频占有
- T: TSpawn T=72683 CT=0; Banana T=61001 CT=51128; SecondMid T=57697 CT=139; TRamp T=56041 CT=43; Middle T=50938 CT=2731; LowerMid T=48264 CT=0; Apartments T=23286 CT=22970; BackAlley T=8452 CT=67
- CT: CTSpawn T=131 CT=75347; BombsiteB T=1490 CT=69597; BombsiteA T=1090 CT=57995; Banana T=61001 CT=51128; TopofMid T=4062 CT=35348; Arch T=1262 CT=32110; Ruins T=3 CT=23815; Apartments T=23286 CT=22970

### T 默认位草案
- banana / 香蕉道: Banana(香蕉道) T=61001 CT=51128
- mid / 中路: TRamp(匪口) T=56041 CT=43; LowerMid(匪口) T=48264 CT=0; Middle(中路) T=50938 CT=2731; TopofMid(中路) T=4062 CT=35348
- second_mid_apps / 侧道/二楼: SecondMid(侧道) T=57697 CT=139; Apartments(二楼) T=23286 CT=22970; BackAlley(匪二楼) T=8452 CT=67; Underpass(下水道) T=5433 CT=20; Bridge(匪桥) T=3396 CT=0; Upstairs(匪二楼) T=3160 CT=0; Deck(匪二阳台) T=1754 CT=0

### CT 默认位草案
- b_site / B点: BombsiteB(B包) T=1490 CT=69597; Banana(香蕉道) T=61001 CT=51128; Ruins(警家教堂) T=3 CT=23815
- a_site / A点: BombsiteA(A包) T=1090 CT=57995; Pit(大坑) T=125 CT=5874; Quad(马鹏) T=165 CT=4726; Graveyard(墓地) T=21 CT=80
- arch_library / 拱门/书房: Arch(拱门) T=1262 CT=32110; Library(书房) T=35 CT=11963
- ct_spawn / 警家: CTSpawn(警家) T=131 CT=75347

### 相邻证据
同一玩家在开局窗口内发生 callout 变化时记录一条有向边。
- TSpawn(匪家) -> LowerMid(匪口): T=1743 CT=0
- LowerMid(匪口) -> TRamp(匪口): T=1224 CT=0
- TRamp(匪口) -> Middle(中路): T=1165 CT=1
- Ruins(警家教堂) -> BombsiteB(B包): T=0 CT=891
- CTSpawn(警家) -> Ruins(警家教堂): T=0 CT=889
- Middle(中路) -> Banana(香蕉道): T=747 CT=2
- BombsiteB(B包) -> Banana(香蕉道): T=4 CT=612
- CTSpawn(警家) -> Library(书房): T=0 CT=558
- Library(书房) -> BombsiteA(A包): T=1 CT=545
- LowerMid(匪口) -> SecondMid(侧道): T=531 CT=0
- CTSpawn(警家) -> Arch(拱门): T=0 CT=436
- Arch(拱门) -> TopofMid(中路): T=0 CT=421
- Banana(香蕉道) -> BombsiteB(B包): T=34 CT=278
- Balcony(阳台) -> Apartments(二楼): T=123 CT=180
- TopofMid(中路) -> Arch(拱门): T=41 CT=241
- Banana(香蕉道) -> Middle(中路): T=244 CT=14

### TS 草案
```ts
de_inferno: {
    t: {
      anchors: {
              "banana": {
                      "name": "香蕉道",
                      "callouts": [
                              "Banana"
                      ]
              },
              "mid": {
                      "name": "中路",
                      "callouts": [
                              "TRamp",
                              "LowerMid",
                              "Middle",
                              "TopofMid"
                      ]
              },
              "second_mid_apps": {
                      "name": "侧道/二楼",
                      "callouts": [
                              "SecondMid",
                              "Apartments",
                              "BackAlley",
                              "Underpass",
                              "Bridge",
                              "Upstairs",
                              "Deck"
                      ]
              }
      },
      roles: {
              "Arch": "ct",
              "Balcony": "ct",
              "BombsiteA": "terminal",
              "BombsiteB": "terminal",
              "CTSpawn": "terminal",
              "Graveyard": "ct",
              "Kitchen": "advanced",
              "Library": "ct",
              "Pit": "ct",
              "Quad": "ct",
              "Ruins": "ct",
              "TSpawn": "advanced"
      },
    },
    ct: {
      anchors: {
              "b_site": {
                      "name": "B点",
                      "callouts": [
                              "BombsiteB",
                              "Banana",
                              "Ruins"
                      ]
              },
              "a_site": {
                      "name": "A点",
                      "callouts": [
                              "BombsiteA",
                              "Pit",
                              "Quad",
                              "Graveyard"
                      ]
              },
              "arch_library": {
                      "name": "拱门/书房",
                      "callouts": [
                              "Arch",
                              "Library"
                      ]
              },
              "ct_spawn": {
                      "name": "警家",
                      "callouts": [
                              "CTSpawn"
                      ]
              }
      },
      roles: {
              "Apartments": "advanced",
              "BackAlley": "advanced",
              "Balcony": "advanced",
              "Middle": "advanced",
              "SecondMid": "advanced",
              "TopofMid": "advanced",
              "TRamp": "advanced",
              "TSpawn": "terminal",
              "Underpass": "advanced"
      },
    },
  },
```
## de_mirage

样本 ZIP：21

### 高频占有
- T: TSpawn T=87332 CT=241; TopofMid T=74393 CT=1610; SideAlley T=72414 CT=296; PalaceAlley T=57524 CT=1512; PalaceInterior T=49022 CT=14836; BackAlley T=46128 CT=408; Underpass T=26029 CT=12877; House T=25676 CT=73
- CT: CTSpawn T=451 CT=146393; BombsiteA T=7362 CT=110185; BombsiteB T=3324 CT=61716; Catwalk T=13265 CT=28887; SnipersNest T=188 CT=27035; Truck T=354 CT=24682; Shop T=64 CT=22529; Connector T=1384 CT=21962

### T 默认位草案
- a_ramp / A1: PalaceAlley(A1) T=57524 CT=1512; TRamp(A1) T=15470 CT=1313
- a_palace / A二楼: PalaceInterior(A二楼) T=49022 CT=14836; Scaffolding(A2上下) T=280 CT=1477
- mid / 中路: TopofMid(中远/匪口) T=74393 CT=1610; SideAlley(匪口) T=72414 CT=296; Middle(中路) T=24862 CT=13634
- underpass / 下水道: Underpass(下水道) T=26029 CT=12877
- b_apps / B二楼: House(匪二楼) T=25676 CT=73; BackAlley(B二楼) T=46128 CT=408; Apartments(B二楼) T=19170 CT=9690

### CT 默认位草案
- a_site / A点: BombsiteA(A包) T=7362 CT=110185; Stairs(跳台) T=145 CT=7823; Jungle(Jungle) T=99 CT=14519
- mid / 中路: SnipersNest(VIP) T=188 CT=27035; Connector(拱门) T=1384 CT=21962; Catwalk(B小) T=13265 CT=28887; Ladder(黑屋) T=278 CT=3431
- b_site / B点: BombsiteB(B包) T=3324 CT=61716; Shop(超市) T=64 CT=22529; Truck(白车) T=354 CT=24682

### 相邻证据
同一玩家在开局窗口内发生 callout 变化时记录一条有向边。
- TSpawn(匪家) -> SideAlley(匪口): T=1604 CT=1
- SideAlley(匪口) -> TopofMid(中远/匪口): T=1053 CT=0
- CTSpawn(警家) -> Shop(超市): T=0 CT=897
- CTSpawn(警家) -> BombsiteA(A包): T=0 CT=890
- Shop(超市) -> BombsiteB(B包): T=1 CT=816
- BombsiteB(B包) -> Truck(白车): T=0 CT=777
- SideAlley(匪口) -> House(匪二楼): T=765 CT=0
- House(匪二楼) -> BackAlley(B二楼): T=652 CT=0
- Truck(白车) -> BombsiteB(B包): T=13 CT=570
- CTSpawn(警家) -> SnipersNest(VIP): T=0 CT=532
- TSpawn(匪家) -> PalaceAlley(A1): T=512 CT=0
- BombsiteA(A包) -> Connector(拱门): T=0 CT=354
- SnipersNest(VIP) -> CTSpawn(警家): T=3 CT=333
- TopofMid(中远/匪口) -> SideAlley(匪口): T=326 CT=6
- Jungle(Jungle) -> BombsiteA(A包): T=0 CT=329
- PalaceAlley(A1) -> TRamp(A1): T=303 CT=17

### TS 草案
```ts
de_mirage: {
    t: {
      anchors: {
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
                              "PalaceInterior",
                              "Scaffolding"
                      ]
              },
              "mid": {
                      "name": "中路",
                      "callouts": [
                              "TopofMid",
                              "SideAlley",
                              "Middle"
                      ]
              },
              "underpass": {
                      "name": "下水道",
                      "callouts": [
                              "Underpass"
                      ]
              },
              "b_apps": {
                      "name": "B二楼",
                      "callouts": [
                              "House",
                              "BackAlley",
                              "Apartments"
                      ]
              }
      },
      roles: {
              "BombsiteA": "terminal",
              "BombsiteB": "terminal",
              "Catwalk": "ct",
              "Connector": "ct",
              "CTSpawn": "terminal",
              "Jungle": "ct",
              "Ladder": "ct",
              "Shop": "ct",
              "SnipersNest": "ct",
              "Stairs": "ct",
              "Truck": "ct",
              "TSpawn": "advanced"
      },
    },
    ct: {
      anchors: {
              "a_site": {
                      "name": "A点",
                      "callouts": [
                              "BombsiteA",
                              "Stairs",
                              "Jungle"
                      ]
              },
              "mid": {
                      "name": "中路",
                      "callouts": [
                              "SnipersNest",
                              "Connector",
                              "Catwalk",
                              "Ladder"
                      ]
              },
              "b_site": {
                      "name": "B点",
                      "callouts": [
                              "BombsiteB",
                              "Shop",
                              "Truck"
                      ]
              }
      },
      roles: {
              "Apartments": "advanced",
              "BackAlley": "advanced",
              "CTSpawn": "advanced",
              "House": "advanced",
              "Middle": "advanced",
              "PalaceAlley": "advanced",
              "PalaceInterior": "advanced",
              "Scaffolding": "advanced",
              "SideAlley": "advanced",
              "TopofMid": "advanced",
              "TRamp": "advanced",
              "TSpawn": "terminal",
              "Underpass": "advanced"
      },
    },
  },
```
## de_nuke

样本 ZIP：12

### 高频占有
- T: Outside T=112614 CT=77005; TSpawn T=63604 CT=13; Lobby T=48452 CT=2005; Vending T=13354 CT=764; Roof T=12504 CT=107; Silo T=12299 CT=0; Squeaky T=7703 CT=1020; Trophy T=6461 CT=839
- CT: Outside T=112614 CT=77005; Ramp T=2107 CT=40490; BombsiteA T=4688 CT=33009; CTSpawn T=0 CT=25131; Rafters T=0 CT=21442; Hell T=0 CT=13992; Mini T=123 CT=13664; Admin T=0 CT=12218

### T 默认位草案
- outside / 外场: Outside(外场) T=112614 CT=77005; Roof(屋顶) T=12504 CT=107; Silo(山上) T=12299 CT=0
- lobby_a / 匪厅/A内: Lobby(匪厅) T=48452 CT=2005; Squeaky(铁门房) T=7703 CT=1020; Hut(黄房) T=2055 CT=2126; Trophy(奖杯房) T=6461 CT=839
- ramp / 铁板: Ramp(铁板) T=2107 CT=40490
- secret_b / K1/地下: Secret(K1) T=3692 CT=869; Tunnels(K1地下) T=1976 CT=4362; Vending(链接) T=13354 CT=764; Control(链接) T=2336 CT=2985

### CT 默认位草案
- outside / 外场: Outside(外场) T=112614 CT=77005; Garage(大仓) T=465 CT=10787; Catwalk(外场三楼) T=0 CT=4091; Crane T=0 CT=3039
- a_site / A点: BombsiteA(A包) T=4688 CT=33009; Rafters(三楼横梁) T=0 CT=21442; Mini(正门) T=123 CT=13664; HutRoof(黄房顶) T=0 CT=8058; Heaven(三楼) T=0 CT=12031; Hell(三楼下) T=0 CT=13992
- ramp / 铁板: Ramp(铁板) T=2107 CT=40490; Admin(铁板三楼下) T=0 CT=12218
- b_site / B点: BombsiteB(B包) T=450 CT=1688; Control(链接) T=2336 CT=2985; Decon(死门) T=4 CT=183; Observation(控制室) T=19 CT=777
- ct_spawn / 警家: CTSpawn(警家) T=0 CT=25131; LockerRoom(更衣室) T=9 CT=1376

### 相邻证据
同一玩家在开局窗口内发生 callout 变化时记录一条有向边。
- TSpawn(匪家) -> Outside(外场): T=1304 CT=1
- CTSpawn(警家) -> Outside(外场): T=0 CT=1285
- Outside(外场) -> Hell(三楼下): T=0 CT=903
- Outside(外场) -> Lobby(匪厅): T=622 CT=2
- Hell(三楼下) -> Heaven(三楼): T=0 CT=534
- Heaven(三楼) -> Rafters(三楼横梁): T=0 CT=510
- Hell(三楼下) -> Admin(铁板三楼下): T=0 CT=412
- Admin(铁板三楼下) -> Ramp(铁板): T=0 CT=368
- Lobby(匪厅) -> Vending(链接): T=255 CT=10
- Rafters(三楼横梁) -> BombsiteA(A包): T=0 CT=238
- Outside(外场) -> Mini(正门): T=7 CT=212
- Outside(外场) -> Roof(屋顶): T=209 CT=0
- Vending(链接) -> Trophy(奖杯房): T=183 CT=8
- Outside(外场) -> Garage(大仓): T=12 CT=129
- Lobby(匪厅) -> Squeaky(铁门房): T=133 CT=6
- Outside(外场) -> Secret(K1): T=115 CT=2

### TS 草案
```ts
de_nuke: {
    t: {
      anchors: {
              "outside": {
                      "name": "外场",
                      "callouts": [
                              "Outside",
                              "Roof",
                              "Silo"
                      ]
              },
              "lobby_a": {
                      "name": "匪厅/A内",
                      "callouts": [
                              "Lobby",
                              "Squeaky",
                              "Hut",
                              "Trophy"
                      ]
              },
              "ramp": {
                      "name": "铁板",
                      "callouts": [
                              "Ramp"
                      ]
              },
              "secret_b": {
                      "name": "K1/地下",
                      "callouts": [
                              "Secret",
                              "Tunnels",
                              "Vending",
                              "Control"
                      ]
              }
      },
      roles: {
              "Admin": "ct",
              "BombsiteA": "terminal",
              "BombsiteB": "terminal",
              "Catwalk": "ct",
              "Crane": "ct",
              "CTSpawn": "terminal",
              "Decon": "ct",
              "Garage": "ct",
              "Heaven": "ct",
              "Hell": "ct",
              "HutRoof": "ct",
              "LockerRoom": "ct",
              "Mini": "ct",
              "Observation": "ct",
              "Rafters": "ct",
              "TSpawn": "advanced",
              "Vents": "ct"
      },
    },
    ct: {
      anchors: {
              "outside": {
                      "name": "外场",
                      "callouts": [
                              "Outside",
                              "Garage",
                              "Catwalk",
                              "Crane"
                      ]
              },
              "a_site": {
                      "name": "A点",
                      "callouts": [
                              "BombsiteA",
                              "Rafters",
                              "Mini",
                              "HutRoof",
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
                      "name": "B点",
                      "callouts": [
                              "BombsiteB",
                              "Control",
                              "Decon",
                              "Observation"
                      ]
              },
              "ct_spawn": {
                      "name": "警家",
                      "callouts": [
                              "CTSpawn",
                              "LockerRoom"
                      ]
              }
      },
      roles: {
              "Hut": "advanced",
              "Lobby": "advanced",
              "Roof": "advanced",
              "Secret": "advanced",
              "Squeaky": "advanced",
              "Trophy": "advanced",
              "TSpawn": "terminal",
              "Tunnels": "advanced",
              "Vending": "advanced",
              "Vents": "advanced"
      },
    },
  },
```
## de_overpass

样本 ZIP：7

### 高频占有
- T: Tunnels T=28742 CT=725; TSpawn T=24011 CT=0; Fountain T=19654 CT=1220; Alley T=12585 CT=58; Canal T=10775 CT=3988; TStairs T=5685 CT=13; Water T=5519 CT=11237; Pipe T=5035 CT=36
- CT: LowerPark T=2609 CT=29154; Walkway T=173 CT=13900; BombsiteB T=1671 CT=13466; BombsiteA T=0 CT=13424; Water T=5519 CT=11237; UpperPark T=3104 CT=8601; UnderA T=0 CT=8386; SnipersNest T=0 CT=6328

### T 默认位草案
- a_upper / A区上路: Fountain(喷泉) T=19654 CT=1220; Playground(游乐园) T=4153 CT=41; UpperPark(A大厕所) T=3104 CT=8601; LowerPark(A小厕所) T=2609 CT=29154
- underpass / 下水道: Tunnels(下水道) T=28742 CT=725; Connector(下水道) T=4377 CT=5229
- canal / 长管: Canal(长管) T=10775 CT=3988
- b_short / B短/工地: Pipe(短管) T=5035 CT=36; Water(工地) T=5519 CT=11237; Construction(B小) T=1598 CT=3920
- b_outer / B外: Alley(匪家B外) T=12585 CT=58; TStairs(匪楼梯) T=5685 CT=13

### CT 默认位草案
- a_site / A点: BombsiteA(A包) T=0 CT=13424; LowerPark(A小厕所) T=2609 CT=29154; UpperPark(A大厕所) T=3104 CT=8601; BackofA(垃圾桶) T=0 CT=5374; UnderA(一层) T=0 CT=8386; Stairs(楼梯) T=0 CT=3088; Restroom(厕所) T=186 CT=759
- b_site / B点: BombsiteB(B包) T=1671 CT=13466; Water(工地) T=5519 CT=11237; Walkway(ABC) T=173 CT=13900; SnipersNest(B二楼) T=0 CT=6328; Construction(B小) T=1598 CT=3920
- connector / 下水道: Connector(下水道) T=4377 CT=5229
- bank / 银行: Lobby(银行) T=0 CT=249; StorageRoom(银行) T=0 CT=266

### 相邻证据
同一玩家在开局窗口内发生 callout 变化时记录一条有向边。
- BombsiteA(A包) -> BackofA(垃圾桶): T=0 CT=390
- TStairs(匪楼梯) -> Tunnels(下水道): T=377 CT=0
- TSpawn(匪家) -> TStairs(匪楼梯): T=371 CT=0
- BackofA(垃圾桶) -> Stairs(楼梯): T=0 CT=343
- Stairs(楼梯) -> UnderA(一层): T=0 CT=342
- Tunnels(下水道) -> Fountain(喷泉): T=240 CT=0
- UnderA(一层) -> Walkway(ABC): T=0 CT=220
- TSpawn(匪家) -> Alley(匪家B外): T=209 CT=0
- BombsiteA(A包) -> LowerPark(A小厕所): T=0 CT=204
- Alley(匪家B外) -> Canal(长管): T=198 CT=0
- Water(工地) -> BombsiteB(B包): T=2 CT=140
- UnderA(一层) -> SnipersNest(B二楼): T=0 CT=128
- Canal(长管) -> Pipe(短管): T=117 CT=0
- Walkway(ABC) -> Water(工地): T=1 CT=111
- SnipersNest(B二楼) -> Water(工地): T=0 CT=99
- Pipe(短管) -> Water(工地): T=91 CT=0

### TS 草案
```ts
de_overpass: {
    t: {
      anchors: {
              "a_upper": {
                      "name": "A区上路",
                      "callouts": [
                              "Fountain",
                              "Playground",
                              "UpperPark",
                              "LowerPark"
                      ]
              },
              "underpass": {
                      "name": "下水道",
                      "callouts": [
                              "Tunnels",
                              "Connector"
                      ]
              },
              "canal": {
                      "name": "长管",
                      "callouts": [
                              "Canal"
                      ]
              },
              "b_short": {
                      "name": "B短/工地",
                      "callouts": [
                              "Pipe",
                              "Water",
                              "Construction"
                      ]
              },
              "b_outer": {
                      "name": "B外",
                      "callouts": [
                              "Alley",
                              "TStairs"
                      ]
              }
      },
      roles: {
              "BackofA": "ct",
              "BombsiteA": "terminal",
              "BombsiteB": "terminal",
              "Bridge": "ct",
              "Lobby": "ct",
              "Restroom": "ct",
              "SideAlley": "advanced",
              "SnipersNest": "ct",
              "Stairs": "ct",
              "StorageRoom": "ct",
              "TSpawn": "advanced",
              "UnderA": "ct",
              "Walkway": "ct"
      },
    },
    ct: {
      anchors: {
              "a_site": {
                      "name": "A点",
                      "callouts": [
                              "BombsiteA",
                              "LowerPark",
                              "UpperPark",
                              "BackofA",
                              "UnderA",
                              "Stairs",
                              "Restroom"
                      ]
              },
              "b_site": {
                      "name": "B点",
                      "callouts": [
                              "BombsiteB",
                              "Water",
                              "Walkway",
                              "SnipersNest",
                              "Construction"
                      ]
              },
              "connector": {
                      "name": "下水道",
                      "callouts": [
                              "Connector"
                      ]
              },
              "bank": {
                      "name": "银行",
                      "callouts": [
                              "Lobby",
                              "StorageRoom"
                      ]
              }
      },
      roles: {
              "Alley": "advanced",
              "Bridge": "advanced",
              "Canal": "advanced",
              "Fountain": "advanced",
              "Pipe": "advanced",
              "Playground": "advanced",
              "TSpawn": "terminal",
              "TStairs": "advanced",
              "Tunnels": "advanced"
      },
    },
  },
```
