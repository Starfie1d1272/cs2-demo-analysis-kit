# AGENTS.md

## 1. Project Overview

CS2 比赛 demo 分析中间层。从 `.dem` 文件到产品级 view model 的完整管道——exporter、分析、可视化、GUI 桌面应用都在本仓库。

- **技术栈**：TypeScript（pnpm monorepo）+ Python（uv 管理依赖）
- **定位**：`.dem → v2 ZIP → @cs2dak/* 分析包 → RivalHub / CS2 Insight Agent`
- **GUI**：pywebview 桌面应用——导出 ZIP 后内嵌 demo-lab 查看器渲染可视化

## 2. Commands

```bash
# 开发
pnpm dev                  # 启动 demo-lab（Vite 预览）
pnpm build                # 构建所有包
pnpm typecheck            # tsc -b 全工作区类型检查

# 测试
pnpm test                 # vitest（packages/**/*.test.ts，node 环境）
pnpm python:test          # Python 测试（uv run pytest）

# 分析
pnpm analyze:sample       # CLI 分析 fixtures/input/cs2dak-sanitized-de_ancient.zip → fixtures/output/sample/
pnpm python:export:sample # 导出一场 NJU demo → fixtures/output/nju-rivals-2026/
pnpm python:export:pro    # 批量导出所有职业 demo → fixtures/output/pro/
pnpm python:export:nju    # 批量导出所有 NJU demo → fixtures/output/nju-rivals-2026/

# GUI（改过 demo-lab 后需要先构建）
pnpm --filter @cs2dak/demo-lab build    # 构建嵌入式查看器
cd python && uv run cs2dak-gui   # 启动 pywebview 桌面应用

# 单测单文件
pnpm vitest run packages/core/src/index.test.ts
```

Python `uv sync --extra gui` 装 pywebview（GUI 运行需要）。禁止向系统 python 和 conda base 安装包。

## 3. Architecture

```
.dem
  → python/src/cs2dak  （demoparser2 → cs2-demo-format/2.0 ZIP）
       ├─ CLI：export / export-batch / validate
       └─ GUI：pywebview 窗口 → 导出 ZIP → 内嵌 demo-lab 查看器渲染
  → @cs2dak/core  （加载 ZIP → DemoPackage → AnalysisBundle）
       ├─ normalize / economy / kills / clutches / timeline / heatmap / QA
       ├─ box-score / RR v1 / RR v2-lite / PRISM（经 @rivalhub/rival-rating）
       └─ → DemoViewModel / MatchWorkspaceModel
  → @cs2dak/react 组件 或 产品适配层（RivalHub / CS2 Insight Agent）
```

**跨语言 seam**：v2 ZIP 是 Python ↔ TypeScript 唯一耦合点。GUI 查看器中 ZIP 字节以 base64 经 pywebview 桥接传递，两边代码不互相 import。

| 包 | 职责 |
|---|---|
| `@cs2dak/contract` | Zod schemas + TS 类型。re-export `cs2-demo-format`。 |
| `@cs2dak/core` | 纯分析逻辑。加载 v2 ZIP → 标准化、信号派生、QA、RR/PRISM 接线。无副作用。 |
| `@cs2dak/maps` | 地图标定、world→radar 坐标变换、zone 几何（`zoneAt` / `pointInPolygon`）。 |
| `@cs2dak/react` | React 组件（MatchWorkspace、HeatmapCanvas、EconomyPanel、KillFeed、ScoreboardTable）。只消费 view model，不查数据库、不跑分析。 |
| `@cs2dak/cli` | 薄 CLI（tsx），把 `@cs2dak/core` 接到文件系统。 |
| `apps/demo-lab` | Vite + React 应用：组件预览沙盒 + pywebview GUI 的嵌入式查看器。 |
| `python/src/cs2dak` | Python exporter：`.dem → v2 ZIP`。CLI + pywebview GUI + PyInstaller 打包。 |

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
    sample-match.zip   # demo-lab 单场样本
  output/              # 生成的 v2 ZIP（gitignored）
  baselines/           # 精选非再生产物（提交）
  _bench/              # 本地 benchmark 与大文件（gitignored）
docs/                  # 架构与集成文档
```

详细架构见 `docs/architecture.md`。

## 4. Conventions

- **Python**：uv 管理依赖，`ruff` lint。禁止装系统 python / conda base。`uv run` 跑脚本
- **TypeScript**：pnpm workspace，vitest（node 环境），`tsc -b` 类型检查。测试与源码同目录 `*.test.ts`
- **跨语言 seam**：v2 ZIP 是唯一耦合点。Python 和 TS 不互相 import
- **组件导出**：公共组件从 `packages/react/src/index.ts` 统一导出
- **Git commit**：中文，不加 `Co-Authored-By` trailer，语言跟随仓库现有约定

## 5. Hard Constraints

- **v2 ZIP 是唯一 seam**：Python ↔ TypeScript 只通过 ZIP 合同对接
- **contract 不 fork**：`@cs2dak/contract` 依赖并 re-export `cs2-demo-format`，不在本仓库内 fork 类型定义
- **Null 保持 null**：`AccountSignalsV2` 字段缺失时发 `null`，绝不 coerce 到 0
- **Core 包不 import 产品代码**：RivalHub、CS2 Insight Agent、任何 app 都不得被 core 包引用
- **React 组件不查数据库**：不跑分析逻辑，只消费 `DemoViewModel` / `MatchWorkspaceModel`
- **fixtures/ 是真相源**：跨语言行为验证以 fixtures 为准
- **公式所有权**：RR/PRISM 公式在 `@rivalhub/rival-rating`（外部依赖），kit 只做信号派生和接线

## 6. Gotchas

- **WKWebView sandbox 警告**：macOS 上非 `.app` bundle 运行 GUI 时，WKWebView 会在 stderr 输出沙盒目录创建失败。无害，PyInstaller 打包后自动消失
- **demo-lab 需先构建**：改过 `apps/demo-lab/` 或任何依赖包的源码后，必须重新 `pnpm --filter @cs2dak/demo-lab build`，否则 GUI 查看器看到旧构建
- **ruff 路径**：`ruff` 不在全局 PATH，用 `uv run ruff check <path>` 跑 lint
- **python:export 前置**：`uv sync --extra gui` 装 pywebview 后才能跑 GUI 或导出命令
- **cwd 敏感**：pnpm 命令只在 workspace root 有效，不要在 `python/` 子目录下跑
- **dist 被 gitignore**：`apps/demo-lab/dist/` 不提交，CI 或本地需先构建
