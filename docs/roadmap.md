# DAK Studio 路线图

> 2026-06 制定。模块分类沿用竞品调研报告（CS2Lens / Noesis / CS2.CAM / Skybox EDGE /
> Breakdown.gg / Scope.gg）的八模块框架，按本仓库现状对账后排期。
>
> 三个核心产品判断（高于一切排期）：
> 1. **Query-first**：任何统计结论都能点回具体回合与 tick 的 2D 证据；
> 2. **三层视角共用同一数据层**：个人（选手）/ 主办方（赛事）/ 教练（模式）；
> 3. **Pattern 可解释化**：不做黑盒评分，每个结论展示由哪些位置、道具、时间、交火结构得出。
>
> AI 模块（chat-with-data / tool-calling 分析师）**有意后置**：先把可视化证据层做满，
> 届时 `search_rounds` / `open_replay` 等筛选与跳转接口即是现成的 AI 工具面。

## 模块现状总览

| # | 模块 | 状态 | 说明 |
|---|------|------|------|
| 1 | Ingest & Data QA | ✅ 基本完成 | .dem/ZIP 导入、hash 幂等、标签、QA badge、strict validator |
| 2 | Demo Explorer（2D 回合浏览器） | 🟡 部分 | 回合/经济表、2D 回放、道具效果、C4 已有；缺回合筛选器与图层开关 |
| 3 | Personal Lab（个人打法） | 🟡 部分 | 选手档案、开局动线已有；缺趋势曲线与 Mistake Review |
| 4 | Duel & Mechanics Lab | ⬜ 未开始 | 依赖 shots.json（格式已支持，导出未接） |
| 5 | Utility Lab | 🟡 部分 | 动线道具叠加已有；缺 flash value / 负收益道具分析 |
| 6 | Economy & Round Flow | 🟡 部分 | 经济 timeline 已有；缺 buy quality 汇总与回合 swing |
| 7 | Tournament Hub（高校赛事中台） | 🟡 部分 | 排行榜、season/cohort、RR 已有；缺赛事报表与图卡导出 |
| 8 | Coach / Analyst Workbench | ⬜ 远期 | pattern finder / playbook / anti-strat / veto lite |

## v0.2 — 单场证据闭环（下一个里程碑）

- [ ] **回合筛选器**：地图 / side / 经济类型 / 胜负 / 首杀方 / 下包点 / endReason /
      clutch / multi-kill / 穿烟穿墙 / 指定选手参与（模块 2 的 query-first 最小实现）
- [ ] **统计跳回放**：选手档案与对位表中的数字（首死、补枪、残局…）可点击 →
      直接落到对应回合的 2D 回放并定位 tick
- [ ] **2D 时间轴**：每回合 freeze end / 首次接触 / 首杀 / 下包拆包 / clutch start 锚点
- [ ] **地图图层开关**：走位 trace / kill line / 道具 throw→effect / 热力图按需叠加
- [ ] **de_nuke / de_vertigo 双层切换**（`*_lower.png` 资产已就位，calibration 有
      `lowerLevelMaxUnits`，渲染端未实现）

## v0.3 — 个人成长与赛事中台

- [ ] **个人趋势**：ADR / KAST / FK-FD 差值 / utility 价值 / clutch 胜率按比赛时间序列
- [ ] **Playstyle Fingerprint**：entry 倾向 / trade 参与 / 道具贡献 / 残局倾向 /
      存活习惯雷达图（开局动线已是雏形）
- [ ] **Mistake Review（证据化）**：队闪 Top10、负收益 flash、force buy 首死率、
      死亡时间分布——每条结论附可点击回合列表
- [ ] **Flash Value**：每颗闪 enemy/team flashed seconds、net value、是否转化击杀
      （`blinds.json` + `enemyFlashDuration` 字段已在合同）
- [ ] **Buy Quality**：full/force/eco/conversion 胜率链、kit/helmet 覆盖率、经济断点
- [ ] **赛事报表导出**：match report（half-by-half、momentum、key rounds）与
      选手图卡（PNG / Markdown），服务高校赛事主办方发布
- [ ] **Tournament Dashboard**：地图使用率、T/CT 胜率、pistol/conversion 胜率、
      最佳选手榜（cohort 聚合已有，缺产品化页面）

## v0.4 — 硬核机制与模式识别

- [ ] **shots.json 接入**：exporter 导出逐枪流（格式 2.x 已定义 optional 文件）
- [ ] **Duel Finder / Opening Duel 分析**：对枪重构、TTK、武器对位、移动射击
- [ ] **Rule-based 开局聚类**：开局 15/20/30 秒位置聚类 + 道具序列 → 战术模式标注
      （透明展示聚类依据，不做黑盒）
- [ ] **Timing Heatmap**:同一战术按回合秒数拆解关键事件分布
- [ ] **Playbook / Anti-Strat 报告**：自动聚类 + 手工命名、对手近 N 场倾向汇总
- [ ] **Lineup Library**：成功道具自动沉淀（throwPosition / effectPosition / 关联胜率）

## 工程债与分发

- [ ] Windows 打包从 onefile 改 onedir + 安装器（启动更快、杀软误报更少）
- [ ] macOS 签名与公证（$99/年 Developer ID，预算到位后做；当前 Release 附绕过说明）
- [ ] cs2-demo-format 增加 optional `playedAt`（比赛时间进合同，摆脱文件名约定）
- [ ] 旧导出包提示重新导出（replay `projectiles` 为 2.3+ 字段，旧包无飞行轨迹）
