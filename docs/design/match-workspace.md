# 设计：Match Workspace 可视化模块

> 定位：把一张 `cs2-demo-format/2.0` ZIP 展示成可复用的比赛分析工作台。目标是先在本仓库做出稳定体验，再让 RivalHub 以组件方式接入，而不是继续在 RivalHub 页面里直接拼 `demo_*` 查询。

## 目标

用户进入一场比赛时，看到的不是一组分散统计表，而是一个可以回答问题的 match workspace：

- 这场比赛总体发生了什么？
- 哪些回合改变了走势？
- 选手各自贡献在哪里？
- 经济、道具、残局、开局对枪如何影响胜负？
- 击杀、死亡、道具和站位在地图上如何分布？
- 关键回合能否用 2D replay 回看？
- RR 等派生指标的数据可信度如何解释？

## 数据边界

输入以 `cs2-demo-format/2.0` ZIP 为准。本仓库消费 ZIP 中的稳定部件：

- 聚合与列表：`match.json`, `players.json`, `rounds.json`, `player-stats.json`
- 事件：`kills.json`, `damages.json`, `blinds.json`, `bombs.json`, `grenades.json`, `clutches.json`, `shots.json`
- 空间与回放：`positions-1s.json`, `replay.json`
- 质量：strict validator 结果 + 本仓库 analysis QA。质量信息不进入普通用户 workspace，只进入管理员/开发者 QA 页面。

`@cs2dak/core` 负责把 ZIP 转成 `MatchWorkspaceModel`。`@cs2dak/react` 只消费 model，不直接读 ZIP 或数据库。RivalHub 负责导入、权限、身份映射、页面壳和持久化，不把展示逻辑散落在 `demo_*` 查询里。

## 顶层信息架构

首屏建议是一个紧凑工作台，而不是长页面堆叠：

1. `Overview`：比赛摘要和关键故事。
2. `Rounds`：回合浏览、时间线和关键事件。
3. `Players`：选手视角分析。
4. `Economy`：经济走势和转化。
5. `Map`：热力图、位置和道具空间分析。
6. `Replay`：2D 回放。

RivalHub 可以把这些作为同一个“Demo 分析”区域里的 tabs，也可以在 match page 里只嵌入部分模块。

## 模块设计

### 1. Overview

用户看到：

- 地图、比分、队伍、回合数、导入/解析状态。
- 最高 RR、最高 ADR、关键选手、上下半场走势、关键回合入口。
- 一段简短 match story：例如“Team A 靠 4 个防守方连胜拉开比分”“Team B 的强起转化率异常高”。

展示目的：

- 让用户先理解这场比赛的主线。
- 给后续模块提供入口，而不是直接把所有数据摊开。

数据来源：

- `match.json`, `rounds.json`, `player-stats.json`, `kills.json`, `player-economies.json`
- `@rivalhub/rival-rating` 的 RR / PRISM 派生结果

参考对象：

- pr1maly 的 match breakdown：用少量卡片先讲清主线。
- CS Demo Manager 的 match overview：比赛级信息和回合入口放在同一个工作区。

### 2. Rounds

用户看到：

- 横向回合时间线：胜负方、阵营、比分变化、结束原因、经济类型。
- 选中某回合后显示该回合的击杀链、炸弹事件、开局对枪、残局、经济状态。
- 支持按回合、阵营、经济类型、胜负、选手过滤。

展示目的：

- 把静态 timeline 升级成回合浏览器。
- 让用户能从“第几回合为什么赢/输”进入分析。

数据来源：

- `rounds.json`
- `kills.json`, `bombs.json`, `grenades.json`, `clutches.json`
- `player-economies.json`

参考对象：

- CS Demo Manager 的 rounds / duels 工作区：以回合为主导航。
- cs2-2d-demoviewer 的 round selector：回合选择要能联动 replay。

暂不做：

