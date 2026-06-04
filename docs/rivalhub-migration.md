# RivalHub → kit 接入迁移指南

> 状态：2026-06-04 夜间分析。kit 侧能力已就绪（v0.2.1，已发布 npm）；RivalHub 侧尚未开始。
> 本文给出**精确**的替换映射，并如实标注哪些是干净替换、哪些不能。

## 0. 前置阻塞：消费机制（必须先决策）

RivalHub 部署在 Vercel，要消费 `@cs2dak/*` 必须解决"包怎么装进来"。

**关键事实**：kit 是 `private: true` 的 pnpm monorepo，子包导出原始 TS。
`github:` 依赖**只能拉单包仓库**（现有的 `cs2-demo-format`、`@rivalhub/rival-rating`
就是这种），**无法解析 monorepo 子包**。所以不存在"github 直接依赖"这条路。

三个方案：

| 方案 | 做法 | Vercel 可用 | 成本 | 推荐 |
|---|---|---|---|---|
| **A 发 npm** | `@cs2dak/*` 发到 npm，RivalHub 加依赖 + `transpilePackages` | ✅ | 需 npm scope；**前置**：`cs2-demo-format` 也要发 npm（contract 经 `github:` 依赖它，否则"干净安装"破功） | ✅ |
| B git submodule | kit 作为 submodule，RivalHub 的 `pnpm-workspace` 纳入 `kit/packages/*` | ✅（Vercel 支持 submodule checkout） | 无需 npm，但工作流更重 | 备选 |
| C 拆仓 | 每个 `@cs2dak/*` 拆独立 github 仓 | ✅（符合现有模式） | 仓库爆炸 | ✗ |

> ⚠️ 这是**对外/账号相关**操作（npm 发布、建仓），需仓库 owner 执行，不能由 agent 夜间代办。
> 选定 A 后，发布顺序：`cs2-demo-format` → `@cs2dak/contract` → `core`/`maps` → `react`。
> 包都导出原始 `.ts`，消费方（Next.js）用 `transpilePackages: ["@cs2dak/core", ...]` 即可。

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

## 3. 建议的接入顺序

1. **定消费机制**（§0，方案 A）→ 发 `cs2-demo-format` + `@cs2dak/*` 到 npm。
2. RivalHub `package.json` 加依赖 + `next.config.ts` `transpilePackages` 追加 `@cs2dak/*`。
3. **先换无数据源问题的**：`weapon-names.ts`、`map-calibration.ts` 删除 → import kit。
4. `economyLabelCn` 换 kit；`EconomyConversionPanel` 换 kit 版（确认样式）。
5. **数据流决策**（§2）：决定 RR / economy-series 是切 ZIP 路径还是保留 DB 适配器。
6. 可视化组件（heatmap/killfeed/economy chart）逐步迁移（🤝 协作者，样式对齐）。
