# DAK Studio 路线图 / Roadmap

> 本文只管**时间排序**；模块完整设计与现状见
> [`docs/design/studio-redesign.md`](design/studio-redesign.md)（唯一设计真相源），
> 各指标成熟度见 [`docs/stability-tiers.md`](stability-tiers.md)。
> 发版机制见 [`docs/release.md`](release.md)：桌面随 `vX.Y.Z` git tag；npm 包独立走 changesets。

三个高于一切排期的产品判断：
1. **Query-first**：任何统计都能点回回合与 tick 的 2D 证据；
2. **四类任务流共用同一数据层**：开始 / 选手复盘 / 赛事与队伍 / 备战；
3. **Pattern 可解释**：不做黑盒评分，展示由哪些位置/道具/时间/交火结构得出。

---

## 已发布（精简存档）

> 详细完成清单见 git 历史与 CHANGELOG；此处只留一句话索引，降低后续阅读负担。

- **0.5.x**（2026-06）：当前成果冻结发版——Home、完整 Duel/Mechanics（`.tri` LOS）、
  Coach 首版、Series/BP、Team Comparison、Lineup Library、StorageAdapter 解耦、
  桌面 SQLite 后端、导出 `--research` 默认。
- **0.6.0**（2026-06-16）：教练战术首版（`TacticalRoundFact` + `PatternExplorer` 三栏 +
  `RadarTrails` + `MapPoolTable` + Round Playlist）+ facts 本地投影层（导入即落 facts 行、
  `rebuildFactsFromZip` 免重导）+ maps 七图默认位资产 + 3D callout 网格 + `.tri` BVH 建树加速。

---

## 0.7.0 — 成为可靠的长期桌面软件（工程线，主体已落地）

收尾项为主，无新产品模块：

- ✅ 导入吞吐并行化（facts 抽取 + `.tri` LOS 移入 worker 池，滑动窗口并发 2）
- ✅ 用户可见 Library 目录 + 维护工具（备份/恢复/完整性检查/孤儿修复/压缩）
- ✅ 资产管理中心（身份/资产/赛事三 Tab + `.tri` 已装/缺失矩阵 + overlay 按需下载）
- ✅ 统一 `AnalysisManifest`（口径落后即标记 + 从已存 ZIP 一键重建 facts）
- 🟡 自动更新 + 国内可达分发（R2 镜像 `dakupdate.starfie1d.top` 已接入；
  **剩**：发一次 tag 验证上传链路 + Windows 真机接力替换验证）
- 🟡 赛事资产库 + 赛事包导入（消费端 + 制作器已落地；
  **剩**：科隆真实内容、RivalHub 文件导出、制作器草稿持久化、Windows 真机验证）
- ⬜ 50 / 200 / 500 场大库稳定性抽测
- ⬜ Windows 签名与公证（去 SmartScreen，让自动更新更可信。macOS 不排期：CS2 仅 Windows 可玩）
- ⬜ 对枪三分类人工验证集（Beta→Stable 闸门，见 stability-tiers）
- ⬜ Stable/Beta/Experimental 标签 UI 全量落地（历史页面逐步补齐）

---

## 0.8.0 — 教练与战术深化（产品功能线 · 已开工）

> 框架于 2026-06-26 与产品讨论确定；设计细节见 [`studio-redesign.md §11`](design/studio-redesign.md)。
> 标「待定」的为方向已认可、细节待细化的条目。

### 雷达场子系统（统一原语，想法 1+5 合一）

> **首版已进产品路径**：合同、core 计算、maps 栅格、presentation 合成、React 画布、
> Studio「控图」入口与 per-match 缓存已落地；方法论与落地记录见
> [`research/map-control-model.md §10-11`](research/map-control-model.md)。当前剩余是产品验证、
> 性能打磨与 App 级范围/导航收口。

一套渲染器 + 一套聚合骨架覆盖多个空间分析功能，避免各 view 重造雷达：

