# 04b - 对 Product Decision Map 的反方审查

本审查只把 `01-current-product-reality.md`、`02-intent-vs-reality.md`、`03-task-walkthrough.md` 作为一手证据。`04-product-decision-map.md` 被视为另一位产品负责人提交的问题定义；这里的任务不是改进它，而是尽力证明它定义错了。

约束：不提出最终产品模型；不设计导航；不给实施 roadmap；不默认接受 04 的六个 Decision；只判断问题定义是否被原始证据支持。

## 1. 04 最强的三个判断

### 1. 范围、透镜、角色的语义冲突是真问题

04 把 CohortScope、team lens、subject role 放进 D3，背后的原始证据很强。

03 的 Experiment A 直接显示：FURIA chip 看起来像 filter，但保留 7/7 全量 demo；Control map 是少数明确解释“global baseline / team contribution”的页面；进入 Coach 后还要重新选择 self/opponent。01 也明确说 team 是 lens，不缩小 corpus。这不是单纯 UI 小毛病，而是用户看到的“范围”“主体”“对手”“队伍贡献”混在同一类控件外观里。

但这只证明“分析语义必须被澄清”，不证明 04 的 D3 可以同时承载 corpus/lens/role/route persistence/cross-page inheritance 这些不同层级。

### 2. 发现到证据、证据到行动之间确实断裂

03 Task 1 的个人发现最有杀伤力：Home 给出 “long-rifle first death 3/39 / inferno R12”，点击后进入的是 generic Match Workspace Overview，没有携带 FalleN、R12、问题语义；手动进 R12 后 replay 返回 rounds 又重置到 R1；也无法回到原始 finding row。

03 Task 4 又给出反例：Coach 内部可以从 pattern 到 representative round，再到 add list，再到 Markdown report。也就是说，系统不是完全没有 evidence loop，而是只有 Coach 局部闭合，其他分析页没有自然 handoff。

04 抓住了断裂，但 D4 和 D5 的拆法可疑。发现能否携带证据、被复核、被接受或否决、进入行动或报告，像是同一个对象生命周期，而不是两个可独立排序的根决策。

### 3. Event 的多重含义确实不是命名问题

03 Experiment B 明确列出至少四种 Event：

- CohortScope 里的 “example professional games 7 matches”：范围/集合 filter。
- Event & Teams dashboard：当前 aggregate range。
- Event Collection：Event -> Stage -> Series -> Map 的只读层级。
- Management Event：下载、导入、`<slug>.zip`、event-series-map、demo pair 的资源生命周期。

01 也要求澄清 Event & Teams、Event collection、Management assets 的边界。04 把这个识别为 D2 的核心材料，是成立的。

问题在于，04 进一步把“用户可感知领域对象”和“package/import/management 资产运营模型”绑成一个 Domain object and asset lifecycle 决策，这一步没有被证据自动支持。

## 2. 04 最可疑的三个判断

### 1. D1 假设存在一个全产品唯一的主要组织单位

D1 问 “main organizing unit” 是 analysis ability、object 还是 issue/task。这个问题过于笼统。

01 已经显示产品里至少有全局 CohortScope、page-local selection、match/player/trails 等页面状态、Coach role selection、Library/Management asset flows。03 也显示不同任务天然处在不同层级：个人诊断从 Home finding 出发，FURIA 分析在多个能力页并行，Coach 准备任务在 Coach 内部闭合。

这些证据不支持“全产品只能选一个组织单位”。更可疑的定义应该是：全局导航层、对象工作空间层、分析能力层、任务/发现层分别以什么为稳定单位。D1 把层级问题压成了 winner-takes-all 问题。

### 2. D2 混合了领域对象模型和资产运营模型

D2 试图同时回答 demo/match/event hierarchy/event package/management asset/import availability。这里至少有两种不同层级：

- 用户可感知的领域对象：match、series、stage、event、team、player、round、evidence。
- 资产运营模型：ZIP package、download/import、local availability、identity repair、event-series-map、demo pairing。

