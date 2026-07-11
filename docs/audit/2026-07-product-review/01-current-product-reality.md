# DAK Studio Current Product Reality

调查日期：2026-07-09  
调查方式：以第一次接手的中期成熟产品视角，只读运行 DAK Studio，浏览真实界面并对照实现证据。  
边界：第一阶段未阅读 `docs/design/studio-redesign.md`、`roadmap.md`。除本审计输出与截图外，本次不修改源码、配置或既有产品文档。

## 运行与采样

事实：

- 使用 `pnpm dev` 启动 DAK Studio，本地界面运行在 `http://127.0.0.1:5178/`。
- 从空库进入，加载内置“7 图示例”后进行页面采样；资料库显示 7 场 demo、6 张地图、70 个选手人次。
- 采样页面覆盖：我的主页、资料库、比赛工作台、选手档案、开局动线、对枪复盘、赛事与队伍三子页、对枪概览、转化与节奏、道具价值、控图、教练工作台。
- `道具点位库` 与 `管理` 有实现证据；本轮 Playwright 点击采样没有获得稳定截图，因此只把 UI 判断限定在可观察入口和实现证据上。
- 运行时观察到 favicon 404 与更新检查跨域/网络失败噪声；这些没有阻断产品页面采样，也不作为产品结构判断依据。

截图索引：

| 截图 | 证明的 UI 事实 |
|---|---|
| [01-empty-home.png](screenshots/01-empty-home.png) | 空库首页、一级导航、空状态引导 |
| [02-empty-library.png](screenshots/02-empty-library.png) | 空资料库、导入 demo、加载示例入口 |
| [03-library-with-sample.png](screenshots/03-library-with-sample.png) | 示例库加载后，资料库统计、筛选、比赛列表 |
| [04-home-pick-self.png](screenshots/04-home-pick-self.png) | 首页要求先标记“这是我” |
| [05-home-with-self.png](screenshots/05-home-with-self.png) | 标记我之后的个人主页、练习建议和证据入口 |
| [06-match-workbench.png](screenshots/06-match-workbench.png) | 比赛工作台、单场比赛上下文、回合/地图/回放结构 |
| [07-players-profile.png](screenshots/07-players-profile.png) | 选手档案、选手列表、关注/对比、画像子页 |
| [08-opening-trails.png](screenshots/08-opening-trails.png) | 开局动线、选手/地图/阵营选择、回合轨迹 |
| [09-duel-review.png](screenshots/09-duel-review.png) | 对枪复盘、证据队列、筛选和分类 |
| [10-tournament-leaderboard.png](screenshots/10-tournament-leaderboard.png) | 赛事与队伍：排行榜子页 |
| [11-tournament-dashboard.png](screenshots/11-tournament-dashboard.png) | 赛事与队伍：赛事总览、队伍对比、地图/武器盘面 |
| [12-events-collection.png](screenshots/12-events-collection.png) | 赛事与队伍：赛事合集，Event -> Stage -> Series -> Map |
| [13-duel-overview.png](screenshots/13-duel-overview.png) | 对枪概览、首杀位置和地图对枪态势 |
| [14-economy.png](screenshots/14-economy.png) | 转化与节奏、经济/人数优势指标 |
| [15-utility-value.png](screenshots/15-utility-value.png) | 道具价值、雷火烟闪榜单和证据入口 |
| [17-control-map.png](screenshots/17-control-map.png) | 控图覆盖场、地图/对象/模式选择 |
| [18-coach-workbench.png](screenshots/18-coach-workbench.png) | 教练工作台、己方/敌方、开局模式和证据面板 |

## A. 当前产品模型

### 一级导航与二级结构

事实：