- “关键道具”自动判断。当前只展示道具事件和位置；真正判断某颗道具是否关键，需要地图区域、遮挡/视野、timing 和回合 outcome 的更深分析。

### 3. Players

用户看到：

- 两队 scoreboard：K/D/A、ADR、KAST、HS%、entry、trade、clutch、utility、RR。
- 选中一名选手后展示个人 story：强项、弱项、关键回合、击杀/死亡热区、武器、道具、残局。
- RR v2 解释面板：combat、trade、clutch、objective、utility 的贡献和数据可信度。

展示目的：

- 不只是排名，而是解释“这个选手怎么影响比赛”。
- 让 RivalHub 的选手页和比赛页使用同一套分析语言。

数据来源：

- `player-stats.json`
- `kills.json`, `damages.json`, `blinds.json`, `grenades.json`, `clutches.json`
- `positions-1s.json` 用于个人位置/热区
- `@rivalhub/rival-rating` 用于 RR / PRISM

参考对象：

- pr1maly 的 player performance narrative：把个人表现讲成强项、弱项和趋势。
- RivalHub 当前 `DemoPlayerStatsTable` / player demo cards：保留赛事产品里已经有用的列和选手链接。
- AWPy stats：ADR / KAST / rating 口径和测试基准。

### 4. Economy

用户看到：

- 每回合两队装备价值折线。
- 上下半区按经济类型上色：pistol、eco、semi、force、full。
- 每种经济类型下的胜率、转化率、强起/eco 成功回合。
- 选中回合时联动到 Rounds 和 Replay。

展示目的：

- 让用户理解经济如何改变比赛走势。
- 把“装备差”和“回合结果”放在一起看，而不是只看数值。

数据来源：

- `player-economies.json`
- `rounds.json`
- `kills.json`, `bombs.json` 用于回合结果上下文

参考对象：

- CS Demo Manager 的 economy/round UI：经济类型和回合结果一起看。
- RivalHub 当前 `DemoEconomyChart`：装备价值折线和经济类型背景已经是可复用雏形。

### 5. Map

用户看到：

- 地图底图上的 kill、death、grenade、bomb、position 热力图。
- 模式切换：全场、单队、单选手、单回合、上下半场、阵营。
- 点图和强度热力图两种展示。
- 状态提示：无底图、无位置数据、缺失坐标时给用户清楚的降级说明。

展示目的：

- 把空间信息作为分析入口，而不是装饰图。
- 让用户能检查“死在哪里、杀在哪里、道具落在哪里、队伍活动区域在哪里”。

数据来源：

- `kills.json`, `grenades.json`, `bombs.json`
- `positions-1s.json`
- `@cs2dak/maps` 的地图校准和 radar 底图

参考对象：

- CS Demo Manager 的 heatmap renderer：强度算法、半径/透明度、过滤器。
- AWPy map/plot：地图坐标、底图和可复算绘图口径。
- RivalHub 当前 `PlayerKillHeatmap`：单选手 kill/death 过滤是应该保留的交互。

### 6. Replay

用户看到：

- 2D radar 回放：10 名玩家、朝向、血量、武器、闪光状态、拆弹器状态。
- 回合选择器、tick scrubber、播放/暂停、倍速、跳过 freeze time。
- 击杀 marker、炸弹事件列表、道具轨迹/生效状态。
- 选中选手后高亮本人、队友、敌人和相关 kill feed。

展示目的：

- 把 timeline 从静态列表升级成可回看的播放器。
- 支撑“这个回合到底怎么打的”这类用户问题。

数据来源：

- `replay.json` 是首选回放流：8Hz columnar player track，包含 `x/y/z/yaw/hp/weapon/flags`。
- `positions-1s.json` 作为低频分析/热力图流，不作为主要播放器数据。
- `kills.json`, `bombs.json`, `grenades.json` 叠加事件 marker。
- `rounds.json` 提供回合边界和 freeze/end tick。

实现边界：

