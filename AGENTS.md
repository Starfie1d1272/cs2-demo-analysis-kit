# AGENTS.md

## 1. Project Overview

CS2 Demo 的共享数据与分析能力仓库。从 `.dem` 导出到产品中立 View Model 的完整管道都在本仓库。

- **技术栈**：TypeScript（pnpm monorepo）+ Python（uv 管理依赖）
- **定位**：`.dem → v3 ZIP → @cs2dak/* 分析包 → RivalHub / CS2 Insight Agent`
- **GUI**：DAK Studio（pywebview 桌面壳）

## 2. Commands

```bash
# 开发
pnpm dev                  # 启动 DAK Studio（pnpm dev:studio 的别名）
pnpm dev:studio           # 启动 DAK Studio（本地 demo 工作台，端口 5178）
pnpm build                # 构建所有包
pnpm typecheck            # tsc -b 全工作区类型检查

# 测试
pnpm test                 # 关键流程 fast suite（Studio 持久化 / Evidence / 上传）
pnpm test:integration     # committed ZIP 解析、必需流拒绝与可选流降级
pnpm test:all             # 所有保留的 Vitest 流程
pnpm python:test          # 原生桥 / 凭据 / 安全更新（dev + gui extras）

# 分析
pnpm analyze:sample       # CLI 分析 fixtures/input/cologne-major-2026-stage3-smoke-de_nuke.zip → fixtures/output/sample/
# 导出使用 cs2df CLI（无需本仓库 Python 壳）：
#   cs2df export <demo.dem>                              # 单场
#   cs2df export-batch <dir> --out bundle.zip --descriptive  # 批量

# 导出
cs2df export <demo.dem>          # 导出单场 .dem → v3 ZIP（cs2df CLI）
cs2df export-batch <dir> --out bundle.zip  # 批量导出

# GUI
bash scripts/package.sh          # 打包桌面应用（DAK Studio + PyInstaller）

# 赛事制作
pnpm event:export                # 赛事批量导出（读 spec.export，--research --compress-level 9）
pnpm events:build                # 构建赛事 R2 资产（build-event-asset.mjs）
pnpm events:publish              # 上传赛事资产到 R2
pnpm event:package <spec.json>   # 通用赛事 per-stage event-package 装配
node scripts/hltv/extract-stage-urls.mjs  # CDP 提取 HLTV match URL（Node 24 原生 WebSocket）

# 分发
cd python && uv run python -m cs2dak.installer # Web Installer（极简 tkinter GUI）
node scripts/gen-install-manifest.mjs # 生成 install-manifest.json
node scripts/assemble-full-zip.mjs    # 组装 Full Portable Zip

# 单测单文件
pnpm vitest run packages/core/src/critical-flows.integration.test.ts
```

Python `uv sync --extra gui` 装 pywebview（DAK Studio 桌面壳运行需要）。禁止向系统 python 和 conda base 安装包。

## 3. Architecture

```
.dem
  → cs2df（PyPI）  （demoparser2 → cs2-demo-format/3.0 ZIP）
       └─ python/src/cs2dak  （薄壳：CLI→version，Studio 桌面桥）
  → @cs2dak/core  （加载 ZIP → DemoPackage → AnalysisBundle）
       ├─ normalize / economy / kills / clutches / timeline / heatmap / QA
       ├─ box-score / HLTV baseline / RR 六账户 / PRISM（经 @rivalhub/rival-rating）
       └─ → AnalysisBundle
  → @cs2dak/cohort → @cs2dak/presentation
  → @cs2dak/react 组件 或 产品适配层（RivalHub / CS2 Insight Agent）
```

**跨语言边界**：v3 ZIP 是 Python ↔ TypeScript 唯一耦合点，两边代码不互相 import。

