# DAK Studio 页面级 UI/UX 实施设计

- 日期：2026-07-11
- 适用分支：`starfie1d/studio-integrated-redesign`
- 产品真相源：[`07-final-product-review.md`](./07-final-product-review.md)
- 文档地位：工作包 7–16 的页面级实施规格；只裁决页面结构、信息层级、交互状态与组件复用，不修改 07 的产品模型、功能范围、模块 owner 或算法边界

## 1. 已确认裁决

1. 延续 Tactical Slate，不更换品牌方向；从“卡片式暗色 Dashboard”收敛为高密度、扁平化的战术分析工作台。
2. 使用紧凑单侧栏，保留对象入口和专项能力直达，不引入二级抽屉导航。
3. 对象型页面允许用真实地图、比赛、队伍和趋势形成更强的领域视觉；专项页保持克制、工具化。
4. “我的复盘”以 Dashboard 为核心。系统 Finding 只作为质量达标时出现的“待复核”区域，不主导首页。
5. 用户界面不使用“赛事同侪”。`event-peers` 的短文案为“参照：赛事整体”，说明文案为“与当前赛事全部可用比赛形成的整体基线比较”。不得在底层并非算术平均时写“赛事平均”。
6. 不增加 07 之外的产品概念；本文件中的组件名只是 UI 实现名，不是新增业务对象。

## 2. 当前运行态结论

本轮以 7 图内置样本实际检查了 Home、Library、赛事混合容器、Match 与 Coach。当前主要问题是：

- 侧栏双行入口过高，1200×720 下需要滚动才能看全一级入口；
- `CohortScope` 与 `AnalysisContextSummary` 重复占据页面顶部；
- 空页面过度留白，有数据后又出现大量同权重卡片、chip、tab 和按钮；
- Match 首屏被系列比分和完整 BP 占据，单场工作台需要继续下滚；
- Coach 在正文前连续堆叠范围、上下文、模式、双方队伍、主 tab、经济和阵营筛选；
- Match 内嵌页面的标题尺度和组件密度与 Studio 壳层不一致；
- Finding、普通观察、样本限制和修复提示尚未形成稳定的视觉语法。

因此，现有分析组件可以保留，但 shell、对象页、Match、Coach、Event/Team 和 Duel 需要重新布局。

## 3. 最终产品 Shell

### 3.1 导航

侧栏宽度从当前 218px 收敛到 192px；入口使用 36px 单行行高，只显示图标和名称，原 hint 改为 tooltip。

```text
DAK Studio

分析入口
  我的复盘
  选手
  队伍
  赛事
  比赛复盘

专项分析
  对枪
  开局动线
  经济与转化
  道具价值
  道具点位
  控图

备战
  Coach

────────────
  资料库
  管理
```

导航行为：

- `我的复盘` 取代“我的主页”；`比赛复盘` 取代“比赛工作台”；`经济与转化` 取代“转化与节奏”。
- `赛事与队伍` 拆为 `赛事` 与 `队伍`；两个 Duel 入口合并为 `对枪`。
- 当前项用 accent 左边线、accent-soft 背景和高亮图标表达，不使用大面积描边卡片。
- 页面滚动不影响侧栏；720px 高度必须同时看见全部入口和资料库/管理。
- 版本、更新通道和 demo 数量移入管理页；侧栏底部只保留紧凑的数据健康入口，异常时显示状态点。

### 3.2 全局上下文栏

所有分析页在内容顶部共享一条 sticky 上下文栏，取代长期展开的 `CohortScope + AnalysisContextSummary`：

```text
[队伍分析]  FURIA  ·  Cologne 7 场  ·  参照：赛事整体       [7/7 可用] [修改]
```

- 顺序固定为：目标、focus/roles、corpus、baseline。
- 对手备战显示：`对手备战 · 我方 NAVI × 对手 FURIA · Cologne 7 场 · 参照：赛事整体`。
- `修改` 打开上下文编辑面板；宽窗口为 anchored popover，窄窗口为右侧 drawer。
- 编辑面板分为语料、对象/关系、参照三段；只展示当前 goal 需要的字段。
- 地图、武器、经济类型、阵营、排序、回放 tick 等仍留在页面局部工具条。
- 证据查看时上下文栏不变，其下插入 Evidence Review 条带。

