# @cs2dak/presentation

展示合同与纯展示工具：ViewModel schema、窄 View DTO、标签、格式化、回放时钟、雷达帧合成和报告排版。结果计算由 `@cs2dak/analytics` 和领域包负责。

本包仅依赖 maps 与 Zod。源码、声明和安装依赖不得引入 contract、core、cohort、tournament、analytics、pipeline、rating、format 或 JSZip。

## 已有展示数据

```tsx
import type { MatchWorkspaceModel } from '@cs2dak/presentation';
import { MatchWorkspace } from '@cs2dak/react';
import '@cs2dak/react/theme.css';

export function MatchPage({ model }: { model: MatchWorkspaceModel }) {
  return <MatchWorkspace model={model} />;
}
```

公共根入口导出展示合同和 helper；`@cs2dak/presentation/models` 提供展示 schema/type 入口，`weapons`、`replay-clock`、`economy`、`radar-field` 提供按能力导入的 helper。地图角色等组件使用窄 `*View` 类型，宿主可传结构满足合同的已有数据。schema 校验展示输入的结构，不重新执行事件归因或评分。

## 需要生成展示数据

- 原始 DemoPackage：`@cs2dak/pipeline.analyzeMatchWorkspace(demoPackage)`。
- 已有同场 package、AnalysisBundle 和 canonical performance facts：`@cs2dak/analytics.buildMatchWorkspaceFromAnalysis(pkg, bundle, facts)`。

工作台模型使用 `cs2-demo-analysis-kit/workspace-0.2`，必填 `buyQuality`、`players[].roundSummary` 和 `reportHighlights`，由 analytics 预计算。报告 helper 只排版这些结果。

`buildDemoViewModel(bundle, options?)`、pipeline 和 analytics 的工作台入口均接收 `DemoViewOptions`：

```ts
const options = {
  radarImageUrl: '/my-assets/de_nuke.png',
  lowerRadarImageUrl: '/my-assets/de_nuke_lower.png',
};
```

省略图片 URL 时默认 `null`。图片路径由嵌入产品提供；Studio 的相对路径在其 `src/lib/library.ts` 中组装。

文件加载、缓存、权限和持久化属于宿主。独立记分板使用窄 `ScoreboardTableRow`，`rr` / `accountRR` 可为 `null`；独立回放使用 `WorkspaceReplay` 与 `MapView`。

发布合同为编译后的 ESM 与 declarations；实际 registry 可用版本以发布记录为准。地图基础坐标变换使用 `@cs2dak/maps/calibration`，空间资产独立位于 map-assets，UI 安装闭包不包含它。
