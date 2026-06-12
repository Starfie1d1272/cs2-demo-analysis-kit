# DAK Studio 完整版总设计（八模块 + 我的主页）

> 2026-06-12 制定，取代 `duel-coach-lab.md`（已归档至 `docs/archive/2026-06/`，
> 其中模块 4/8 的**数据口径定义原文吸收进本文，不得回退**）。
> 本文不参考现有页面布局，以「现有功能组件 + v3 数据能力」为底，规划最终形态：
> 每个模块应有哪些组件、层级如何组织、还缺什么。落地节奏另行排期。
>
> UI 约定见 [`docs/design-language.md`](../design-language.md)（强制）。
> 模块 owner 边界见 [`docs/module-boundaries.md`](../module-boundaries.md)（强制）。

## 0. 全局结构

### 导航（侧边栏一级入口，自上而下）

```
我的主页        ← 新增（见 §9）
─ 单场 ─
资料库          (模块 1)
比赛工作台      (模块 2)
对枪实验室      (模块 4)
─ 跨场 ─
选手            (模块 3)
道具实验室      (模块 5)
经济与节奏      (模块 6)
赛事中台        (模块 7)
教练工作台      (模块 8)
```

- 单场组共享「当前比赛」上下文（资料库选中即全组生效）；跨场组共享
  CohortScope（赛季/标签/队伍范围）。两个上下文常驻顶栏，不在各视图内重复。

### 公共服务层（所有模块复用，禁止各自实现）

| 原语 | 职责 | 现状 |
|---|---|---|
| EvidenceLink | 统计值 → 回合列表 / 2D 回放定位 tick 的统一跳转 | ✅ 分散在 TrailsView 等处，需抽公共原语 |
| RoundFilterBar | 回合多维筛选（地图/side/经济/首杀/clutch/…） | ✅ 已有，需做成可嵌入任意视图 |
| ReplayCanvas | 2D 回放（双层雷达、图层开关、时间轴锚点、投掷物弧线） | ✅ 已有；v3 后吃 replay 8Hz 全状态流 |
| CohortScope | 跨场范围选择 | ✅ 已有组件 |
| MetricInfo (ⓘ) | 口径说明 tooltip | ⬜ 缺统一原语 |
| StatCard / DataTable / EmptyState | 基础展示原语 | 🟡 样式分散，需收敛进 studio.css 公共段 |
| ExportButton | Markdown / PNG 报表导出 | ✅ 已有导出逻辑，需统一入口样式 |

### v3 新增数据能力（设计前提，详见 `docs/v3-migration.md`）

- `duels.json`：满 tick 交火窗口 → **反应时间、preaim 从「误差大」变为可做**；
- `replay.json` 8Hz 全状态流（pitch/armor/money/equipValue/flash/place/flags）：
  回放面板可显示实时经济与致盲状态；place 列免去 positions-1s 区域聚合；
- 列式 `shots.json`：机制画像（burst/急停/扫射）数据量更小、解码更快。

---

## 1. 资料库（Ingest & Data QA）

**回答**：我的 demo 都在哪、质量如何、怎么组织。

- 层级：导入区（.dem 拖入即本地调用 cs2df 导出 / ZIP 直接入库）→ 比赛列表
  （搜索、标签、series 分组）→ 单包详情（QA 报告、manifest、重导）。
- 组件：导入队列（进度 + 失败隔离报告，复用 cs2df batch report）✅、
  比赛卡片列表 ✅、标签管理 ✅、QA badge ✅、**series 自动归组建议** ⬜
  （文件名约定 + 手工确认，8d 依赖它）。
- 交叉：series 分组是教练工作台（8d）与赛事中台的共同地基，owner 在资料库。

## 2. 比赛工作台（Demo Explorer）

**回答**：这一场发生了什么，证据在哪一回合哪一刻。

- 层级：比分头 + half-by-half → 回合时间轴（锚点：freeze end/首接触/首杀/
  下包拆包/clutch）→ 主区 2D 回放 + 右栏（记分板 / kill feed / 经济 / RR 解释
  切换）。
- 组件：ReplayCanvas ✅、RoundTimeline ✅、ScoreboardTable ✅、KillFeed ✅、
  EconomyPanel ✅、RR 六账户解释 ✅、**回放经济/致盲实时面板**（v3 replay
  money/flash 列）⬜、**回合 swing（关键回合识别）** ⬜。
- 交叉：是所有 EvidenceLink 的落点；不做任何跨场聚合。

## 3. 选手（Personal Lab）

**回答**：某个选手是什么风格、在变好还是变差、错误在哪。

- 层级：选手索引（身份归并）→ 选手档案页：概览卡（RR/ADR/KAST 趋势）→
  Fingerprint 雷达 → 开局动线 → 武器分布 → Mistake Review（证据列表）。
- 组件：趋势曲线 ✅、Fingerprint ✅、动线图 ✅、武器分布 ✅、
  Mistake Review ✅、**机制画像嵌入**（来自模块 4 的 Mechanics 跨场聚合）⬜。
- 交叉：档案页是「我的主页」（§9）的母体；机制画像 owner 在模块 4 的
  core/presentation 信号，本页只消费。

## 4. 对枪实验室（Duel & Mechanics Lab）

**回答**：对枪到底输在哪——枪法、定位、还是反应。

