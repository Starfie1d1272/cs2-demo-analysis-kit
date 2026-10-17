# DAK 模块边界

本文定义 DAK 的目标模块职责。重构、删除旧 API 和新增功能时，以本文为边界依据。

## 总体数据流

```text
.dem
  -> cs2df (PyPI)
  -> cs2-demo-format v3 DemoPackage
  -> @cs2dak/core
       ├─> @cs2dak/cohort
       ├─> CS2 Insight Agent
       ├─> @cs2dak/rivalhub-upload → RivalHub Evidence V1
       └─> @cs2dak/presentation <─ @cs2dak/cohort / @cs2dak/maps
              └─> @cs2dak/tournament（frozen Tournament facts 跨图聚合）
              -> @cs2dak/react
              -> RivalHub / DAK Studio
```

## 模块职责

| 模块                     | 负责                                                            | 不负责                                      | 主要输出                    |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------- | --------------------------- |
| `cs2-demo-format`        | 定义 v3 DemoPackage 数据合同，解析并校验 v3 ZIP                  | 原始 `.dem` 解析、分析、评分、展示          | Schema、类型、ZIP parser、validator |
| `cs2df`                  | 将原始 `.dem` 确定性导出为合法 v3 DemoPackage                   | RR/PRISM、产品展示、业务持久化              | v3 ZIP、导出报告            |
| Python CLI / GUI         | 提供 cs2df 的本地 GUI / DAK Studio 桥 / 打包壳                  | 维护独立 parser/exporter、分析或展示实现    | GUI、Studio bridge、桌面应用 |
| `@cs2dak/contract`       | 定义 DAK 派生结果的公共合同；re-export 上游合同                 | 复制 `cs2-demo-format` schema、实现分析逻辑 | Zod schema、TypeScript 类型 |
| `@cs2dak/core`           | 单场 Demo 的标准化、canonical performance/frozen Tournament facts、QA 和确定性分析 | 跨场聚合、身份管理、页面叙事、React UI      | `AnalysisBundle`            |
| `@cs2dak/cohort`         | 跨场聚合、身份归并、赛季级 RR/PRISM 输入与结果整形              | 单场解析、数据库、产品 UI                   | `CohortBundle`              |
| `@rivalhub/rival-rating` | RR、PRISM 及相关评分公式                                        | Demo 信号提取、持久化、展示                 | 评分结果                    |
| `@cs2dak/maps`           | 地图标定、坐标变换、callout 语义/grid、默认位、包点入口、区域几何 | 评分公式、产品 UI、战术结论、静态完整战术库 | 地图与空间能力              |
| `@cs2dak/tournament`     | frozen Tournament sufficient-fact DTO、identity-safe 跨图 merge、透明 performance aggregation、rate 与结构/引用/聚合安全校验 | Demo 解析/detection、Core semantic QA、RivalHub scope、数据库、React、评分公式 | `TournamentAnalytics`、`TournamentPerformanceAnalytics` |
| `@cs2dak/presentation`   | 将 core/cohort 结果转换为比赛、选手、队伍、赛季和排行榜展示模型；仅包装 canonical adapter 并注入最终显示标签 | 解析、评分公式、数据库、React、Tournament 跨图 merge | 产品中立 View Models        |
| `@cs2dak/react`          | 渲染 presentation View Model、contract props/types 与 maps 坐标/level 投影                          | 数据库查询、分析、评分、产品业务规则        | React 组件与样式            |
| `@cs2dak/rivalhub-upload` | RivalHub 配对与 HTTP client、目标匹配、Evidence V1 producer；唯一共享上传语义 owner | 本地文件、UI、数据库、Library 持久化 | `rivalhub-demo-evidence/1` |
| Node CLI                 | 将 TypeScript 包接入本地文件系统和自动化流程                    | 复制核心分析逻辑                            | 命令行输出与文件产物        |
| DAK Studio（`apps/dak-studio`） | 本地 Demo 管理、导入、检索、比较和个人档案               | RivalHub 赛事业务、共享分析公式             | 独立本地产品                |
| RivalHub Demo Uploader（`apps/rivalhub-uploader`） | 原生多选 `.dem`、逐场上传编排、连接与错误指导 | 本地 Library、replay、赛事管理、Evidence 语义 | 上传桌面应用 |
| RivalHub                 | 赛事、赛季、身份、权限、持久化和公开展示                        | 复制 DAK 分析与评分逻辑                     | 赛事产品                    |
| CS2 Insight Agent        | 高光录制软件，复用本仓库 demo 展示模块                          | 复制 Demo 解析与评分逻辑                    | 产品                        |

