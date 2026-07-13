# DAK Studio Roadmap

> 本文只管理产品版本顺序、范围与出口条件，不重复设计细节或研究论证。
>
> - 产品职责真相源：[`07-final-product-review.md`](audit/2026-07-product-review/07-final-product-review.md)
> - 页面实施参考：[`08-page-level-ui-ux-implementation.md`](audit/2026-07-product-review/08-page-level-ui-ux-implementation.md)
> - 模块边界：[`module-boundaries.md`](module-boundaries.md)
> - 指标成熟度：[`stability-tiers.md`](stability-tiers.md)
> - 发布流程：[`release.md`](release.md)
> - 用户可见历史：[`CHANGELOG.md`](../CHANGELOG.md)

## 产品原则

1. **Evidence-first**：可下结论的分析必须说明样本、依据、限制，并能回到比赛、回合和 tick 证据。
2. **AnalysisContext 唯一持有当前分析**：语料、对象/角色、基线和目标不由各页面重复拥有。
3. **观察不冒充结论**：描述性结果可以浏览、收藏或备注；只有满足证据与成熟度条件的 Finding 才进入行动系统。
4. **行动产物保持具体**：个人问题进入 `TrainingFocus`，队伍/对手材料进入 `PrepItem`，点位练习进入 `PracticeLineup`；不建设万能 Finding 仓库。
5. **先发布与验证，再扩功能**：真实 Windows 更新、长期资料库和用户使用证据优先于新增评分或复杂工作流。
6. **单一分析管道**：v3 ZIP、可重建 facts、core/cohort 与 presentation 是共享分析真相源；产品页面只做上下文适配与编排，不重新解析 ZIP，不复制聚合或评分公式。
7. **Pattern 必须可解释**：战术模式必须展示位置、道具、时间、交火结构、样本范围和代表回合，不输出无法还原依据的战术标签。

## 当前产品基线

当前桌面版本为 **0.8.0**。`v0.7.8..v0.8.0` 完成了一次完整产品重构：

- `AnalysisContext` 成为唯一产品上下文 owner，旧 `CohortScope` 仅保留为范围编辑适配层；
- 导航、Home、Team、Event、Duel、Utility、Lineup、Economy、Coach、RadarField 和 Management 职责重新收口；
- Home → Finding → Evidence → Match → 返回来源的证据闭环已建立；
- `TrainingFocus`、`PrepItem`、`PracticeLineup` 分别持有个人训练、备战材料和点位练习；
- `CapabilityAvailability` 统一表达数据资格、降级原因与修复入口；
- PRISM 拆分行为倾向、执行效率、样本覆盖与可用性；
- BP 选图后的对手选边语义已校正；
- 页面级响应式布局、空态、对象选择和入口边缘状态已完成一轮验收。

当前明确限制：

- RadarField 是描述性空间观察，不自动输出弱区、意图、对策或 RR 地图控制价值；
- Economy/赛事聚合等页面并非每个数字都有 Finding 资格；
- 专项分析进入 `TrainingFocus` / `PrepItem` 的交接仍不完整；
- Windows 长期使用、更新恢复和 50/200/500 场资料库尚缺系统验证；
- GitHub 主线尚缺最小 CI 作为本地测试之外的第二份证明。

---

## 0.8.0 — Evidence-first Analysis Workbench

**用户结果：** 发布当前完整产品重构，让个人、队伍、赛事和备战分析共享同一上下文，并能从 Finding 查看证据后返回原问题。

### 范围

- `AnalysisContext` 唯一 owner 与统一上下文摘要/编辑入口；
- 新导航以及 Team / Event 页面职责；
- Home → Finding → Evidence → Match → 返回闭环；
- `TrainingFocus`、`PrepItem`、`PracticeLineup` 用户数据合同与迁移；
- Duel 合并，Utility / Lineup 分离，Economy 转化叙事收口；
- PRISM 行为倾向与效率拆分；
- BP 选边修复；
- `CapabilityAvailability` 与 facts/replay/shots/`.tri` 修复入口；
- 完整页面级 UI、响应式布局、空态和上下文边缘状态收口。

### 非目标

- BP 策略算法；
- 战术板；
- 个人地图池与枪位画像；
- 新评分模型；
- 自动弱区/战术意图识别；
- 控制价值回归或 RR 地图控制账户改造。

### 出口条件

- `pnpm test:all`；
- `pnpm python:test`；
- `pnpm typecheck`；
- `pnpm build`；
- 按 `v0.7.8..v0.8.0` 的完整用户影响重写 `CHANGELOG.md`；
- 桌面版本同步为 `0.8.0`；
- tag 后 GitHub Release、R2 `latest.json`、`install-manifest.json` 与下载包 size/sha256 一致。

---

## 0.8.1 — Stability and Distribution

**用户结果：** 不增加产品模块，证明 0.8 能在 Windows 和长期资料库中可靠运行、更新与恢复。

### 范围