- 一级导航由 4 个可见分组和一个底部管理入口组成：`开始`、`选手复盘`、`赛事与队伍`、`备战`、`管理`。实现证据：`apps/dak-studio/src/App.tsx:52-87`；UI 证据：[01-empty-home.png](screenshots/01-empty-home.png)。
- `开始` 下有：我的主页、资料库、比赛工作台。实现证据：`apps/dak-studio/src/App.tsx:54-59`。
- `选手复盘` 下有：选手档案、开局动线、对枪复盘。实现证据：`apps/dak-studio/src/App.tsx:61-67`。
- `赛事与队伍` 下有：赛事与队伍、对枪概览、转化与节奏、道具价值、道具点位库、控图。实现证据：`apps/dak-studio/src/App.tsx:69-78`。
- `备战` 下有：教练工作台。实现证据：`apps/dak-studio/src/App.tsx:80-84`。
- `赛事与队伍` 是一个页面容器，内部二级 tab 是：排行榜、赛事总览、赛事合集。实现证据：`apps/dak-studio/src/App.tsx:89-93`、`apps/dak-studio/src/App.tsx:734-770`；UI 证据：[10-tournament-leaderboard.png](screenshots/10-tournament-leaderboard.png)、[11-tournament-dashboard.png](screenshots/11-tournament-dashboard.png)、[12-events-collection.png](screenshots/12-events-collection.png)。
- `管理` 内部二级 tab 由 `MGMT_TABS` 渲染，至少包含资产、赛事、身份管理方向；页面文案是“选手与队伍身份 · 资产与存储 · 赛事”。实现证据：`apps/dak-studio/src/views/ManagementView.tsx:244-267`。
- 多个主页面还有页面内部 tab：比赛工作台有回放/概览/回合/选手/经济/武器/对位/地图；选手档案有总览/枪法机制/道具失误/趋势比赛；对枪复盘有对枪记录/枪法机制；教练工作台有开局模式/战术本/备战清单/备战报告。UI 证据分别见 [06-match-workbench.png](screenshots/06-match-workbench.png)、[07-players-profile.png](screenshots/07-players-profile.png)、[09-duel-review.png](screenshots/09-duel-review.png)、[18-coach-workbench.png](screenshots/18-coach-workbench.png)。

推断：

- 当前信息架构不是单一“赛事中台”或单一“个人复盘”产品，而是围绕 demo 语料库建立的多视角分析工作台：个人、比赛、赛事/队伍、备战共存。

### 核心对象

事实：

| 对象 | 当前 UI 中的表现 | 证据 |
|---|---|---|
| 我 | 首页空态要求标记“这是我”；选手档案中可用星标设置关注/本人 | [04-home-pick-self.png](screenshots/04-home-pick-self.png)、[05-home-with-self.png](screenshots/05-home-with-self.png)、`apps/dak-studio/src/views/HomeView.tsx:252-337`、`apps/dak-studio/src/views/PlayersView.tsx:188-321` |
| 选手 | 选手档案、排行榜、对枪复盘、开局动线、道具价值都以选手为可选/可点击对象 | [07-players-profile.png](screenshots/07-players-profile.png)、[10-tournament-leaderboard.png](screenshots/10-tournament-leaderboard.png)、`apps/dak-studio/src/views/LeaderboardView.tsx:55-75` |
| 比赛 / demo | 资料库列表、比赛工作台当前比赛选择、证据按钮跳转到比赛/回合/tick | [03-library-with-sample.png](screenshots/03-library-with-sample.png)、[06-match-workbench.png](screenshots/06-match-workbench.png)、`apps/dak-studio/src/views/LibraryView.tsx:171-510`、`apps/dak-studio/src/views/MatchView.tsx:114-178` |
| 赛事 / 赛事包 | 赛事与队伍子页的赛事合集，按 Event -> Stage -> Series -> Map 展示 | [12-events-collection.png](screenshots/12-events-collection.png)、`apps/dak-studio/src/views/EventsView.tsx:36-80` |
| 队伍 | CohortScope 队伍透镜、赛事总览队伍对比、控图对象、教练工作台己方/对手 | [11-tournament-dashboard.png](screenshots/11-tournament-dashboard.png)、[17-control-map.png](screenshots/17-control-map.png)、[18-coach-workbench.png](screenshots/18-coach-workbench.png)、`apps/dak-studio/src/components/CohortScope.tsx:151-170` |
| 地图 | 全局地图范围、开局动线地图、控图地图、道具点位地图、赛事地图 | [08-opening-trails.png](screenshots/08-opening-trails.png)、[17-control-map.png](screenshots/17-control-map.png)、`apps/dak-studio/src/components/CohortScope.tsx:132-149` |
| 回合 | 比赛工作台回合页、证据卡、教练证据回合、道具/对枪 deep link | [06-match-workbench.png](screenshots/06-match-workbench.png)、[09-duel-review.png](screenshots/09-duel-review.png)、[18-coach-workbench.png](screenshots/18-coach-workbench.png) |
| 证据 | EvidenceLink/EvidenceActions 风格按钮，通常打开比赛工作台并定位回合/tick | [05-home-with-self.png](screenshots/05-home-with-self.png)、[15-utility-value.png](screenshots/15-utility-value.png)、`apps/dak-studio/src/views/LineupView.tsx:240-267` |
| 身份归并 | 管理页支持选手/队伍改名、合并、拆分和操作历史 | `apps/dak-studio/src/views/ManagementView.tsx:277-535` |

