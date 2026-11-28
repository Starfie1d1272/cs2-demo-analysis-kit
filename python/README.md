# cs2dak Python Shell

[English](#english) · [中文](#中文)

---

## English

`cs2dak` no longer contains a `.dem` parser or exporter. Raw demo export is owned by
the native Rust [`cs2df` v5.0.0](https://github.com/Starfie1d1272/cs2-demo-format/releases/tag/v5.0.0)
binary (`cs2-demo-format/3.0` & `3.1`).

This package is now a thin desktop shell:

- `cs2dak-studio`: DAK Studio desktop bridge and bundled web assets
- `cs2dak version`: print the package version (also available without a subcommand)

```text
.dem -> cs2df (v5.0.0) -> cs2-demo-format/3.0 & 3.1 ZIP -> @cs2dak/* TypeScript analysis
```

### Development

```bash
cd python
uv sync --locked --extra dev --extra gui
uv run pytest
uv run cs2dak version
```

The test setup above includes pywebview for native bridge tests. For GUI-only development:

```bash
uv sync --locked --extra gui
```

`uv run cs2dak version` prints the package version. The no-argument
`uv run cs2dak` shortcut remains supported; `uv run cs2dak --help` lists the
`version` command.

### Exporting demos

Use the native `cs2df` v5.0.0 CLI directly:

```bash
cs2df export demos/example.dem -o exports/example.zip
cs2df export-batch demos/ --descriptive
cs2df validate --strict exports/example.zip
```

DAK Studio and the RivalHub uploader invoke the native `cs2df` binary via `cs2dak.cs2df_runner`
(bundled in packaged releases; set `CS2DF_BIN` or add `cs2df` to `PATH` in dev). The exported
ZIP is the only Python/TypeScript seam.

### Packaging

```bash
cd ..  # from python/ to the workspace root
bash scripts/package.sh
```

The PyInstaller spec bundles the Python shell plus DAK Studio frontend assets.

---

## 中文

`cs2dak` 不再包含 `.dem` parser 或 exporter。原始 demo 导出由原生 Rust 二进制
[`cs2df` v5.0.0](https://github.com/Starfie1d1272/cs2-demo-format/releases/tag/v5.0.0)
负责（产出 `cs2-demo-format/3.1`，DAK 同时兼容读取 `3.0` 与 `3.1`）。

本包现在只是桌面壳层：

- `cs2dak-studio`：DAK Studio 桌面桥和打包后的前端资产
- `cs2dak version`：打印包版本（也可不带子命令调用）

```text
.dem -> cs2df (v5.0.0) -> cs2-demo-format/3.0 & 3.1 ZIP -> @cs2dak/* TypeScript 分析
```

### 开发

```bash
cd python
uv sync --locked --extra dev --extra gui
uv run pytest
uv run cs2dak version
```

上面的测试环境包含原生桥测试需要的 pywebview。仅开发 GUI 时：

```bash
uv sync --locked --extra gui
```

`uv run cs2dak version` 打印包版本；无参数的 `uv run cs2dak` 快捷用法继续支持。
`uv run cs2dak --help` 列出 `version` 命令。

### 导出 demo

直接使用原生 `cs2df` v5.0.0 CLI：

```bash
cs2df export demos/example.dem -o exports/example.zip
cs2df export-batch demos/ --descriptive
cs2df validate --strict exports/example.zip
```

DAK Studio 与 RivalHub 上传器通过 `cs2dak.cs2df_runner` 调用原生 `cs2df` 二进制（桌面安装包已内置；开发环境可通过 `CS2DF_BIN` 或 `PATH` 指定）。导出的 ZIP 是 Python/TypeScript 的唯一 seam。

### 打包

```bash
cd ..  # from python/ to the workspace root
bash scripts/package.sh
```

PyInstaller spec 会把 Python 壳层和 DAK Studio 前端资产一起打包。
