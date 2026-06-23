# DAK Studio UI 体检对照表（临时）

> ⚠️ **临时文档，不长期维护**。2026-06-22 全页面 UI 走查产物，仅作一轮集中修复的对照清单。
> 修完即可删除或归档。基准：`docs/design-language.md`「Tactical Slate」。

## 图例

- 🔴 P0 功能正确性 / 误导用户
- 🟠 P1 功能缺口（排序 / 翻页 / 重复收敛）
- 🟡 P2 架构收敛 / 风格一致性
- ✅ 决策已定（保留哪一套）
- ❓ 待与作者确认（多为英文 vs 中文）
- 🚫 作者明确不改（如 BP 英文动词）

---

## 0. 作者已拍板 / 不改

- 🚫 **BpView 英文动词（removed / picked / was left over / chose）刻意保留**。延伸原则：CS 中文社区惯用英文的术语**一律保留英文**，不强行中文化。见 §4「英文术语对照」逐条确认。
  - 位置 `views/BpView.tsx:4,35`

---

## 1. 重复功能 → 收敛决策

| # | 重复点 | 涉及位置 | 决策（保留哪套） | 状态 |
|---|---|---|---|---|
| D1 | 经济分析表（economyMatrix / ecoUpsets / teamPistols） | `EconomyView.tsx:129-161` ↔ `TournamentDashboardView.tsx:195-240` | **保留 EconomyView**（有可点表头排序 + 热力着色 + 更全列）。赛事总览删掉这 3 张经济表，只留它独有的 TeamComparisonPanel / 地图盘面 / 武器击杀榜 | ✅ |
| D2 | 跳回放交互 | `EvidenceLink`（Home/Players/Utility） ↔ 自绘 `stu-button-sm 回放/工作台↗`（Coach/Duel/Lineup） | **统一用 `EvidenceLink` 原语**。Coach「加入清单」是另一动作，保留为普通按钮 | ✅ |
| D3 | 道具落点聚合 | `buildLineupClusters`(@cs2dak/maps) ↔ `UtilityView` 内嵌 Lineup ↔ `PatternExplorer.buildUtilityLanding:384` | **复用 `buildLineupClusters`**：教练页改调 maps 包统一聚类，删 `buildUtilityLanding` | ✅ |
| D4 | 表格排序交互 | `stu-sort-header` 按钮(EconomyView) ↔ `stu-col-sortable` th-onClick ↓/↑(Utility/Lineup) ↔ Duel 工具栏 chip | **统一用 `stu-col-sortable` 可点表头（支持升/降切换）** | ✅ |
| D5 | 翻页 | 已有共享 `Pagination`，仅 Duel/Utility/Lineup 用了 | 所有长表/长列表统一接 `Pagination`（无需选型，组件已是唯一实现） | ✅ |
| D6 | 淘汰赛 bracket 渲染 | `ElimBracket`（无 lane） ↔ `BracketConnections`（带 lane + 胜/负连线，**死代码**） | **以 `BracketConnections` 为准**（唯一能正确表达双败胜者组/败者组）。观看侧改用它；制作板 `EventFrameworkBoard` 也需补 lane | ✅ |
| D7 | 排行榜归属 | `LeaderboardView` 现挂在赛事中台 | **留在赛事中台**，定位为「赛事选手排行」，改 nav hint / 子页命名使其名副其实 | ✅ |

---

## 2. 🔴 P0 功能正确性 / 误导

- 🔴 **双败淘汰 lane 丢失**：`EventFrameworkBoard.tsx:65-84` 只按 round 分列，丢掉 winner/loser/grand；观看侧 `EventsView` 用无 lane 的 `ElimBracket`，正确的 `BracketConnections` 是死代码（仅 `EventsView.render.test.ts` 引用）。→ 见 D6
- 🔴 **瑞士轮提前判定晋级/淘汰**：`event-bracket.ts:108` 用 `Math.max(各队胜场)` 当门槛，未打完会误标晋级。
- 🔴 **开局模式回放定位用哈希凑 seq**：`PatternExplorer.tsx:208 replayTargetSeq` 把 matchId 哈希成 seq 传 `ReplayViewer`，非真实回合序号，可能定位错回合；`initialClockSeconds={95}` 写死。
- 🔴 **GSL 双败小组渲染成单循环积分榜**：`EventsView.tsx:70` `gsl_group` 走 `RoundRobinStage`。

## 3. 🟠 P1 功能缺口