推断：

- “证据”在产品里已经是一个核心对象，而不是简单跳转：它把个人建议、对枪、道具、教练模式和比赛工作台连接起来。
- “赛事”存在两种含义：一是 CohortScope 的聚合范围，二是 Event Package 的只读层级视图。这两个对象在 UI 中都叫赛事相关，边界需要后续确认。

### 全局上下文与页面内选择

事实：

- 只要已经有 entries，且当前页面不是 `home`、`library`、`match`、`management`，App 会显示全局 `CohortScope`。实现证据：`apps/dak-studio/src/App.tsx:589-597`。
- `CohortScope` 将范围分为语料层和透镜层：event/map/tag/excludedIds 决定 demo 集合，teams 是队伍透镜，不窄化 demo 语料。实现证据：`apps/dak-studio/src/components/CohortScope.tsx:11-18`、`apps/dak-studio/src/components/CohortScope.tsx:40-56`。
- CohortScope UI 提供全部 demo、赛事、地图、队伍、标签、按场次筛选和重置。实现证据：`apps/dak-studio/src/components/CohortScope.tsx:103-195`；UI 证据：[07-players-profile.png](screenshots/07-players-profile.png)、[10-tournament-leaderboard.png](screenshots/10-tournament-leaderboard.png)。
- 页面内部选择包括：比赛工作台的当前比赛；选手档案的当前选手/对比选手；开局动线的选手/地图/阵营；对枪复盘的证据分类/武器；控图的地图/对象/模式；教练工作台的己方/对手/模式。

推断：

- 当前产品的工作方式是“先拥有一批 demo 语料，再在不同分析页面切换视角”。全局范围先决定可分析语料，页面内部再决定对象或分析镜头。

### 先选对象还是先选分析类型

事实：

- 空产品路径先要求导入 demo，再要求标记“这是我”。UI 证据：[01-empty-home.png](screenshots/01-empty-home.png)、[04-home-pick-self.png](screenshots/04-home-pick-self.png)。
- 示例数据加载后，主要入口是左侧分析页面；大多数页面打开后才选择局部对象。UI 证据：[07-players-profile.png](screenshots/07-players-profile.png)、[08-opening-trails.png](screenshots/08-opening-trails.png)、[17-control-map.png](screenshots/17-control-map.png)。
- 比赛工作台和赛事合集更偏对象优先：先选当前比赛，或按 Event -> Stage -> Series -> Map 浏览。UI 证据：[06-match-workbench.png](screenshots/06-match-workbench.png)、[12-events-collection.png](screenshots/12-events-collection.png)。

推断：

- 新用户路径是对象/数据优先：导入 demo -> 标记我 -> 回首页。成熟使用路径是分析类型优先：先进页面，再用全局范围与局部控件选择对象。

## B. 页面职责