- 50 / 200 / 500 场资料库抽测；
- Windows 真机安装、首次导入、RadarField 首开与缓存重开；
- web patch、runtime 更新、失败恢复和旧版本升级；
- 建立内存、首开时间、页面切换和重任务耗时基准；
- 验证 `player-profile-0.1 → 0.2`、facts cache `v8 → v9`、`PrepItem` 幂等迁移；
- 验证 event package、`.tri` 下载、备份/恢复、完整性检查；
- 验证赛事内容生产链：RivalHub 导出、制作器草稿恢复以及 build → publish → manifest → Studio import 端到端回归；
- Stable / Beta / Experimental 用户可见标签收口；
- 建立最小 GitHub CI，至少覆盖 typecheck、快速测试与构建。

### 可测标准

- **50 场**：所有页面可常规使用；
- **200 场**：聚合页可打开，无 OOM；
- **500 场**：资料库可管理；重任务允许慢，但必须有进度、取消或明确失败反馈；
- 产品不得冻结、崩溃或在失败后丢失用户数据。

### Windows 代码签名

当前不作为 0.8.1 的阻塞项。近期分发先保证 HTTPS/R2、SHA-256 manifest、GitHub Release 可追溯，以及构建产物与 tag 对应。出现以下任一情况后重新评估 Artifact Signing 等签名方案：

- 开始向陌生公众规模化分发；
- SmartScreen 明显阻碍安装完成率；
- 自动更新成为主要分发方式；
- 进入付费、机构部署或高校赛事统一安装；
- 需要为镜像或第三方下载渠道提供发布者身份保证。

---

## 0.9.0 — Actionable Review

**用户结果：** 用户能从重复问题进入多条证据，形成下一场可复核的行动，并在后续比赛检查变化。

### 1. 跨能力行动合同

```text
可靠个人 Finding     → TrainingFocus
可靠队伍/对手 Finding → PrepItem
描述性观察            → 收藏/备注，不自动升级为行动结论
```

- 不给所有数据行机械增加“加入训练”；
- 只有满足样本、证据、限制和能力成熟度的 Finding 才能进入行动系统；
- 不确定结果不得自动生成 `TrainingFocus` 或 `PrepItem`；
- `TrainingFocus` 支持复查条件和后续比赛证据；
- `PrepItem` 保留来源能力、对象关系和 match/round/tick provenance。

### 2. 对枪复盘队列

- 满血输枪、首死、关键人数局输枪、重复位置失误、补枪失败；
- 按相同武器、位置与问题类型聚合重复模式；
- 每项直接进入多条证据，可建立 `TrainingFocus`；
- 支持待复核、已复核、忽略、待重看等轻量复盘状态；
- 不新增黑盒对枪评分。

### 语义质量闸门

- 分类逻辑有实质变化时，对主要类别、阈值边界、冲突、字段缺失和新旧结果不一致样本做分层随机抽检；
- 描述性 Beta 分类每类至少抽检 10 个实例，要求不存在系统性语义错误；
- 会生成 `TrainingFocus` 的高置信结果至少抽检 20 个，明确错误不超过 1 个；
- 优先保证 precision；无法判断的样本只保留为描述性观察，不自动升级为行动；
- 以 3–5 场固定 golden demos 做回归；只有功能准备升为 Stable 或被频繁使用后，才投入固定人工验证集。

### 3. 队伍级对枪概览

- 首杀热点与易丢首死位置；
- T/CT 对枪净值、主要对枪者和重复发生区域；
- 地图、阵营、时间段与选手维度过滤；
- 对应证据队列和样本覆盖说明。

### 4. 个人地图池

- 每图场次、胜率、RR、ADR、开局对枪、主要武器；
- 常驻区域、开局动线和当前 `TrainingFocus`；
- 明确样本不足与地图版本边界。

### 5. 枪位画像：常站与最强枪位

新增独立页面，以高精度空间坐标回答“常在哪里架、哪些枪位样本内对枪效果最好”。它是个人/队伍复盘能力，不是 RadarField 控图评分。

- 从 replay/duels 提取稳定 world coordinate，并投影到雷达高精度点位；
- 识别长时间低速/静止、持续保持观察方向的架点片段，区分路过、转点和真正持枪架位；
- 聚合常站时长、使用回合数、遭遇数、首枪/首杀、击杀、死亡与对枪胜率；
- 按地图、阵营、经济层、武器、选手/队伍筛选；
- 使用空间聚类吸收轻微站位抖动，同时保留代表点、半径和原始样本；
- “最强枪位”必须设置最小回合/遭遇门槛和置信区间，禁止用 1/1、2/2 之类小样本排序冒充高胜率；
- 点位可回到多条 match/round/tick 证据，并显示对手、武器、观察方向和交火结果；
- 先输出描述性“样本内高胜率枪位”，不自动宣称地图最优站位，不进入 RR。

### 出口条件

个人用户能够完成：

```text
发现重复问题或高频枪位
→ 查看多条证据
→ 建立 TrainingFocus
→ 在后续比赛复核
```

---

## 0.10.0 — Coach Preparation

