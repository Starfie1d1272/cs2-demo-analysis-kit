# cs2dak Python Shell

[English](#english) · [中文](#中文)

---

## English

`cs2dak` no longer contains a `.dem` parser or exporter. Raw demo export is owned by
[`cs2df`](https://pypi.org/project/cs2df/), the reference exporter for
`cs2-demo-format` v3.

This package is now a thin desktop shell:

- `cs2dak-studio`: DAK Studio desktop bridge and bundled web assets
- `cs2dak version`: package-version command by the existing CLI convention (see the known compatibility bug below)

```text
.dem -> cs2df -> cs2-demo-format/3.x ZIP -> @cs2dak/* TypeScript analysis
```

### Development

```bash
cd python
uv sync --locked --extra dev --extra gui
uv run pytest
uv run cs2dak
```

The test setup above includes pywebview for native bridge tests. For GUI-only development:

```bash
uv sync --locked --extra gui
```

Known compatibility bug: `src/cs2dak/cli.py` documents `cs2dak version` and
registers a `version` command, but the current single-command entry point rejects
`uv run cs2dak version`. This disagrees with the existing CLI convention. Until
a separate bug fix restores compatibility, temporarily use `uv run cs2dak`
without a subcommand to print the version. This documentation change does not
modify the implementation.

### Exporting demos

Use `cs2df` directly:

```bash
uv run cs2df export demos/example.dem -o exports/example.zip
uv run cs2df export-batch demos/ --out exports/bundle.zip --descriptive
uv run cs2df validate exports/example.zip
```

DAK Studio calls the same `cs2df` package internally. The
exported ZIP is the only Python/TypeScript seam.

### Packaging

```bash
cd ..  # from python/ to the workspace root
bash scripts/package.sh
```

The PyInstaller spec bundles the Python shell plus DAK Studio frontend assets.

---

## 中文

`cs2dak` 不再包含 `.dem` parser 或 exporter。原始 demo 导出由
[`cs2df`](https://pypi.org/project/cs2df/) 负责，它是 `cs2-demo-format` v3 的参考导出器。

本包现在只是桌面壳层：

- `cs2dak-studio`：DAK Studio 桌面桥和打包后的前端资产
- `cs2dak version`：既有 CLI 约定中的包版本命令（见下方已知兼容缺陷）

```text
.dem -> cs2df -> cs2-demo-format/3.x ZIP -> @cs2dak/* TypeScript 分析
```

### 开发

```bash
cd python
uv sync --locked --extra dev --extra gui
uv run pytest
uv run cs2dak
```

上面的测试环境包含原生桥测试需要的 pywebview。仅开发 GUI 时：

```bash
uv sync --locked --extra gui
```

已知兼容缺陷：`src/cs2dak/cli.py` 声明 `cs2dak version` 并注册 `version` 命令，
但当前单命令入口拒绝 `uv run cs2dak version`，与既有 CLI 约定不一致。
兼容修复另列为 bug；修复前暂用不带子命令的 `uv run cs2dak` 打印版本。
本次文档修正不修改实现。

### 导出 demo

直接使用 `cs2df`：

```bash
uv run cs2df export demos/example.dem -o exports/example.zip
uv run cs2df export-batch demos/ --out exports/bundle.zip --descriptive
uv run cs2df validate exports/example.zip
```

DAK Studio 内部也调用同一个 `cs2df` 包。导出的 ZIP 是 Python/TypeScript 的唯一 seam。

### 打包

```bash
cd ..  # from python/ to the workspace root
bash scripts/package.sh
```

PyInstaller spec 会把 Python 壳层和 DAK Studio 前端资产一起打包。