### 3.3 页面通用骨架

```text
Context bar
Evidence review bar（仅证据模式）
Page header：标题 / 一句话职责 / 页面主动作
Capability bar：ready 状态 / eligible 样本 / 输出级别 / 限制
Local toolbar：页面 tab、地图、武器、阵营等局部状态
Primary workspace
```

页面标题控制在 18–20px。禁止 Match 当前的 hero 级标题。筛选器不再放入独立大卡片。

## 4. 统一视觉与状态语法

### 4.1 表面层级

- 页面底与主要工作区保持开放，不把每个 section 都包成卡片。
- 卡片只用于 Finding、TrainingFocus、PrepItem、重复条目和需要明确边界的工具。
- 普通指标组使用分隔线、列和浅层 panel；删除存量卡片的装饰性渐变。
- accent 只用于选中、证据链接和主动作；T/CT、胜负继续使用现有语义色。
- 对象页的主要领域视觉来自真实趋势、地图、赛程和 radar，不增加装饰插画。

### 4.2 CapabilityAvailability

每个能力只显示一条统一状态：

| 状态 | 紧凑表达 | 展开内容 | 页面行为 |
|---|---|---|---|
| ready | `可用 · 7/7 场` | 依赖与输出层级 | 正常显示 |
| partial | `部分可用 · 5/7 场` | 排除原因、缺失依赖、修复入口 | 使用 eligible 样本，所有结论显示 coverage |
| unavailable | `不可用` | 缺少内容和唯一修复路径 | 保留页面职责说明，正文改为行动型空态 |

状态使用图标、文字和语义色共同表达，不用只有颜色的圆点。展开面板复用现有 repair action，不新增修复中心。

### 4.3 页面数据、Finding 与限制

- 普通指标、表格、轨迹和场保持中性表面，表示 observation。
- 系统 Finding 使用固定结构：结论句、样本/分母、参照、证据入口、限制、来源能力、允许的具体动作。
- 用户从 observation 写入 Coach 时显示“用户判断”，必须先填写一句判断或备注。
- 限制使用紧凑 `LimitNote`，默认显示一行；只有影响解释时展开详情。
- `—` 继续表示缺失；不得用 0、空卡或灰色假数据代替。

### 4.4 Evidence Review

证据模式在上下文栏下显示 sticky 条带：

```text
正在复核：FalleN 在 39 个长枪局中首死 3 次
当前证据：de_inferno · R12 · 首死发生前 4 秒                         [返回原发现]
```

- Match 的 tab、round、tick 可以变化，但来源 Finding 和返回动作持续可见。
- 返回后恢复来源页面、Finding、筛选、选中项和滚动锚点。
- 没有 replay 时仍进入回合事实视图，并在条带中写明“无 2D 回放，仅显示回合事实”。

## 5. 页面实施规格

### 5.1 我的复盘：重新布局

首屏以个人 Dashboard 为核心，不以算法推荐为核心：

```text
标题与当前个人 / 时间范围
核心状态条：RR、Rating、近期胜负、有效样本、数据完整度

近期趋势（2/3）                         当前打法画像（1/3）
RR / ADR / KAST 可切换趋势              PRISM / 武器结构 / 样本说明

专项摘要：对枪 | 经济 | 道具 | 开局动线

待复核 Finding（1/2）                  TrainingFocus（1/2）
最近比赛
```

- `待复核` 只显示已有稳定 assertion/evidence 的 Finding，最多首屏 3 条；无可靠 Finding 时诚实显示空态。
- 不使用“本周该练什么”“自动训练建议”等文案。
- TrainingFocus 显示用户已确认条目，可编辑备注、复查条件和删除；详情在右侧 drawer 编辑。
- 专项摘要只提供当前样本观察和深链，不做跨能力自动强弱排序。
- 现有 `FingerprintRadar`、`TrendChart`、Mistake Review、近期比赛和 opening trail 预览复用；删除泛化 PracticeCard 叙事。

### 5.2 选手：局部重排

