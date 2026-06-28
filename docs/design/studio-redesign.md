# DAK Studio 完整版总设计（四类任务流 + 管理工具）

> 2026-06-12 制定，取代 `duel-coach-lab.md`（已归档至 `docs/archive/2026-06/`，
> 其中模块 4/8 的**数据口径定义原文吸收进本文，不得回退**）。
> 本文不参考旧页面布局，以「现有功能组件 + v3 数据能力」为底，规划最终形态：
> 每个产品面服务什么用户任务、组件如何组织、还缺什么。落地节奏另行排期。
>
> UI 约定见 [`docs/design-language.md`](../design-language.md)（强制）。
> 模块 owner 边界见 [`docs/module-boundaries.md`](../module-boundaries.md)（强制）。

## 0. 全局结构

### 导航（侧边栏一级入口，自上而下）

```
─ 开始 ─
我的主页        ← 标记「这是我」后的个人入口（见 §9）
资料库          ← 导入、检索、重导、facts 重建
比赛工作台      ← 单场证据落点 / 回放 / QA / 系列赛工作台

─ 选手复盘 ─
选手档案        ← 选手画像、趋势、机制、失误证据
开局动线        ← 选手 × 地图 × 最近 N 场开局轨迹
对枪复盘        ← 个人复盘队列（满血输枪、首死、关键回合等）

─ 赛事与队伍 ─
赛事合集        ← Event → Stage → Series → Map
赛事总览        ← 地图盘面、攻防摘要、队伍对比
排行榜          ← 当前范围内选手榜单
对枪概览        ← 地图/阵营/时间段/位置/选手维度的整体对枪态势
转化与节奏      ← 手枪转化、小枪翻盘、5v4/5v3 转化、经济对位
闪光价值        ← 闪光收益、负收益队闪、最佳闪证据
控图            ← 覆盖场、赛事基线、队伍差分

─ 备战 ─
教练工作台      ← 我的队伍 / 对手队伍、Pattern、地图池、BP、报告
道具点位库      ← lineup 素材库，供练习与战术本复用
战术板          ← 回放/雷达标注层 + PNG/Markdown 导出

─ 管理工具 ─
管理            ← 身份、资产、赛事包、资料库维护
```

- 「开始」里的比赛工作台是所有 EvidenceLink 的落点，不归个人或赛事专属。
- 「选手复盘」服务长期导入自己 demo 的个人用户；默认优先「这是我」或当前选手。
- 「赛事与队伍」服务关注赛事、队伍强弱与整体趋势的用户；经济/转化、闪光价值和控图都属于队伍/赛事层，不放进个人复盘。
- 「备战」服务有固定队伍的教练/IGL；全局范围只定义语料池，主体仍由「我的队伍 / 对手队伍」控制。
- 管理工具不参与产品主任务分类，放侧边栏底部。
- 单场组共享「当前比赛」上下文；跨场/赛事/备战组共享 App 级 CohortScope。上下文常驻顶栏，不在各视图内重复。

### App 级范围模型

跨场分析页统一使用一条范围：

```
赛事 / 全部 demo → 地图 → 队伍透镜 → 标签 → 手动排除场次
```

- **赛事是结构化组织层，不是标签**：来自 `EventRecord` / `SeriesRecord` / map assignment；标签只是 `StudioDemoEntry.tags` 的自由备注。
- 赛事范围先窄化 demo 语料；地图、标签、排除继续窄化语料；队伍是透镜，不应丢掉该队与其他队伍交手的样本。
- 控图页消费全局赛事范围，但地图与对象（赛事基线 / 队伍）保留页内选择，并只在进入控图页后触发覆盖场计算。
- 教练页消费全局语料池，但「我的队伍 / 对手队伍」和己方复盘 / 敌方侦察保留在教练页内。
- 管理页默认面向全库治理，不应被普通分析范围隐藏身份、资产或赛事包。

### 公共服务层（所有模块复用，禁止各自实现）

