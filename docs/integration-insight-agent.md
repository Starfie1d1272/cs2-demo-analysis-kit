# CS2 Insight Agent Integration / CS2 Insight Agent 集成

## English

CS2 Insight Agent is a **downstream consumer** of the exporter pipeline. It is the source of raw `.dem` files but no longer owns parsing — the exporter lives in this repo (`python/cs2_demo_exporter`). Once a `cs2-demo-format/2.0` ZIP is produced (via CLI or GUI), the Agent can call:

```bash
cs2dak analyze match.zip --out analysis-output
```

The generated `analysis-bundle.json` and `view-model.json` can power local previews without duplicating the analysis model in Python.

## 简体中文

CS2 Insight Agent 是导出管道的**下游消费方**。它是原始 `.dem` 的来源，但不再拥有解析端——exporter 在本仓库（`python/cs2_demo_exporter`）。生成 `cs2-demo-format/2.0` ZIP 后（通过 CLI 或 GUI），Agent 可以调用：

```bash
cs2dak analyze match.zip --out analysis-output
```

生成的 `analysis-bundle.json` 和 `view-model.json` 可以直接驱动本地预览，不需要在 Python 里重复实现全部分析模型。
