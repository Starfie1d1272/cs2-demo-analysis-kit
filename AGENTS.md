# AGENTS.md

## 1. Project Overview

CS2 Demo 的共享数据与分析能力仓库。从 `.dem` 导出到产品中立 View Model 的完整管道都在本仓库。

- **技术栈**：TypeScript（pnpm monorepo）+ Python（uv 管理依赖）
- **定位**：`.dem → v3 ZIP → @cs2dak/* 分析包 → RivalHub / CS2 Insight Agent`
- **GUI**：pywebview 桌面导出器；可视化开发与验收由 demo-lab 承担

## 2. Commands

```bash
# 开发
pnpm dev                  # 启动 demo-lab（Vite 预览）
pnpm dev:studio           # 启动 DAK Studio（本地 demo 工作台，端口 5178）
pnpm build                # 构建所有包
pnpm typecheck            # tsc -b 全工作区类型检查

# 测试
pnpm test                 # vitest（packages/**/*.test.ts，node 环境）
pnpm python:test          # Python 测试（uv run pytest）

# 分析
pnpm analyze:sample       # CLI 分析 fixtures/input/cs2dak-sanitized-de_ancient.zip → fixtures/output/sample/
# 导出使用 cs2df CLI（无需本仓库 Python 壳）：
#   cs2df export <demo.dem>                              # 单场
#   cs2df export-batch <dir> --out bundle.zip --descriptive  # 批量

# 导出
cs2df export <demo.dem>          # 导出单场 .dem → v3 ZIP（cs2df CLI）
cs2df export-batch <dir> --out bundle.zip  # 批量导出

# GUI
cd python && uv run cs2dak-gui   # 启动 pywebview 桌面导出器
bash scripts/package.sh          # 打包桌面应用（exporter + DAK Studio，PyInstaller）

# 单测单文件
pnpm vitest run packages/core/src/index.test.ts
```

Python `uv sync --extra gui` 装 pywebview（GUI 运行需要）。禁止向系统 python 和 conda base 安装包。

## 3. Architecture

```
.dem
  → cs2df（PyPI）  （demoparser2 → cs2-demo-format/3.0 ZIP）
       └─ python/src/cs2dak  （薄壳：CLI→gui/version，Studio/桌面导出器桥）
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
| `@cs2dak/maps` | 地图标定、world→radar 坐标变换、进攻动线（`MapRoute`）、zone 几何（`zoneAt` / `pointInPolygon`）、callout 中文映射。 |
| `@cs2dak/presentation` | 产品中立 View Model、标签与 workspace 编排。 |
| `@cs2dak/react` | React 组件。只消费 presentation 合同，不查数据库、不跑分析。 |
| `@cs2dak/cli` | 薄 CLI（tsx），把 `@cs2dak/core` 接到文件系统。 |
| `apps/demo-lab` | Vite + React 应用：组件预览、fixture 人工验收与视觉回归入口。 |
| `apps/dak-studio` | DAK Studio：本地 Demo 管理、战术分析与个人打法复盘工作台（独立设计语言，IndexedDB 资料库）。 |
| `python/src/cs2dak` | Python 壳（cs2df 包装器）：pywebview GUI + DAK Studio 导出桥。CLI 仅保留 gui/version。 |

```
packages/              # @cs2dak/* TypeScript 库
apps/demo-lab/         # Vite 预览 + GUI 嵌入式查看器
python/                # cs2dak（uv-managed）
fixtures/
  demos/               # 原始 .dem（gitignored）
    nju-rivals-2026/   # 55 场 NJU 联赛
    pro/               # 24 场职业比赛
  input/               # 提交的测试输入
    cs2dak-sanitized-de_ancient.zip   # 主 vitest fixture
    cohort/            # 3 场 cohort/cli 测试
    sample-match.zip   # Studio/demo-lab 内置示例（FURIA vs Vitality, de_mirage 职业局）
  output/              # 生成的 v3 ZIP（gitignored）
  baselines/           # 精选非再生产物（提交）
  _bench/              # 本地 benchmark 与大文件（gitignored）
docs/                  # 架构与集成文档
```

详细架构见 `docs/architecture.md`。

> **已迁移**：cs2-demo-format 3.0.0（2026-06）。TS 管线全部使用 v3 合同，
> Python exporter 切换为 PyPI `cs2df`（本仓库只留 GUI/Studio 壳层）。
> 需用 cs2df 重导测试 fixture 后方可全量验证（已归档到 `docs/archive/2026-06/v3-migration.md`）。
> Studio 最终形态设计见 [`docs/design/studio-redesign.md`](docs/design/studio-redesign.md)。

### 模块边界规则

模块职责、禁止事项与目标依赖边界以 [`docs/module-boundaries.md`](docs/module-boundaries.md)
为准。新增、迁移或删除功能前必须先确定唯一 owner；允许删除违反该边界的旧 API，
不得为错误职责长期维护兼容层。

## 4. Conventions

- **Python**：uv 管理依赖，`ruff` lint。禁止装系统 python / conda base。`uv run` 跑脚本
- **TypeScript**：pnpm workspace，vitest（node 环境），`tsc -b` 类型检查。测试与源码同目录 `*.test.ts`
- **跨语言 seam**：v3 ZIP 是唯一耦合点。Python 和 TS 不互相 import
- **组件导出**：公共组件从 `packages/react/src/index.ts` 统一导出
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
- **React 组件不查数据库**：不跑分析逻辑，只消费 presentation 合同
- **fixtures/ 是真相源**：跨语言行为验证以 fixtures 为准
- **公式所有权**：RR/PRISM 公式在 `@rivalhub/rival-rating`（外部依赖），kit 只做信号派生和接线

## 6. Gotchas

- **WKWebView sandbox 警告**：macOS 上非 `.app` bundle 运行 GUI 时，WKWebView 会在 stderr 输出沙盒目录创建失败。无害，PyInstaller 打包后自动消失
- **ruff 路径**：`ruff` 不在全局 PATH，用 `uv run ruff check <path>` 跑 lint
- **cs2df 导出**：`uv run cs2df export` 直接导出 v3 ZIP（无需本仓库 Python 壳）。GUI/Studio 需要 `uv sync --extra gui` 装 pywebview
- **cwd 敏感**：pnpm 命令只在 workspace root 有效，不要在 `python/` 子目录下跑
- **dist 被 gitignore**：`apps/demo-lab/dist/` 不提交，CI 或本地需先构建
