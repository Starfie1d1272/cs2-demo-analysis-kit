# CS2 Insight Agent Integration / CS2 Insight Agent 集成

## English

CS2 Insight Agent should remain the owner of raw `.dem` parsing. Its RivalHub exporter should be upgraded to emit `cs2-demo-format/2.0`. Once the ZIP is produced, it can optionally call:

```bash
cs2dak analyze match.zip --out analysis-output
```

The generated `analysis-bundle.json` and `view-model.json` can power local previews without duplicating the analysis model in Python.

## 简体中文

CS2 Insight Agent 应继续负责原始 `.dem` 解析。它的 RivalHub exporter 应升级为输出 `cs2-demo-format/2.0`。ZIP 生成后，可以选择调用：

```bash
cs2dak analyze match.zip --out analysis-output
```

生成的 `analysis-bundle.json` 和 `view-model.json` 可以直接驱动本地预览，不需要在 Python 里重复实现全部分析模型。