| 页面 | 用户为什么来到这里 | 它试图回答什么问题 | 核心内容 | 主要输入上下文 | 结果后去哪里/做什么 | 重叠 | 证据 |
|---|---|---|---|---|---|---|---|
| 我的主页 | 看“我”的最近状态和下一步训练方向 | 我最近打得怎么样、该练什么、有哪些证据 | 个人指标、打法风格、趋势、练习建议、开局动线、最近比赛、闪光价值 | 全资料库 + 已标记的“这是我” | 打开最近比赛、打开证据回合、去选手档案、去资料库 | 与选手档案共享个人画像；与开局动线/道具价值共享摘要 | [04-home-pick-self.png](screenshots/04-home-pick-self.png)、[05-home-with-self.png](screenshots/05-home-with-self.png)、`apps/dak-studio/src/views/HomeView.tsx:252-523` |
| 资料库 | 导入、检查、筛选和维护 demo | 当前有哪些比赛可分析，数据是否具备回放/facts | 导入控件、库统计、地图/tag/server/date 筛选、demo 表格、批量操作 | 本地 IndexedDB/桌面库中的 demo entries | 打开比赛工作台、重建 facts、编辑标签、导入赛事资产 | 与管理页的资产维护有边界重叠 | [02-empty-library.png](screenshots/02-empty-library.png)、[03-library-with-sample.png](screenshots/03-library-with-sample.png)、`apps/dak-studio/src/views/LibraryView.tsx:171-510` |
| 比赛工作台 | 进入单场比赛复盘 | 这一场比赛的回合、选手、经济、武器、对位、地图发生了什么 | 单场比赛选择、系列赛/BP、MatchWorkspace、回放/概览/回合/选手/经济/武器/对位/地图 | 当前选中的 demo 或证据 deep link | 切换回合、看回放、从证据定位到 tick/round | 与经济/对枪/道具页面共享事实，但这里是单场容器 | [06-match-workbench.png](screenshots/06-match-workbench.png)、`apps/dak-studio/src/views/MatchView.tsx:114-178` |
| 选手档案 | 查看某个选手的长期画像 | 这个选手是什么类型、强弱项在哪里、趋势如何 | roster、本人星标、对比选手、核心指标、RR/PRISM、武器、机制、道具、失误、趋势、比赛 | 全局 CohortScope + 当前选手 | 标记“这是我”、打开证据/比赛、导出选手卡、切换选手 | 与首页个人摘要、排行榜点击选手、对枪复盘重叠 | [07-players-profile.png](screenshots/07-players-profile.png)、`apps/dak-studio/src/views/PlayersView.tsx:209-565` |
| 开局动线 | 看选手出门路线和默认位 | 某选手在某图某边开局怎么走 | 选手选择、地图选择、范围选择、T/CT、雷达轨迹、回合列表 | 全局 CohortScope + 选手/地图/阵营 | 切换选手/地图/回合，回到相关比赛证据 | 与首页的开局动线卡、教练开局模式共享主题 | [08-opening-trails.png](screenshots/08-opening-trails.png)、`apps/dak-studio/src/views/TrailsView.tsx:217-320` |
| 对枪复盘 | 做个人或范围内的对枪证据审查 | 哪些对枪值得复盘，枪法机制问题是什么 | 对枪记录、分类筛选、武器筛选、证据卡、机制 tab | 全局 CohortScope + 对枪分类/武器筛选 | 打开比赛证据、切到机制分析 | 与对枪概览共享 DuelView，但目标从队伍态势变成证据队列 | [09-duel-review.png](screenshots/09-duel-review.png)、`apps/dak-studio/src/views/DuelView.tsx:112-190`、`apps/dak-studio/src/views/DuelView.tsx:476-546` |
| 赛事与队伍：排行榜 | 看聚合范围内选手排名 | 谁在当前范围表现最好，可以点进谁 | SeasonLeaderboard，Core/Impact/Advanced 排名 | 全局 CohortScope | 点击选手进选手档案 | 与选手档案、赛事总览共享 cohort 聚合 | [10-tournament-leaderboard.png](screenshots/10-tournament-leaderboard.png)、`apps/dak-studio/src/views/LeaderboardView.tsx:55-75` |
| 赛事与队伍：赛事总览 | 看当前范围的赛事/队伍宏观盘面 | 当前范围地图、攻防、手枪、武器、队伍对比如何 | 场次/回合/T/CT/手枪指标、队伍对比、地图盘面、武器榜 | 全局 CohortScope + 队伍对比选择 | 去经济与节奏，看更细经济指标；打开比赛 | 与转化与节奏在手枪/转化主题上重叠 | [11-tournament-dashboard.png](screenshots/11-tournament-dashboard.png)、`apps/dak-studio/src/views/TournamentDashboardView.tsx:111-167` |
| 赛事与队伍：赛事合集 | 按赛事包层级浏览 | 已加载的赛事资产包含哪些阶段/系列赛/地图 | Event selector、Stage、Series、Map、本地只读赛事视图 | 已加载 event package / entries | 打开对应地图比赛，去管理加载资产 | 与资料库/管理的赛事资产入口重叠 | [12-events-collection.png](screenshots/12-events-collection.png)、`apps/dak-studio/src/views/EventsView.tsx:36-80` |
| 对枪概览 | 看范围内地图首杀和对枪态势 | 首杀热点在哪里、哪些位置导致对枪优势/风险 | 地图 tab、首杀位置雷达、证据列表 | 全局 CohortScope + 地图 | 打开证据回合/比赛 | 与对枪复盘共用 DuelView，区别是 overview variant | [13-duel-overview.png](screenshots/13-duel-overview.png)、`apps/dak-studio/src/views/DuelView.tsx:116-190`、`apps/dak-studio/src/views/DuelView.tsx:605-679` |
| 转化与节奏 | 看经济、人数优势和翻盘 | 优势转化好不好，哪些队伍/经济状态出问题 | 回合样本、手枪转化、5v4/5v3/4v5、小枪翻盘、队伍矩阵 | 全局 CohortScope | 定位到队伍/经济问题，回比赛或教练页继续看 | 与赛事总览的宏观节奏和 Match 的单场经济重叠 | [14-economy.png](screenshots/14-economy.png)、`apps/dak-studio/src/views/EconomyView.tsx:57-208` |
| 道具价值 | 看雷火烟闪贡献 | 谁的道具价值高，哪些回合有高价值证据 | HE、火、闪、烟榜单，最佳闪光，最高伤害道具回合 | 全局 CohortScope + 选手身份 | 打开证据回合/比赛，进入个人道具复盘 | 与选手档案道具页、道具点位库重叠 | [15-utility-value.png](screenshots/15-utility-value.png)、`apps/dak-studio/src/views/UtilityView.tsx:135-255` |
| 道具点位库 | 查常见投掷点和落点 | 当前语料里有哪些可复用道具点位 | 道具点位雷达、聚类模式、地图/类型/阵营筛选、点位表、回放/复制命令/进游戏 | 全局 CohortScope + 地图/道具/阵营 | 打开比赛定位投掷，复制练习命令 | 与道具价值共享道具主题，但一个偏价值，一个偏可练点位 | `apps/dak-studio/src/views/LineupsView.tsx:31`、`apps/dak-studio/src/views/LineupView.tsx:75-181`、`apps/dak-studio/src/views/LineupView.tsx:307-524` |
| 控图 | 看地图覆盖、信息差和薄弱区 | 当前范围或队伍在地图上的覆盖/风险如何 | 地图 tab、对象选择、覆盖场 canvas、模式切换 | 全局 CohortScope + 地图 + 赛事基线/队伍对象 | 切换对象/模式，作为队伍或教练诊断依据 | 与教练工作台、赛事队伍分析主题重叠 | [17-control-map.png](screenshots/17-control-map.png)、`apps/dak-studio/src/views/RadarFieldView.tsx:107-168` |
| 教练工作台 | 为己方复盘或敌方侦察准备材料 | 开局模式、战术本、备战清单、备战报告是什么 | 己方/敌方模式、我的队伍/对手队伍、开局 cluster、代表回放、facts、加入清单 | 全局 CohortScope + subject/opponent team + tab/mode | 加入备战清单、打开代表回放、导出/复制报告 | 与开局动线、控图、赛事队伍重叠，但面向备战产物 | [18-coach-workbench.png](screenshots/18-coach-workbench.png)、`apps/dak-studio/src/views/CoachView.tsx:143-185`、`apps/dak-studio/src/views/CoachView.tsx:378-459` |
| 管理 | 维护身份、资产、赛事和存储 | 选手/队伍身份是否合并正确，资产是否可用 | 管理分区、选手身份、队伍身份、操作历史、资产/赛事管理 | 全资料库 entries + identity state | 合并/改名/拆分/撤销，加载赛事资产，回资料库 | 与资料库资产维护、赛事合集入口重叠 | `apps/dak-studio/src/views/ManagementView.tsx:244-535` |

