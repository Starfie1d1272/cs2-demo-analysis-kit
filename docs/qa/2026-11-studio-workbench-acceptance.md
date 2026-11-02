# Studio 工作台 W19 集成验收记录（进行中）

本记录不是整体验收通过证明。原始实测基线 main `186f3fafea6bda8bee8850250ef49d7bf5adcd7f`，2026-11-02 UTC；分支随后更新到 `9bc075532e3c365993ab4bdf32956a5cc3aaa09b`（#180），新差异见 C2；[#133](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/133)、[#152](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/152)。21 个前置项已合入，但其 PR/CI 不替代下列旅程验收。没有关闭 #152/#133，也不建议据此关闭 #17。#3 的长期运行及 50+ 场、#64 的桌面平台、#49/#75/#76 各自独立门槛仍由原 owner 承接。

## 环境与证据

- Linux x86_64 云环境，5 vCPU（AMD EPYC 9V74），约 17 GiB 可用内存；Node 24.19.0/pnpm 使用仓库 activate 脚本，Vite 开发服务，Chromium 151 headless，1280×800；隔离浏览器 context/IndexedDB，没有接触现有用户库。无显示服务器及可用桌面设备，本次没有原生壳、Windows/macOS、原生壳备份/恢复或实际打印机结果。
- 空库 A 和独立 B；B 通过文件选择导入仓库 Nuke `cologne-major-2026-stage3-smoke-de_nuke.zip`（593,751 bytes）及 cohort 三个 ZIP（1,986,337 / 1,045,157 / 1,134,000 bytes），共 4 场，约 4.8 MB；均为仓库真实样本，未伪造 50 场。四场界面均显示日期未知。另用临时副本和内存/SQLite 记录模拟缺失、故障与旧资料，具体方法在各项注明；未操作项不标通过。
- 精确 main 的 [官方 CI](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/actions/runs/41407963506)：TypeScript（typecheck/fast/build）、integration、Python、event worker 四项成功。本地先缺 dist 直接运行失败；按仓库流程 `pnpm build:packages` 后 `pnpm typecheck`、Studio build 成功，既有 library-persistence/library 两文件 9 项通过。`pnpm check:package-boundaries`（8 项）和 `pnpm check:package-consumers` 成功：真实 tarball、隔离安装、NodeNext 声明闭包及浏览器打包。额外独立安装当前 maps/presentation/react tarball，实调用 `sortTableRows` 和三个 MapRoles 排序列：样本 3 在 1 前、RR 2/1/null 顺序正确。不是所有外部消费者迁移证明。

## A 玩家

- A1 部分通过：未绑定本人启动，空工作台可用；B 的最近比赛打开 Nuke。绑定本人/缺席默认选择未验。
- A2 部分通过：Nuke 显示 9z 1:13 Aurora、10 人、14 回合；soulfly 19/7/1、ADR 137.8，界面显示 RR 1.611。未独立逐事实核验筛选和首死措辞。
- A3–A5 部分通过：另一隔离库导入 Nuke 后创建 StudyNote，选择该场 R1 添加证据并保存，显示“来源和已知版本一致”；重载资料页仍显示笔记、正文及“来源一致”。删除 Nuke 后笔记和正文保留并提示原场缺失；把另一场 Inferno 临时复制为同一文件名后导入，原证据仍显示 Nuke R1 已不存在，未指向同名场。回放实际切 R2、下层、2× 并前进一步，显示 tick 7453 / 664 帧中的第 5 帧；无 `.dem`。对临时副本移除 replay.json 与 shots.json（模拟缺失，原 fixture 未改）导入后 1:13、ADR 137.8 和回合统计可读，回放入口不可用；因 shots 缺失 RR 与原样本不同，不能视为同口径。模拟零帧反例：临时副本将 R1 的 replay frameCount 设 0 并清空玩家帧，保存 R1 证据再打开，横幅显示 R1，播放器却显示 R2 / tick 7421；这是直接阻塞，待回放 owner 修复并重验。两场交火证据列表打开 Nuke R1，再以“下一条”进入 Inferno R1（分别显示 tick 4634 和 5856），返回来源回到交火列表；筛选/排序/页码/anchor 的完整恢复及 null 投法命令尚未验。