| 原语 | 职责 | 现状 |
|---|---|---|
| EvidenceLink | 统计值 → 回合列表 / 2D 回放定位 tick 的统一跳转 | ✅ 分散在 TrailsView 等处，需抽公共原语 |
| RoundFilterBar | 回合多维筛选（地图/side/经济/首杀/clutch/…） | ✅ 已有，需做成可嵌入任意视图 |
| ReplayCanvas | 2D 回放（双层雷达、图层开关、时间轴锚点、投掷物弧线） | ✅ 已有；v3 后吃 replay 8Hz 全状态流 |
| CohortScope | App 级范围选择：赛事 / 地图 / 队伍透镜 / 标签 / 排除场次 | ✅ 已有组件，需补赛事结构并上移到 App 顶栏 |
| MetricInfo (ⓘ) | 口径说明 tooltip | ✅ 已抽公共原语 |
| StatCard / DataTable / EmptyState | 基础展示原语 | 🟡 样式分散，需收敛进 studio.css 公共段 |
| ExportButton | Markdown / PNG 报表导出 | ✅ 已有导出逻辑，需统一入口样式 |

### v3 新增数据能力（设计前提，详见 `docs/archive/2026-06/v3-migration.md`）

- `duels.json`：满 tick 交火窗口 → **反应时间、preaim 从「误差大」变为可做**
  （✅ 2026-06-13 落地，配合安装包内置 `.tri` 碰撞几何走 LOS 精确口径）；
- `replay.json` 8Hz 全状态流（pitch/armor/money/equipValue/flash/place/flags）：
  place 列免去 positions-1s 区域聚合。实时经济/致盲面板经评估**无产品价值，不做**
  （2026-06-13 决策：回放中逐帧经济与致盲状态对战术复盘没有可操作的结论）；
- 列式 `shots.json`：机制画像（burst/急停/扫射）数据量更小、解码更快。

---

## 1. 资料库（Ingest & Data QA）

**回答**：我的 demo 都在哪、质量如何、怎么组织。

- 层级：导入区（.dem 拖入即本地调用 cs2df 导出 / ZIP 直接入库）→ 比赛列表
  （搜索、标签、series 分组）→ 单包详情（QA 报告、manifest、重导）。
- 组件：导入队列（进度 + 失败隔离报告，复用 cs2df batch report）✅、
  比赛卡片列表 ✅、标签管理 ✅、QA badge ✅、series 自动归组建议 ✅ 2026-06-13
  （文件名约定 + 手工确认，8d 依赖它）。
- QA 口径：damage 允许出现在 round start → freezeEnd 之间（HLTV 职业 demo 常见
  第一回合开局前伤害伪影）；这些行不报 QA error，但不进入 ADR、武器伤害或对枪机制统计。
- 交叉：series 分组是教练工作台（8d）与赛事中台的共同地基，owner 在资料库。

## 2. 比赛工作台（Demo Explorer）

**回答**：这一场发生了什么，证据在哪一回合哪一刻。

- 层级：比分头 + half-by-half → 回合时间轴（锚点：freeze end/首接触/首杀/
  下包拆包/clutch）→ 主区 2D 回放 + 右栏（记分板 / kill feed / 经济 / RR 解释
  切换）。
- 组件：ReplayCanvas ✅、RoundTimeline ✅、ScoreboardTable ✅、KillFeed ✅、
  EconomyPanel ✅、RR 六账户解释 ✅。回放经济/致盲实时面板**不做**（见 §0）；
  回合 swing 见 §6 的后续方向标注。
- 交叉：是所有 EvidenceLink 的落点；不做任何跨场聚合。

## 3. 选手（Personal Lab）

**回答**：某个选手是什么风格、在变好还是变差、错误在哪。

- 层级：选手索引（身份归并）→ 选手档案页：概览卡（RR/ADR/KAST 趋势）→
  Fingerprint 雷达 → 开局动线 → 武器分布 → Mistake Review（证据列表）。
- 组件：趋势曲线 ✅、Fingerprint ✅、动线图 ✅、武器分布 ✅、
  Mistake Review ✅、机制画像嵌入 ✅ 2026-06-13（模块 4 Mechanics 跨场聚合，
  按 AK/M4/AWP/Deagle 分桶）。