## C. 产品路径

事实路径：

1. 新用户/空库路径：我的主页提示“导入 demo / 标记这是我 / 回主页看复盘”，资料库提供“导入 demo”和“加载 7 图示例”。UI 证据：[01-empty-home.png](screenshots/01-empty-home.png)、[02-empty-library.png](screenshots/02-empty-library.png)。
2. 示例数据路径：资料库加载示例后，用户在首页先标记“这是我”，再看到个人状态、该练什么、最近比赛和证据入口。UI 证据：[03-library-with-sample.png](screenshots/03-library-with-sample.png)、[04-home-pick-self.png](screenshots/04-home-pick-self.png)、[05-home-with-self.png](screenshots/05-home-with-self.png)。
3. 证据复盘路径：首页、选手档案、对枪复盘、道具价值、教练工作台等页面都提供证据按钮，最终打开比赛工作台并定位到具体比赛/回合/tick。UI 证据：[05-home-with-self.png](screenshots/05-home-with-self.png)、[09-duel-review.png](screenshots/09-duel-review.png)、[15-utility-value.png](screenshots/15-utility-value.png)、[18-coach-workbench.png](screenshots/18-coach-workbench.png)。
4. 赛事/队伍分析路径：用户先用 CohortScope 确定事件、地图、队伍或标签范围，再进入排行榜、赛事总览、经济、道具、对枪概览、控图等页面看同一语料的不同切片。实现证据：`apps/dak-studio/src/App.tsx:589-597`、`apps/dak-studio/src/components/CohortScope.tsx:103-195`；UI 证据：[10-tournament-leaderboard.png](screenshots/10-tournament-leaderboard.png)、[11-tournament-dashboard.png](screenshots/11-tournament-dashboard.png)、[17-control-map.png](screenshots/17-control-map.png)。
5. 备战路径：在教练工作台选择己方/敌方、我的队伍/对手队伍，阅读开局模式和证据事实，并把条目加入备战清单/报告。UI 证据：[18-coach-workbench.png](screenshots/18-coach-workbench.png)。
6. 资产/维护路径：资料库负责导入、筛选、重建和删除 demo；管理页负责身份归并、赛事资产和操作历史。实现证据：`apps/dak-studio/src/views/LibraryView.tsx:171-510`、`apps/dak-studio/src/views/ManagementView.tsx:244-535`。