DAK Studio 已落地为 `apps/dak-studio`（资料库 / 比赛工作台 / 选手档案 / 道具实验室 / 经济与节奏 / 排行榜 / 赛事总览），仍须遵守上表边界：只做适配与编排，不拥有共享逻辑。

## DAK Studio 八模块归属

| Studio 模块 | 唯一职责 | 共享逻辑 owner |
|---|---|---|
| 资料库 | 本地 ZIP/.dem 导入、标签、重导、检索 | Studio 本地适配；ZIP 解析仍属 core/contract |
| 比赛工作台 | 单场回合、回放、地图、经济与 RR 解释入口 | `@cs2dak/presentation` + `@cs2dak/react` |
| 个人实验室 | 选手档案、趋势、武器分布、证据跳转 | `@cs2dak/cohort` + `@cs2dak/presentation` |
| 对枪实验室 | duels/mechanics 信号聚合、三分类对枪、TTK、机制画像（含 .tri LOS 反应时间/预瞄） | `@cs2dak/core` + `@cs2dak/presentation` |
| 道具实验室 | 跨场 Flash Value、负收益队闪、道具证据 | `@cs2dak/presentation` |
| 经济与节奏 | 经济矩阵、手枪转化、eco/semi 翻盘 | `@cs2dak/tournament`（单图事实由 Core canonical adapter 生成） |
| 赛事中台 | 跨队横向对比、地图盘面、武器榜、报表 | `@cs2dak/cohort` + `@cs2dak/presentation` + `@cs2dak/tournament` |
| 教练工作台 | pattern/playbook/anti-strat 的本地查询与编排 | `@cs2dak/maps` 静态地图语义 + `@cs2dak/core` 回合推导 + `@cs2dak/cohort` 聚合 + `@cs2dak/presentation` 展示模型 |

RR 口径统一使用 `@rivalhub/rival-rating` 的 frozen pro baseline：单场和跨场聚合都以
`1.0 = 职业基线` 为同一标准；cohort 层只做身份归并、信号汇总和展示模型整形。
PRISM 风格、强弱项等“相对当前范围”的判断可以继续使用 cohort 百分位，但不得改变 RR 标尺。

## 强制规则

