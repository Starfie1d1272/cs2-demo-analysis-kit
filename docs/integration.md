# 产品集成 / Product Integration

本仓库（DAK = cs2-demo-analysis-kit）是**产品中立的 Demo 分析能力层**，被多个产品消费：
RivalHub（云端赛事平台）、CS2 Insight Agent，以及 DAK Studio 自身。

> **边界铁律**：产品负责赛事业务、身份映射、权限、持久化与品牌 UI；
> DAK 负责可复用的单场分析、跨场聚合与产品中立的 presentation 模型。
> 产品**不得**重建评分/聚合/展示公式，只消费 DAK 合同。

---

## 1. 通用消费链路

```text
v3 ZIP（cs2-demo-format/3.x，由 cs2df 导出）
  → @cs2dak/core   analyzeDemoPackage   单场事实 / QA / RR 信号 / AnalysisBundle
  → @cs2dak/cohort buildSeasonCohort     跨场聚合（身份归并由产品传入 identityMap）
  → @cs2dak/presentation                 match / leaderboard / player / team / series 视图模型
  → 产品路由、筛选与品牌 UI
```

赛事/经济统计走窄的 frozen-facts 接缝：DAK 单图 adapter 或已确认的 Evidence
先生成 `TournamentMapFacts`，再由发布后的 `@cs2dak/tournament` 负责跨图 merge；
这条 runtime 不需要安装整个 `@cs2dak/presentation`。

CLI 路径（无需在产品里复刻分析模型）：

```bash
cs2dak analyze match.zip --out analysis-output
# → analysis-bundle.json + view-model.json + qa-report.json
```

---

## 2. DAK ↔ RivalHub：分阶段接缝

> **背景（必读）**：RivalHub v1.30.0 已把 `@cs2dak/core` / `@rivalhub/rival-rating` 从 1.x
> 生产线移除，demo 导入挪到 `release/2.0.0` 分支，生产库 `demo_*` 表保留空置。原因是
> 在 Vercel 上把 DAK monorepo 当裸 TS 源码 `transpilePackages` 全量转译，构建耦合重、
> 一动就拖垮 1.x 外部试点。因此接缝**先走数据、后走代码**，避免重蹈覆辙。

两个项目是**两个产品、一条数据接缝**，不是「把组件塞进 RivalHub」：

```text
RivalHub（云：身份/赛事/名单/权限，真相源）
        │  ① 批量导出赛事数据（API）
        │     season → matches[] 元数据 + roster + identityMap（Steam64→选手→队伍）
        ▼
DAK Studio / @cs2dak/*（本地：深度分析，算力在本地）
        │     用 identityMap 做跨场聚合、对枪/机制、Pattern、报告
        │  ② 回推分析产物（API）
        │     AnalysisBundle / 选手图卡 / 队伍报告（版本化 artifact，带 analysisVersion）
        ▼
RivalHub（发布：公开排行榜 / 嵌入官网 / 赛事页）
```

设计要点：
- **身份的唯一 owner 是 RivalHub**（它持有 Steam→user→team）。DAK cohort 一直需要外部
  `identityMap`，正由 ① 提供——消除了「身份归并放哪边」的纠结。
- **算力留在本地**（符合 local-first + AGPL），**只有协作/索引/发布上云**。
- RivalHub **不在 Vercel 端跑分析**，而是消费 DAK 产出的 JSON artifact。

### 当前接缝：RivalHub 赛事目录与 Demo Evidence V1

当前 #268 接缝仍是数据接缝，不把 RivalHub shell 或 DAK 分析算法搬进另一仓库：

| 端点 | 方向 | 载荷 |
|---|---|---|
| `POST /api/integrations/dak/pairing/start` + `POST .../poll` | DAK Studio ↔ RivalHub | 系统浏览器一次性授权后返回可撤销设备 credential |
| `GET /api/integrations/dak/events` | RivalHub → DAK Studio | season/event、stage、CompetitionEntry、Canonical MatchRoster、match/map/series/veto、revision 与 Demo 状态 |
| `POST /api/integrations/dak/evidence` | DAK Studio → RivalHub | `rivalhub-demo-evidence/1`；服务端硬校验、幂等、不可变 artifact、SQL projection 与 audit |

DAK Studio 复用现有一级 `赛事` / `EventsView`，把在线 RivalHub 事件排在本地事件之前；连接后只手动刷新，断开时保留并标记缓存过期。在线地图上下文直接进入现有 `.dem → cs2-demo-format/3.x → @cs2dak/core` 导入链，支持单个或批量 Demo。身份匹配只接受 Steam64 与 Canonical MatchRoster 的稳定对应，不能用昵称回退；匹配不唯一时交给用户处理。

RivalHub 只拥有 target、赛事/名单身份、revision、算术/交叉校验、持久化、投影与审计；DAK 只拥有 Demo QA、round/KDA/damage/HS/KAST/opening/trade/clutch/utility/weapon 与 conversion 语义。正常提交不需要管理员二次点击；可选 Broadcast/OCR 缺失不阻塞，冲突进入轻量 needs-attention。原始 `.dem` 永不上传，长期 token 不进入 Studio 普通记录存储。

### Phase 2（当前）：共享 `@cs2dak/tournament` build artifact

RivalHub #608 的赛事统计只消费正式发布后的 `@cs2dak/tournament` npm build
artifact（`dist/index.js` + `dist/index.d.ts`），不安装 `@cs2dak/presentation`，
也不把 DAK monorepo 裸 TS 源码接入 Vercel。该 package 只接收已冻结的
`TournamentMapFacts`，所以 RivalHub 保持自己的身份、scope、持久化和 UI owner。

未来如需共享更高层的 presentation View Model，仍须先确认其以**构建产物**发布且
依赖图自洽；两边各自原生渲染，确有必要再嵌**只读卡片组件**，不共享有状态视图。
`release/2.0.0` 的代码集成方向固定为「消费 artifact + 选择性只读组件」，不是
「Vercel 端跑 core」。

> 注意：DAK Studio 是 Tactical Slate 设计语言、RivalHub 是 Tactical Grid，组件视觉不通用；
> 共享的价值在数据合同，不在像素。

---

## 3. CS2 Insight Agent

下游消费方，也是原始 `.dem` 的来源。解析端统一用 `cs2df` 生成 v3 ZIP，
再调用 `cs2dak analyze`，用 `analysis-bundle.json` / `view-model.json` 驱动对话式分析与本地预览。

---

## 4. 已提炼到 DAK 的共享能力（唯一 owner）

| 能力 | DAK owner |
|---|---|
| half-side 胜率 | `@cs2dak/core` `buildTeamSideWinRates` |
| 武器榜 | `@cs2dak/core` weapon highlights + `@cs2dak/cohort` |
| 选手 demo 统计 | `@cs2dak/cohort` + `@cs2dak/presentation` |
| RR 输入派生 | `@cs2dak/core` `deriveRRIndicators` |
| 赛季评分重算 | `@cs2dak/cohort` `buildSeasonCohort` |
| 队伍赛前侦察对比 | `@cs2dak/presentation` `buildTeamComparisonFromFacts` |
| Tournament frozen-fact 跨图 merge | `@cs2dak/tournament` `buildTournamentAnalytics` |
| 地图标定 / world→radar / zone | `@cs2dak/maps` |
| 展示标签（武器/经济/side） | `@cs2dak/presentation` |

> 历史的 symbol 级文件替换映射（RivalHub v1 → kit）已归档至
> `docs/archive/2026-06/rivalhub-migration.md`，仅作历史参考，不再是当前接缝依据。
