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

## 4. 对枪实验室（Duel & Mechanics Lab）

**回答**：对枪到底输在哪——枪法、定位、还是反应。

口径（**已冻结，勿回退**；2026-06-13 修订分类命名，参数不变）：
engagement 切分 1.5s；对枪配对 ±2s 互伤窗口；burst 切分 **250ms**；
TTK 为 burst 锚定（击杀 tick − 致死 burst 首发 tick，中位数 + 分布呈现）；
一枪致命率单列；受害者三分类 `contested_duel`（±1.5s 内还手）/
`suppressed_kill`（朝向夹角 ≤60° 且静止未还手）/ `caught_off_guard`
（未面向、转点或跑动中）；HP 档独立为 `hpBucket`（full_hp ≥80 / low_hp），
仅 full_hp 且无第三方伤害的样本进 TTK 分布。

- 层级：三 tab——对枪记录（明细 + 筛选：三分类/HP 档）→ 首杀分析
  （对位矩阵、FK/FD 散点、首杀时间分布）→ 枪法机制
  （个人机制画像：TTK/首发精准/扫射精准/急停/一枪致命/开枪节奏/
  视觉反应/预瞄，按武器拆分，标「当前范围前 X%」）。
- 组件：M1–M6 实施拆分沿用归档文档；反应时间与 preaim ✅ 2026-06-13 转正
  （`duels.json` 满 tick 窗口 + 安装包内置 `.tri` LOS；无 `.tri` 时退化为
  窗口起点口径，UI 口径说明须如实标注）。
- **不做**：A/B/C 固定联赛基线 percentile（2026-06-13 决策：本地工作台
  没有稳定联赛样本池，固定基线意义不大，保留「当前范围前 X%」相对标签）。
- 交叉：Mechanics 跨场聚合输出给模块 3 档案页与 §9 我的主页。

## 5. 道具实验室（Utility Lab）

**回答**：道具丢得值不值，标准 lineup 学没学会。

- 层级：Flash Value 排行（enemy/team flashed 秒、net value、转化击杀）→
  负收益队闪证据列表 → Lineup Library ✅ 2026-06-13（按地图/落点聚类常用
  投掷物：出手点 → 落点 → 效果覆盖，按地图分组渲染）→ 烟/火占用时序。
- 组件：Flash Value ✅、队闪证据 ✅、lineup 聚类与缩略图 ✅（⚠️ 效果差：
  缩略图模糊、无发射线/落点标记、maps 端几何降维不足，需后续优化 UI 渲染与聚类展示）、
  道具时序条（与回合时间轴对齐）⬜。
- 与模块 8 重设计的关系（§8）：lineup 聚类将升级为战术路线节点的证据源，
  单独的「道具排行」叙事弱化。
- 交叉：lineup 聚类几何 owner 在 `@cs2dak/maps`；教练工作台 anti-strat
  复用「对手常用 lineup」。

## 6. 经济与节奏（Economy & Round Flow）

**回答**：钱花得对不对，节奏断在哪。

- 层级：经济矩阵（双方逐回合 buy 类型 + 结果）→ 手枪局转化链 →
  eco/semi 翻盘列表 → Buy Quality（kit/helmet 覆盖、经济断点）。
- 组件：经济矩阵 ✅、转化链 ✅、翻盘证据 ✅、Buy Quality ✅。
- **后续方向（暂不实施）**：回合 swing 曲线（动量/关键回合识别）。
  2026-06-13 决策：在积累大量 demo 样本之前，swing 模型缺少校准依据，
  没有实现意义；待资料库规模上来后再立项。
- 注意：v3 移除 `"conversion"` 经济类型——转化语义由本模块从
  roundNumber + 前轮 winner 派生，是该口径唯一 owner。

## 7. 赛事中台（Tournament Hub）

**回答**：联赛全貌——谁强、什么图流行、报告怎么发。

- 层级：赛事总览（地图使用率、T/CT 胜率、pistol 转化）→ 排行榜
  （RR/ADR/各维度榜）→ 队伍横向对比 → 报表导出（match report、选手图卡）。