## B 教练

- B1 部分通过：空库可打开新建战术、人员安排、笔记编辑器；战术默认 Mirage/T，可选择 Default/Protocol/Play，人员安排有五行与观察绑定。在空库保存 Mirage T 的 Default、Protocol、Play 和一份人员安排（Player A 的职责填入 IGL + 主 AWP + A 区），重新加载后四条均显示；另建一份 Play，添加三个阶段、各一项人员任务和 position/smoke/flash 标记；保存重载后逐阶段列表可见。真实 Nuke 中为手工人员安排显式绑定 9z 的观察范围，出现位置矩阵；输入的 IGL + 主 AWP + A 区人工文字在绑定后及重载后不变。
- B2–B5 部分通过：空库比赛单加入 Play、人员安排、StudyNote，重排后保存并进入/退出讲解；实际下载 Markdown 含三项材料及手工判断。调用打印并以 Chromium print media 输出 A4 一页 PDF，文本检查包含主体且无编辑按钮；没有目视核实所有复杂内容与原生打印。删除被引用笔记后，比赛单显示 `材料已删除 study-note:<id>`，另两项仍显示。真实 cohort 三场中选择 Team Plasma 侦察 Team D'avenir，模式列出 Inferno R18/R23，加入 R18 后材料页出现备战条目并标注“来源版本未知”；“报告”页可显示地图池比较。另将该真实 PrepItem 与 Play、人员安排、StudyNote 加入比赛单并保存，比赛单正文显示 Inferno R18 和来源，已按下一项走到真实 PrepItem，讲解显示 Inferno R18 来源和人工备注。但材料页显示“来源版本未知”，讲解项未显示该状态且本次未找到打开真实回合的动作；需讲解 owner 核实来源状态与往返。复杂打印及报告其他入口未覆盖。另在空库创建仅含正文 `W19 正文战术内容` 的战术，进入讲解只显示“暂无阶段/手工示意”，正文未显示：直接阻塞，待战术讲解 owner 修复并重验。另一三阶段样本中选中阶段 2 再上移，本次仍选中阶段 2，不能排除其他重排路径问题。另在空库已保存三战术、一份人员安排与一份比赛单，工作台“最近资料”只列出三战术，人员安排及比赛单均未列出；源码种类列表同样缺这两类，待工作台 owner 修复。

## C 分析师

- C1 部分通过：两场独立库范围初始 2/2；将 focus 切到 Aurora 后仍为 2/2，选择 Nuke 后为 1/2。两场日期均未知；日期条件默认排除未知为 0/2，勾选包含未知后恢复 2/2。选择再排除同一场后为 0/2。赛事/标签尚未核对；删除显式选择参见 C3–C5。
- C2 部分通过：实际点击六主题（表现与趋势、交火与协同、经济与转化、道具、开局与控图、位置与职责），均可进入；经济页显示 4 场、82 回合与具体队伍矩阵。两场不交手的 Aurora Gaming 与 Team Plasma 实际生成队伍比较；同一 Aurora 语料选择 soulfly 与 Wicadia 显示选手 CompareCard。更新至 #180 后，在浏览器临时拦截队伍比较查询并模拟抛错：界面显示比较失败，但仍提供“不含队伍对比”导出；实际 JSON 包含该局限且 sources 仅列 Aurora 的 Nuke。14 旧视图映射和 team-vs-league 尚未完整操作。
- C3–C5 部分通过：Nuke 经济页保存分析并勾选工作台，重载后打开，再另存；实际下载 JSON 与 Markdown。JSON 显示 1 场/14 回合、scope、来源 entryId/matchId、demo SHA-256、format/facts 版本、时间、局限及 null；导入另一真实场前后下载文件 SHA-256 均为 `e17655a5ae1880b85eeec440bb42b502bde65048ee1ced0d774f8a8ff2eb9e7c`。另保存仅含 Nuke 的显式比赛范围，删除 Nuke 而保留 Inferno 后重开，显示 0/1 而未扩为全库。反例：另存 Nuke 地图筛选，删除唯一 Nuke 后重开同样为 0/1，但范围编辑器地图行只显示 de_inferno，没有展示已失效的 de_nuke 选择；用户无法看见原筛选条件，待分析范围 owner 核实和修复。局部筛选和更多导出主题仍未验。

