<div align="center">

<img src="python/packaging/icon.png" width="112" alt="DAK Studio" />

# CS2 Demo Analysis Kit

**本地优先的 CS2 demo 分析——每一项统计都能点回具体的回合与 tick。**

[English](./README.md) · 简体中文

[![CI](https://img.shields.io/github/actions/workflow/status/Starfie1d1272/cs2-demo-analysis-kit/ci.yml?label=ci)](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/actions)
[![Release](https://img.shields.io/github/v/release/Starfie1d1272/cs2-demo-analysis-kit?label=release)](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/latest)
[![License](https://img.shields.io/badge/license-MIT%20%2F%20AGPL--3.0-blue)](#许可证)
[![Format](https://img.shields.io/badge/cs2--demo--format-3.x-success)](https://pypi.org/project/cs2df/)

</div>

---

**DAK Studio** 是一个桌面工作台，把 CS2 的 `.dem` 变成完整的分析会话：2D 回放、选手档案、对枪与枪法机制拆解、道具与经济实验室、赛事中台、教练工作台。一切都在你本机运行与保存——无账号、不上传、无服务端。

本仓库同时是支撑 Studio 的**产品中立管道**：一组 `@cs2dak/*` 包，把 `cs2-demo-format/3.x` ZIP 转成可复用的分析结果与 View Model，供 Studio 以及 RivalHub、CS2 Insight Agent 等产品消费。

> **Query-first，拒绝黑盒。** Studio 里每一个数字都能点回具体的比赛、回合与 tick，并在 2D 回放里亲眼复核。我们透明地派生信号，绝不给出一个你无法追溯的评分。

## 下载

从 [**Releases**](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/latest) 下载最新构建：

| 平台 | 文件 | 首次打开 |
|---|---|---|
| macOS | `dak-studio-X.Y.Z.dmg` | 拖入 Applications → 系统设置 → 隐私与安全性 → **仍要打开**（当前未签名） |
| Windows | `dak-studio-windows-X.Y.Z.zip` | 解压，运行 `dak-studio.exe`，SmartScreen 选 **仍要运行** |

应用内置 exporter——点 **导入 demo**，选 `.dem`（或 v3 ZIP），本机解析入库，无需其他工具。

## Studio 能做什么

九个模块共享同一套证据层（2D 回放 · 回合筛选 · 证据跳转）。完整模块图：[docs/design/studio-redesign.md](docs/design/studio-redesign.md)。各模块成熟度（Stable / Beta / Experimental）：[docs/stability-tiers.md](docs/stability-tiers.md)。

| 模块 | 回答什么 |
|---|---|
| **我的主页** | 「我」最近打得怎么样，本周该练什么？ |
| **资料库** | 我的 demo 在哪、数据质量如何、怎么组织？（导入、哈希去重、标签、series 归组、QA） |
| **比赛工作台** | 这一场发生了什么，证据在哪一回合哪一刻？（回放、记分板、kill feed、经济、RR 拆解） |
| **对枪实验室** | 这枪输在哪——枪法、定位、还是反应？（`.tri` 视线 TTK、首发 / 扫射 / 急停 / 预瞄） |
| **选手** | 这名选手什么风格、在变好还是变差、错误在哪？ |
| **道具实验室** | 这颗道具丢得值不值，标准 lineup 学没学会？ |
| **经济与节奏** | 钱花得对不对，节奏断在哪？ |
| **赛事中台** | 谁强、什么图流行、报告怎么发？ |
| **教练工作台** | 对手会打什么，我们准备什么？*（早期——见成熟度分级）* |

## 架构

```
.dem
  → cs2df（PyPI；demoparser2 → cs2-demo-format/3.x ZIP）
       └─ python/src/cs2dak    GUI / Studio 桥 / 打包壳（无 parser 逻辑）
  → @cs2dak/core               加载 v3 ZIP → 标准化 / 信号派生 / QA → AnalysisBundle
  → @cs2dak/cohort             跨场聚合 · 身份归并 · 赛季 RR/PRISM
  → @cs2dak/presentation       产品中立 View Model
  → @cs2dak/react              可复用 React 组件
  → apps/dak-studio            DAK Studio（pywebview 桌面壳 / 浏览器）
```

**v3 ZIP 是 Python 与 TypeScript 之间唯一的接缝**——两侧代码不互相 import。v2 包不做运行时兼容；loader 直接失败并提示用 `cs2df` 重导。

| 包 | 职责 |
|---|---|
| `@cs2dak/contract` | Zod schemas + 类型；re-export `cs2-demo-format`（不 fork）。 |
| `@cs2dak/core` | 纯单场分析：标准化、经济、击杀、残局、时间线、热力图、对枪、机制、QA、RR/PRISM 接线。 |
| `@cs2dak/cohort` | 跨场聚合、身份归并、赛季 RR/PRISM 整形。 |
| `@cs2dak/maps` | 地图标定、world→radar 变换、进攻动线、zone 几何、callout 中文映射。 |
| `@cs2dak/presentation` | 产品中立 View Model、标签、workspace 编排。 |
| `@cs2dak/react` | 只消费 presentation 合同的 React 组件。 |
| `@cs2dak/cli` | 把 `core` 接到文件系统的薄 CLI。 |
| `apps/dak-studio` | DAK Studio：本地 demo 工作台（IndexedDB 资料库）。 |
| `apps/demo-lab` | 组件预览与 fixture 验收应用（开发用）。 |
| `python/src/cs2dak` | 围绕 `cs2df` 的 Python 壳：pywebview GUI + Studio 桥 + PyInstaller 打包。无 parser/exporter 逻辑。 |

## 开发

```bash
pnpm install
pnpm dev:studio        # DAK Studio（端口 5178，.dem 导入走本地 uv 环境）
pnpm dev               # demo-lab 组件预览
pnpm test              # 快速 vitest（排除 integration 与 season 验证）
pnpm test:integration  # cohort / spatial / season 真实 ZIP 验证
pnpm test:all          # 全量
pnpm typecheck         # 全工作区 tsc -b
pnpm analyze:sample    # CLI 分析示例 ZIP → fixtures/output/sample/
bash scripts/package.sh  # 打包桌面应用（DMG / exe）
```

Demo 导出直接用 `cs2df` CLI：

```bash
cd python && uv sync --extra gui     # 装 pywebview（GUI/Studio 桥需要）
uv run cs2df export <demo.dem>       # 单场 .dem → v3 ZIP
uv run cs2df export-batch <dir> --out bundle.zip --descriptive
```

## 消费者与边界

DAK 是**产品中立的分析层**。产品负责业务逻辑、身份、持久化与品牌 UI，且不得重建评分 / 聚合 / 展示公式。

- **RivalHub**（云端赛事平台）通过**版本化数据接缝**对接，而非运行时共享源码——分阶段方案见 [docs/integration.md](docs/integration.md)（先数据 API，后选择性包共享）。
- **CS2 Insight Agent** 产出原始 `.dem`，用 `cs2df` 导出 v3 ZIP，再跑 `cs2dak analyze` 做对话式分析。
- **rival-rating** 拥有 RR/PRISM 公式与校准；本 kit 只做信号派生与接线。
- **cs2-demo-format** 拥有 v3 ZIP 合同；contract 包 re-export、绝不 fork。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 数据流、组件职责、v3 ZIP 接缝、评分三层 |
| [docs/module-boundaries.md](docs/module-boundaries.md) | 各模块 owner：做什么、不做什么 |
| [docs/design/studio-redesign.md](docs/design/studio-redesign.md) | Studio 完整模块设计（9 模块） |
| [docs/stability-tiers.md](docs/stability-tiers.md) | 各模块 Stable / Beta / Experimental 成熟度 |
| [docs/integration.md](docs/integration.md) | RivalHub 与 CS2 Insight Agent 集成、分阶段数据接缝 |
| [docs/design/rr-model.md](docs/design/rr-model.md) | RR v1 / 六账户 / PRISM 设计 |
| [docs/roadmap.md](docs/roadmap.md) | 0.5 / 0.6 / 0.7 方向 |
| [docs/release.md](docs/release.md) | 桌面（git tag）与 npm（changesets）发布流程 |

## 许可证

按「生态 / 产品」双轨许可：

- **生态 —— MIT**：全部 `@cs2dak/*` 包、Python 壳（`python/`）、`apps/demo-lab`。与 `cs2-demo-format`、`@rivalhub/rival-rating` 同侧——欢迎任何人基于格式与管道构建自己的工具。
- **产品 —— AGPL-3.0-only**：`apps/dak-studio`（DAK Studio 桌面应用，见 [apps/dak-studio/LICENSE](apps/dak-studio/LICENSE)）。自用与修改自由；分发或以网络服务提供衍生版本时必须开源。

边界纪律与模块规则一致：产品代码（AGPL）可依赖生态包（MIT）；生态包绝不回流引用产品代码。第三方移植与改编出处见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## 致谢

参考但不复制：[CS Demo Manager](https://github.com/akiver/cs-demo-manager)（工作台结构）、[AWPy](https://github.com/pnxenopoulos/awpy)（分析严谨性）、[CS2 2D Demo Viewer](https://github.com/sparkoo/csgo-2d-demo-viewer)（回放 frame model）、[pr1maly](https://github.com/pr1malator/pr1maly)（local-first 思路，非商业 license，仅产品研究）。