- 交叉：档案页是「我的主页」（§9）的母体；机制画像 owner 在模块 4 的
  core/presentation 信号，本页只消费。

## 4. 对枪复盘与对枪概览（Duel & Mechanics）

**回答**：个人该复盘哪次对枪；赛事/队伍整体对枪态势如何。

口径（**已冻结，勿回退**；2026-06-13 按最终软件口径修订）：
engagement 切分 1.5s；burst 切分 **250ms**；TTK 为 lethal burst 锚定
（击杀 tick − 致死 burst 首发 tick，中位数 + 分布呈现，AK 一枪头可接近 0ms）。
受害者三分类走逐 tick 可见性时间线：`contested_duel`=受害者伤到击杀者，
或在击杀者首发到死亡之间看得到击杀者并开火；`suppressed_kill`=死前有过有效
可见机会但没有有效还手；`caught_off_guard`=死前从未获得有效可见机会。有效可见
必须满足 hp>0、未被闪、视野锥内、`.tri` 静态 LOS 通透且无烟雾遮挡。
HP 档独立为 `hpBucket`（full_hp ≥80 / low_hp）。

机制画像统一使用 **clean gunfight gate**：排除第三方伤害、穿烟击杀和穿墙击杀。
首发命中、扫射、急停、TTK、one tap、反应时间、预瞄、爆头率都基于 clean 样本；
标题击杀数/发数仍保留真实武器产出。TTK 与 one tap 额外要求满血 100HP；
one tap 只对可一枪满血终结的武器展示，Glock/USP/M4 等不展示。

- 产品面拆分：
  - **对枪复盘**（选手复盘）：默认聚焦「这是我」或当前选手，把已有
    `DuelSignals` / `MechanicsSignals` 组织成复盘队列。按满血输枪、首死、关键回合、
    重复位置、补枪失败等 review value 排序；每项给问题标签 + 回合/tick 证据入口。
  - **对枪概览**（赛事与队伍）：按地图/阵营/时间段/位置/选手聚合首杀热点、对枪分类分布、
    队伍对枪风格与证据队列。避免把原始分类表作为主叙事。
  - **枪法机制**：作为选手档案与对枪复盘的详情块展示，不再作为独立一级页面主叙事。
- 组件：M1–M6 实施拆分沿用归档文档；反应时间与 preaim ✅ 2026-06-13 转正
  （`duels.json` 满 tick 窗口 + 浏览器/安装包加载 `.tri` BVH；无 `.tri` 时只跳过
  静态墙体 LOS，仍保留 hp/flash/视野锥/烟雾约束，UI 口径说明须如实标注）。
  一枪终结时若首发帧 victim HP 已经落到 0，反应时间使用上一帧仍存活的可见状态作为
  anchor，避免 AWP/USP/Glock 等首发即击杀被误判为 prefire。
- 性能：浏览器端持久化缓存原始 `.tri` bytes；对枪实验室、个人机制详情等 LOS-heavy
  派生模型按 demo 集合 + identity version 写入 IndexedDB，重开软件后优先复用。
- **不做**：A/B/C 固定联赛基线 percentile（2026-06-13 决策：本地工作台
  没有稳定联赛样本池，固定基线意义不大，保留「当前范围前 X%」相对标签）。
- 交叉：Mechanics 跨场聚合输出给模块 3 档案页与 §9 我的主页。

## 5. 闪光价值与道具点位库（Utility）

**回答**：这批比赛谁的闪光创造价值；备战时哪些点位可以练和复用。

- 产品面拆分：
  - **闪光价值**（赛事与队伍）：Flash Value 排行（enemy/team flashed 秒、net value、
    转化击杀）→ 最佳闪光 → 负收益队闪证据列表。它回答队伍/选手贡献，属于赛事与队伍层。
  - **道具点位库**（备战）：按地图/落点聚类常用投掷物：出手点 → 落点 → 效果覆盖，
    支持 EvidenceLink、未来接「进游戏练这个点」与战术板/战术本复用。
  - 烟/火占用时序作为后续能力，可在闪光价值或战术板证据层复用，不单独维持旧「道具实验室」叙事。