- 顶部为选手选择、长期样本、关注/“这是我”和 availability。
- 主 tab 固定为 `概览 / 趋势 / 机制 / 比赛`；道具与武器摘要放在概览，不继续增加一级 tab。
- 概览首屏为评分与样本、打法画像、武器结构；趋势和机制详情进入对应 tab。
- Mistake Finding 可查看证据，但非 self 选手不显示 TrainingFocus。
- 复用现有画像、趋势、武器、mechanics 和比赛表；移除重复指标卡和内联标题样式。

### 5.3 Team Overview：新建并重新布局

```text
FURIA                                      [转为对手备战]
4 场 · 5 名主要阵容 · 6 张地图 · 参照：赛事整体

地图盘面（主）                            阵容与样本（侧）
地图记录 / T-CT / 最近比赛                出场、角色仅按现有数据描述

经济与转化 | 对枪 | 道具价值
控图       | 开局模式 | 最近比赛
```

- 地图盘面是首要领域视觉；每行地图可进入同一 Team context 下的专项能力。
- 六个能力摘要统一显示 availability、样本、一个中性 observation 或可靠 Finding、`查看详情`。
- Economy、Duel、Utility、Control 和 Tactical 的详细表不得复制进 Overview。
- 不生成“强项/弱项”“应该怎么打”等结论。
- `转为对手备战` 只补 beneficiary/opponent 关系后进入 Coach，不创建新对象。

### 5.4 Event Directory：重新布局

赛事导航入口默认进入 Directory，采用主从布局：

```text
赛事列表（240px） | Event 详情
                 | Event header + [查看总览]
                 | Stage tabs
                 | bracket / standings
                 | Series list -> Match rows
```

- 左列只显示本地可浏览 Event、stage coverage 和最近更新时间。
- 右侧按 Event → Stage → Series → Match 展开，不再使用多层嵌套 `details` 卡片。
- Match 行显示比分、地图 coverage、availability 和打开比赛动作。
- Directory 不显示下载、package slug、重建或身份治理；缺赛事时跳资料库。
- Bracket、standings 和 Series 数据复用 `ElimBracket`、`SwissBracket`、`DataTable` 与现有 records。

### 5.5 Event Overview：新建并重新布局

```text
赛事名 / stage / 时间 / coverage
赛事盘面：比赛、地图、队伍、有效回放

地图分布与攻防（主）                     队伍入口（侧）
排行榜
赛程 / 最近比赛
```

- Event Overview 与 Directory 使用同一 `赛事` 一级入口；选中 Event 后通过 `目录 / 总览` 局部 tab 切换。
- 排行榜不再是赛事容器默认页，作为 Overview 的完整 section 或局部 tab。
- 队伍点击进入 Team Overview，并保留 Event corpus 与“参照：赛事整体”。
- 所有宏观结果默认是 observation；只有 presentation 已提供可靠 Finding 时才使用 Finding 组件。

### 5.6 比赛复盘：重新布局

- 首屏立即显示比赛头部：双方、比分、地图、日期、系列位置和 QA。
- 第二行直接显示 `回放 / 概览 / 回合 / 选手 / 经济 / 武器 / 对位 / 地图`。
- 系列总比分与地图条压成一行 series strip；完整 BP 只在“系列汇总”或展开面板中显示，不阻挡单场内容。
- Match Workspace 内部标题、间距和按钮统一使用 Studio token；删除 hero 级 `MATCH WORKSPACE` 标题。
- 证据模式优先打开 target 对应的回放或回合 tab；独立复盘使用用户上次本地 tab 或概览。
- QA 通过为紧凑状态；有问题时展开说明，不让 QA 按钮与页面主动作争夺。

### 5.7 对枪：合并并重新布局

统一入口下使用三个局部视图：

- `证据复盘`：Finding/证据队列、选手与武器筛选、具体 Duel 卡；个人复盘默认进入。
- `整体态势`：首杀位置、对位和地图态势；队伍/Event context 默认进入。
- `机制`：shots 可用时显示 TTK、急停、首发命中等；partial 时明确 coverage。

三个视图共享 context、availability 和一条局部工具栏。删除 `variant` 对应的两套页面标题、入口和重复 scope。证据继续复用 `EvidenceActions` 与 `DataTable`。