- 🟠 赛事中台全部表无排序/翻页：`EventsView.standings:78`、`EventManager` 已导入赛事表 `EventManager.tsx:123`、`TournamentDashboardView` 地图盘面/武器榜/手枪局表 `:118+`（economyMatrix 硬切 12 行、weaponKills 无上限）。
- 🟠 开局模式证据回合表无排序/翻页 `PatternExplorer.tsx:408`；战术本 `slice(0,20)` 静默截断 `CoachView.tsx:351`。
- 🟠 赛事「获取/制作」入口在「管理」(EventManager/EventPackageMaker)，但 `EventsView` 空态指向「资料库」`EventsView.tsx:36` → 入口与提示对不上；考虑把获取入口搬进赛事中台。
- 🟠 道具实验室只覆盖闪光，无烟/火/雷价值；「落点」靠内嵌 Lineup。
- 🟠 Players 的「该选手的比赛 / 每场 RR / 逐场趋势」长列表不翻页。

## 4. 英文术语对照（§0 原则的逐条落地）— ✅ 已确认

> 原则：社区惯用英文的**保留**；作者已逐条拍板。

**A. 这 4 个中文化（作者确认可中文）**
- ✅ Flash Value → **闪光价值**（道具实验室 / 个人档案）
- ✅ Lineup / Lineup Library → **道具点位 / 道具点位库**（道具实验室、LineupView 标题，含「Lineup 雷达」「常用道具库」一并统一）
- ✅ Playstyle Fingerprint → **打法风格**（个人档案雷达）
- ✅ Mistake Review → **失误复盘**（个人档案）
- 保留英文无疑：PRISM / RR / KAST / HLTV / ADR / TTK / Rating 2.0 / Eco / Anti-eco / Semi / Force / 8Hz；BP 动词（§0）

**B. 确定要改（与英文无关，是「不一致」本身）**
- ✅ 同一指标两名：「净值/颗」(`UtilityView.tsx:164`) → 统一为 **「净价值/颗」**（对齐 `PlayersView.tsx:408`）。
- 🟡 nav hint 名不副实：赛事中台「排行榜/报表」、教练「战术模式与战术本」(实为开局模式/战术本/备战清单/备战报告)、道具「道具价值与落点」(实只 flash) `App.tsx:49-53`。
- 🟡 回放标识显示裸 matchId 截断串（`PatternExplorer.tsx:445`、Trails 图例）→ 改为对阵/地图/日期。

## 5. 🟡 P2 风格一致性（设计语言违背）

- 🟡 **裸色值 / 内联颜色**（违反 §2）：`LineupView.tsx:27-34,496-506` GRENADE_COLOR hex + inline style；`TrailsView.tsx:48` trailColor hsl；RadarTrails 同。→ 注册 `--dak-*` token。
- 🟡 **MetricInfo ⓘ 覆盖不均**（违反 §4.2）：Utility / Economy(多处用 title 代替) / Lineup(胜率无 ⓘ) / Events 缺；Players/Home/Dashboard/Coach 达标。
- 🟡 **空态包裹不一致**：`LineupView.tsx:216` 裸返回 EmptyState 缺 `stu-view` 骨架（因被嵌入）。
- 🟡 **原生弹窗混用**：`window.prompt/confirm`（`LibraryView.tsx:73,138`、`EventManager.tsx:139`）与自绘 `stu-modal`(VetoInputDialog) 风格割裂。
- 🟡 **CohortScope 出现不一致**：赛事合集无 scope，同级排行榜/赛事总览有。
- 🟡 **标签文案重复定义**：`DuelView.tsx:41 CLASS_TONE` 覆盖 presentation 的 `duelClassificationLabel`，两份易漂移。

## 6. 死代码 / 接口噪音

- `BracketConnections`（`EventsView.tsx:120`）仅测试引用 → 按 D6 启用而非删除。
- `DuelView.explainDuelRow:650` 定义未用。
- `MapPoolTable` 声明 `clusters`/`entries` props 但函数体未用（`MapPoolTable.tsx:41`）。

---

## 7. 建议修复顺序（一次性集中处理）

1. **决策落地（无歧义的先做）**：D5 翻页铺开、D4 排序统一、D2 EvidenceLink 统一、D1 经济表去重。
2. **P0 正确性**：D6 bracket lane（含 EventFrameworkBoard + 启用 BracketConnections）、瑞士轮门槛、Coach 回放 seq、GSL 渲染。
3. **P1 缺口**：赛事/教练表补排序翻页（依赖 1）、赛事获取入口归位、Players 长列表翻页。
4. **文案**：先按 §4 与作者确认英文保留项 → 再批量改 §4-B 不一致项 + nav hint + matchId 展示。
5. **P2 风格**：色值入 token、ⓘ 补齐、空态骨架、原生弹窗替换、scope 一致、CLASS_TONE 去重。
6. **清理**：死代码（explainDuelRow、MapPoolTable 冗余 props）。

所有 ❓ 已确认（2026-06-22）：D3=复用 buildLineupClusters；D7=留赛事中台并重命名；§4 四个英文词中文化；指标统一「净价值/颗」。

---

## 8. 执行状态（2026-06-22 夜，直接改 main，未做可视化验证；typecheck + 受影响测试已过）

