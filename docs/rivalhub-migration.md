# RivalHub → kit 接入迁移指南

> 状态：2026-06-04 收尾。kit 侧能力已就绪（v0.2.1，已发布 npm）；
> RivalHub Phase 1 已完成并合入 `dev`，后续工作是全面 demo 化的数据流与数据库重构。
> 本文给出**精确**的替换映射，并如实标注哪些是干净替换、哪些不能。

## 0. 消费机制（已解决）

RivalHub 部署在 Vercel，要消费 `@cs2dak/*` 必须解决"包怎么装进来"。

**关键事实**：kit 是 `private: true` 的 pnpm monorepo，子包导出原始 TS。
`github:` 依赖**只能拉单包仓库**（现有的 `cs2-demo-format`、`@rivalhub/rival-rating`
就是这种），**无法解析 monorepo 子包**。所以不存在"github 直接依赖"这条路。

采用 npm 包。消费方一律使用 `@cs2dak/*@^0.2.1`；0.2.0 的依赖图无效。
包导出原始 `.ts`，Next.js 需把使用到的包加入 `transpilePackages`。

## 1. 文件级替换映射（symbol 精确对照）

| RivalHub 文件 | 实际用到的 symbol | kit 替换 | 干净度 |
|---|---|---|---|
| `src/lib/demo/weapon-names.ts` | `displayWeaponName`, `weaponFullName` | `displayWeaponName`（`@cs2dak/core`） | ✅ kit 设计上已合并两者为单一真相源；注意 knife/手雷的中文标签 kit 归一为 `"knife"` 等，少量 label 差异 |
| `src/lib/demo/map-calibration.ts` | `getCalibration`, `worldToPixel` | `getMapCalibration`, `worldToRadar`（`@cs2dak/maps`） | ✅ 同 SimpleRadar 公式；**两个一起换**。kit 标定字段是 `posX/posY/radarSize`（RivalHub 是 `offsetX/offsetY`），`worldToRadar` 多返回 `outOfBounds`（超集，兼容） |
| `src/lib/demo/economy-series.ts` | `economyLabelCn` | `economyLabelCn`（`@cs2dak/core`） | ⚠️ **部分**：`economyLabelCn` 可换；但 `buildEconomySeries` / `EconomyRow` / `RoundEconomyType` / `getEconomyBgColor` 在 kit **无等价**（见 §2） |
| `src/lib/demo/to-rr-indicators.ts` | `toRRIndicators` | `computeAccountRatingsV2` | ❌ **不能干净替换**：数据源不同——RivalHub 版吃 **DB 行**（`PlayerStatRow[]`），kit 版吃 **v2 ZIP `DemoPackage`**。见 §2 |

### 组件替换
- RivalHub `EconomyConversionPanel` → kit `EconomyConversionPanel`（`@cs2dak/react`）。
  Props 形状一致（`{ stats, teamName }`），数据用 kit 的 `buildEconomyConversion(points)` 生成。
  **差异**：kit 版用 `dak-` 样式（`@cs2dak/react/theme.css`），不是 RivalHub 的 tailwind `var(--color-*)`，视觉需对齐确认。
- `DemoHeatmap` / `DemoKillFeed` / `DemoEconomyChart` 可逐步换 kit 的 `HeatmapCanvas` / `KillFeed` / `EconomyPanel`（kit 版功能已反超），但样式体系不同，属可视化迁移（🤝 协作者）。

## 2. 不能干净替换的两处（数据源错配）

kit 的纯函数都以 **v2 ZIP 派生的 view model** 为输入；RivalHub 的这两个模块以 **Postgres 行**为输入。所以不是换 import 能解决的：

- **`to-rr-indicators.ts`**：`toRRIndicators(PlayerStatRow[], BlindsRow[], WeaponStat[])` 是 DB→RRIndicators 适配器。kit 的 `computeAccountRatingsV2(DemoPackage)` 从 ZIP 直算。
  - 选项：(a) RivalHub 导入时就用 kit 从 ZIP 算好 RR 存库（推荐，单一真相源）；(b) 保留这个适配器作为 DB 路径。**短期保留**。
- **`economy-series.ts` 的 `buildEconomySeries`**：吃 `EconomyRow`（DB 行），产出带背景色带的 series。kit 的 `buildEconomy(DemoPackage)` 产出 `EconomyPoint[]`。若 RivalHub 改为消费 kit 的 `EconomyPoint`（即从 ZIP 分析而非 DB 拼），可切；否则保留。

> 根因是 issue 里早就立的硬约束："v2 ZIP 是唯一 seam"。RivalHub 真正吃到 kit 的纯函数，
> 前提是它在导入路径上持有 `DemoPackage`/`AnalysisBundle`（来自 `analyzeDemoPackage(zip)`），
> 而不是从自己的 DB schema 重新拼。这决定了是"换 import"还是"改数据流"。

## 3. 后续重构顺序

1. 以 v2 ZIP / `DemoPackage` 为导入真相源，定义分析快照和数据库 schema。
2. 导入时调用 kit 生成单场信号、RR、经济与转化率；停止从 DB 行重复推导。
3. 用 `@cs2dak/cohort` 替换季度聚合，并通过外部 identity map 合并多 Steam 账号。
4. 重构排行榜只消费 demo 派生结果；OCR 仅作为迁移期兼容或明确归档数据。
5. 真实 demo 导入、重算、排行榜与回滚验证通过后，删除旧 DB 适配器。
6. 最后迁移 heatmap/killfeed/economy chart 等可视化组件。