- **四个基础场**：`CT/T × 视野/位置` —— `视野覆盖`（视锥 40° ∩ `.tri` LOS ∩ 烟雾，
  复用 `duel-window` 原语）｜`位置占据`（落最近 nav 格，无 LOS，便宜）。另含 `击杀/死亡密度`。
- **合成视图**（render 层组合，已验证）：**信息差分** `tVis−ctVis`（T 优势暖 / CT 预警冷，
  = L3 信息控制层可视化）｜**对拼线** `min(tVis,ctVis)`（双方互见 = 真实交火点）｜
  T 侧重 `位置/推进波前`（非视野）。
- **覆盖场算法**：nav 质心 grid-sample，逐 tick 测「任一玩家可见/占据」→ frequency 叠加
  N 个满买长枪局 → 热场。**不预设 route**：盲区靠频率自然消隐、七张 `.tri` 图即可用。
- **聚合轴**：CohortScope 范围筛选 + 按比赛时钟逐秒对齐（**回合 1:55 = 115s**）。
  **样本量决定性质**：数百局=地图客观真相/分块基线；10–20 局=主体倾向/盲区。
- **差分模式**：**队伍 − 赛事地图基线**（A·B 差分的正确用法，比两场对比统计更稳）→
  风格/倾向/薄弱点。只需「队伍过滤」（`match.json` 队名 + `players.json` teamKey）。
- **渲染**：柔化圆 blob + 高斯模糊（真热力图观感，非方格）+ 裁剪到 radar 框；
  **逐秒 + 进度条拖动**（已原型）+ mode 下拉切场；接回放时间轴同理。
- **性能**：首版已走 worker 池 + per-match blob 缓存；仍需 Windows 桌面真实语料验证首开耗时、
  进度反馈与缓存命中体验。
- 落点：想法 1 = 防守盲区可视化（Overpass 长管）；想法 5 = 活动/击杀/死亡范围 + 队伍差分。

### 其余功能

- **进游戏看回合 / 学瞄点**（Windows）：回合 / lineup 一键 `playdemo` 跳 tick；
  接道具库「进游戏练这个点」。补上唯一硬竞品差距（CS Demo Manager 的杀手锏）。**待定**：
  Steam/CS2 路径检测 + tick→demo 跳转的桥实现
- **BP 策略洞察**（收编旧 8d ban/pick 建议表）：首 ban / 首 pick 倾向 +
  选自己强图 vs 点菜对方弱图判定 + 双方地图池胜率支撑的 BP 建议
- **个人地图池**：选手复盘新增「选手×地图」tab——每图胜率 / RR / 常驻 callout / 开局动线缩略
- **对枪拆分：对枪复盘 + 对枪概览**：现「对枪记录 / 首杀分析」信息密度低，先不新增评分模型，
  而是把已有 `DuelSignals` / `MechanicsSignals` 组织成可复盘的工作流：
  **对枪复盘**归选手复盘，改为复盘队列（按满血输枪、首死、关键回合、重复位置、补枪失败等 review value 排序，
  每项给问题标签 + 回合/tick 证据入口）；
  **对枪概览**归赛事与队伍，展示首杀热点、对枪分布和队伍风格（按地图/阵营/时间段聚合位置、盈亏、主要选手与证据队列），
  避免继续展示用户看不出下一步动作的原始分类表。
- **道具拆分：闪光价值 + 道具点位库**：旧「道具实验室」不再作为一级叙事。
  闪光价值归赛事与队伍，展示闪光收益、最佳闪与负收益队闪；道具点位库归备战，
  作为 lineup 练习、战术本和战术板的素材库。
- **转化与节奏首屏重排**：旧「经济与节奏」归赛事与队伍，改为围绕手枪转化、小枪翻盘、
  5v4/5v3 转化、4v5/3v5 翻盘与经济对位组织；它回答队伍/赛事回合转换能力，不回答个人发挥。
