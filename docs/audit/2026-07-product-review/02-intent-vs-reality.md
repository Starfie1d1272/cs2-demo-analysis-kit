# DAK Studio Intent vs Reality Audit

调查日期：2026-07-09  
边界：只读审计；不评价 UI，不提出重设计；只记录原始设计意图与当前真实产品之间的差异。

## 总结

原设计没有简单“偏离”。更准确地说：0.8 信息架构的一部分已经在 0.7.4 附近提前落地，随后产品继续沿真实使用压力演进，形成了“全局语料范围 + 分析页面 + 证据回比赛/进游戏”的实际闭环。现在主要未决点不是能不能实现，而是页面归属、对象边界和新能力是否属于主任务流。

## 差异记录

**1. 一级导航已经从计划项变成现实，但文档状态滞后**  
意图：四类任务流：开始 / 选手复盘 / 赛事与队伍 / 备战，管理沉底。  
现实：`App.tsx` 已按四组加管理实现；`studio-redesign.md` 缺口表仍把侧边栏重排标为 0.8 前置。  
证据：[studio-redesign.md:13-49](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/design/studio-redesign.md:13)，[App.tsx:52-87](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/App.tsx:52)，[CHANGELOG.md:64-70](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/CHANGELOG.md:64)，提交 `752909b`。  
分类：implementation-ahead-of-docs / stale-documentation  
需决策：否；主要是文档同步。

**2. `赛事合集 / 赛事总览 / 排行榜` 从三个一级入口合并成一个容器**  
意图：三者都是“赛事与队伍”组内独立一级入口。  
现实：真实产品只有一个一级入口 `赛事与队伍`，内部 tab 为排行榜、赛事总览、赛事合集。  
证据：[studio-redesign.md:26-33](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/design/studio-redesign.md:26)，[App.tsx:89-93](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/App.tsx:89)，[App.tsx:734-770](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/App.tsx:734)。  
分类：intentional-evolution  
需决策：是；确认“赛事与队伍”是否继续作为容器，而不是恢复多入口。

**3. 全局范围模型已落地，但“队伍透镜”语义仍可能需要产品确认**  
意图：跨场页统一 `赛事 / 全部 demo → 地图 → 队伍透镜 → 标签 → 排除场次`，队伍不窄化 demo 语料。  
现实：`CohortScope` 已实现事件、地图、标签、排除和队伍透镜；App 只在跨场页显示。  
证据：[studio-redesign.md:51-63](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/design/studio-redesign.md:51)，[CohortScope.tsx:11-56](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/components/CohortScope.tsx:11)，[App.tsx:589-597](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/App.tsx:589)，提交 `655d0dd`、`cf22b3c`。  
分类：implementation-ahead-of-docs  
需决策：是；不是结构重做，而是确认用户是否能理解“队伍=透镜，不是语料过滤”。

**4. 产品使用路径比原设计更偏“分析类型入口”**  
意图：按用户任务分组：个人复盘、赛事/队伍、备战。  
现实：新用户是数据/对象优先；成熟路径是先进分析页，再用全局范围和页内对象选择。  
证据：[studio-redesign.md:44-49](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/design/studio-redesign.md:44)，[01-current-product-reality.md:92-103](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/audit/2026-07-product-review/01-current-product-reality.md:92)。  
分类：intentional-evolution  
需决策：是；确认导航最终是任务流优先，还是保留当前“任务分组下的分析页入口”。

**5. `道具点位库` 的归属与设计意图不一致**  
意图：道具点位库属于备战素材库，供 lineup 练习、战术本和战术板复用。  
现实：一级导航把 `道具点位库` 放在“赛事与队伍”组；实现里它已经有地图/类型/阵营筛选、回放、练习命令和进游戏能力。  
证据：[studio-redesign.md:35-38](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/design/studio-redesign.md:35)，[studio-redesign.md:237-239](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/design/studio-redesign.md:237)，[App.tsx:69-78](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/App.tsx:69)，[LineupsView.tsx:31-38](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/views/LineupsView.tsx:31)。  
分类：unclear  
需决策：是；它到底是备战素材库，还是赛事范围内的道具分析页。

**6. `闪光价值` 已演进成更宽的 `道具价值`**  
意图：赛事与队伍层展示 Flash Value、最佳闪、负收益队闪。  
现实：页面名为 `道具价值`，覆盖 HE、火、闪、烟，且分选手榜和队伍榜。  
证据：[studio-redesign.md:161-170](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/design/studio-redesign.md:161)，[UtilityView.tsx:135-166](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/views/UtilityView.tsx:135)，[CHANGELOG.md:64-72](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/CHANGELOG.md:64)。  
分类：intentional-evolution  
需决策：是；需要确认它与 `道具点位库` 的边界是否就是“贡献评估 vs 练习复现”。