## D 数据、异步、可用性

- 导入真实四场最终工作台显示 4 场；另在 cohort 三场导入期间新建并保存笔记，切换比赛/分析/战术与训练/工作台，任务完成后笔记编辑页仍在。模拟 IndexedDB 持续 open 抛错：页面显示“读取本地资料库失败”与缓存重试，同时最近比赛仍写“还没有比赛”；失败状态与空库文案并存，待数据 owner 修复/核对。临时浏览器延迟查询并触发真实 `invalidateAnalysisQueries`：旧 Promise 在恢复后以 AbortError 结束、bucket 清空；这是模拟延迟的数据 generation 检查，不等于 A/B 证据或 scope 切换导出验收。另在浏览器临时拦截 model loader，使证据 A 的加载延迟 12 秒；立即点下一条进入 B，等待 A 晚到后仍显示 Inferno R1/tick 5856，再返回来源。这是标明注入方式的竞态验证。对 ExportPolling 使用短超时与模拟状态读取：首次查询超时进入 uncertain，重查同一 job 得到 done，共两次读取、零启动调用；此为模拟 bridge，非原生后台实机。另临时拦截经济查询并延迟 8 秒：从两场切到 Nuke 范围期间 JSON 导出按钮消失，返回后下载含 de_nuke、1 场及 Nuke source ID；这是模拟延迟，不代表所有主题的竞态均已覆盖。后台任务真实失败重试仍未实测。
- 源码 `storage-overview.ts` 的用户 namespace 包含 training-focus、prep-items、practice-lineups、role-declarations、study-notes、coach-playbook、coach-assignments、coach-match-sheets、saved-analyses；cache 名单由 facts/derived cache 加 cache/meta 构成。另以临时隔离目录直接运行 Linux Python `StudioApi` 后端：九类各写一条模拟记录，清除 9 字节临时 cache 后逐类一致；备份后删除九条及真实 Nuke ZIP，恢复后九类各一条和 ZIP 字节一致（SHA-256 `e9405245cd0ba55d4427bb5890874b0b70b19475790248d963734b6cd93e4d21`）。这是后端调用、模拟用户资料，不是 pywebview 壳或 Windows/macOS 实机验证。
- 旧 playlist 迁移源码先写后删、冲突时另分 ID、末尾写 marker；普通 prep list 仅读取排序。临时内存 RecordStore 注入首次复制失败与首次删除失败，重试后旧记录删除、同 ID 不同内容两条保留、marker 写入；重复迁移和普通 list 无写入。另在隔离 IndexedDB 写入模拟旧 playlist 与同 ID 不同内容的现存 prep，重载应用后旧记录清空、两条新记录及 marker 存在，再次重载仍为两条。此为模拟故障和合成旧记录，旧版本真实资料及平台恢复尚未验。
- 浏览器导入仓库 `sample-pro-finals-2026.zip`（7,585,021 字节解压内容，7 图）后赛事目录显示两系列、7/7 图关联；IEM 决赛 BO5、FURIA 1:3 Vitality 和四图可见；展开 BP 后显示 Dust2/Ancient ban、Mirage/Inferno/Nuke/Overpass pick 与 Anubis decider。另一阶段实操未完成。另可见导入赛事资源包及赛事资源制作器；数据管理中的身份、资产和资料库维护均可打开，维护页显示备份入口，资产页显示 .tri 资产。它们只是入口检查；赛事/series/BP、RivalHub 实际导入、批量标签/修复、身份修改、更新、原始 demo/进游戏的逐项流程未验。canonical/RR/PRISM 跨版本同语料逐项对照未完成。W20 缺姿态保持缺失、W21 分母和日期修正应按 #157/#161 语义核实，不能为了旧错误数值回退。
- 单 Nuke 文件从选择到显示约 15 秒（粗观察）。同一隔离 Chromium、1 场/593,751 字节：空库首次工作台 1,496ms，导入后首次/再次打开比赛 1,074/115ms，返回工作台 64/53ms；两次比赛进入时 JS heap 约 242/227 MB（非进程总内存、GC 可波动）。这是一次开发服务器粗测，不作 50 场或长期性能结论。1280×800 页面可显示导航与主要内容；键盘 Tab 实际依次进入四主导航、数据管理、全部比赛和导入；阶段地图标记在列表中可见。返回/关键按钮和切页焦点的完整键盘路径、复杂打印裁切未验。未验证首页无全量加载或模型缓存长期行为。

