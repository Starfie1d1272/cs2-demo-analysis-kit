# DAK Studio 路线图 / Roadmap

> 2026-06 重订（取代 v0.4 八模块排期，已归档 `docs/archive/2026-06/roadmap-v0.4.md`）。
> 本文只管**时间排序**；模块的完整设计与现状见
> [`docs/design/studio-redesign.md`](design/studio-redesign.md)（唯一设计真相源），
> 各指标成熟度见 [`docs/stability-tiers.md`](stability-tiers.md)。

三个高于一切排期的产品判断：
1. **Query-first**：任何统计都能点回回合与 tick 的 2D 证据；
2. **三层视角共用同一数据层**：个人 / 主办方 / 教练；
3. **Pattern 可解释**：不做黑盒评分，展示由哪些位置/道具/时间/交火结构得出。

现状：九模块主体已落地（详见 studio-redesign）。**0.6.0 已发布（2026-06-16）**——
教练工作台战术聚类首版（`TacticalRoundFact`+`PatternExplorer`+`RadarTrails`+`MapPoolTable`+`Playlist`）
+ maps 默认位资产 + 3D callout 网格 + `.tri` BVH 建树加速（quickselect，O(n log²n)→O(n log n)）。
完整战术路线（MapRoute+zone 动线链）与资产管理/导入吞吐为 v0.7 方向。

---

## 0.5.0 — 稳定并正式发布当前成果

**不再新增模块**，把 main 已有的成果冻结发版：Home、完整 Duel/Mechanics（含 `.tri` LOS）、
Coach 首版、Series/BP、Team Comparison、Lineup Library 重写，以及所有性能与缓存修复。

已发布内容（v0.5.0–v0.5.3）：
- [x] 文档与代码状态同步（README v2→v3 全面重写、integration 分阶段接缝、本路线图收敛、stability-tiers）
- [x] StorageAdapter 解耦：业务层读写统一经 `records()` / `blobs()`，IndexedDB 后端可替换
- [x] Windows 打包从 onefile 改为 onedir，Release zip 整个 `dak-studio/` 目录
- [x] 桌面静态服务缓存修复：`.tri` / 雷达图 / hashed assets 可缓存，避免反复拉大文件
- [x] Lineup Library 小修：默认聚类容差调大，雷达 Top 20/40/60 切换且选中项临时绘制
- [x] 2D 回放接口预留 `targetEndTick`，优先对齐下一回合 `startTick`
- [x] CHANGELOG 与版本同步（v0.5.0–v0.5.3 条目）
- [x] `pnpm typecheck` + `pnpm test` 全绿
- [x] cs2df 3.0.3 升级 + sample ZIP 重导（--research --compress-level 9）
- [x] 导出默认启用 `--research`（急停/反应/预瞄恢复正常）
- [x] pywebview→SQLite 存储后端接入（桌面版资料库落盘到 `userdata/studio.sqlite`）

已发布（v0.6.0）：
- [x] facts 本地持久化投影层：`extractMatchFacts` + `FactsStore`，导入即落 facts 行
- [x] season.ts + 各重型视图（TrailsView/CoachView/LineupView/MatchView）全切投影读取
- [x] 清除死代码：`rrInputs` 投影与 `MATCH_FACTS_VERSION` 只写不读字段移除
- [x] 教练首版 0.6.0：TacticalRoundFact + PatternExplorer 三栏 + RadarTrails + MapPoolTable + Playlist
- [x] maps 默认位资产（七图阵营专属默认位固化）
- [x] maps 3D callout 网格 + calloutAt() 接口
- [x] `.tri` BVH 建树加速（quickselect，大图首次加载尖峰 ~18s→~6s）
- [x] macOS / Windows 冒烟测试 → 打 `v0.6.0` tag（2026-06-16）

挂账到 v0.7（发版时未完成）：
- [ ] 对枪人工验证集首版（对枪三分类 Beta→Stable 的闸门，见 stability-tiers）
- [ ] 50 / 200 / 500 场资料库性能抽测 + 导入吞吐并行化（facts 抽取移入 worker 池，离开主线程）

> 发版机制见 [`docs/release.md`](release.md)：桌面随 `vX.Y.Z` git tag；npm 包独立走 changesets。

