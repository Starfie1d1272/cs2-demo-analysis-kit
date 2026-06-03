# cs2-demo-exporter

[English](#english) · [中文](#中文)

---

## English

Parse CS2 `.dem` files into [`cs2-demo-format`](https://github.com/Starfie1d1272/cs2-demo-format) **v2** ZIP exports.

This is an independent **producer** for the `cs2-demo-format` contract. The ZIP
file is the universal interface — any consumer (e.g. RivalHub) ingests the ZIP
without depending on this tool or its language.

```
.dem ──parser──▶ RawDemo ──builder──▶ v2 rows ──package──▶ export.zip ──validate──▶ ✓
     (demoparser2)          (rounds/economy/stats)      (manifest + 13 files)   (JSON Schema)
```

### Layout

| Module | Responsibility |
|---|---|
| `parser.py` | Only place that touches `demoparser2`; `.dem` → neutral `RawDemo` |
| `rounds.py` | Formal round model + `t/ct` side + `teamA/teamB` normalization |
| `economy.py` | `economyType` classification + `player-economies` rows |
| `builder.py` | `RawDemo` → `ExportBundle` (orchestrates per-file row builders) |
| `stats.py` | `player-stats` aggregation (capped damage / ADR / KAST / utility) |
| `package.py` | `ExportBundle` → ZIP; owns logical-name → filename map; rejects NaN/Inf |
| `validate.py` | Check a ZIP against `cs2-demo-format/spec/*.schema.json` |
| `cli.py` | `export` / `export-batch` / `validate` / `gui` commands (thin shell) |
| `gui/` | pywebview desktop frontend (drag-drop `.dem` → ZIP); another frontend on the same core |

### Desktop app

A download-and-run desktop build (the main goal): native window via **pywebview**
(HTML/CSS/JS frontend, Python backend), bundled with **PyInstaller** so end users
need no Python. The frontend mirrors **RivalHub's design system** (tokens from
`src/app/globals.css`: near-black tactical surface, 32px hairline grid, sharp
2–3px radii, `#ff6b1a` accent, wide-tracked uppercase labels).

`.github/workflows/build.yml` builds and attaches to a GitHub Release:
- **Windows → `cs2-demo-exporter.exe`** (onefile, double-click)
- **macOS → `cs2-demo-exporter.dmg`** (from the `.app` bundle)

```bash
pip install -e ".[gui]" && cs2-demo-exporter gui   # run from source
pyinstaller packaging/cs2-demo-exporter.spec        # bundle (needs [build] extra)
```

> **Unsigned builds.** macOS: right-click → Open (or `xattr -dr com.apple.quarantine
> cs2-demo-exporter.app`). Windows: SmartScreen → "More info" → "Run anyway".
> Add code-signing + notarization later for friction-free downloads.

### Install (dev)

```bash
cd cs2-demo-exporter
uv venv && source .venv/bin/activate    # or python -m venv .venv
uv pip install -e ".[dev]"
pytest
```

### Usage (target)

```bash
cs2-demo-exporter export demos/*.dem --out exports/
cs2-demo-exporter export-batch demos/ --out rivalhub-exports.zip
cs2-demo-exporter export-batch demos/ --out rivalhub-exports.zip --workers 12
cs2-demo-exporter validate exports/*.zip --spec-dir ../cs2-demo-format/spec
```

### Batch Export Benchmark

These numbers measure the full exporter workflow: parse `.dem`, build the
`cs2-demo-format/2.0` rows, write per-demo ZIPs, and package the batch report.
They are not directly comparable to narrow demoparser2 micro-benchmarks such as
"find all player death coordinates".

| Machine | Workers | Demos | Input | Result | Wall time | Throughput |
|---|---:|---:|---:|---|---:|---:|
| MacBook Air M5, fanless | 4 | 55 | 20.09 GB | 55 ok, 0 failed | 419.4s | 47.9 MB/s |
| Ryzen 7 7800X3D desktop | 4 | 55 | 20.09 GB | 55 ok, 0 failed | 166.3s | 120.8 MB/s |
| Ryzen 7 7800X3D desktop | 8 | 55 | 20.09 GB | 55 ok, 0 failed | 165.3s | 121.5 MB/s |
| Ryzen 7 7800X3D desktop | 12 | 55 | 20.09 GB | 55 ok, 0 failed | 154.6s | 129.9 MB/s |
| Ryzen 7 7800X3D desktop | 16 | 55 | 20.09 GB | 55 ok, 0 failed | 155.4s | 129.2 MB/s |

`--workers` controls the number of parallel exporter processes. For sustained
runs, omitting it uses the logical CPU count visible to Python. Pass an explicit
value for reproducible benchmarks or to stay conservative on thermally
constrained laptops. On the 7800X3D sample, 12 workers was the best point in
this four-run curve; 16 workers did not improve throughput because per-process
speed dropped under heavier CPU/cache/I/O contention.

### Roadmap

- [x] `parser.py` — wire up demoparser2 raw extraction (events + ticks)
- [x] `rounds.py` — formal round model, side / team normalization, warmup drop
- [x] `builder.py` — implement the 13 per-file row builders
- [x] `economy.py` — port economyType thresholds
- [x] `stats.py` — capped damage / ADR / KAST / utility aggregation
- [x] `validate.py` — jsonschema checks against `cs2-demo-format/spec`
- [x] `export-batch` — parallel parsing + per-demo report
- [ ] golden-fixture tests (tiny `.dem` → build → validate)
- [x] GUI polish — per-file progress, embedded demo-lab viewer, batch export
- [ ] code signing + notarization (macOS / Windows) for friction-free downloads

---

## 中文

把 CS2 的 `.dem` 文件解析成 [`cs2-demo-format`](https://github.com/Starfie1d1272/cs2-demo-format) **v2** ZIP 导出包。

这是 `cs2-demo-format` 契约的一个独立 **producer（生产者）**。**ZIP 文件本身就是通用接口** —— 任何 consumer（消费者，例如 RivalHub）直接吃 ZIP，不依赖本工具，也不在意它用什么语言写。

```
.dem ──parser──▶ RawDemo ──builder──▶ v2 行数据 ──package──▶ export.zip ──validate──▶ ✓
     (demoparser2)          (回合/经济/统计)        (manifest + 13 个文件)   (JSON Schema)
```

### 模块职责

| 模块 | 职责 |
|---|---|
| `parser.py` | 唯一接触 `demoparser2` 的层；`.dem` → 中立的 `RawDemo` |
| `rounds.py` | 正式回合模型 + `t/ct` 阵营 + `teamA/teamB` 归一化 |
| `economy.py` | `economyType` 分类 + `player-economies` 行 |
| `builder.py` | `RawDemo` → `ExportBundle`（编排各文件的 row builder） |
| `stats.py` | `player-stats` 聚合（capped 伤害 / ADR / KAST / 道具伤害） |
| `package.py` | `ExportBundle` → ZIP；负责逻辑名→文件名映射；拒绝 NaN/Inf |
| `validate.py` | 对照 `cs2-demo-format/spec/*.schema.json` 校验 ZIP |
| `cli.py` | `export` / `export-batch` / `validate` / `gui` 命令（薄壳） |
| `gui/` | pywebview 桌面前端（拖入 `.dem` → ZIP）；与 CLI 共用同一核心库 |

### 桌面 App（核心目标）

「下载即用」的桌面版：用 **pywebview** 做原生窗口（前端 HTML/CSS/JS，后端 Python），
再用 **PyInstaller** 打包，**用户无需安装 Python**。前端对齐 **RivalHub 设计系统**
（取自 `src/app/globals.css`：近黑战术底色 + 32px 网格细线、锐利 2–3px 圆角、
`#ff6b1a` 强调色、大写宽字距标签）。

`.github/workflows/build.yml` 会构建并挂到 GitHub Release：
- **Windows → `cs2-demo-exporter.exe`**（onefile，双击即用）
- **macOS → `cs2-demo-exporter.dmg`**（由 `.app` 生成）

```bash
pip install -e ".[gui]" && cs2-demo-exporter gui   # 源码运行
pyinstaller packaging/cs2-demo-exporter.spec        # 打包（需 [build] 依赖）
```

> **未签名产物。** macOS：右键 → 打开（或 `xattr -dr com.apple.quarantine
> cs2-demo-exporter.app`）；Windows：SmartScreen → 「更多信息」→「仍要运行」。
> 之后再配代码签名 + 公证可实现零摩擦下载。

### 安装（开发）

```bash
cd cs2-demo-exporter
uv venv && source .venv/bin/activate    # 或 python -m venv .venv
uv pip install -e ".[dev]"
pytest
```

### 用法（目标形态）

```bash
cs2-demo-exporter export demos/*.dem --out exports/
cs2-demo-exporter export-batch demos/ --out rivalhub-exports.zip
cs2-demo-exporter export-batch demos/ --out rivalhub-exports.zip --workers 12
cs2-demo-exporter validate exports/*.zip --spec-dir ../cs2-demo-format/spec
```

### 批量导出 Benchmark

这里记录的是完整 exporter 工作流：解析 `.dem`、构建
`cs2-demo-format/2.0` 行数据、写出每场 demo 的 ZIP，并打包批量报告。它不等同于
demoparser2 那种“只找所有玩家死亡坐标”的窄任务 micro-benchmark。

| 机器 | Workers | Demos | 输入大小 | 结果 | 总耗时 | 吞吐 |
|---|---:|---:|---:|---|---:|---:|
| MacBook Air M5，无风扇 | 4 | 55 | 20.09 GB | 55 ok, 0 failed | 419.4s | 47.9 MB/s |
| Ryzen 7 7800X3D 台式机 | 4 | 55 | 20.09 GB | 55 ok, 0 failed | 166.3s | 120.8 MB/s |
| Ryzen 7 7800X3D 台式机 | 8 | 55 | 20.09 GB | 55 ok, 0 failed | 165.3s | 121.5 MB/s |
| Ryzen 7 7800X3D 台式机 | 12 | 55 | 20.09 GB | 55 ok, 0 failed | 154.6s | 129.9 MB/s |
| Ryzen 7 7800X3D 台式机 | 16 | 55 | 20.09 GB | 55 ok, 0 failed | 155.4s | 129.2 MB/s |

`--workers` 控制并行 exporter 进程数。长时间跑批时，无风扇或散热受限的笔记本建议保守；
不传时默认使用 Python 能看到的逻辑 CPU 数；需要可复现 benchmark，或想给散热受限机器降负载时，
再显式传入固定值。这组 7800X3D 曲线里，12 workers 是最佳点；16 workers 没有继续提升，
因为更高并发下单进程速度被 CPU/cache/I/O 竞争压低了。

### 路线图

- [x] `parser.py` —— 接通 demoparser2 原始抽取（events + ticks）
- [x] `rounds.py` —— 正式回合模型、阵营/队伍归一、剔除热身
- [x] `builder.py` —— 实现 13 个 per-file row builder
- [x] `economy.py` —— 移植 economyType 阈值
- [x] `stats.py` —— capped 伤害 / ADR / KAST / 道具伤害聚合
- [x] `validate.py` —— 对照 `cs2-demo-format/spec` 做 jsonschema 校验
- [x] `export-batch` —— 并行解析 + 单 demo 报告
- [ ] golden fixture 测试（小 `.dem` → 构建 → 校验）
- [x] GUI 打磨 — 逐文件进度、嵌入式 demo-lab 查看器、批量导出
- [ ] 代码签名 + 公证（macOS / Windows），实现真·零摩擦下载