- 组件：Dashboard ✅、Leaderboard ✅、报表导出 ✅、队伍对比页 ✅ 2026-06-13
  （两队各图胜率/风格对照，与 8c anti-strat 共享数据但叙事中立）。
- 交叉：只读 cohort 聚合；不做教练向叙事。

## 8. 教练工作台（Coach / Analyst Workbench）

**回答**：对手会打什么，我们准备什么。

双视角（主办方任选两队 / 教练「我的队伍」vs 对手）维持归档文档设计：
- 8a Pattern Finder：开局 15/20/30s callout 位置向量 + 道具序列 →
  **规则聚类**（动线链 + 人数分桶，不用黑箱 k-means），每个 cluster 展示
  覆盖回合（可点回放）、雷达缩略图、胜率、聚类依据。
- 8b Playbook：cluster 命名沉淀（IndexedDB）+ Timing Heatmap。
- 8c Anti-Strat 报告：对手近 N 场倾向 → Markdown 导出 ✅（首版）。
- 8d Series/BP/Veto Lite：series 分组 ✅ + BP 录入/展示 ✅（`SeriesVeto`
  schema + `VetoInputDialog` + `SeriesWorkspace` 系列赛工作台含各图 tab/比分/跨图记分板）
  + 地图池 ban/pick 建议表（纯统计）⬜。

> **⚠ 重设计方向（2026-06-13，0.6 重点）**：现有 8a 只回答「开局 15/20/30s
> 站在哪」，没有后续动线、没有「最终如何打进包点」的完整战术路线，教练
> 视角下几乎不可用；配套的道具序列也因此失去战术语境。重设计核心叙事改为
> **完整回合战术路线**：开局站位 → 中期动线链（`MapRoute` + zone 序列）→
> 进包点执行（爆弹时间、人数、配套道具 lineup 时机），一个 cluster 对应
> 一条「打法」，而不是一组开局坐标。Pattern 向量需扩展为全回合 zone 轨迹，
> 道具序列与路线节点对齐（道具实验室的 lineup 聚类作为路线节点的证据源）。
> 落地前 8a/8b 现状视为占位骨架，不再继续小修。

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
| series 自动归组 | 1 | studio lib | ✅ 2026-06-13 |
| 回放实时经济/致盲面板 | 2 | — | ❌ 不做（§0） |
| 回合 swing | 6 | core | ⏸ 后续方向（§6，待大量 demo） |
| 机制画像跨场聚合进档案页 | 3 ← 4 | presentation | ✅ 2026-06-13 |
| M1–M6（duels/mechanics 信号与视图深化） | 4 | core → studio | ✅ 2026-06-13（口径见 §4） |
| 反应时间 / preaim（duels.json + `.tri` LOS） | 4 | core + maps + 打包 | ✅ 2026-06-13 |
| A/B/C 固定联赛基线 | 4 | — | ❌ 不做（§4） |
| Lineup Library（首版） | 5 | maps + studio | ✅ 2026-06-13 |
| Lineup 视觉效果优化 | 5 | studio + maps | ⬜ 效果差：缩略图模糊、无发射线/落点标记、maps 几何降维不足 |
| 道具时序条（与回合时间轴对齐） | 5 | react | ⬜ |
| 队伍对比页 | 7 | presentation + react | ✅ 2026-06-13 |
| 8a 完整战术路线重设计 | 8 | cohort/maps/presentation | ⬜ **0.6 重点**（§8） |
| 8d series/BP（SeriesWorkspace/BpView/VetoInputDialog） | 8 | presentation + studio | ✅ 2026-06-13 |
| 8d ban/pick 建议表 | 8 | presentation | ⬜ |
| 「这是我」标记 + 主页编排 | 9 | studio | ✅ 2026-06-12 |
| 机制跨场聚合从 presentation 迁往 cohort | 架构债 | presentation → cohort | ⬜ 低优先 |

下一个重点：模块 8 完整战术路线重设计（§8，0.6）；其余缺口按需排期。