推断路径：

- 产品实际暗示的主闭环是：导入语料 -> 标记身份/范围 -> 在分析页发现问题 -> 点证据回到比赛工作台 -> 再回到个人/队伍/教练视角沉淀结论。
- 另一个次级闭环是赛事/队伍侦察：用赛事包或全局范围锁定语料 -> 看排行榜/总览/控图/教练 -> 形成备战清单。
- 资料库与管理更像数据运营后台，不是主要分析闭环的终点。

## D. 证据汇总

实现证据：

- 路由与一级导航：`apps/dak-studio/src/App.tsx:52-95`。
- 全局范围展示规则与页面装配：`apps/dak-studio/src/App.tsx:589-790`。
- CohortScope 语料层/透镜层定义与过滤实现：`apps/dak-studio/src/components/CohortScope.tsx:11-56`。
- CohortScope UI 控件：`apps/dak-studio/src/components/CohortScope.tsx:103-195`。
- 首页空态、本人状态、练习建议和证据入口：`apps/dak-studio/src/views/HomeView.tsx:252-523`。
- 资料库导入、统计、筛选和列表：`apps/dak-studio/src/views/LibraryView.tsx:171-510`。
- 比赛工作台当前比赛与 MatchWorkspace 装配：`apps/dak-studio/src/views/MatchView.tsx:114-178`。
- 选手档案 roster、本人标记、画像和证据：`apps/dak-studio/src/views/PlayersView.tsx:209-565`。
- 开局动线控件与轨迹区域：`apps/dak-studio/src/views/TrailsView.tsx:217-320`。
- 对枪复盘/概览共用 DuelView 与 evidence/first-kill map：`apps/dak-studio/src/views/DuelView.tsx:112-190`、`apps/dak-studio/src/views/DuelView.tsx:476-546`、`apps/dak-studio/src/views/DuelView.tsx:605-679`。
- 排行榜：`apps/dak-studio/src/views/LeaderboardView.tsx:55-75`。
- 赛事总览：`apps/dak-studio/src/views/TournamentDashboardView.tsx:111-167`。
- 赛事合集：`apps/dak-studio/src/views/EventsView.tsx:36-80`。
- 转化与节奏：`apps/dak-studio/src/views/EconomyView.tsx:57-208`。
- 道具价值：`apps/dak-studio/src/views/UtilityView.tsx:135-255`。
- 道具点位库：`apps/dak-studio/src/views/LineupsView.tsx:31`、`apps/dak-studio/src/views/LineupView.tsx:75-181`、`apps/dak-studio/src/views/LineupView.tsx:307-524`。
- 控图：`apps/dak-studio/src/views/RadarFieldView.tsx:107-168`。
- 教练工作台：`apps/dak-studio/src/views/CoachView.tsx:143-185`、`apps/dak-studio/src/views/CoachView.tsx:378-459`。
- 管理：`apps/dak-studio/src/views/ManagementView.tsx:244-535`。