03 Experiment B 证明它们现在共用 “Event” 词，并且关系不清。但“关系不清”不等于“它们应该由同一个根产品决策定义”。用户可以理解 Event 是比赛集合或赛事层级，却完全不需要理解 package slug；管理者可以处理 package 导入失败，却不必改变分析页里的 Event 语义。

D2 的危险是把 vocabulary collision 当成 ontology unification。

### 3. D4 和 D5 被错误拆开

D4 说 finding-to-evidence contextual contract，D5 说 results-to-action/sinking。03 里的失败不是两段可独立决策的流程，而是同一生命周期没有产品身份：

- finding 是否有可携带身份？
- finding 是否保存 subject、scope、assertion、metric、evidence reason？
- 用户进入证据后是在验证、解释、还是继续浏览？
- 回来时是回到同一 finding，还是回到页面默认状态？
- finding 被接受后是否进入 action、playlist、report 或 training item？

这些问题不能拆成“先 deep link，再 action sink”。如果 finding 没有身份，D5 的 action sink 只能接收页面临时状态；如果 action 语义先定，D4 的 evidence context 又会被反向定义。

## 3. 逐项攻击

### 3.1 False split

#### D4 + D5 应该合并为一个问题：分析发现是否是一等产品对象，以及它的完整生命周期

03 Task 1 的问题不是“点击 finding 时多传几个参数”这么窄。真正断点是从现象到证据、从证据到判断、从判断到行动之间没有同一个可追踪对象。

一个 finding 至少涉及这些生命周期位置：临时观察、可表述发现、证据访问、复核/否决/接受、保存或行动化。这里不是在提出最终产品模型，而是在说明 D4/D5 的分界不成立。它们研究的是同一个根对象是否存在，以及它存在后是否有完整生命周期。

Coach 的局部闭环也支持这个判断。Coach 能从 pattern 到 round 到 playlist/report，是因为它在局部拥有一种可承接的 task material。其他页面没有这层对象，所以 evidence jump 和 action sink 同时失败。

#### D1 的 “issue/task” alternative 与 D4/D5 重复

如果 D1 的“发现任务优先”指的是以发现为一等对象组织工作，那么它就是 D4/D5 的上位版本；如果它只是导航入口偏好，那它不应与“分析能力优先/分析对象优先”并列为根模型。

04 一边把 discovery/task close-loop 当成三种竞争模型之一，一边又把 finding identity/action sink 拆到 D4/D5。这导致同一根问题被重复编码。

#### D6 不一定是 D1-D5 的下游统一决策

04 把 capability role/placement 放到 D6，并说它在 D1-D5 后。这个依赖关系过硬。Utility、Lineup、Control map、Duel review、Economy 可能分别产出不同类型材料：解释、对比、证据、练习素材、诊断观察。它们不一定需要一个统一 “capability role” 决策才能被评估。

更可能的是：每个 capability 是否产出可承接的 claim/evidence/action material，要由发现生命周期和断言-证据关系来判断，而不是由一个统一 placement 决策判断。

### 3.2 False merge

#### D1 合并了四个不同层级

D1 不能问“产品主要按什么组织”，因为 01-03 的证据至少区分四层：

- 全局导航层：用户先看到哪些入口、哪些长期区域、哪些 footer/management。
- 对象工作空间层：player、match、event、team、round 等对象是否有稳定上下文。
- 分析能力层：duel、economy、utility、lineup、control、coach 等能力如何暴露。
- 任务/发现层：一个问题、模式、finding、playlist/report 是否跨页面持续。

03 Task 3 里 FURIA 可以作为 lens 贯穿多个分析页，但没有稳定 team profile；Task 4 的 Coach 可以作为准备任务闭合，但并不组织全局导航；Task 1 的 Home finding 可以触发证据，但不能维持 Match Workspace 状态。

这些事实说明 D1 的抽象层级错了。不存在一个证据支持的“全产品唯一主要单位”问题。

#### D2 合并了用户领域模型和资产运营模型

D2 把 event range、event hierarchy、event package、management asset association/import availability 放在同一个决策里。这是 false merge。