- 组件：Flash Value ✅、队闪证据 ✅、lineup 聚类与缩略图 ✅（⚠️ 2026-06-13 已重写为 SVG
  雷达渲染：跨场聚类、callout 中文提取、发射线与双端标记、排序分页双向高亮；缩略图质量
  仍需改进、maps 几何降维不足）、
  道具时序条（与回合时间轴对齐）⬜。
- 与备战（§8）的关系：道具点位库是备战素材库；lineup 聚类将升级为战术路线节点的证据源。
- 交叉：lineup 聚类几何 owner 在 `@cs2dak/maps`；教练工作台 anti-strat
  复用「对手常用 lineup」。

## 6. 转化与节奏（Conversion & Round Flow）

**回答**：这支队伍 / 这个赛事的回合转换能力怎么样。

- 层级：摘要卡（手枪转化 / 小枪翻盘 / 5v4、5v3 转化 / 4v5、3v5 翻盘）→
  队伍明细矩阵 → 经济对位胜率 → 小枪翻盘排行 → 证据回合。
- 组件：经济矩阵 ✅、转化链 ✅、翻盘证据 ✅、人数优势转换 ✅、Buy Quality ✅。
- 归属：赛事与队伍。个人用户可从证据回合回看自己，但本页不回答个人发挥。
- **后续方向（暂不实施）**：回合 swing 曲线（动量/关键回合识别）。
  2026-06-13 决策：在积累大量 demo 样本之前，swing 模型缺少校准依据，
  没有实现意义；待资料库规模上来后再立项。
- 注意：v3 移除 `"conversion"` 经济类型——转化语义由本模块从
  roundNumber + 前轮 winner 派生，是该口径唯一 owner。

## 7. 赛事与队伍（Tournament & Team）

**回答**：这个赛事/这批队伍整体发生了什么，谁强、什么图流行、关键转换能力如何。

- 产品面：
  - **赛事合集**：Event → Stage → Series → Map，含 bracket / Swiss / round-robin / BP。
  - **赛事总览**：地图盘面、T/CT 胜率、手枪转化摘要、队伍横向对比、报告导出。
  - **排行榜**：当前范围内选手榜单。
  - **对枪概览**：整体首杀热点、对枪分布、队伍对枪风格（见 §4）。
  - **转化与节奏**：手枪转化、小枪翻盘、人数优势转换、经济对位（见 §6）。
  - **闪光价值**：闪光收益与负收益队闪（见 §5）。
  - **控图**：赛事地图基线、队伍差分与覆盖场（见 §11）。
- 组件：Dashboard ✅、Leaderboard ✅、报表导出 ✅、队伍对比页 ✅ 2026-06-13
  （两队各图胜率/风格对照，与 8c anti-strat 共享数据但叙事中立）。
- 交叉：只读 cohort 聚合；不做教练向叙事。

## 8. 备战（Coach / Analyst Workbench）

**回答**：对手会打什么，我们准备什么，素材如何沉淀成可执行战术。