## 验收中修复的直接阻塞

原 main 在分析范围编辑中，scope editor 与 AnalysisView 及主题页面使用相同 React sibling key；每次修改上下文可把范围编辑器从 1 个累积到多个，复选框无法稳定选择。`App.tsx` 为 scope 和 analysis 栏分配独立、稳定的 frame 派生 key。修后以同样两场数据切 focus、地图、日期、选择与排除，编辑器始终为 1 个，最终空范围为 0/2；`pnpm typecheck` 和 Studio build 成功。此为 UI 接线修复，没有改变公共包合同。

## E 架构删除与新 owner（静态证据，部分闭合）

下表的 PR 为实现来源，源码搜索与构建是本次证据；未逐项验证的内容保留待办，不以 CI 代替架构验收。

| 已删除旧项 / 范围 | 新 owner | 实现 / 本次证据 |
|---|---|---|
| `season.ts`、`facts-projections.ts`、`tactics.ts` facade | App queries + analytics/tactics | [#161](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/161)，目标文件名搜索无匹配；尚需逐函数核重 |
| `HomeView.tsx`、`CohortScope.tsx` | Players/AnalysisContext | [#169](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/169)、[#171](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/171)，目标文件搜索无匹配；CSS 仍有旧名称注释，非运行时 owner |
| `CoachView.tsx` | 分析主题与 App 材料 | [#172](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/172)，目标文件搜索无匹配；CoachSettings 双写尚需完整追踪 |
| `playlist.ts` 与材料混入 series | prep-items / material-data-migration | [#166](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/166)，文件搜索无匹配；迁移只做静态检查 |
| 公共 React 整页 MatchWorkspace、Studio 样式 | App MatchReviewWorkspace；公共窄 DTO/widgets | [#159](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/159)，源码搜索及 tarball 闭包；修正 presentation README 仍引用已删组件的示例 |
| 旧回放/表格状态 props | 受控 state/onStateChange | [#159](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/159)，公共源码搜索 `initialTarget`/`initialViewState` 无匹配；所有 caller 和旧位置参数需继续逐项核验 |
| App 姿态计算和单场编排 | tactics `extractMatchLineupObservations` / pipeline `analyzeMatchFacts` | [#157](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/157)，`library.ts` 与 `pkg-worker.ts` 均调用 `buildMatchRecords`，后者调用 pipeline |
| 导航镜像及旧证据 fallback | App 页面帧与单对象 `OpenEvidenceRequest` | [#158](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/158)、[#164](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/164)；`sourceKey` 仍作为 anchor 合法存在，前缀猜 tab/所有 fallback 尚需逐项核查 |
| 公共 break | presentation/react 等各自 major Changeset | `.changeset/w03-controlled-state.md`、迁移指南；本次真实 tarball 消费通过，不代表未知外部调用方已迁移 |

公共包源码检索未命中 AnalysisContext、MaterialRef、RecordStore、STUDIO_TABLE_CLASSES、initialTarget 或 initialViewState；query 目录未命中 view import。这是针对名称的静态检查，不证明所有潜在耦合已排除。已发现边界未闭合：`queries/query-scope.ts` 为 `originalTeamNamesForDisplay` 导入 `identity.ts`，后者模块顶层调用 `getStorage().records(...)`；纯查询读取队名会加载 storage，需原 owner 拆分纯身份变换与 I/O。源码搜索未见 CoachSettings、sourceKey 前缀猜 tab，series 源码未见材料/教练设置引用；其他纯模块依赖、所有 query 算法唯一性、来源回退与所有受控调用方仍需逐项验证。因此架构表尚未闭合。