上游待办（`cs2df`）：回放捕获窗口延到下一回合 freeze/start 边界
（[`cs2-demo-format#3`](https://github.com/Starfie1d1272/cs2-demo-format/issues/3)；本仓库
presentation 已以 `targetEndTick = nextRound.startTick` 留出接口）。

---

## 0.6.0 — 教练战术首版 + maps 资产落地

### 已完成（2026-06-16）

- **TacticalRoundFact 提取**：替换旧 OpeningPatternFact，双层站位（defaults/advanced）+ 双点投入 + 倒计时节奏桶 + 首杀 + 经济。
- **PatternExplorer 三栏**：簇列表/雷达快照/数据摘要+证据回合表；`autoName` 模板命名。
- **RadarTrails**：从 TrailsView 抽出的共享雷达叠加渲染器。
- **CT/T 视角切换 + 页内回放 + 对手抽象**。
- **MapPoolTable**：地图池比较表（我方/对手胜率+高频打法+备注）。
- **Round Playlist**：备战清单持久化 + Markdown 导出。
- **Maps 默认位资产**：七图阵营专属默认位（110 场数据驱动 + 人工抽查）。
- **Maps 3D callout 网格**：`calloutAt()` 三维空间查 callout。

### 未完成（v0.7+）

- **完整战术路线**（开局站位 → zone 动线链 → 进包执行）：需扩展 Pattern 向量为全回合 zone 轨迹。现有 `TacticalRoundFact.snapshots[]` 已预留多切片扩展。
- **道具实验室 lineup 聚类作为路线节点证据源**。
- **8d ban/pick 建议表**（纯统计）。

### 并行（不占 Coach 主线）
集成 Phase 1 数据 API（[`integration.md`](integration.md) §2），
让赛事数据在 RivalHub ↔ DAK 之间流起来。

---

## 0.7.0 — 成为可靠的长期桌面软件

- **大库稳定性验证**：StorageAdapter 解耦（`records()` / `blobs()` 接缝）已在 0.5.1 完成，pywebview→SQLite 后端已在桌面版生产运行；0.7 重点改为 200–500 场规模的稳定性抽测与数据库迁移工具。
- **导入吞吐并行化**（✅ 已落地）：facts 抽取（含 `.tri` LOS 遍历）已从主线程移入导入 worker 池——worker 内解析 + 建 BVH + 榨 facts，只回传紧凑 `{meta, facts}`，输出与主线程逐字节等价、异常回退主线程。批量导入改滑动窗口并发（并发 2，兼顾吞吐与渲染器内存峰值）。剩余：大库规模下的并发调参与 facts 抽取本身的算法优化。
- **用户可见 Library 目录** + 一键备份/恢复（manifest、标签、身份归并、BP、Playbook、原始 ZIP）。
- **存储空间管理**（原始 ZIP / derived cache / `.tri` / 报告 各项占用展示，支持按类清理）。
- **数据库迁移与修复工具**；存储空间占用展示（原始 ZIP / derived cache / `.tri` / 报告）。
- **自动更新 + 国内可达分发**（🟡 主体已落地，见 [`docs/design/auto-update.md`](design/auto-update.md)）：
  manifest + 镜像失败转移的更新检查（替代 `api.github.com`）、Windows 应用内一键更新
  （下载+sha256 校验+side-by-side 接力替换）、CI 自动生成 `latest.json`。**剩**：填自建 CDN
  镜像、Windows 真机冒烟验证接力替换路径。
- **`.tri` 资产包管理**：从 Release CI 现场打包（~30MB/图）改为版本化资产包或首次按图下载。
  （🟡 `userdata/tris` overlay + `tri_download` 桥已落地，是去内置化地基；当前仍内置作回退。）
- **签名与公证**：Windows 签名（去 SmartScreen 警告，让自动更新更可信）——优先级高于付费墙。
  （macOS 不再排期：CS2 仅 Windows 可玩，桌面端只面向 Windows。）
- **崩溃诊断包** + 可选、匿名、明确授权的使用统计。
- **统一 AnalysisManifest**：收敛分散的 `DERIVED_VERSION` / Duel cache version 等版本号
  （`formatVersion` / `analysisVersion` / `cacheVersion` / `reportVersion` / `appVersion`）。
- Stable/Beta/Experimental 标签在 UI 全量落地。

---

## 后续方向（暂不排期）

- 回合 swing / 动量（待资料库规模上来，有校准依据再立项）。
- Save / exit kill 识别、AWP 投资回报、经济交换链。
- Analyst Data 订阅（完整 Tactical Route + 职业 demo 库成熟后）。
- 集成 Phase 2：`@cs2dak/*` 发布为构建产物后，presentation 合同与只读组件共享。

## 商业验证（与版本并行）

先找三组真实用户而非追下载量：10–20 名长期导入自己 demo 的玩家、2–3 个高校赛事主办方、
2–5 名有固定队伍的教练/IGL。重点观察：首场导入成功率、一周后留存、模块重复打开率、
EvidenceLink 点击频率、报告是否真被发布、教练能否从 Pattern 得出备战结论。
出现「持续使用且愿为协作/托管/省人工付费」的证据后，再建支付与订阅（落在 RivalHub 云层，
而非本地 `if(isPro)`）。