双视角（主办方任选两队 / 教练「我的队伍」vs 对手）维持归档文档设计：
- **8a Pattern Finder（0.6 已落地，0.7 底层与 UI 已重构）**：`TacticalRoundFact`
  使用 `@cs2dak/maps` 的 callout 倾向与双方默认位作为唯二静态地图语义，
  `@cs2dak/core` 从开局连续区域段推导 coarse/detailed 双层开局签名。聚类主身份只由
  经济层、开局区域人数/形态与默认位人数结构组成；最终打点、C4、入口结构、道具和执行
  节奏全部降为 evidence，不再改变开局模式身份。没有进包的回合仍可进入主聚类。
  旧 `advanced/contested/anchor 前缀` 静态判断和固定 `snapshots` 切片已删除。
  `openingPressure` 独立记录离开本方默认位后的中文 callout 前压证据，进入对方默认位标记为深入，
  不再把前压点伪装成默认站位。`PatternExplorer` 三栏现为簇列表 / 常驻统一回放 / 数据摘要与证据
  回合表；主名称只使用已审核的默认位中文名与真实人数结构。进点词典只负责 evidence
  文案，摘要展示常见进点路线、回合数和覆盖率；道具作为关联统计，不影响聚类稳定性。
  **CT/T 视角切换** + **常驻页内回放**：支持 CT 侧和 T 侧双视角查看 pattern；
  教练页与比赛工作台复用同一 `ReplayViewer` 和四阶段比赛时钟。教练默认 1:35，比赛默认 1:55；
  C4 安放与赛后窗口按真实回合边界倒计时。单场 workspace 按 matchId 主键直读。
  **进点 A1/A2 子区域区分** + **C4 轨迹证据**：入口使用进包前最终连续推进段的最早
  命中点，能区分 A1/A2/连接等最终执行路线；C4 轨迹只作证据，不自动拍死“佯攻/转点”。
- 8b Playbook：cluster 命名沉淀（IndexedDB，接新 `TacticalCluster.id`）✅。
- 8c Anti-Strat 报告：对手近 N 场倾向 → Markdown 导出 ✅（基于 `TacticalCluster`
  重写，按地图/side 分段列出 `autoName` + 胜率）。
- 8d Series/BP/Veto Lite：series 分组 ✅ + BP 录入/展示 ✅（`SeriesVeto`
  schema + `VetoInputDialog` + `SeriesWorkspace` 系列赛工作台含各图 tab/比分/跨图记分板）
  + `MapPoolTable`（地图池比较表：我方/对手样本胜率 + 对手高频打法）✅ 2026-06-15。
- 8e Round Playlist：备战清单持久化（`PlaylistItem` + IndexedDB `playlist`
  namespace）+ Markdown 导出（`playlistToMarkdown`）✅ 2026-06-15。
- **道具点位库**：归备战素材库，供 lineup 练习、战术本和战术板复用；不再作为旧「道具实验室」的一部分。
- **战术板 MVP**：回放/雷达画布标注层（箭头 / 道具图标 / 文字）→ PNG + Markdown 导出；
  无实时协作、无动画播放。

> **后续 UI 方向**：完整战术路线（开局站位 → 中期动线链 → 进包执行）直接消费
> `TacticalRoundFact v4.openingPattern` 与 core 时间化证据；`MapRoute`、zone/nav 和
> lineup 聚类只能作为额外事实源，不再各自生成一套区域判断。

---

## 9. 我的主页（新增）

**回答**：打开 Studio 第一眼——「我」最近打得怎么样，该练什么。

- **身份**：选手索引中任一身份可标记「这是我」（IndexedDB 本地设置，
  与「我的队伍」同处一个 settings store）。未标记时主页显示引导空态。
- **不是新数据层**：主页 = 模块 3 档案 + 模块 4 Mechanics + 模块 5/6 错误证据
  的**编排视图**，零新信号，全部消费既有 presentation view model。
- 层级：抬头（我 + 我的队伍 + 最近一场快捷入口）→ 趋势速览（RR/ADR/KAST
  迷你曲线）→ 「本周该练什么」：Mistake Review Top3 + 机制画像最弱两项
  （各带 EvidenceLink）→ 最近比赛列表。
- 组件：全部复用；新增的只有 settings store 的「这是我」标记 ⬜ 与
  主页编排壳 ⬜。

---

## 10. 缺口汇总（最终版 vs 现状）

> 本表按新的产品面命名；旧模块号仅在需要定位历史 owner 时保留在「层」描述里。

