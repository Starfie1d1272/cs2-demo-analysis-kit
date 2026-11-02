# Studio 工作台 W19 集成验收（2026-11-02）

本记录对应 [#133](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/133)、[#152](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/152)：产品基线 main `98c3d50e3b52e93e6908379651fcd6efda0526a3`，以及本 PR 的纯依赖、回合标签、键盘返回、证据焦点和打印分页修正。21 项前置合并和 CI 不代替旅程实测。除比赛 format/ZIP 资料库外，用户已取消旧版兼容要求：不恢复旧 Prep 页面、旧手工入口或旧导出；旧数据不主动 purge，新分析统一导出保留。本文不是原生平台或整体验收通过的声明。

环境：Linux x86_64 云机，Node 24.19.0、仓库 pnpm、Vite 开发服务、Chromium 151 headless，1280×800。独立浏览器 context/IndexedDB：A 空库；B 导入仓库真实 Nuke ZIP（593,751 bytes）及 cohort 三 ZIP（1,986,337 / 1,045,157 / 1,134,000 bytes），四场约 4.8 MB。赛事另用仓库 `sample-pro-finals-2026.zip` 的七图。模拟数据、故障均在下表标明；没有模拟 50 场或使用用户 Mac。

## 当前验收结果

| 范围 | 实际操作与结果 | 边界 |
|---|---|---|
| A 玩家身份和单场 | 绑定 soulfly 为本人；Nuke 自动选其 Steam ID，不含该人的 Inferno 不误选。Nuke 9z 1:13 Aurora、14 回合，soulfly 19/7/1、ADR 137.8；首死/残局/道具回合 0/0/12，独立读取 ZIP kills、clutches、grenades 一致。 | 不代表所有统计跨版本口径均已逐项核对。 |
| A 证据与删除 | Nuke R1 保存证据笔记并重载，正文及来源一致状态保留；删除 Nuke 后笔记保留且提示来源缺失，另导入同名 Inferno 不误绑定。真实回放切 R2、下层、2×、单步；两场交火证据可前进及返回来源；步枪筛选的第 2 页进入 Inferno R17 后返回，仍为 2/3 页、116 条、原卡片并将焦点恢复到该卡片。 | 无 `.dem`，未验证进入游戏。 |
| A 缺失/零帧 | 临时 Nuke 副本移除 replay/shots：比赛统计可读、回放不可用；shots 缺失时 RR 不同，不能比较口径。另将 R1 frameCount 置 0 并清空玩家帧：R1 详情显示无可播放回放，不跳 R2。 | 两者是明确注入的异常，原 fixture 未更改。 |
| B 空库材料 | 保存 Default/Protocol/Play、五人职责、笔记和比赛单并重载；三阶段战术任务与 position/smoke/flash 标记重载保留。未保存笔记切换新建战术时，取消保留原编辑内容，确认后只有新编辑器；纯文字战术讲解可见正文。 | 不是原生桌面操作。 |
| B 真实绑定、讲解和打印 | 四场库建立 Nuke R1 证据笔记和战术、加入比赛单；讲解、下载 Markdown、打印 PDF 显示来源和已知版本一致，重载保留。另一真实 Nuke 手工职责绑定 9z 观察范围后，人工 IGL/AWP/A 区文字重载不变。删除引用笔记后比赛单提示材料已删除，其他项保留。 | Chromium 打印模拟；真实打印机和原生壳未验。 |
| C 范围及六主题 | 实际进入表现与趋势、交火与协同、经济与转化、道具、开局与控图、位置与职责；经济四场 82 回合。范围选 Nuke 为 1/2；未知日期默认排除为 0/2、包含后 2/2；显式选择再排除为 0/2。两次真实导入标签筛选 A 1/4、B 3/4。 | 各主题空样本与条件限制按界面呈现，不等于所有子维度均实测。 |
| C 比较和固定导出 | 两不交手队伍及同队两选手生成比较；模拟队伍比较查询失败时仍能导出不含比较的结果并标局限。Nuke 经济保存、重载打开并另存，下载 JSON/Markdown；新增真实场前后固定 JSON SHA-256 都为 `d61663f9674709515117415daff758c3580c9ec5667cec9db4de1865584da4ef`，含范围、来源 ID/哈希、版本及局限。删除显式选择的 Nuke 后重开为 0/1，未扩成全库。 | 注入失败仅覆盖该比较路径。 |
| C 地图和回合条件 | 保存 Nuke 地图后切至 Inferno 范围，显示 Nuke 无样本而不静默切图；手选 Inferno 生效。Nuke 覆盖场长枪/全部为 4/14 回合，队伍和基线条件一致，标签均为“回合”。 | 条件对照为此样本。 |
| D 管理、身份和数据 | 两场中修改单场标签、批量标签、重建 facts，重载后保留；真实 Nuke 的 Aurora Gaming 改为 W19 Aurora，队伍分析仍为 13:1，重载名称保留，原名反查覆盖两别名。真实 ZIP blob 和元数据 key 重载不变；合成旧 playlist、笔记哨兵仍物理存在。 | 保留数据不承诺旧 UI 兼容。 |
| D 失败与异步 | 模拟 IndexedDB 打开失败显示资料读取失败及暂不可用；模拟一场旧 factsRevision，另一场 Nuke 的个人交火仍可查并显示 1/2 可用。模拟慢查询 invalidation 得 AbortError、旧 bucket 清空；模拟证据 A 晚于 B 返回，B 仍保持；模拟范围慢查询期间导出不可用，完成后导出正确 Nuke source。模拟后台导出超时后重查同 job 成功，未重新启动。 | 注入故障和模拟 bridge，非原生后台失败重试实机。 |
| D 清缓存与恢复 | 隔离 Linux Python StudioApi 中九类合成用户记录，清 9 字节临时 cache 后均一致；备份、删除记录及真实 Nuke ZIP、恢复后九类与 ZIP SHA-256 均一致。 | 是后端调用，非 pywebview 壳或 Windows/macOS 备份恢复。 |
| D 赛事与输入 | 七图资源导入后两系列、7/7 图关联；IEM BO5 1:3、四图及 ban/pick/decider 可见。管理身份/资产/维护入口可打开。键盘 Tab 到比赛、Enter 进入、聚焦返回再 Enter 后焦点回到工作台导航。 | 另一赛事阶段、RivalHub 在线导入、更新、原生桌面和进游戏未验。 |
| D 打印分页 | 五条各 18 行的笔记组成比赛单，Chromium A4 导出三页；标题与后续正文不再跨页孤立，抽取文字完整。 | 纸张/驱动和复杂战术地图实际打印未验。 |

## 有效能力映射和架构删除

用户不要求保留旧页面；以下列出当前实际 owner。入口实测不等于每个历史视图的每个功能均已逐项通过。

| 原能力或已删除项 | 当前 owner / 本次核对 | 证据 |
|---|---|---|
| Home 选手概览、趋势及发现 | PlayersView 与表现与趋势；选手及总体入口可达，个人数据和身份如上实测。旧 HomeView/CohortScope 文件不存在。 | [#169](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/169)、[#171](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/171) |
| 单场、回放、证据 | App MatchReviewWorkspace；真实单场、证据、回放如上。公共 React 不再拥有整页 MatchWorkspace 或 Studio 样式。 | [#159](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/159)、[#164](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/164)、[#184](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/184) |
| 比赛库、赛事、系列和 BP | MatchesView/LibraryView 与 EventsView/SeriesInspector；四 ZIP 管理、七图赛事和 BP 如上。 | [#158](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/158) |
| 交火、经济、道具、开局、位置和职责，赛事/排行 | Analysis 各主题及 TournamentDashboardView/LeaderboardView；六主题入口和部分真实样本如上。战术模式由 Patterns 页面承接；旧 CoachView 文件不存在。 | [#161](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/161)、[#172](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/172) |
| 旧 Prep/playlist 页面与单场报告导出 | 新材料 StudyNote、战术、职责、比赛单及统一 AnalysisResult 导出；`prep-items.ts`、`material-data-migration.ts`、`PrepItemsPanel.tsx` 和旧单场 Markdown helper 已删除。storage overview 保留旧 namespace 用于不删除用户数据。 | [#166](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/166)、[#184](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/184) |
| 旧 season/facts-projections/tactics facade 与 App 姿态编排 | App queries 调 analytics/tactics，library 和 worker 同调 `buildMatchRecords`，后者调 pipeline `analyzeMatchFacts` 和 tactics lineup 提取；旧 facade 文件不存在，query 不反向 import view。utility/player/team/combat/season/spatial 的计算入口逐一核对对应 analytics/tactics owner。 | [#157](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/157)、[#161](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/161) |
| 双 context、导航镜像与旧证据 fallback | AnalysisContext 和 App 页面帧/单对象 OpenEvidenceRequest；旧 CohortScope、CoachSettings、sourceKey 前缀猜 tab 搜索无匹配，sourceKey 本身仍合法用于 anchor。 | [#158](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/158)、[#164](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/164) |
| 旧回放/表格初始 props | 公共组件受控 `state`/`onStateChange`；AST 检查仓内 16 个 DataTable 和 3 个 ReplayViewer 调用均传两项，无 spread；`initialTarget`/`initialViewState` 源码无匹配。 | [#159](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/159) |
| 纯队名查询依赖及公共回合标签 | 本 PR 将纯队名映射移到 `team-identity.ts`、缓存版本移到纯模块，调用方迁移；esbuild 闭包无 storage/worker/pipeline/query-cache。RadarFieldCanvas 标签改为“回合”，提供 React patch Changeset；presentation README 删除已不存在的整页示例。 | 本 PR；真实队名与 4/14 回合实测如上。 |

## 验证与剩余边界

最终 main 的[官方 CI](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/actions/runs/41423559464)四项成功；本 PR 需以其最终提交的官方 CI 单独核对。本地 typecheck、Studio build、既有 library-persistence/library 共 9 项、package-boundaries 和 package-consumers 通过。真实 tarball 隔离安装检查 NodeNext 声明与浏览器打包，额外调用公共 `sortTableRows` 和 MapRoles 排序列；不等于未知外部消费者均已迁移。没有新增测试文件或测试框架。

真实设备和服务依赖仍未验：原生壳、Windows/macOS、原生备份恢复、打印机、RivalHub 在线、原始 demo 进入游戏。四场不能证明 #3 的 50+ 场/长期性能；#64 的桌面平台及 #49/#75/#76 各自门槛独立，不因本文关闭。单场开发环境粗测只能作为观察，不能外推性能结论。当前无已复现且尚未修复的云端直接阻塞；未列为通过的子功能仍需各自证据。

历史说明：早期基线的范围编辑器重复、旧场阻断个人分析、初始读取失败混为空库、零帧回退、战术正文、旧地图静默替换等观察，分别由 #180–#185 最终改动替代并在上表按当前状态复验；旧 Prep 迁移和旧导出已按用户决定删除，不再作为新 owner 或待恢复事项。