1. 每项共享逻辑只能有一个 owner；消费者不得复制实现。
2. 产品和 UI 可以依赖共享模块；共享模块不得反向依赖产品或 UI。
3. v3 ZIP 是 Python / cs2df 与 TypeScript 分析层之间的唯一接口。
4. `cs2-demo-format` 是 DemoPackage 合同的唯一真相源。
5. `@rivalhub/rival-rating` 是评分公式的唯一真相源。
6. 缺失数据保持 `null`；不得为了展示、聚合或兼容伪造为 `0`。
7. Apps 和 CLI 只能负责适配与编排，不能成为共享逻辑 owner。
8. View Model 不包含数据库、权限或产品路由语义。
9. 当前任务确需调整边界时，允许重构和删除旧 API；先检查调用方并完成必要迁移，不为错误职责边界长期维护兼容层。不把该许可视为清理所有旧 API 或发布不兼容版本的授权。
10. 跨模块行为必须由公开合同和 fixture 验证，不依赖内部文件结构。
11. `@cs2dak/tournament` 自己拥有窄 public DTO；不得把 `@cs2dak/contract` 的 DemoFormat、Zod 或 RR 依赖拖入其 runtime。1.1 performance surface 只消费已冻结的 player-round/objective/weapon sufficient facts，不重新 detection。Tournament 的 fail-fast 只保护 shape/count、entity/reference、duplicate 与 denominator/cross-row aggregation safety；不得从一个 frozen semantic 字段重新推导或否定另一个字段（例如用 `deaths` 推导 `survived`，或用 `teamWonRound` / `survived` 裁决 `clutch.won`）。这类 semantic QA 只属于 Core / Evidence producer。
12. `@cs2dak/cohort` 保留 RR/PRISM 所需的 `RRIndicators` compatibility projection；它不替代 `@cs2dak/tournament` 的透明 performance owner。Presentation 的证据/视图模型可以保留自己的输出整形，但不得重新实现 Core 的事件归因。
13. `@cs2dak/core` 的 `buildPlayerRoundPerformanceFacts` 是 Assist、Damage、Opening、Trade、KAST、Clutch、Utility、Objective、Weapon 和 man-state 的唯一 analytical owner。`playerStats` 不再作为旧 aggregate 对照或事实 fallback；仅保留合同读取及尚未替代的 collateral 观察字段。`assertPlayerRoundPerformanceFacts` 复用同一 owner 的私有结果快照验证 supplied facts 的结构、身份、覆盖、统计守恒及成对 opening；未登记或源变化时仅调用 canonical owner 重建，不能维护第二套事件计算器。fresh facts 不重复校验，真实源 QA 仍保留。旧 `buildPlayerRoundFacts` / utility projection 只能从 canonical facts 投影，不能形成第二套 producer。

## 边界变更规则

新增或移动功能前，必须先回答：

1. 哪个模块是该功能的唯一 owner？
2. 它消费什么公共合同，输出什么公共合同？
3. 哪些模块明确不得实现它？

先从代码、公共合同与本表确定答案，这是实现前的技术判断，不要求用户逐项确认。
若仍存在会改变产品目标或公共合同语义的未授权取舍，给出证据与选项，只暂停相关
实现；继续独立的调查、验证或修复。授权范围内的技术归属可自主决定并记录依据。

14. `core/src/tournament-facts.ts` 是单图 frozen Tournament economy/performance projection 的唯一 owner，只以 type import 消费 Tournament DTO。显式 stable team/player ID 必须完整，teamA/B 相同 ID 明确拒绝；显示队名、昵称、logo 不生成或决定 ID。Evidence 直接消费 Core data adapter，再按 target entry ID 查询 Tournament 结果，不通过 Presentation ViewModel 回查。未绑定的本地 Demo 使用显式 match-scoped observed ID，只表示本场观察，不能据同名跨图认定同队；Presentation 只注入标签，Studio `teamRenames` 不改变 frozen identity。

Calibration-only 消费者优先使用 `@cs2dak/maps/calibration`；root 是 aggregate compatibility surface。两者由同一 maps owner 实现，当前 Active Duty 与 checked-in spatial coverage 分别由 `ACTIVE_DUTY_MAPS` / `SPATIAL_ASSET_MAPS` 表达。

## 可执行 package graph 与发布合同（#64 Phase A/B）

`pnpm check:package-boundaries` 同时检查 production TypeScript/TSX 的 import、re-export、dynamic import、require、import type 与 manifest dependencies/peers/optional dependencies。测试文件与 test-fixtures/__tests__ helper 可使用跨层 fixture，不进入生产 graph（生产代码不得 import 测试 helper）；跨包相对路径、未声明依赖、计算出来的模块入口与不在下表中的外部依赖均拒绝。`scripts/check-package-boundaries.mjs` 是机器规则，下表记录当前允许方向（不要求每个允许方向都有 runtime import）：

| 包 | 允许的依赖 |
|---|---|
| contract | cs2-demo-format、rating、Zod |
| maps | 无 npm 依赖；Node 专用入口可用 Node builtins |
| core | contract、maps、rating、JSZip；tournament **仅 DTO/type** |
| cohort | contract、core、rating |
| tournament | **无 runtime/peer/optional 依赖，也不 import 外部 DTO** |
| presentation | contract、core、cohort、maps、tournament、rating |
| react | contract、presentation、maps、lucide-react；React/React DOM peers |
| rivalhub-upload（private） | contract、core canonical adapter、tournament、Zod |

