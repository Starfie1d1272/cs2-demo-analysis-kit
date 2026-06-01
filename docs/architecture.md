# Architecture / 架构

## English

This repository is the middle layer between demo exporters and products.

```text
.dem parser/exporter
  -> cs2-demo-format/2.0 package
  -> @cs2dak/core
  -> @rivalhub/rival-rating RR/PRISM
  -> analysis-bundle.json
  -> view-model.json
  -> React preview components / product adapters
```

The repository deliberately separates five concerns:

1. `contract`: shared schemas and types.
2. `core`: deterministic analysis, RR/PRISM adapter, and QA.
3. `maps`: map calibration and spatial transforms.
4. `react`: product-neutral preview components.
5. `cli`: language-neutral integration surface.

RivalHub should call the core or CLI, store only the product-specific subset it needs, and render pages from `DemoViewModel`. CS2 Insight Agent should keep owning `.dem` parsing and emit `cs2-demo-format/2.0`; it can optionally call the CLI to produce analysis artifacts. Future standalone tools can either import the TypeScript packages directly or consume the generated JSON files.

## 简体中文

这个仓库是 demo exporter 和产品之间的中间层。

```text
.dem parser/exporter
  -> cs2-demo-format/2.0 package
  -> @cs2dak/core
  -> @rivalhub/rival-rating RR/PRISM
  -> analysis-bundle.json
  -> view-model.json
  -> React 预览组件 / 产品适配层
```

仓库刻意拆成五层：

1. `contract`：共享 schema 和类型。
2. `core`：确定性的分析、RR/PRISM 适配和 QA。
3. `maps`：地图标定和空间坐标转换。
4. `react`：产品中立的预览组件。
5. `cli`：跨语言集成入口。

RivalHub 应该调用 core 或 CLI，只把产品需要的子集存进自己的数据库，再基于 `DemoViewModel` 渲染页面。CS2 Insight Agent 继续负责 `.dem` 解析并输出 `cs2-demo-format/2.0`，必要时调用 CLI 生成分析产物。未来独立工具可以直接 import TypeScript 包，也可以消费生成的 JSON。