### ✅ 已完成
- **文案**：闪光价值 / 道具点位·道具点位库 / 打法风格 / 失误复盘 全部中文化（UtilityView、PlayersView、LineupView、选手图卡 Markdown）；「净值/颗」→「净价值/颗」并补 ⓘ；nav hint 三处改名副其实（`App.tsx`）；开局模式证据表裸 matchId → 对阵标签（`PatternExplorer.tsx`）。
- **D1 经济去重**：`TournamentDashboardView` 删队伍手枪局 / 经济对位胜率 / Eco-Semi 翻盘三表，留指向「经济与节奏」的说明。
- **排序/翻页**：开局模式证据表（翻页）、战术本（去 slice(0,20)+翻页）、赛事循环赛积分榜（可点表头排序）。
- **D6 双败 lane（观看侧）**：`EventsView` 双败改用 `BracketConnections`（带胜/败者组 lane + 晋级连线），单败保留可点的 `ElimBracket`；`BracketConnections` 不再是死代码。
- **赛事入口归位**：`EventsView` 空态 →「去管理」（真正的赛事获取/制作在管理）。
- **D3 部分 / token**：`LineupView` 复用 `RadarTrails` 的 token 化 `GRENADE_COLOR`，删本地裸 hex。
- **清理**：删 `DuelView.explainDuelRow` 死代码；`MapPoolTable` 去掉未用的 `clusters`/`entries` props；`LineupView` 胜率补 ⓘ。

### ⏸ 暂缓（2026-06-23 第二轮大部分已解决，见 §9）
- **瑞士轮提前判定晋级**：只在「未打完的瑞士轮」触发，赛事包是 read-only 完赛资产，实际少见。
- **原生 window.prompt/confirm → 自绘弹窗**、**TrailsView trailColor 彩虹色板入 token**：低优先。

---

## 9. 第二轮（2026-06-23，作者逐条确认后）—— typecheck + 16 测试文件/99 测试全过

### ✅ 已完成
- **D3 目标点道具落点**：删手搓 `buildUtilityLanding` 计数，改用验证过的 `buildLineupClusters` 做空间聚类（教练 fact 的 grenade 已带 3D 投掷/落点，直接构造 `LineupGrenadeLike`，同步、不新增查询、返回形状不变）。**保留"落点大区==本回合目标包点"过滤 + 烟/火都要**（作者确认按原逻辑，仅换底层函数）。
- **雷达裁切（修正：是「教练工作台 → 开局模式」PatternExplorer）**：
  - 第一次误改了 TrailsView CSS，已**全部还原**。
  - 多轮迭代后最终方案：外层网格锁死 `height: calc(100dvh - 130px)`（不参与子元素高度竞争）+ 左右栏 `overflow-y: auto` 各自滚 + 中间 ReplayViewer 列由 JS `ResizeObserver` 实测可用空间，`radarMaxWidth = min(列宽, 列高−bar−gap, 660)`，wrapper `maxWidth` 约束而不碰 `.dak-replay-stage` 内部类。
- **道具页布局**：道具点位库提到上面、闪光价值+负收益队闪放下面。
- **地图名统一**：LineupView 四处统一走 `mapDisplayName`（"de_mirage"/"mirage" → "Mirage"）。
- **D2 EvidenceLink**：PatternExplorer「工作台↗」、LineupView「回放」转 `EvidenceLink` 原语；DuelView 整张 compact 卡片本就是可点击证据（role=button），保留卡片点击模式（塞原语反而割裂）。
- **D6 制作侧 lane**：`EventFrameworkBoard` 淘汰赛按 lane（胜者组/败者组/总决赛）分段渲染；顺带修了底层 bug——制作器切阶段类型时**根本没挂 bracketNodes**（连 single/double elim 用下拉切换都拿不到节点），现统一经 `bracketNodesForType()` 挂/清。
- **GSL 渲染**：新增 `gslGroupNodes()`（4 队双败：双开局→胜者组决胜 2-0 晋级/败者组淘汰 0-2 出局→小组决胜）；EventsView 对**有 bracketNodes 的 GSL** 走 lane-aware bracket（`BracketConnections`），缺节点的旧只读资产降级为积分榜（数据限制，无法回填）。

### 决定保留 / 不改（作者确认）
- BP 英文动词、瑞士轮提前判定、原生弹窗、TrailsView 彩虹轨迹色板：均不改。
- 开局模式回放 `seq`：读 `ReplayViewer` 后确认是 re-trigger nonce（非回合索引），功能正确，**误报撤销**。

### ⚠️ 数据限制提示
GSL 要渲染成 bracket 需 `bracketNodes`。**已导入的旧 GSL 只读资产若不含节点，仍显示积分榜**；新建/重制的 GSL 阶段会自动带节点 → 正确渲染为双败小组。