用户领域模型回答：用户认为自己在看哪个赛事、哪个 stage、哪组 series、哪场 match、哪个 team/player/round。资产运营模型回答：本地有没有 demo、package 如何下载导入、facts 是否已构建、series-map 是否能配对、资源是否可修复。

03 Experiment B 只证明两者现在在命名和入口上纠缠，不证明它们应该共享一个产品抽象。把它们合并会让一个简单的用户问题“我正在分析哪个赛事范围”被拖进 package lifecycle；也会让一个运营问题“这个 package 是否可用”被迫承担赛事语义。

#### D3 合并了分析语义和状态传播

D3 里有一部分是根问题：team chip 到底是 corpus filter、lens、subject 还是 role。另一部分只是行为合同或状态管理：哪些页面继承、哪些 selector 清空、URL 是否携带参数、返回路径如何恢复。

03 Experiment A 说 Coach 不继承 FURIA selection，这可以是产品语义问题，也可以是有意的 role rebinding。没有先定义 actor/subject/role，就不能把它直接归为 cross-page persistence 错误。

#### D6 合并了能力角色和页面归属

“Utility 是否用于 contribution evaluation，Lineup 是否用于 reproduction/practice，Control map 是否是 spatial diagnosis”，这是能力产物语义。“放在 Event & Teams、Preparation、Player review、独立 workspace”，这是信息架构。04 虽然说 D6 是 local，但仍把两者绑在同一决策中。

能力是否应该存在、产出什么材料、归入哪里，是三个不同层级。

### 3.3 Wrong abstraction level

04 把一些实现或交互问题提升成了产品根决策。

| 04 中的材料 | 更低层级归类 | 反方判断 |
|---|---|---|
| MatchDeepLink 只带 round/tick，不带 finding/player/problem | deep link 行为和状态携带 | 这是 D4/D5 合并问题的证据，但本身不是根决策 |
| replay 返回 rounds 重置到 R1 | 页面状态恢复 / history 行为 | 可作为缺陷修复，不需要先定 D1 |
| team chip 像 filter 但其实是 lens | 文案、控件语义、交互表达 | 背后有产品语义问题，但 chip 外观不是根问题 |
| Event tabs、Lineup placement、Control page placement | 导航和页面职责 | 不应被提升成产品模型本体 |
| package import、asset association、event package availability | 数据资产实现 / 运营模型 | 只有当它影响分析资格、范围口径、证据可用性时才进入产品决策 |
| Library vs Management overlap | 资产入口和操作边界 | 不等于用户领域对象必须重构 |

反过来，03 Task 1 里 “为什么这个 round 是证据”“为什么这个指标说明问题” 不能被降级为文案。它是 claim/evidence validity：系统是否能说明一个分析断言凭什么成立。

### 3.4 Path dependence

04 的问题定义仍受当前实现形状影响。

第一，D1 过度受当前 navigation grouped by capability 的页面结构牵引。01 说成熟用户可能先选分析页，新用户可能先走 data/object；03 的 walkthrough 只是单次任务路径，不足以证明三种模型需要竞争。

第二，D3 受现有 CohortScope 实现影响。当前 CohortScope 位于部分页面之外，team lens 不缩小 corpus，这是事实；但“是否继承到 Coach”不能直接从当前实现推出。Coach 也有 self/opponent 的角色语义，可能本来就不应该继承一个 team lens。

第三，D4 受当前 Match Workspace deep link 限制。MatchDeepLink 字段缺失证明当前行为有断点，不证明产品根问题是 deep link contract。根问题更可能是 finding 是否存在和它带什么证据语义。

第四，D2 受当前 Event Package implementation 牵引。Event Collection 的层级树、Management 的 package slug、Library 的 local demo 都是现有实现形状。04 把这些都装进 D2，容易把资源实现边界误认成用户对象边界。

第五，D5 受 Coach 当前闭环牵引。Coach 有 playlist/report，所以 04 把 action sink 独立出来；但这可能只是因为 Coach 是唯一已有 action surface，而不是因为 action sink 是独立于 finding lifecycle 的根决策。

### 3.5 Missing decision

#### 缺失 1：Actor / Subject / Role / Goal 的根关系