| 包 | 职责 |
|---|---|
| `@cs2dak/contract` | Zod schemas + TS 类型。re-export `cs2-demo-format`。 |
| `@cs2dak/core` | 纯分析逻辑。加载 v3 ZIP → 标准化、信号派生、QA、RR/PRISM 接线。无副作用。 |
| `@cs2dak/cohort` | 跨场聚合、身份归并与赛季 RR/PRISM 整形。 |
| `@cs2dak/maps` | 地图标定、world→radar 坐标变换、zone 几何（`zoneAt` / `pointInPolygon`）、callout 中文名与倾向、callout grid、进点入口（`site-entry-chokes`）、默认站位查询（`classifyTacticalLocation`）。 |
| `@cs2dak/presentation` | 产品中立 View Model、标签与 workspace 编排。 |
| `@cs2dak/react` | React 组件。消费 presentation View Model、contract props/types 与 maps 坐标投影，不查数据库、不跑分析。 |
| `@cs2dak/cli` | 薄 CLI（tsx），把 `@cs2dak/core` 接到文件系统。 |
| `apps/dak-studio` | DAK Studio：本地 Demo 管理、战术分析与个人打法复盘工作台（独立设计语言；导入即提取 facts 行持久化，视图读投影；IndexedDB 开发 / SQLite 桌面双后端）。教练页战术聚类 0.6.0 已落地（`TacticalRoundFact`/`TacticalCluster` + `PatternExplorer` 三栏 + `RadarTrails` + `MapPoolTable` + Round Playlist + 默认位资产 + 3D callout 网格）见 `docs/design/studio-redesign.md §8`。 |
| `python/src/cs2dak` | Python 壳（cs2df 包装器）：DAK Studio 桌面桥。CLI 仅保留 version。 |

```
packages/              # @cs2dak/* TypeScript 库
apps/dak-studio/       # DAK Studio 桌面/开发前端
python/                # cs2dak（uv-managed）
fixtures/
  demos/               # 原始 .dem（gitignored）
    nju-rivals-2026/   # 55 场 NJU 联赛
    pro/               # 24 场职业比赛
  input/               # 提交的测试输入
    cologne-major-2026-stage3-smoke-de_nuke.zip # CLI / invariant smoke 样本（cs2df 3.1.0）
    cs2dak-sanitized-de_ancient.zip   # legacy compact ancient 样本
    cohort/            # 3 场 cohort/cli 测试
    sample-*.zip       # Studio 与测试使用的精简 v3 ZIP 样本
  output/              # 生成的 v3 ZIP（gitignored）
  baselines/           # 精选非再生产物（提交）
  _bench/              # 本地 benchmark 与大文件（gitignored）
docs/                  # 架构与集成文档（索引见 docs/README.md）
```

详细架构见 `docs/architecture.md`。分发架构见 `docs/design/distribution.md`。

> **已迁移**：cs2-demo-format 3.1.0 / cs2df 3.1.0（2026-06）。TS 管线全部使用 v3 合同，
> Python exporter 切换为 PyPI `cs2df`（本仓库只留 Studio 桌面壳）。
> v3 迁移与 fixture 重导均已完成（归档见 `docs/archive/2026-06/v3-migration.md`）。
> Studio 最终形态设计见 [`docs/design/studio-redesign.md`](docs/design/studio-redesign.md)。

### 模块边界规则

模块职责、禁止事项与目标依赖边界以 [`docs/module-boundaries.md`](docs/module-boundaries.md)
为准。新增、迁移或删除功能前必须先确定唯一 owner；允许删除违反该边界的旧 API，
不得为错误职责长期维护兼容层。删除或迁移限于当前任务所需范围，检查调用方并完成
必要迁移；发现其他边界问题不自动扩大重构范围。

### 工作流分流