- **战术板 MVP**（无实时协作 / 无动画）：回放·雷达画布加标注层（箭头 / 道具图标 / 文字）
  → 图文（PNG + Markdown）战术框架导出。复用 `@cs2dak/maps` 坐标变换；与雷达场是两个独立功能

### 前置基础重构（动新功能前先做）

- **CohortScope 抽成 App 级常驻顶栏**（现多个视图各自渲染，违背设计 §0）：
  `赛事 / 全部 demo → 地图 → 队伍透镜 → 标签 → 手动排除场次`。
  赛事是 `EventRecord` / `SeriesRecord` / map assignment 的结构化范围，不复用标签体系；
  标签继续作为自由备注筛选。
- **侧边栏重新设计**：10+ 项纯竖排不美观也不可扩展——改为「开始 / 选手复盘 / 赛事与队伍 / 备战」四组，
  管理沉底为系统工具；给控图 / 战术板等新入口留位。
- **控图接入 App 级赛事范围**：消费全局赛事/地图范围，但保留页内对象选择与懒加载计算，
  避免进入普通页面时触发覆盖场重任务。
- **旧页面拆分与命名收口**：对枪实验室拆成对枪复盘 / 对枪概览；道具实验室拆成闪光价值 / 道具点位库；
  经济与节奏改为转化与节奏。
- 删死代码 `ComingSoonView`

---

## 0.9+ / 后续 — 数据驱动地图控制价值（④，待细化）

> **②③④ 关系**：现有 scalar `buildOfficialMapControl`（route-index 手调 gate，
> 接进 `signals.ts` 但只进 shadow、不进 RR）是 **v0 代理，冻结不再投精力打磨 gate**；
> 先做描述性覆盖场（③，0.8）；本项是 ③ 之上的经验价值模型，**最终取代 v0 gate** 喂 RR 地图控制账户。

思路（待校准，需足够语料）：

- 覆盖场给出每 `(图, side, 回合时刻, 栅格点)` 的**经验覆盖频率**（描述性先验）
- **控制价值 ≠ 覆盖频率**，而是「控住该区域与赢回合 / 拒止进点 / 拿首杀的相关性」——
  用语料回归 round 结果学出 **per-area × time 的价值权重**
- 每回合控制价值 = Σ_覆盖区域 (该区学得的价值 × contested 因子) → RR 地图控制账户输入；
  自然包住现有 `soloPressure` / `denial`，但把手调 gate 换成语料学出来的值
- **门槛**：描述性覆盖场 10–20 回合即稳；价值模型需数百+ 回合语料，故排在 0.8 之后
- **数据可行性已确认**（2026-06-26）：「控制事件→outcome（推进/进点/下包/CT 调动/T 受影响）」
  关联所需数据全在 v3 ZIP（`kills/bombs/grenades/replay` presence），**不需改导出器**。
  先做描述性条件概率对照验证信号强度，再上回归。字段映射见
  [`research/map-control-model.md §10.7`](research/map-control-model.md)。

---

## 后续方向（暂不排期）

- 回合 swing / 动量（待语料规模 + 校准依据；未来并入转化与节奏）。
- Save / exit kill 识别、AWP 投资回报、经济交换链。
- Analyst Data 订阅（完整 Tactical Route + 职业 demo 库成熟后）。
- 集成 Phase 2：`@cs2dak/*` 发布为构建产物后，presentation 合同与只读组件共享。

## 商业验证（与版本并行）

先找两类核心用户而非追下载量：10–20 名长期导入自己 demo 的玩家、2–3 个高校赛事/队伍运营或教练/IGL。
重点观察：首场导入成功率、一周后留存、选手复盘是否能定位下一场该练什么、赛事与队伍页是否能形成报告、
EvidenceLink 点击频率、备战页是否能从 Pattern 得出可执行结论。
出现「持续使用且愿为协作/托管/省人工付费」的证据后，再建支付与订阅（落在 RivalHub 云层，
而非本地 `if(isPro)`）。