01 把“我”、players、team、event、match 都列为核心对象；03 Task 1 从“这是我”开始，Task 4 又要求选择 self/opponent。03 Task 3 的 FURIA 是被分析 team，Task 4 的 FURIA/Vitality 是对手准备关系中的角色。

04 的 D3 提到 subject/role，但它是在 scope/lens/cross-page contract 下讨论，缺少一个更早的问题：谁在分析、为谁分析、分析对象是谁、比较关系是什么、任务目标是什么。

没有这个根关系，team lens、self marker、opponent role、player profile、coach preparation 都会被混入同一个 selector persistence 问题。

#### 缺失 2：Claim / Evidence validity

04 讨论 finding context travel 和 evidence return，但没有直接问：一个分析结论到底声明了什么，凭什么证据成立。

03 Task 1 的关键断裂不是只丢了 R12 参数，而是从 “long-rifle first death 3/39” 到 R12 replay 之间没有解释为什么这个 round 是证据、FalleN 的哪段行为支撑了这个诊断、这个指标是观察还是问题。03 Task 4 的 Coach representative round 也隐含同一问题：代表性如何成立？

如果不定义 claim/evidence validity，那么即使 D4 把 context 带过去，用户也只是带着一个不透明结论去看录像。

#### 缺失 3：Analytical eligibility / Data readiness

04 的 D2 涉及 import availability，但没有把它拆成用户可见的分析资格问题。

01 和 03 都显示数据资产不是纯后台问题：Library、Management、Event package、facts rebuild、demo pairing 会影响用户能否得出 cohort、event、team、round 级结论。真正的根问题不是 package 怎么管理，而是什么数据条件足以支持某类分析断言，以及用户如何知道 denominator/provenance/coverage。

这个问题连接 D2 和 D3，但不等于二者之一。

### 3.6 False alternatives

04 的三种模型：“分析能力优先 / 分析对象优先 / 发现任务优先”，不一定是竞争模型。

它们更像不同产品层级：

- 分析能力优先：适合探索入口和专家用户直接进入工具。
- 分析对象优先：适合定义 scope、workspace、比较锚点和证据归属。
- 发现任务优先：适合当观察跨过阈值后，维持问题、证据、复核、行动的连续性。

01 的“先选对象还是先选分析类型”本来就把新用户和成熟用户分开；03 Task 3 的 FURIA lens 可以在多个能力页间移动；03 Task 4 的 Coach 可以把 pattern 转成 playlist/report。这些证据更支持三者并存于不同层级，而不是三选一。

所以 04 的 false alternative 在于：它把 landing/default/navigation 的选择，误包装成全产品根模型竞争。

## 4. Retain / Merge / Split / Demote / Add

| 动作 | 对象 | 反方处理 |
|---|---|---|
| Retain | D3 的语义核心 | 保留 corpus denominator / lens / subject / role 的区分，因为 01-03 有直接证据。去掉它对 route persistence 和 selector inheritance 的过度承载。 |
| Retain | D2 的 Event collision 观察 | 保留 “Event” 多义冲突这个事实。不要保留 D2 把领域模型和资产运营模型合并的定义。 |
| Merge | D4 + D5 | 合并为“分析发现是否是一等产品对象，以及它的完整生命周期”。finding identity、evidence jump、return、review、action/report/saved item 属于同一问题。 |
| Merge | D1 的 task alternative + D4/D5 | 如果 D1 的“发现任务优先”指 discovery lifecycle，它应进入合并后的 finding lifecycle，而不是作为 D1 的竞争模型。 |
| Split | D1 | 拆成全局导航层、对象工作空间层、分析能力层、任务/发现层。不要问唯一 primary organizing unit。 |
| Split | D2 | 拆成用户领域对象关系、数据资产运营模型、分析资格/数据 readiness。 |
| Split | D3 | 拆成分析语义 contract 与页面状态/deep link 行为。 |
| Split | D6 | 拆成能力产物语义、能力适用对象、页面归属。 |
| Demote | exact deep link fields、返回 R12/R1、chip 外观、tab placement | 降为状态管理、deep link、文案/交互、导航行为。它们可以修，但不应伪装成根产品决策。 |
| Demote | package import mechanics | 降为资产运营实现，除非它影响用户看到的分析资格、coverage、provenance。 |
| Add | Actor / Subject / Role / Goal | 新增根问题：谁在分析、分析谁、以什么关系分析、目标是什么。 |
| Add | Claim / Evidence validity | 新增根问题：分析断言是什么，证据为何成立，代表性和反证如何表达。 |
| Add | Analytical eligibility / Data readiness | 新增根问题：哪些数据条件支持哪些分析结论，用户如何看到 denominator、coverage、provenance。 |

