# cs2dak Python Shell

[English](#english) · [中文](#中文)

---

## English

`cs2dak` no longer contains a `.dem` parser or exporter. Raw demo export is owned by
[`cs2df`](https://pypi.org/project/cs2df/), the reference exporter for
`cs2-demo-format` v3.

This package is now a thin desktop shell:

- `cs2dak gui`: standalone pywebview exporter UI backed by `cs2df`
- `cs2dak-studio`: DAK Studio desktop bridge and bundled web assets
- `cs2dak version`: package version

```text
.dem -> cs2df -> cs2-demo-format/3.x ZIP -> @cs2dak/* TypeScript analysis
```

### Development

```bash
cd python
uv sync --extra dev
uv run pytest
uv run cs2dak version
uv run cs2dak gui
```

GUI development additionally needs:

```bash
uv sync --extra gui
```

### Exporting demos

Use `cs2df` directly:

```bash
uv run cs2df export demos/example.dem -o exports/example.zip
uv run cs2df export-batch demos/ --out exports/bundle.zip --descriptive
uv run cs2df validate exports/example.zip
```

The desktop GUI and DAK Studio call the same `cs2df` package internally. The
exported ZIP is the only Python/TypeScript seam.

### Packaging

```bash
bash scripts/package.sh
```

The PyInstaller specs bundle the Python shell plus DAK Studio/static GUI assets.

---

## 中文

`cs2dak` 不再包含 `.dem` parser 或 exporter。原始 demo 导出由
[`cs2df`](https://pypi.org/project/cs2df/) 负责，它是 `cs2-demo-format` v3 的参考导出器。

本包现在只是桌面壳层：

- `cs2dak gui`：由 `cs2df` 驱动的 pywebview 导出器 UI
- `cs2dak-studio`：DAK Studio 桌面桥和打包后的前端资产
- `cs2dak version`：包版本

```text
.dem -> cs2df -> cs2-demo-format/3.x ZIP -> @cs2dak/* TypeScript 分析
```

### 开发

```bash
cd python
uv sync --extra dev
uv run pytest
uv run cs2dak version
uv run cs2dak gui
```

GUI 开发还需要：

```bash
uv sync --extra gui
```

### 导出 demo

直接使用 `cs2df`：

```bash
uv run cs2df export demos/example.dem -o exports/example.zip
uv run cs2df export-batch demos/ --out exports/bundle.zip --descriptive
uv run cs2df validate exports/example.zip
```

桌面 GUI 和 DAK Studio 内部也调用同一个 `cs2df` 包。导出的 ZIP 是 Python/TypeScript 的唯一 seam。

### 打包

```bash
bash scripts/package.sh
```

PyInstaller spec 会把 Python 壳层和 DAK Studio/static GUI 资产一起打包。