- 按风险与不确定性选择流程，不按文件数量升级流程。目标明确的小修、只读审计和纯讨论直接完成；需要多步协调或设计取舍的实现任务，若全局 `$delivery-task` 可用则使用。若未挂载且用户未明确要求该 Skill，说明一次，按“目标与验收 → 最小实现 → 相关验证 → 交付”继续；若用户明确指定且缺失会影响交付，只暂停依赖它的部分并说明缺失项。
- 先核真实代码、数据合同和现有入口。设计文档是当前假设；实现与文档不一致是调查线索，不自动代表实现正确，也不自动触发用户审批。
- 只处理影响当前验收的 Blocker。Invalidation 若仅改变授权范围内的技术方案，自主调整并简述依据；若会改变产品目标、公共合同语义或发布范围且未获授权，提出具体取舍，只暂停依赖该决定的工作。
- 有后续价值的 Improvement / New Idea 简记到 [`docs/product/discovery-inbox.md`](docs/product/discovery-inbox.md)，不扩入本次任务。影响产品方向、模块边界、数据口径或发布策略的重要决定记到 [`docs/decisions/`](docs/decisions/)；普通技术选择无需另建决策文档。

### 自主执行、澄清与批准

本节定义仓库默认协作方式；Skills 补充具体操作步骤，不重复设审批关卡。遵守系统、平台与适用上级指令；在其允许范围内以用户当前任务和本轮已有授权为准。

- 用户提出实现、修复或优化请求即授权完成相应工作。先读取上下文，再自主完成范围内的可逆改动、必要迁移与验证；不要在计划、诊断或第一处修复后询问“是否继续”。
- 澄清用于补齐影响结果的信息：先查仓库与已有对话；低风险、可逆的缺省选择直接采用并说明。只有目标、验收、关键数据或会显著改变结果的取舍仍无法确定时才问；合并相关问题，等待期间继续不依赖答案的工作。用户未回复不等于批准。
- 批准用于授权尚未获准的动作。已有授权在同一目标、范围和后果下持续有效；发布、合并、外部写入等动作先检查是否已获授权，不一律重新询问。破坏性/难以恢复的操作、对外发送消息及平台强制门禁遵守适用的明确授权要求。
- 确需批准时，先完成允许进行的准备与验证，给出具体对象、差异、后果和阻塞规则来源；批准后从该步骤继续，不重启整个流程。不得为了等待最终批准而提前停止独立工作。

### 验证与完成

- 完成标准是用户要求的结果已实现且相关验收有证据；纯审阅交付发现和依据，要求优化时还需落地修改。不要用计划、测试变绿或“可继续”代替交付结果。
- 验证按改动面选择：文档改动检查内容、引用和 diff；行为变更运行相关测试；跨语言合同/fixture 改动使用 `fixture-verify`；发布任务保留 [`docs/release.md`](docs/release.md) 的全部适用门禁。通过后仅因新修改、失败或具体未解风险扩大或重跑检查。
- 工具、依赖或权限失败时先诊断，尝试有依据的替代办法；不重复相同失败命令，不以跳过测试或放宽断言制造成功。仍受阻则完成其余工作，交付已完成内容、未完成项、失败证据及解除阻塞所需的最小信息或操作。
- 最终说明改动、验证结果及剩余限制；只有实际执行并获成功证据的提交、发布或保存才可声称完成。达到验收后结束，不主动追加重构、全量测试或下一阶段任务。

## 4. Conventions

- **Python**：uv 管理依赖，`ruff` lint。禁止装系统 python / conda base。`uv run` 跑脚本
- **TypeScript**：pnpm workspace，vitest（node 环境），`tsc -b` 类型检查。测试与源码同目录 `*.test.ts`
- **跨语言 seam**：v3 ZIP 是唯一耦合点。Python 和 TS 不互相 import
- **组件导出**：公共组件从 `packages/react/src/index.ts` 统一导出
- **组件复用**：新增 UI 前先查 [`docs/design/studio-components.md`](docs/design/studio-components.md)
  组件登记表——能复用就复用，不要重造。表格一律用 `DataTable`（唯一排序表），
  翻页用 `Pagination`。纯展示组件应下沉 `@cs2dak/react`（绑数据的才留 Studio）
