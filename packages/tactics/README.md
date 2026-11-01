# @cs2dak/tactics

拥有空间战术事实、对枪与机制信号、雷达覆盖场，以及跨场战术分类和地图角色证据。原始输入使用 `DemoPackage`；击杀、伤害等基础事实复用 Core 的 canonical owner。

## 公开入口

所有能力从 `@cs2dak/tactics` 导出：

- `extractMatchTacticalAndMapIntelligenceFacts`：共用回放解码，生成单场战术与地图事实。
- `buildTacticalClusters`、`buildOpeningPatternClusters`：跨回合或跨场分类。
- `buildPlayerMapRoleEvidence`、`buildTeamMapResponsibilityEvidence`：消费已有地图事实及显式身份映射。
- `buildDuelsSignals`、`derivePlayerMechanics`：对枪与机制信号。
- `buildMatchRadarField`、`aggregateRadarFields`：雷达基础场及其加性聚合。
- `loadSpatialAssets`、`buildOfficialMapControl`：空间资源组合及地图控制信号。

相关 DTO、schema 和算法版本由本包同时导出。评分公式属于 rating，页面投影属于 presentation，文件加载属于 demo-io / map-assets。

```ts
import type { DemoPackage } from "@cs2dak/contract";
import type { CalloutGrid } from "@cs2dak/maps";
import { buildPlayerRoundPerformanceFacts } from "@cs2dak/core";
import { extractMatchTacticalAndMapIntelligenceFacts } from "@cs2dak/tactics";

export function analyzeTactics(pkg: DemoPackage, matchId: string, calloutGrid: CalloutGrid | null) {
  const performanceFacts = buildPlayerRoundPerformanceFacts(pkg);
  return extractMatchTacticalAndMapIntelligenceFacts(pkg, {
    matchId,
    calloutGrid,
    performanceFacts,
  });
}
```

同一轮分析可复用已生成的 `performanceFacts`。空间资源缺失时保留已有降级与覆盖信息；缺失信号保持 `null`。地图角色的玩家归并接受 `MapRoleIdentityMap`，队伍归并由调用方提供 `teamIdentityMap`。

本包依赖 contract、core、maps、map-assets 和 Zod。它提供计算与事实，不访问产品数据库。