| 缺口 | 模块 | 层 | 状态 |
|---|---|---|---|
| App 级范围顶栏（赛事 / 地图 / 队伍透镜 / 标签 / 排除） | 全局 | dak-studio | ⬜ 0.8 前置 |
| 侧边栏按「开始 / 选手复盘 / 赛事与队伍 / 备战」重排，管理沉底 | 全局 | dak-studio | ⬜ 0.8 前置 |
| EvidenceLink / MetricInfo / EmptyState 公共原语收敛 | 全局 | studio.css + 组件 | ✅ 2026-06-12 |
| series 自动归组 | 1 | studio lib | ✅ 2026-06-13 |
| 回放实时经济/致盲面板 | 2 | — | ❌ 不做（§0） |
| 回合 swing | 转化与节奏 | core | ⏸ 后续方向（§6，待大量 demo） |
| 机制画像跨场聚合进档案页 | 3 ← 4 | presentation | ✅ 2026-06-13 |
| M1–M6（duels/mechanics 信号与视图深化） | 对枪复盘 / 对枪概览 | core → studio | ✅ 2026-06-13（口径见 §4） |
| 对枪复盘队列产品化 | 对枪复盘 | presentation + dak-studio | ⬜ 0.8 |
| 对枪概览（首杀热点 / 对枪分布 / 队伍风格） | 赛事与队伍 | presentation + dak-studio | ⬜ 0.8 |
| 反应时间 / preaim（duels.json + `.tri` LOS） | 对枪复盘 / 对枪概览 | core + maps + 打包 | ✅ 2026-06-13 |
| A/B/C 固定联赛基线 | 对枪复盘 / 对枪概览 | — | ❌ 不做（§4） |
| Lineup Library（首版） | 道具点位库 | maps + studio | ✅ 2026-06-13 |
| Lineup 视觉效果优化 | 道具点位库 | studio + maps | 🟡 首版已重写为 SVG 雷达渲染（发射线/落点标记/双向高亮），缩略图与几何降维仍需进一步优化 |
| 闪光价值独立页面（从旧道具实验室拆出） | 赛事与队伍 | presentation + dak-studio | ⬜ 0.8 |
| 道具时序条（与回合时间轴对齐） | 道具点位库 / 备战 | react | ⬜ |
| 转化与节奏首屏重排（5v4/5v3 转化、小枪翻盘、经济对位） | 赛事与队伍 | presentation + dak-studio | ⬜ 0.8 |
| 队伍对比页 | 赛事与队伍 | presentation + react | ✅ 2026-06-13 |
| 8a 默认位主导战术聚类 + 进点 evidence（TacticalCluster + PatternExplorer） | 备战 | cohort + presentation + dak-studio | ✅ 2026-06-21 |
| CT/T 视角切换 + 页内回放 | 备战 | dak-studio | ✅ 2026-06-16 |
| A1/A2 进点子区域区分 + C4 轨迹佯攻判定 | 备战 | dak-studio | ✅ 2026-06-16 |
| 常驻统一回放 + 聚类双层大分类 | 备战 | react + dak-studio | ✅ 2026-06-17（替代固定切片） |
| 8d series/BP（SeriesWorkspace/BpView/VetoInputDialog） | 备战 / 比赛工作台 | presentation + studio | ✅ 2026-06-13 |
| 8d 地图池比较表（MapPoolTable） | 备战 | dak-studio | ✅ 2026-06-15 |
| 8e Round Playlist 备战清单 | 备战 | dak-studio | ✅ 2026-06-15 |
| 8a 完整战术路线（MapRoute+zone 动线链） | 备战 | cohort/maps/presentation | ⬜ v0.8+ |
| 「这是我」标记 + 主页编排 | 9 | studio | ✅ 2026-06-12 |
| 资料库服务器筛选 + 日期区间 + 批量删除/重导 | 1 | dak-studio | ✅ 2026-06-16 |
| 公共 base64 分块编码模块 | 全局 | studio lib | ✅ 2026-06-16 |
| maps 默认位资产（七图阵营专属默认位） | maps | `@cs2dak/maps` | ✅ 2026-06-15 |
| maps 3D callout 网格（calloutAt） | maps | `@cs2dak/maps` | ✅ 2026-06-16 |
| 地面掉落拆弹器标注 | 2 | replay | ✅ 2026-06-16 |
| 机制跨场聚合从 presentation 迁往 cohort | 架构债 | presentation → cohort | ⬜ 低优先 |
| 雷达场子系统（视野覆盖 + 密度场 + A·B 差分） | 控图 | core + maps + react + studio | 🟡 首版已落地，待产品验证（见 §11） |
| 数据驱动地图控制价值（取代 scalar v0 gate） | 控图 / RR | core | ⬜ 0.9+（待足够语料，见 §11） |