事实与推断边界：

- “有哪些导航、页面、tab、按钮、筛选器、数据块”来自 UI 截图与路由/组件实现，按事实记录。
- “产品主闭环”“分析类型优先还是对象优先”“证据是核心对象”“页面职责重叠”来自界面行为和页面信息架构的归纳，按推断记录。
- 未稳定截图的 `道具点位库` 与 `管理` 只使用实现证据描述职责，不把未观察到的交互细节当作 UI 事实。

## 需要后续回答的问题

1. “这是我”在产品模型中是单一全局身份，还是可以扩展成多个人/多账号工作流？
2. `赛事与队伍`、`赛事合集`、`管理 -> 赛事资产` 三者的边界分别是什么？
3. `对枪复盘` 与 `对枪概览` 的目标用户和入口差异是否需要被明确区分？
4. `赛事总览` 与 `转化与节奏` 中的手枪、节奏、经济指标边界是什么？
5. `道具价值` 与 `道具点位库` 的用户任务边界是“评估贡献”与“练习复现”吗？
6. `控图` 是独立诊断页，还是应该被视为教练工作台/备战流程的一部分？
7. CohortScope 的队伍选择是“透镜”而不是窄化 demo 语料，用户是否能从当前界面正确理解？
8. 证据按钮打开比赛工作台后，用户是否需要明确的返回路径回到原分析页面？
9. `资料库` 与 `管理` 的资产维护职责应该如何分工？
10. `赛事包` 的 Event -> Stage -> Series -> Map 只读视图是否是主要分析入口，还是资料库的组织辅助入口？