### 5.8 开局动线：局部调整

- 顶部局部工具条只保留地图、选手/队伍、阵营和回合显隐。
- 主区保持 radar 为主、回合列表为侧；选中回合时侧栏显示证据理由和打开 Match。
- 默认位、路径和具体回合明确标为描述，不出现战术意图文案。
- replay 缺失时保留可计算摘要，地图区显示降级原因。

### 5.9 经济与转化：局部重排

- 局部 tab 为 `概览 / 手枪局 / 人数优势 / 翻盘 / 经济对位`。
- 首屏摘要按真实 owner 展示手枪转化、5v4、翻盘和经济矩阵；Event/Team 页只深链到此。
- 有 round facts 的单元格使用 EvidenceLink；纯聚合 observation 不伪造证据按钮。
- 三张现有 `DataTable` 继续复用，减少外围 MetricCard 数量。

### 5.10 道具价值：局部调整

- 局部 tab 为 `总览 / 闪光 / 雷火 / 烟雾`；玩家/队伍切换属于局部筛选。
- 最佳闪、伤害事件和负收益队闪使用 Finding/Evidence 结构；汇总表保持 observation。
- `UtilitySection` 和现有 DataTable 保留，统一样本、coverage 与限制位置。
- 不提供保存点位动作；需要复现具体点位时深链到道具点位或 Match。

### 5.11 道具点位：局部调整

- 主从布局保持：点位表/筛选在左，radar 与详情在右。
- 主动作只允许 `查看回放 / 进游戏 / 复制命令 / 保存点位`。
- 保存只产生 PracticeLineup；一次性练习不要求持久化。
- availability 分开表达 facts、replay 和启动游戏能力，避免一个状态掩盖全部动作。

### 5.12 控图：局部重排

- 顶部固定显示 focus team、赛事整体参照、eligible coverage、`.tri` 状态和 observation-only 标识。
- 主区优先 radar field；地图、阵营、时间属于局部工具条。
- 右侧显示队伍贡献与赛事整体差分的可读图例、coverage 和限制。
- 不出现“防守漏洞”“弱区”“优势区”等自动诊断文案。
- 加入 Coach 前必须先填写用户判断，写入的 PrepItem 标记为用户判断。

### 5.13 Coach：重新布局

上下文栏直接表达 `己方复盘` 或 `对手备战` 及双方关系，页面头不再重复两个队伍下拉。

主 tab 收敛为：

- `战术模式`：保留 PatternExplorer 三栏和代表回放；模式命名、备注并入详情，不再保留“战术本”。
- `备战材料`：PrepItem 表/列表，可按地图、阵营、来源能力筛选；条目详情在右侧 drawer。
- `报告`：地图池、模式摘要、所选 PrepItem、coverage 和限制的导出预览。

宽窗口下 PrepItem 清单可作为 320px 右栏常驻；小于 1360px 时改为 drawer。经济类型、T/CT 等只在战术模式工具条出现。报告不生成未经验证的对策。

### 5.14 资料库：职责迁移并局部重排

- 页头主动作统一为 `导入`，菜单中选择 `.dem / v3 ZIP / Event package / 示例数据`。
- 顶部摘要只显示场次、地图、含 replay、需要修复；不显示无决策价值的选手人次。
- 比赛表保留搜索、地图、标签和日期筛选；默认操作只外露“打开”。
- 编辑标签、重建 facts、关联源文件、删除进入行尾菜单，避免五个同权重按钮。
- Event package 的获取和导入全部在这里；成功后可 `查看赛事`。
- 行级 availability 只显示基础数据健康，不把所有专项能力塞入宽表。

### 5.15 管理：收窄并局部重排

主 tab 固定为 `身份 / 存储与修复 / 应用与资产`：

- 身份：我的身份、我的队伍、选手/队伍归并。
- 存储与修复：目录、容量、孤儿数据、批量重建和清理。
- 应用与资产：版本、更新通道、官方地图/`.tri` 等资产健康。

移除普通导入、Event 获取和赛事分析入口。危险动作继续二次确认，并明确影响范围。

## 6. 页面改造分级