口径（**已冻结，勿回退**）：engagement 切分 1.5s；对枪配对 ±2s 互伤窗口；
burst 切分 250ms；TTK 为 burst 锚定（击杀 tick − 致死 burst 首发 tick，
中位数 + 分布呈现）；一枪致命率单列；受害者三分类
contested / outaimed（死亡帧朝向夹角 ≤60° 未还手）/ caught off-guard；
victimHealthBefore ≥ 80 HP 才进完整对枪与 TTK。

- 层级：三 tab——Duel Finder（对枪明细 + 筛选：callout/武器对位/先手/血量档/
  三分类）→ Opening（对位矩阵、FK/FD 散点、首杀时间分布）→ Mechanics
  （个人机制画像：TTK/爆头率/首发精准/扫射精准/急停/开枪节奏，按武器拆分，
  A/B/C = 联赛 percentile，标「联赛前 X%」）。
- 组件：M1–M6 实施拆分沿用归档文档；**v3 升级项**：反应时间与 preaim 从
  beta 待办转正（`duels.json` 满 tick 窗口），新增「反应时间分布」组件 ⬜。
- 交叉：Mechanics 跨场聚合输出给模块 3 档案页与 §9 我的主页。

## 5. 道具实验室（Utility Lab）

**回答**：道具丢得值不值，标准 lineup 学没学会。

- 层级：Flash Value 排行（enemy/team flashed 秒、net value、转化击杀）→
  负收益队闪证据列表 → **Lineup Library** ⬜（按地图/落点聚类常用投掷物：
  出手点 → 落点 → 效果覆盖，复用 replay projectiles 弧线）→ 烟/火占用时序。
- 组件：Flash Value ✅、队闪证据 ✅、lineup 聚类与缩略图 ⬜、
  道具时序条（与回合时间轴对齐）⬜。
- 交叉：lineup 聚类几何 owner 在 `@cs2dak/maps`；教练工作台 anti-strat
  复用「对手常用 lineup」。

## 6. 经济与节奏（Economy & Round Flow）

**回答**：钱花得对不对，节奏断在哪。

- 层级：经济矩阵（双方逐回合 buy 类型 + 结果）→ 手枪局转化链 →
  eco/semi 翻盘列表 → Buy Quality（kit/helmet 覆盖、经济断点）→
  **回合 swing 曲线** ⬜（动量/关键回合，供 match report 复用）。
- 组件：经济矩阵 ✅、转化链 ✅、翻盘证据 ✅、Buy Quality ✅、swing ⬜。
- 注意：v3 移除 `"conversion"` 经济类型——转化语义由本模块从
  roundNumber + 前轮 winner 派生，是该口径唯一 owner。

## 7. 赛事中台（Tournament Hub）

**回答**：联赛全貌——谁强、什么图流行、报告怎么发。

- 层级：赛事总览（地图使用率、T/CT 胜率、pistol 转化）→ 排行榜
  （RR/ADR/各维度榜）→ 队伍横向对比 → 报表导出（match report、选手图卡）。
- 组件：Dashboard ✅、Leaderboard ✅、报表导出 ✅、**队伍对比页** ⬜
  （两队各图胜率/风格对照，与 8c anti-strat 共享数据但叙事中立）。
- 交叉：只读 cohort 聚合；不做教练向叙事。

## 8. 教练工作台（Coach / Analyst Workbench）

**回答**：对手会打什么，我们准备什么。

双视角（主办方任选两队 / 教练「我的队伍」vs 对手）维持归档文档设计：
- 8a Pattern Finder：开局 15/20/30s callout 位置向量 + 道具序列 →
  **规则聚类**（动线链 + 人数分桶，不用黑箱 k-means），每个 cluster 展示
  覆盖回合（可点回放）、雷达缩略图、胜率、聚类依据。
- 8b Playbook：cluster 命名沉淀（IndexedDB）+ Timing Heatmap。
- 8c Anti-Strat 报告：对手近 N 场倾向 → Markdown 导出。
- 8d Series/BP/Veto Lite：series 分组（owner 在资料库）+ BP 录入
  （`SeriesVeto` contract schema）+ 地图池 ban/pick 建议表（纯统计）。
- 组件状态：CoachView 骨架 ✅（首版已落地），8a–8d 深化均 ⬜。

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

| 缺口 | 模块 | 层 | 状态 |
|---|---|---|---|
| EvidenceLink / MetricInfo / EmptyState 公共原语收敛 | 全局 | studio.css + 组件 | ✅ 2026-06-12 |
| series 自动归组 | 1 | studio lib | ⬜ |
| 回放实时经济/致盲面板、回合 swing | 2 / 6 | core + react | ⬜ |
| 机制画像跨场聚合进档案页 | 3 ← 4 | presentation | ⬜ |
| M1–M6（duels/mechanics 信号与视图深化） | 4 | core → studio | 🟡 M0 基本面已落地 |
| 反应时间 / preaim（v3 duels.json 转正） | 4 | core | ⬜ |
| Lineup Library + 道具时序条 | 5 | maps + react | ⬜ |
| 队伍对比页 | 7 | presentation | ⬜ |
| 8a–8d 深化 | 8 | cohort/presentation | ⬜ |
| 「这是我」标记 + 主页编排 | 9 | studio | ✅ 2026-06-12 |

已落地项：先做公共原语收敛（消除风格漂移），再落地我的主页（编排既有 view model）。
下一个重点：模块 4 深化（吃 v3 红利最大）→ 模块 8 深化。
