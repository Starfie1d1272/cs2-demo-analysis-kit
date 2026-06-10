# CS2 Demo Analysis Kit · DAK Studio

[English](./README.md) | 简体中文

**DAK Studio** 是一个本地优先的 CS2 demo 分析工作台：把 `.dem` 拖进来，得到比赛工作台、2D 回放（走位 / 道具轨迹 / C4 时间线）、选手档案、开局动线和跨场排行榜。所有数据存在本机（IndexedDB），不依赖任何服务端。

本仓库同时是支撑 Studio 的共享数据与分析管道：`.dem → cs2-demo-format/2.0 ZIP → @cs2dak/* 分析包`，可被 RivalHub、CS2 Insight Agent 等产品复用。

## 下载 DAK Studio

从 [GitHub Releases](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/latest) 下载：

- **macOS**：`dak-studio-X.Y.Z.dmg`，拖入 Applications。首次打开需在「系统设置 → 隐私与安全性」点「仍要打开」（应用未签名）。
- **Windows**：`dak-studio-windows-X.Y.Z.zip`，解压双击 `dak-studio.exe`。SmartScreen 警告选「仍要运行」。

应用内置 exporter：点「导入 demo」选 `.dem`（或 v2 ZIP），本机解析入库，无需其他工具。

## Studio 能做什么

| 视图 | 内容 |
|---|---|
| 资料库 | 导入 / 标签 / 检索本地 demo，全窗口拖拽导入 |
| 比赛工作台 | 回合浏览、经济、武器、对位矩阵、地图图层、2D 回放（8Hz 走位、道具落点与飞行轨迹、C4 安放/拆除/爆炸） |
| 选手档案 | 个人打法复盘、RR 拆解、回合事实 |
| 开局动线 | 跨场走位与道具习惯（按地图聚合） |
| 排行榜 | 跨场指标对比、赛季 RR/PRISM |

## 数据管道（开发者）

```
.dem
  → python/src/cs2dak       exporter（demoparser2 → cs2-demo-format/2.0 ZIP）
  → @cs2dak/core            加载 ZIP → 标准化 / 信号派生 / QA → AnalysisBundle
  → @cs2dak/cohort          跨场聚合、身份归并、赛季 RR/PRISM 整形
  → @cs2dak/presentation    产品中立 View Model
  → @cs2dak/react           可复用 React 组件
  → apps/dak-studio         Studio（pywebview 桌面壳 / 浏览器）
```

v2 ZIP 是 Python ↔ TypeScript 的唯一耦合点，两侧代码不互相 import。

| 包 | 职责 |
|---|---|
| `@cs2dak/contract` | Zod schemas + TS 类型，re-export `cs2-demo-format`。 |
| `@cs2dak/core` | 纯分析逻辑：标准化、经济、击杀、残局、时间线、热力图、QA、RR/PRISM 接线。 |
| `@cs2dak/cohort` | 跨场聚合、身份归并与赛季 RR/PRISM 整形。 |
| `@cs2dak/maps` | 地图标定、world→radar 坐标变换、进攻动线、zone 几何、callout 中文映射。 |
| `@cs2dak/presentation` | 产品中立 View Model、标签与 workspace 编排。 |
| `@cs2dak/react` | React 组件，只消费 presentation 合同。 |
| `@cs2dak/cli` | 薄 CLI，把 core 接到文件系统。 |
| `apps/dak-studio` | DAK Studio：本地 demo 工作台（IndexedDB 资料库）。 |
| `apps/demo-lab` | 组件预览与 fixture 验收应用（开发用）。 |
| `python/src/cs2dak` | Python exporter：CLI + pywebview 桌面壳 + PyInstaller 打包。 |

### 快速开始

```bash
pnpm install
pnpm dev:studio        # DAK Studio（端口 5178，.dem 导入走本地 uv 环境）
pnpm test              # vitest
pnpm python:test       # pytest
pnpm analyze:sample    # CLI 分析示例 ZIP → fixtures/output/sample/
bash scripts/package.sh  # 打包桌面应用（DMG / exe）
```

Python 侧用 uv 管理：`cd python && uv sync --extra gui` 后即可 `uv run cs2dak export <demo.dem>`。

## 下游消费者与边界

- **RivalHub**：消费 `@cs2dak/*` 的分析与展示模型，负责赛事 / 赛季 / 队伍 / 比赛业务。
- **CS2 Insight Agent**：消费 v2 ZIP 与 AnalysisBundle 做对话式分析。
- **rival-rating**：RR/PRISM 公式与校准的唯一 owner，kit 只做信号派生与接线。
- **cs2-demo-format**：v2 ZIP 合同的唯一 owner，contract 包 re-export、不 fork。

模块职责详见 [docs/module-boundaries.md](docs/module-boundaries.md)，架构详见 [docs/architecture.md](docs/architecture.md)，发布流程详见 [docs/release.md](docs/release.md)。

## 参考项目

参考但不复制：[CS Demo Manager](https://github.com/akiver/cs-demo-manager)（工作台结构）、[AWPy](https://github.com/pnxenopoulos/awpy)（分析严谨性）、[CS2 2D Demo Viewer](https://github.com/sparkoo/csgo-2d-demo-viewer)（回放 frame model）、[pr1maly](https://github.com/pr1malator/pr1maly)（local-first 思路，非商业 license，仅产品研究）。