| 页面 | 处理级别 |
|---|---|
| Shell / 导航 / Context bar | 重新布局 |
| 我的复盘 | 重新布局 |
| Team Overview | 新建页面 |
| Event Directory / Overview | 重新布局 + 新建 Overview |
| Match | 重新布局 |
| Duel | 合并并重新布局 |
| Coach | 重新布局 |
| 资料库 | 职责迁移 + 局部重排 |
| 选手、开局动线、经济、道具价值、道具点位、控图、管理 | 保留核心实现，统一骨架并局部重排 |
| 旧赛事混合容器、旧 Duel 双入口、战术本 tab | 删除 |

## 7. 组件复用与新增实现原语

优先复用：

- `DataTable`、`Pagination`：所有排序表和长列表；
- `EmptyState`、`MetricInfo`、`EvidenceLink`：空态、口径和证据；
- `FingerprintRadar`、`TrendChart`：我的复盘和选手；
- `ElimBracket`、`SwissBracket`、`BracketConnections`：Event Directory；
- `ScoreboardTable`、现有 Match Workspace/Replay：比赛复盘；
- `RadarTrails`、`PatternExplorer`、`MapPoolTable`：Coach；
- 现有 `CapabilityAvailability`、`AnalysisFinding`、`EvidenceContinuation` 合同。

允许新增或升级的纯展示原语：

| 原语 | 作用 | 归属 |
|---|---|---|
| `AnalysisContextBar` | 一句话上下文、availability 与修改入口 | 纯展示下沉 `@cs2dak/react`；编辑 container 留 Studio |
| `CapabilityBar` | ready/partial/unavailable、coverage、输出级别 | `@cs2dak/react` |
| `FindingPanel` | 统一 Finding、证据、限制和动作槽 | `@cs2dak/react` |
| `LimitNote` | 紧凑限制说明 | `@cs2dak/react` |
| `EvidenceReviewBar` | 来源问题、当前证据、返回 | `@cs2dak/react` |
| `SectionLink` | Overview 摘要进入专项能力 | `@cs2dak/react` |

不得新建第二套表格、分页、tooltip、证据按钮、状态 badge 或页面私有 context card。

## 8. 工作包对应关系

- WP7：我的复盘 Dashboard、待复核 Finding、TrainingFocus。
- WP8：资料库、Event Directory 和管理职责迁移。
- WP9：Team Overview。
- WP10：Event Overview、排行榜归位和旧赛事容器删除。
- WP11：Duel 合并。
- WP12–14：Economy、Utility/Lineup、RadarField 的统一骨架与边界表达。
- WP15：Coach、PrepItem 和报告。
- WP16：最终 shell、导航、视觉收口、旧入口删除和设计文档同步。
- WP17：按本文件的真实 UI 场景做桌面宽度和降级状态验证。

## 9. 窗口与验收

- 主要验收宽度：1440×900、1200×720；补充检查 1024×720。
- 1200×720 必须看到完整侧栏、上下文栏、页面标题和第一块有效内容。
- 1024px 下允许对象页从双列变单列，Coach/Lineup 的右栏改 drawer；不得出现横向页面滚动，数据表可在自身容器滚动。
- 所有 sticky 区域叠加后不得超过 120px；证据模式最多额外增加 48px。
- 使用真实 7 图样本与至少一个 partial/unavailable 样本截图验证，不以空 mock 验收。
- 验证个人、Team、Event、Match、Coach、专家直达和证据返回七条路径。

## 10. 实施时仍需验证但不需重新决定的事项

以下不是产品方向待决策，可在实现 PR 的真实截图中收口：

1. 192px 侧栏在 Windows 字体渲染下是否需要放宽到 196px；不得恢复双行入口。
2. “我的复盘”核心状态条最终保留 4 个还是 5 个指标，以真实最小窗口不换行为准。
3. Team Overview 六个能力摘要在 1200px 下采用 3×2 还是 2×3，以每块是否能完整显示样本和入口为准。
4. Coach 的 PrepItem 常驻右栏断点可在 1320–1360px 间微调，不改变宽屏常驻、窄屏 drawer 的行为。

除此之外，本文件不保留需要再次讨论的页面结构或产品概念。
