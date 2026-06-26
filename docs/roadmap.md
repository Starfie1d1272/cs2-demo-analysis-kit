# DAK Studio 路线图 / Roadmap

> 本文只管**时间排序**；模块完整设计与现状见
> [`docs/design/studio-redesign.md`](design/studio-redesign.md)（唯一设计真相源），
> 各指标成熟度见 [`docs/stability-tiers.md`](stability-tiers.md)。
> 发版机制见 [`docs/release.md`](release.md)：桌面随 `vX.Y.Z` git tag；npm 包独立走 changesets。

三个高于一切排期的产品判断：
1. **Query-first**：任何统计都能点回回合与 tick 的 2D 证据；
2. **三层视角共用同一数据层**：个人 / 主办方 / 教练；
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

## 0.8.0 — 教练与战术深化（产品功能线 · 规划中）

> 框架于 2026-06-26 与产品讨论确定；设计细节见 [`studio-redesign.md §11`](design/studio-redesign.md)。
> 标「待定」的为方向已认可、细节待细化的条目。

### 雷达场子系统（统一原语，想法 1+5 合一）

一套渲染器 + 一套聚合骨架覆盖多个空间分析功能，避免各 view 重造雷达：

- **场来源**：`位置密度 / 击杀密度 / 死亡密度`（纯点聚合，无 LOS，最便宜）
  ｜`视野覆盖`（视锥 ∩ `.tri` LOS ∩ 烟雾遮挡，复用 `core/duel-window.ts` 的 `isVisibleAt`）
- **覆盖场算法**：nav area 质心做 grid-sample，逐 tick 测「任一防守者可见」→ frequency 叠加
  N 个长枪局（≥10–20 回合即可成图）→ 热场。**不预设 route/动线**：盲区靠频率自然消隐、
  免 route 标定、七张 `.tri` 图即可用（零假设是发现「系统性放空」盲区的前提）
- **聚合轴**：CohortScope 范围筛选 + 可选按四阶段比赛时钟对齐（`replay-clock.ts`，1:55 起逐 tick 演化）
- **模式**：单场景 ｜ A·B 双 scope **差分**（平时隐藏、按需展开的对比视图；
  换人前后谁让位置 / 跨赛事自由度 = 两个场相减取 delta）
- **渲染**：`HeatmapCanvas` 从「吃点」扩成「吃栅格场」+ 枪线 / trail 叠加
- **性能**：grid 降采样到 nav area + 覆盖采样 1–2Hz + worker 池 + 按 demo集合×identity 缓存
  IndexedDB（沿用对枪 LOS 缓存的同一套）
- 落点：想法 1 = 防守盲区可视化（Overpass 长管用例）；想法 5 = 选手活动/击杀/死亡范围 + A·B 差分

### 其余功能

- **进游戏看回合 / 学瞄点**（Windows）：回合 / lineup 一键 `playdemo` 跳 tick；
  接道具库「进游戏练这个点」。补上唯一硬竞品差距（CS Demo Manager 的杀手锏）。**待定**：
  Steam/CS2 路径检测 + tick→demo 跳转的桥实现
- **BP 策略洞察**（收编旧 8d ban/pick 建议表）：首 ban / 首 pick 倾向 +
  选自己强图 vs 点菜对方弱图判定 + 双方地图池胜率支撑的 BP 建议
- **个人地图池**：个人实验室新增「选手×地图」tab——每图胜率 / RR / 常驻 callout / 开局动线缩略
- **战术板 MVP**（无实时协作 / 无动画）：回放·雷达画布加标注层（箭头 / 道具图标 / 文字）
  → 图文（PNG + Markdown）战术框架导出。复用 `@cs2dak/maps` 坐标变换；与雷达场是两个独立功能

### 前置基础重构（动新功能前先做）

- **CohortScope 抽成 App 级常驻顶栏**（现 9 个视图各自渲染，违背设计 §0）
- **侧边栏重新设计**：10+ 项纯竖排不美观也不可扩展——改分组（单场 / 跨场 / 工具）+ 可折叠，
  给雷达场 / 战术板新一级入口留位
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

---

## 后续方向（暂不排期）

- 回合 swing / 动量（待语料规模 + 校准依据）。
- Save / exit kill 识别、AWP 投资回报、经济交换链。
- Analyst Data 订阅（完整 Tactical Route + 职业 demo 库成熟后）。
- 集成 Phase 2：`@cs2dak/*` 发布为构建产物后，presentation 合同与只读组件共享。

## 商业验证（与版本并行）

先找三组真实用户而非追下载量：10–20 名长期导入自己 demo 的玩家、2–3 个高校赛事主办方、
2–5 名有固定队伍的教练/IGL。重点观察：首场导入成功率、一周后留存、模块重复打开率、
EvidenceLink 点击频率、报告是否真被发布、教练能否从 Pattern 得出备战结论。
出现「持续使用且愿为协作/托管/省人工付费」的证据后，再建支付与订阅（落在 RivalHub 云层，
而非本地 `if(isPro)`）。