**7. 对枪拆分按设计落地，但用同一个 `DuelView` 承载两种产品面**  
意图：对枪复盘归个人复盘；对枪概览归赛事与队伍；枪法机制不再作为独立一级页面。  
现实：`duel` 和 `duelOverview` 是两个入口，但共用 `DuelView`，通过 `variant="overview"` 切换叙事。  
证据：[studio-redesign.md:143-149](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/design/studio-redesign.md:143)，[App.tsx:667-690](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/App.tsx:667)，[DuelView.tsx:116-120](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/views/DuelView.tsx:116)，提交 `063ccb4`。  
分类：implementation-ahead-of-docs  
需决策：低；除非要重新定义两页目标用户，否则当前是实现层复用。

**8. 控图从研究原语进入产品，但还没完全变成任务流**  
意图：RadarField 是统一空间分析原语，服务防守盲区、队伍差分、地图控制价值演进。  
现实：`控图` 已是独立入口，支持全局范围、地图、赛事地图基线、队伍对象和缓存计算；7/03 继续做口径、分档、性能和显示打磨。  
证据：[studio-redesign.md:311-343](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/design/studio-redesign.md:311)，[RadarFieldView.tsx:1-5](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/views/RadarFieldView.tsx:1)，[RadarFieldView.tsx:107-164](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/views/RadarFieldView.tsx:107)，[CHANGELOG.md:27-30](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/CHANGELOG.md:27)。  
分类：implementation-ahead-of-docs / unfinished-design  
需决策：是；它是独立诊断页，还是教练/赛事流程中的一个步骤。

**9. 证据入口已经从“回比赛工作台”扩展到“回比赛 + 进游戏”**  
意图：比赛工作台是所有 EvidenceLink 的落点。  
现实：`EvidenceActions` 复用证据跳转，并在有原始 demo 时提供 `进游戏`；道具点位库还能生成练习命令。  
证据：[studio-redesign.md:44](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/design/studio-redesign.md:44)，[EvidenceActions.tsx:23-30](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/components/EvidenceActions.tsx:23)，[LineupView.tsx:561-573](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/views/LineupView.tsx:561)，提交 `73b8f46`、`b293fb6`。  
分类：intentional-evolution  
需决策：是；不是结构问题，而是是否需要明确“返回原分析页”的证据闭环。

**10. 战术板仍是设计项，当前产品没有入口**  
意图：备战组应有战术板，作为回放/雷达标注层，支持 PNG/Markdown 导出。  
现实：当前 `StudioView` 和 `NAV_GROUPS` 没有战术板入口。  
证据：[studio-redesign.md:35-38](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/design/studio-redesign.md:35)，[studio-redesign.md:345-348](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/design/studio-redesign.md:345)，[App.tsx:35-49](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/App.tsx:35)。  
分类：unfinished-design  
需决策：是；确认它仍是备战主入口，还是等真实教练流程证明后再做。

**11. 资料库、管理、赛事合集三者边界仍重叠**  
意图：资料库负责导入与数据 QA；管理负责身份、资产、赛事包、资料库维护；赛事合集是 Event → Stage → Series → Map 的分析面。  
现实：资料库有导入/重建/删除；管理有身份、资产、赛事三 tab；赛事合集空态引导去管理加载赛事资产。  
证据：[studio-redesign.md:88-99](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/design/studio-redesign.md:88)，[studio-redesign.md:40-41](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/docs/design/studio-redesign.md:40)，[ManagementView.tsx:234-267](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/views/ManagementView.tsx:234)，[EventsView.tsx:35-40](/Users/starfie1d/GitHub/cs2-demo-analysis-kit/apps/dak-studio/src/views/EventsView.tsx:35)。  
分类：unclear  
需决策：是；尤其是赛事资产到底是分析入口、资料组织入口，还是管理后台入口。

## 需要后续产品决策的问题

1. `赛事与队伍` 是否继续作为容器承载排行榜 / 总览 / 赛事合集。
2. `道具点位库` 归备战还是赛事与队伍。
3. `控图` 是独立诊断页，还是教练/赛事流程中的证据步骤。
4. `道具价值` 与 `道具点位库` 的边界是否固定为贡献评估 vs 练习复现。
5. 证据 deep link 是否需要返回原分析上下文。
6. 资料库 / 管理 / 赛事合集的资产与赛事职责边界。
