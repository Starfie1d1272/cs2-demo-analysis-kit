# @cs2dak/rating

## 1.0.2

### Patch Changes

- 通过 GitHub Actions OIDC 发布，生成构建来源证明并验证新增包的 Trusted Publisher 连接。

## 1.0.1

### Patch Changes

- 4e34b0f: 按基础事实、评分、跨场画像、地图算法与资产、战术、展示和执行编排重划公共边界；删除迁出的旧入口。

  - contract 只保留原始输入与基础事实合同；展示合同归 presentation，评分合同归 rating，跨场合同归 cohort，战术合同归 tactics，组合 AnalysisBundle 归 analytics。
  - core 保留 canonical facts/QA/frozen Tournament projection。ZIP loader 与诊断改从新包 demo-io 导入；空间、交战和聚类改从新包 tactics 导入；analyzeDemoPackage 改从 pipeline 导入。
  - 新包 rating 消费已提取信号并接线原版 RR/PRISM。analytics 派生信号；cohort 保留 buildSeasonCohortFromRows，原始 Demo 的 buildSeasonCohort 改从 pipeline 导入。
  - maps 只发布算法。getMapZones/getMapRoutes/getMapNav 与 callout-grid-node/callout-grid-browser/tri-assets 入口迁至新包 map-assets；buildRadarFieldGrid 接收 CompactNav 输入。
  - format 与原版 rival-rating 是精确 build-only 依赖；发布原源编译的 JS 和完整声明，保留源哈希、声明哈希、许可证与 provenance，消费者不安装上游源码包。
  - presentation 的领域计算移 analytics；删除 tournament-compat 和 buildMatchWorkspaceModel，原始 Demo 工作台入口为 pipeline.analyzeMatchWorkspace，已有结果入口为 analytics.buildMatchWorkspaceFromAnalysis。
  - React 提供 scoreboard/table/replay 子入口。独立回放只接 WorkspaceReplay/MapView；记分板使用窄 ScoreboardTableRow，rr/accountRR 可为 null。
  - workspace-0.2 必填 buyQuality、players.roundSummary、reportHighlights；地图图片 URL 由宿主通过 DemoViewOptions 注入，默认 null。
  - UI、基础事实与 cohort 的安装/声明闭包分别隔离分析执行、评分/地图以及 Demo/地图输入。
