# @cs2dak/cohort

对已经提取的选手行进行跨场归并、RR / PRISM 聚合与结果整形。

```ts
import { buildSeasonCohortFromRows } from '@cs2dak/cohort';

const cohort = buildSeasonCohortFromRows(rows, { identityMap });
```

本包自持 `SeasonCohortFactRow` / `SeasonCohortBundle` 等窄合同，runtime 仅依赖 rating 与 Zod。输入已有行时无需安装 Core、Demo loader、地图资产或战术计算。

从原始 DemoPackage 集合生成 cohort 使用 `@cs2dak/pipeline.buildSeasonCohort`。战术聚类属于 `@cs2dak/tactics`；透明 Tournament 聚合属于 `@cs2dak/tournament`。