- 本仓库提供 replay model 和 React viewer。
- RivalHub 不自己重建 frame model，只传入或读取 `MatchWorkspaceModel.replay`。
- 如果某个 ZIP 没有 `replay.json`，Replay tab 显示“该导出包不含回放流”，并可退化到低频位置预览。
- C4 地图位置先不承诺展示。当前回放先做玩家、击杀、道具和炸弹事件列表；C4 位置等 exporter/replay 侧状态完整后再打开。

参考对象：

- cs2-2d-demoviewer 的 frame/playback 协议：tick scrubber、round selector、player highlight、frame render loop。
- CS Demo Manager 的 2D viewer：播放器工作区和事件叠加方式。

### 7. Admin QA Page

管理员/开发者看到：

- 整体状态：通过、警告、错误。
- 字段可用性：player stats、rounds、economy、rich kills、positions、replay、map calibration。
- 具体问题：事件越界、坐标异常、字段缺失、回放帧不完整。
- 影响说明：例如“replay 缺失只影响 2D 回放，不影响 scoreboard/RR”。

展示目的：

- 不污染普通用户界面。
- 让开发者和赛事管理员能判断问题来自 exporter、ZIP、地图资产还是 UI 降级。

数据来源：

- `cs2-demo-format` strict validator
- `@cs2dak/core` analysis QA
- map/replay renderer 的前端可渲染性检查

参考对象：

- AWPy 的 golden tests / stats tests：QA 要能给开发者可复核证据。
- `cs2-demo-format/tools/validate.py`：strict ZIP contract 是质量判断的源头。

## RivalHub 接入方式

主线接入：

1. RivalHub 收到并保存 `cs2-demo-format/2.0` ZIP。
2. 导入时调用 `@cs2dak/core` 基于 ZIP 生成 `MatchWorkspaceModel` 和 admin QA report。
3. RivalHub 保存 workspace 快照，match page 直接读取快照并渲染 `@cs2dak/react` 组件。
4. 赛季聚合、选手页和榜单需要结构化数据时，再从同一个 ZIP / workspace 派生产品侧行数据。

这个方向不再分“短期/中期”。RivalHub 后续应完整适配本仓库的 ZIP 分析和快照模型，而不是维护一套独立的 demo 展示 DTO。

RivalHub 仍保留的责任：

- `mapId/importBatchId` 生命周期。
- `steamId64 -> userId` 身份映射和选手链接。
- 权限、导入、删除、审计、页面路由。
- 赛事产品上下文：队伍名、赛季、比赛状态、MVP、公开页/admin 页差异。

本仓库承担的责任：

- ZIP 合同消费。
- 分析 view-model。
- 可复用 React 展示。
- 管理员 QA、字段可用性和降级解释。
- 2D replay frame/player/event 协议。

## 首批交付顺序

1. 定义 `MatchWorkspaceModel`：把当前 `AnalysisBundle` 扩展成 workspace 级合同。
2. 做 `MapWorkspace`：统一 heatmap renderer、过滤器和坐标降级提示。
3. 做 `RoundExplorer`：回合时间线、回合详情和事件联动。
4. 做 `PlayerStoryPanel`：选手解释、RR breakdown、个人空间/武器/关键回合。
5. 做 `ReplayViewer`：基于 `replay.json` 的 2D 播放器。
6. 再把 `DemoAnalysisDashboard` 收敛成 `MatchWorkspace` 的 demo-lab 页面。
7. 最后做 RivalHub adapter 和页面替换。

## 不做什么

- 不在 RivalHub 页面里继续复制一套图表逻辑。
- 不把 RivalHub 数据库 schema 作为本仓库组件合同。
- 不复制 pr1maly 的 source-available 实现。
- 不把 `positions-1s.json` 当成完整 replay 数据；完整播放器以 `replay.json` 为准。
- 不在 UI 层修正 exporter 错误；错误进入管理员 QA，由 exporter 或 core 派生层修。