下一个重点（0.8）：先完成 App 级范围/导航收口与旧页面拆分（对枪复盘/概览、闪光价值/道具点位库、转化与节奏），
再做雷达场首版产品验证/打磨（§11）+ 进游戏看回合 + BP 策略洞察 + 战术板 MVP；
完整战术路线（全程 zone 动线链，§8）顺延；其余缺口按需排期。

---

## 11. 雷达场子系统 + MapControl 演进（0.8 首版落地，2026-06-27 更新）

**回答**：把所有空间分析（防守盲区、活动/击杀/死亡范围、换人前后位置变化、跨赛事风格）
收敛成**一个可复用原语**，而非每个功能各画一套雷达。

当前状态：`RadarField` 合同、core 计算、maps 栅格、presentation 合成、React 画布、Studio「控图」
入口与 per-match 缓存已进产品路径；仍需真实赛事语料做 Windows 桌面首开性能、缓存命中、队伍/基线
解释与视觉语言验证。落地细节见 [`../research/map-control-model.md §11`](../research/map-control-model.md)。

### 一套原语，四个轴

- **场来源**：`位置密度 / 击杀密度 / 死亡密度`（纯点聚合，无 LOS，最便宜）
  ｜`视野覆盖`（视锥 ∩ `.tri` LOS ∩ 烟雾遮挡，复用 `core/duel-window.ts` 的
  `isVisibleAt` / `smokeBlocksRay`，几何地基与口径见 §4）
- **覆盖场算法**：用 `getMapNav` 的 nav area 质心做 grid-sample，逐 tick 测「任一防守者可见」
  → 跨 N 个长枪局 frequency 叠加成热场。**不预设 route/动线**（盲区靠频率自然消隐，不需要
  显式 control 阈值）；≥10–20 回合即可成图，七张 `.tri` 图可用。零假设是发现「系统性放空」
  盲区的前提——一旦先过 route 过滤，只能重新发现 route 定义已编码的东西。
- **聚合**：CohortScope 范围 + 可选按四阶段比赛时钟对齐（`replay-clock.ts`，1:55 起逐 tick 演化）
- **模式**：单 / A·B 差分（隐藏可展开的对比视图；两个 scope 的场相减取 delta）
- **渲染**：`HeatmapCanvas`（扩成吃栅格场）+ 枪线/trail 叠加。owner = dak-studio 容器
  查 facts/聚合 + `@cs2dak/react` 纯渲染
- **性能**：grid 降采样 + 覆盖采样 1–2Hz + worker 池 + IndexedDB 缓存（demo集合×identity，
  沿用对枪 LOS 缓存）

### MapControl 评分的演进（②→③→④）

- **②** `core/spatial/mapcontrol.ts` 的 scalar gate（route-index 手调，接进 `signals.ts`
  但只进 shadow / Trade 闭环，不进 RR）= **v0 代理，冻结，不再投精力打磨 gate**
- **③** 本子系统的覆盖场 = 描述性、空间忠实，先落地（0.8）
- **④** 数据驱动控制价值（roadmap 0.9+，**待细化**）：在 ③ 覆盖场上回归 round 结果，
  学出 per-area × time 价值权重 → RR 地图控制账户，**取代 ② 手调 gate**；
  控制价值 = Σ_覆盖区域 (该区学得价值 × contested 因子)；需数百+ 回合语料才稳

### 战术板（独立功能，非雷达场）

回放/雷达画布的**标注层**（箭头 / 道具图标 / 文字）→ 图文战术框架导出（PNG + Markdown）。
无实时协作、无动画播放，本质是给现有画布加一层标注 + 导出，复用 `@cs2dak/maps` 坐标变换。
