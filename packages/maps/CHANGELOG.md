# @cs2dak/maps

## 2.0.0

### Major Changes

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

## 1.1.0

### Minor Changes

- eaca7aa: 新增纯 calibration 公开入口并将标定与版本归于单一 owner；补齐 Train -50 分层元数据并将 calibration revision 升至 2。区分 Valve 当前 Active Duty 图池和已提交 nav/route 覆盖，保留 Overpass 历史资产。通过真实 tarball 的 runtime、严格声明与移除空间资产后的 calibration 隔离验证。

### Patch Changes

- ec2fbb0: 现有 root、callout-grid-node/browser 和 tri-assets 入口发布编译后的 ESM 与声明，保留全部公开 API 和地图资产；修复干净 Node consumer 无法加载 node_modules 下 TypeScript 源文件，以及 ESM hasMapTri 错误使用 require 返回 false。发布前用实际 tarball 干净安装验证四个入口的导入、调用与声明解析。
- 770c4c4: 包含根入口静态引用的 map-zones JSON，修复独立 tarball 消费者加载 Maps、Core 与 Presentation 根入口时的 ERR_MODULE_NOT_FOUND。不改变导出、数据语义或公共包架构。

## 1.0.0

### Major Changes

- 3982a44: 将默认位置语义从 `DefaultAnchor` 统一迁移为 `DefaultPositionGroup`，更新地图查询、战术 facts、跨场聚类和展示标签的公共字段与 API；保留既有七图 callout 归并内容，不提供旧命名兼容 alias。

### Minor Changes

- 5ed968a: 以 callout 倾向和默认站位为唯二静态地图语义，新增时间化战术空间内核、开局模式与跨回合战术聚类接口，并删除旧静态 contested/advanced 角色判断。统一回放回合边界与四阶段比赛时钟，支持按调用方设置 1:55/1:35 初始定位。
- 8c75daa: 分离开局默认职责窗口与全回合移动事实，补充经济资格、有效轨迹 AWP、开局队形、可观测 Support、完整比赛覆盖、样本加权角色、逐侧职责、地图候选审阅和产品中立位置显示。
