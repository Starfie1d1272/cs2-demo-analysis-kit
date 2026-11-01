# @cs2dak/core

单场 canonical facts 与 QA 的唯一 owner。消费已加载的 DemoPackage，负责事件归因、基础统计、时间线和 frozen Tournament projection。

```ts
import { normalizeDemoPackage, buildPlayerRoundPerformanceFacts } from '@cs2dak/core';

const pkg = normalizeDemoPackage(input);
const facts = buildPlayerRoundPerformanceFacts(pkg);
```

安装依赖闭包为 core、contract、tournament 与 Zod。Tournament 仅提供 DTO/type；Core 不执行它的跨图聚合。

- ZIP 加载由 `@cs2dak/demo-io` 提供。
- 完整分析由 `@cs2dak/pipeline.analyzeDemoPackage` 编排。
- 评分信号提取由 analytics 提供，评分由 rating 执行。
- 空间、交战和战术分析由 tactics 提供。
- 展示模型由 presentation 定义。

`assertPlayerRoundPerformanceFacts` 使用 canonical owner 的私有快照验证 supplied facts；源变化时按 owner 规则校验。它不承担外部鉴权。缺失数据保持 null，事件归因语义由本包统一维护。
