# Studio 工作台 W19 集成验收记录（进行中）

本记录不是整体验收通过证明。基线 main `186f3fafea6bda8bee8850250ef49d7bf5adcd7f`，2026-11-02 UTC；[#133](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/133)、[#152](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues/152)。21 个前置项已合入，但其 PR/CI 不替代下列旅程验收。没有关闭 #152/#133，也不建议据此关闭 #17。#3 的长期运行及 50+ 场、#64 的桌面平台、#49/#75/#76 各自独立门槛仍由原 owner 承接。

## 环境与证据

- Linux x86_64 云环境，约 17 GiB 可用内存；Node/pnpm 使用仓库 activate 脚本，Vite 开发服务，系统 Chromium headless，1280×800；隔离浏览器 context/IndexedDB，没有接触现有用户库。无显示服务器及可用桌面设备，本次没有原生壳、Windows/macOS、原生备份/恢复或实际打印机结果。
- 空库 A 和独立 B；B 通过文件选择导入仓库 Nuke `cologne-major-2026-stage3-smoke-de_nuke.zip`（593,751 bytes）及 cohort 三个 ZIP（1,986,337 / 1,045,157 / 1,134,000 bytes），共 4 场，约 4.8 MB；均为仓库真实样本，未伪造 50 场。四场界面均显示日期未知。未注入模拟旧资料或缺失流，以下未操作项不标通过。
- 精确 main 的 [官方 CI](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/actions/runs/41407963506)：TypeScript（typecheck/fast/build）、integration、Python、event worker 四项成功。本地先缺 dist 直接运行失败；按仓库流程 `pnpm build:packages` 后 `pnpm typecheck`、Studio build 成功，既有 library-persistence/library 两文件 9 项通过。`pnpm check:package-consumers` 成功：真实 tarball、隔离安装、NodeNext 声明闭包及浏览器打包。额外独立安装当前 maps/presentation/react tarball，实调用 `sortTableRows` 和三个 MapRoles 排序列：样本 3 在 1 前、RR 2/1/null 顺序正确。不是所有外部消费者迁移证明。

## A 玩家

- A1 部分通过：未绑定本人启动，空工作台可用；B 的最近比赛打开 Nuke。绑定本人/缺席默认选择未验。
- A2 部分通过：Nuke 显示 9z 1:13 Aurora、10 人、14 回合；soulfly 19/7/1、ADR 137.8，界面显示 RR 1.611。未独立逐事实核验筛选和首死措辞。
- A3–A5 未完成：回合/tick、回放控制、跨场证据往返、笔记重启与删除源、缺 replay 和 null 投法命令尚未执行。Nuke ZIP 导入与统计不需要 `.dem`，不能据此推断回放已验。

## B 教练

- B1 部分通过：空库可打开新建战术、人员安排、笔记编辑器；战术默认 Mirage/T，可选择 Default/Protocol/Play，人员安排有五行与观察绑定。在空库保存 Mirage T 的 Default、Protocol、Play 和一份人员安排（Player A 的职责填入 IGL + 主 AWP + A 区），重新加载后四条均显示；三阶段/标记和真实观察绑定尚未完成。
- B2–B5 未完成：真实观察绑定、模式示例、比赛单及重排/讲解/缺失占位、Markdown、打印预览尚未完成；原生打印未验。

## C 分析师

- C1 未完成：四场导入，未知日期可见；赛事/日期/地图/排除与 focus 不改变 corpus 尚未核对。
- C2 部分通过：实际点击六主题（表现与趋势、交火与协同、经济与转化、道具、开局与控图、位置与职责），均可进入；经济页显示 4 场、82 回合与具体队伍矩阵。14 旧视图映射、比较和 team-vs-league 尚未完整操作。
- C3–C5 未完成：局部筛选、证据粒度、保存/另存及空显式范围、下载 JSON/Markdown 的来源和冻结性尚未验。不能以导出按钮存在代替实际下载。

## D 数据、异步、可用性

- 导入真实四场期间显示后台处理，最终工作台显示 4 场；未测导入时编辑、失败重试、A/B 竞态与 scope 切换导出。
- 源码 `storage-overview.ts` 的用户 namespace 包含 training-focus、prep-items、practice-lineups、role-declarations、study-notes、coach-playbook、coach-assignments、coach-match-sheets、saved-analyses；cache 名单由 facts/derived cache 加 cache/meta 构成。仅源码检查，不等于实际清缓存或 native 备份恢复逐类核验。
- 旧 playlist 迁移源码先写后删、冲突时另分 ID、末尾写 marker；普通 prep list 仅读取排序。这是静态审阅；失败注入、重试与旧资料真实迁移未验。
- 赛事/series/BP、RivalHub、批量标签/修复、身份/资产/更新/原始 demo/进游戏的逐项可达性未验；canonical/RR/PRISM 跨版本同语料逐项对照未完成。W20 缺姿态保持缺失、W21 分母和日期修正应按 #157/#161 语义核实，不能为了旧错误数值回退。
- 单 Nuke 文件从选择到显示约 15 秒（粗观察，非基准）；未计首次/再次进入延迟及内存曲线，不作性能结论。1280×800 页面可显示导航与主要内容；键盘、地图等价列表、焦点、打印裁切未验。未验证首页无全量加载或模型缓存长期行为。

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
| App 姿态计算和单场编排 | tactics `extractMatchLineupObservations` / pipeline `analyzeMatchFacts` | [#157](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/157)，`match-records.ts` 调用 pipeline；主线程/worker 两链尚需完整追踪 |
| 导航镜像及旧证据 fallback | App 页面帧与单对象 `OpenEvidenceRequest` | [#158](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/158)、[#164](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/pull/164)；`sourceKey` 仍作为 anchor 合法存在，前缀猜 tab/所有 fallback 尚需逐项核查 |
| 公共 break | presentation/react 等各自 major Changeset | `.changeset/w03-controlled-state.md`、迁移指南；本次真实 tarball 消费通过，不代表未知外部调用方已迁移 |

公共包无产品状态/路径、纯模块依赖、所有 query 算法唯一性、series 领域界限、CoachSettings、来源回退与所有受控调用方仍需逐项验证。因此架构表尚未闭合。