**用户结果：** 把可信分析和用户判断组织成可复核、可导出的真实赛前准备材料。

### BP 策略洞察

第一阶段只提供事实：首 ban/pick 频率、地图出场和胜率、选图后的开局边、近期地图偏好、双方地图池交集、样本范围与阵容变化。

第二阶段才允许生成可解释建议；每条建议必须列依据、样本范围、阵容/版本限制和对应证据，不直接输出黑盒“最佳 BP”。

### 战术板 MVP

- 雷达/回放截图；
- 箭头、路线、文字、道具图标与图层；
- PNG 和 Markdown 导出；
- 引用 `PracticeLineup` 与 `PrepItem`；
- 不做实时协作、动画时间轴或完整战术模拟器。

### Coach 行动闭环

```text
Pattern / Finding
→ PrepItem
→ 战术板或 PracticeLineup
→ 报告
→ Match 证据
```

完整战术路线只在战术板 MVP 有真实使用证据后再决定是否进入 0.10.x；不预先建设复杂路线编辑、版本协作或云同步。

---

## Research Gates

研究方向不绑定确定产品版本。满足闸门前只保留研究、shadow 计算或描述性展示。

### RadarField 产品验证

- Windows 真机首开性能与缓存体验；
- 用户能否正确理解赛事基线和队伍差分；
- 队伍差分是否真实帮助复盘；
- 10–20 回合下哪些文案和比较安全；
- 不自动生成弱区、意图、对策或强弱评分。

10–20 个有效回合只支持描述“当前样本倾向”；跨队伍、跨赛事的大规模样本才可作为地图基线。队伍结果必须相对同赛事、同地图、同阵营和相近时段的基线解释。

### 控制价值模型

只有同时满足以下条件才进入产品开发：

- 有足够职业语料并跨赛事验证；
- 控制区域与 outcome 的条件相关性稳定；
- 对阵容、地图版本、阵营、经济状态等混杂因素做控制；
- 能解释失败案例，并证明不只是拟合胜负；
- 冻结数据集、口径与回归验证流程可复现。

否则 RadarField 保持描述性，不进入 RR。具体方法假设保留在 [`research/map-control-model.md`](research/map-control-model.md)。

### 其他研究方向

- 回合 swing / 动量；
- Save / exit kill 识别；
- AWP 投资回报与经济交换链；
- 数据驱动完整战术路线；
- Analyst Data 托管与订阅。

---

## Validation Strategy

### 当前阶段：专家主导 dogfooding

维护者以真实赛事、队伍和个人 demo 持续走通完整工作流，主要验证产品方向、CS 语义和结论能否回到证据。最低要求：

- 新结论必须能返回具体证据；
- 新分类必须通过对应的轻量语义质量闸门；
- 新工作流必须以真实赛事或个人资料库完整走通；
- 不确定结果不得自动升级为训练或备战建议。

持续观察的行为指标：

- 首场导入成功率与一周后继续导入率；
- Finding → Evidence 点击率与返回来源完成率；
- `TrainingFocus` 建立后被后续比赛再次复核的比例；
- `PrepItem` 进入报告或赛前材料的比例；
- 枪位画像是否帮助用户找到可复核的重复站位，而不是只看热图；
- Windows 更新成功率、失败恢复率和长期资料库错误率。

### 低成本外部检查

首次对外发布、重大导航/安装变更、首次引入自动行动建议或完整 Coach 工作流时，邀请 1–2 名目标用户做一次 20–30 分钟无引导任务检查，只验证可理解性、可发现性和环境兼容性，不要求每个版本开展成规模用户研究。

### 扩大验证的触发条件

出现以下情况后，再建立固定人工验证集或扩大真实用户研究：

- 功能开始自动生成训练或战术建议；
- 能力准备从 Beta 升级为 Stable；
- 陌生用户数量明显增长；
- 开始商业化、机构部署或团队协作；
- 用户反馈与维护者判断出现持续冲突。

出现持续使用且愿意为协作、托管或节省人工付费的证据后，再在 RivalHub 云层验证商业化；本地 Studio 不增加 `if (isPro)` 式功能锁。

---

## 已完成版本

- **0.8.0**（2026-07-13）：Evidence-first Analysis Workbench——统一 AnalysisContext、Finding/Evidence 返回闭环、具体行动产物、对象页面职责与完整页面级 UI 重构。
- **0.7.8**（2026-07-03）：RadarField 大库聚合、计算热路径与显示优化；修复 Windows 一键更新重启。
- **0.7.x**（2026-06 至 2026-07）：长期桌面软件基础、资产/赛事/更新系统、全局范围、页面初步拆分与 RadarField 首版。详见 [`CHANGELOG.md`](../CHANGELOG.md)。
- **0.6.0**（2026-06-16）：Coach 战术聚类首版、facts 本地投影、默认位与 callout grid。
- **0.5.x**（2026-06）：Home、Duel/Mechanics、Series/BP、Lineup、SQLite 桌面后端等基础能力冻结。