## 5. 反方 Root Decision Set

这不是最终产品答案，也不是导航方案。它只是更抗攻击的问题集合。

### R1. Actor / Subject / Role / Goal：谁在分析，分析谁，以什么关系，为了什么任务？

原始证据：

- 01 把“我”、players、team、event、match、round、evidence 都列为核心对象。
- 03 Task 1 从“这是我”开始，个人诊断依赖 self identity。
- 03 Task 3 的 FURIA 是被分析队伍。
- 03 Task 4 的 Vitality/FURIA 是 opponent scouting 的角色关系。

要排除的误判：不要把 self marker、team lens、opponent role、player profile 都塞进一个 selector persistence 问题。

### R2. Claim / Evidence validity：系统到底在声明什么，凭什么证据成立？

原始证据：

- 03 Task 1 的 finding 有指标和 round，但进入 replay 后没有保留“为什么这段是证据”的解释。
- 03 Task 4 的 representative round 能进入 playlist/report，但“代表性”仍是隐含关系。
- 01 把 evidence 推断为核心连接对象。

要排除的误判：不要把 evidence jump 仅仅当成 deep link；也不要把说明缺失降级成文案。

### R3. Analysis Domain / Data Eligibility：分析域、领域对象、数据资格之间是什么关系？

原始证据：

- 03 Experiment B 显示 Event 同时是范围、聚合视图、层级集合、资源包。
- 01 区分 event/map/tag/excludedIds narrowing 和 team lens。
- 01/03 都显示 Library、Management、Event Package 影响 demo/facts/series-map 的可用性。

要排除的误判：不要把 package lifecycle 等同于用户领域模型；也不要把 data availability 当成纯后台问题。

### R4. Finding Lifecycle：分析发现是否是一等产品对象，以及完整生命周期是什么？

原始证据：

- 03 Task 1 finding -> match -> replay -> return 的链路丢失 subject、round/problem context 和 source row。
- 03 Task 2 显示离开 Home 后没有持续的 current diagnostic。
- 03 Task 4 显示 Coach 内部存在 pattern -> round -> playlist -> report 的局部闭环。

要排除的误判：不要拆成 D4 evidence transport 和 D5 action sink；这是一条生命周期。

### R5. Cross-boundary Continuity：哪些上下文必须跨边界持续，哪些只是一次性跳转？

原始证据：

- 03 Task 1 的 evidence jump 后无法回到原 finding。
- 03 Task 3 的 FURIA 在多个分析页中作为 lens，但没有 team workspace。
- 03 Task 4 的 Coach 不继承外部 FURIA selection，需要重新绑定 self/opponent。

要排除的误判：不要在没有 R1-R4 的前提下先规定 URL、route state、selector inheritance。跨边界连续性是行为合同，不是全产品组织单位。

## 6. 反方结论

04 的强处是它收集到了真实断点：scope/lens 混淆、Event 多义、finding 到 evidence/action 不连续、能力页之间缺少任务承接。

04 的弱处是它把这些断点定义成六个看似同层级的决策。D1 过大，D2 误合并，D4/D5 误拆分，D3 混入状态传播，D6 把能力产物和页面归属绑在一起。最危险的是三模型比较：原始证据更像在提示不同层级应分别采用不同组织原则，而不是要求三者竞争出一个全局答案。

因此，04 不应直接作为下一轮产品比较的根框架。它更适合作为现象索引；根问题需要按 actor/subject/role、claim/evidence validity、analysis domain/data eligibility、finding lifecycle、cross-boundary continuity 重新定义。