- **UI 设计语言**：DAK Studio 所有页面与组件必须遵守
  [`docs/design-language.md`](docs/design-language.md)（Tactical Slate：只用
  `--dak-*`/`stu-*` token，禁止裸色值与视图私有控件样式；统计证据可点击、
  派生指标带 ⓘ、缺失值显示 `—`）
- **Git commit**：中文，不加 `Co-Authored-By` trailer，语言跟随仓库现有约定

### 版本与发布

两条独立版本流，详见 [`docs/release.md`](docs/release.md)：

- **桌面应用**（DAK Studio / exporter）：版本随 `vX.Y.Z` git tag，推 tag 触发
  Release CI 出 DMG/zip。发版前 `node scripts/sync-version.mjs X.Y.Z` 同步
  根 package.json / 私有 apps / python。Studio 启动时自查 releases/latest 提示更新。
- **npm 包**（`@cs2dak/*`）：Changesets 管理（`pnpm changeset` → `version:packages`
  → `release:npm`），tag 形如 `@cs2dak/core@1.0.0`。`sync-version.mjs` 不碰公共包。

## 5. Hard Constraints

- **v3 ZIP 是唯一 seam**：Python ↔ TypeScript 只通过 v3 ZIP 合同对接
- **contract 不 fork**：`@cs2dak/contract` 依赖并 re-export `cs2-demo-format`，不在本仓库内 fork 类型定义
- **Null 保持 null**：`RRSignals` 字段缺失时发 `null`，绝不 coerce 到 0
- **Core 包不 import 产品代码**：RivalHub、CS2 Insight Agent、任何 app 都不得被 core 包引用
- **React 组件不查数据库**：不跑分析逻辑；允许 presentation View Model、contract props/types 与 maps 坐标投影
- **fixtures/ 是真相源**：跨语言行为验证以 fixtures 为准
- **公式所有权**：RR/PRISM 公式在 `@rivalhub/rival-rating`（外部依赖），kit 只做信号派生和接线

## 6. Gotchas

- **WKWebView sandbox 警告**：macOS 上非 `.app` bundle 运行 GUI 时，WKWebView 会在 stderr 输出沙盒目录创建失败。无害，PyInstaller 打包后自动消失
- **ruff 路径**：`ruff` 不在全局 PATH，用 `uv run ruff check <path>` 跑 lint
- **cs2df 导出**：`uv run cs2df export` 直接导出 v3 ZIP（无需本仓库 Python 壳）。DAK Studio 需要 `uv sync --extra gui` 装 pywebview
- **`.tri` 碰撞几何**：反应时间/预瞄的 LOS 口径需要 awpy `.tri`（`uvx awpy get tris`，~30MB/图，不进 git）。Node 端从 `~/.awpy/tris` 读（`AWPY_TRIS_DIR` 可覆盖）；Studio 浏览器端 fetch `tris/{map}.tri`——开发环境放/链到 `apps/dak-studio/public/tris/`，打包时 `scripts/package.sh` 自动从 `~/.awpy/tris` 拷入安装包。缺失只降级不报错
- **cwd 敏感**：pnpm 命令只在 workspace root 有效，不要在 `python/` 子目录下跑
- **dist 被 gitignore**：`apps/dak-studio/dist/` 与包构建产物不提交，CI 或本地需先构建

## 依赖安装与更新

依赖维护遵循 [`docs/dependency-maintenance.md`](docs/dependency-maintenance.md)。使用 manifest 指定的 pnpm，日常冻结安装，版本更新时自动生成锁文件；不要手改锁文件或恢复旧文件掩盖依赖变化。

云环境中如存在 `/workspace/.onboarding/activate.sh`，每个 shell 执行仓库命令前先 source 该文件，以选择可写缓存和 manifest 对应的包管理器。