Core 的 tournament manifest dependency 是外部声明解析所需的 DTO 合同，不允许变成运行时 aggregation。React 直接使用 contract props/type 和 maps 坐标变换是合理渲染职责；不得 import core、cohort、tournament 或产品代码。私有 uploader 直接消费 Core canonical facts；禁止回读 presentation。

七个公共包发布 dist ESM/declarations，显式 exports 与有限 files；React 的 theme.css 保持原公开入口，复制到 dist 并标记 CSS side effect，其余包 sideEffects=false。现有 private CLI/uploader/apps 保持 private。DAK 自身模块不 bundle、不改变 owner/API；React 原有省略扩展名的相对路径只在生成的 JS/declaration 中补 `.js`。build configs 排除测试，typecheck configs 继续检查测试源码。

`pnpm check:package-consumers` 重建公共库、实际 pack 七个 tgz，逐包在仓外临时目录只安装该 root 与所需 peers；npm overrides 将每条传递 DAK dependency 固定到本次对应 tarball。它验证完整声明依赖闭包、公开 JS 入口实际 import/call、strict NodeNext（skipLibCheck=false），禁止 workspace link、源码/测试泄漏与额外 DAK 包，并记录真实 compressed/unpacked bytes。外部 cs2-demo-format/rating/Zod/React 等仍通过已声明 npm dependencies 安装；仓库只提供编译器工具，不提供 TS paths/aliases。

保留 maps 专项五入口/资产/calibration 隔离 gate。上述 Node/strict TS 验证不能替代正式 registry 发布后的 smoke，也不声称完成 browser consumer matrix。Phase C 的 correctness 已在 #69 完成，本轮只固定其 adapter graph；跨消费者 Evidence seam 的全面审计、Phase D 的外部 consumer 成本判断和 Phase E 的 DTO ownership audit 仍需各自证据。记录 pack size 不等于授权拆 maps 资产；#64 保持 umbrella，不由 A/B PR 自动关闭。

registry cs2-demo-format@3.1.0 与 @rivalhub/rival-rating@0.3.0 仍直接导出 TypeScript。DAK build 只从这两个精确版本的原版 registry bytes 生成 dependency ESM 模块，消费方 JS 引用生成模块，declarations 仍引用相同精确版本。生产源码 graph 的上游 owner 与 manifest type dependency 保留；只编译依赖，不复制改写公式/schema，不 bundle DAK 模块或 canonical facts caches。每个上游在一个 DAK package 内共享单一生成模块，附 MIT notices、原包 tarball/integrity、输入源码/输出哈希。包间仍用公开 DAK exports；不因此新增公开 API/package。详见 [artifact audit](research/public-package-artifact-audit.md)。

**#64 Phase A/B 的任务范围记录**：该 PR 当时按普通 Ready 状态交付，合并需完整 CI 与父独立审，该任务不执行发布。这不是后续任务的通用禁发或额外审批规则；后续合并/发布按当前任务授权、仓库保护规则及 `docs/release.md` 的适用门禁执行。

编译入口变化需要冷启动先构建依赖闭包：`pnpm build:packages` 用于公共库准备，CI 在 typecheck/fast tests 前执行；desktop/web-patch/uploader 的独立 build 递归包含对应 app dependencies。typecheck 的 rootDir 与发布 build 均为 src，保持 dist 声明路径一致。开发 dev 入口先准备公共产物；修改共享源码后需重跑 build:packages。构建器直接用 Node 调用已安装 tsc，避免 Windows pnpm shim 启动差异。仅变更依赖构建顺序，不改变诊断/发布 provenance 语义。

路径归属使用原生 path.relative/isAbsolute，覆盖 Windows path.win32 回归；Windows startup CI 实跑 graph gate。全包 tgz consumer gate 当前认证范围为 Linux/Ubuntu，显式拒绝其他平台；Windows 应用 build 通过不能当成 Windows tgz consumer 已通过。
