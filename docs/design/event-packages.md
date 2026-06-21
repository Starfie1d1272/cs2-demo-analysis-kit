# 赛事资产库、赛事包导入与制作（Event Packages）

> 实施状态（2026-06-21）：`event-package/1.0` 合同、Event/Series 导入、在线资产下载、
> 原生低内存逐图导入/生成、可取消 checkpoint，以及 round robin / Swiss /
> single-elim / double-elim bracket 展示已落地。
> Cologne Major 已建立空赛事骨架，需在赛程结束后补真实队伍、系列赛、BP 与 v3 ZIP。

> 0.7.0 方向设计稿。**只定义合同与落点，不在本稿实现平台**。
> 复用已落地的 R2 资产层 + manifest + sha256 校验 + `download_with_fallback`
> （见 [`auto-update.md`](auto-update.md)）。

## 1. 为什么

两个现实诉求，共用同一套 R2 资产分发地基：

1. **赛事资产库**：把"经 `cs2-demo-format` 解析后的结构化数据包 / analysis bundle"
   托管到 R2，按需下载导入 Library。**不托管原始 `.dem`**（体积/版权/隐私），
   只托管已脱敏的 v3 ZIP 或更轻的 analysis bundle。例如内置 Cologne Major 示例、
   职业局样本，让新用户开箱即有可分析的数据。
2. **赛事框架导入**：用户希望一次性导入 1–5 个 demo 作为一场 BO1/BO3/BO5 比赛，
   填入 BP，并把这场比赛挂进一个**赛事（Event）框架**。而这套 BP / 赛程 / 队伍 /
   选手元数据，用户本地 59 场 NJU 联赛已经完整存在于 **RivalHub** 里——
   能直接桥接导出就不必手工重录。

### 免费与捐赠边界（硬约束）

- 所有**本地分析、高级战术分析功能永久免费**，不设 `if(isPro)` 门槛。
- 捐赠只用于支持作者维护、**存储与带宽成本**，**不是某个职业赛事数据包的购买门槛**。
- 赛事资产包公开可下载；捐赠是赞助而非解锁。商业化判断遵循
  [`roadmap.md`](../roadmap.md) §商业验证（落在 RivalHub 云层，而非本地）。

## 2. 两个能力的边界

| 能力 | 输入 | 产物 | 谁来做 |
|---|---|---|---|
| **A. 赛事资产库** | 已解析的 v3 ZIP / analysis bundle | R2 上的版本化资产 + `events-manifest` | 发布侧（CI / 作者手动）+ DAK 按需下载导入 |
| **B. 赛事框架导入** | 1–5 个本地 demo + BP/赛程元数据 | DAK 内的 Event → Series → Map 结构 | DAK 导入模块（本地） |

两者交汇点：B 的"BP/赛程元数据"可以来自 **RivalHub 导出**（见 §4），
也可以手工录入（现状）；A 的资产包未来可携带一份 event-package 清单，
下载即同时落地"数据 + 赛事框架"。

## 3. 数据模型现状

### DAK 侧（已存在）

- `StudioSeriesRecord`（[`apps/dak-studio/src/lib/series.ts`](../../apps/dak-studio/src/lib/series.ts)）：
  `{ id, name, entryIds[], format: bo1|bo3|bo5, teamAName, teamBName, veto, ... }`
  ——一个 series = 一组 demo entry + 一份 BP。
- `SeriesVeto` 合同（[`packages/contract/src/veto.ts`](../../packages/contract/src/veto.ts)
  `cs2-demo-analysis-kit/series-veto-0.1`）：`format / teamA/BName / mapPool /
  maps{picked,banned,decider} / sideChoices / steps[]`。
- `suggestSeriesGroups` 已能按"日期 + 队伍对"自动把 demo 聚成 BO1/3/5；
  BP 经 `vetoSkeleton` 骨架手工录入，demo 按图名经 `sortEntriesByVeto` 配对。
- **缺口**：Series 目前是顶层分组，**没有"赛事/赛季（Event）"这一层**。

### RivalHub 侧（已存在，Postgres + Drizzle）

| 表 | 关键字段 | 对应 DAK |
|---|---|---|
| `seasons` | `slug / name / kind / stagePlan` | **Event（新层）** |
| `matches` | `format(bo1/3/5) / teamAId / teamBId / stage / round / scoreA/B / status` | **Series** |
| `match_maps` | `mapOrder / mapName / pickedByTeamId / teamAStartSide / scoreA/B` | Series 内 map + 配对依据 |
| `match_veto_steps` | `stepOrder / actionType / mapName / teamId / side` | `SeriesVetoStep`（**几乎 1:1**） |
| `match_rosters` / `match_roster_players` | 出场阵容 | Series 阵容元数据 |
| `teams` | 队名 / 标识 | `teamAName / teamBName` + 身份归并 |

**关键事实**：RivalHub **不持有 demo**（无 `.dem` 关联字段）。demo 在 DAK 这侧。
桥接方向是 **元数据 RivalHub → DAK**，DAK 再把本地 demo 配进去。

## 4. RivalHub 桥接：文件导出 vs API

| 方案 | 可行性 | 评价 |
|---|---|---|
| **A. 文件导出（推荐 v1）** | RivalHub 加一个 server action「导出赛事包」→ 下载 `event-package/1.0` JSON | ✅ RivalHub 目前**只有 cron API**（`src/app/api/cron/*`），无公共读接口；文件导出无需新建鉴权端点。DAK 本地优先 / 离线友好，文件导入契合其模型。合同几乎 1:1 |
| **B. HTTP API 导出** | DAK 调 RivalHub 鉴权只读端点拉取 | ⚠️ 需在 RivalHub 新建鉴权 + 公开读端点，DAK 需联网 + 凭证。重，且 RivalHub 是多租户托管应用。留作 v2 可选 |

**结论**：v1 走**文件导出**。RivalHub 侧新增一个赛季/比赛级别的导出按钮，
产出版本化 JSON；DAK 侧新增导入模块读它。API 路径等 RivalHub 暴露只读端点后再做。

### RivalHub 侧改动（在 RivalHub 仓库实现，本仓库只定义合同）

- 一个 server action：`exportEventPackage(seasonId | matchId[])` →
  组装 `seasons + matches + match_maps + match_veto_steps + match_rosters + teams`
  → 序列化为 `event-package/1.0` → 触发浏览器下载。
- 队伍/选手用稳定显示名导出（DAK 侧再走身份归并 `displayTeamName`）。

## 5. `event-package/1.0` 合同

合同由 `packages/contract/src/event-package.ts` 的 Zod schema 持有。阶段类型与 RivalHub
当前模型对齐：`round_robin | swiss | single_elim | double_elim | gsl_group`；Series 可携带
轮次、胜/败者组节点、赛前 Swiss 战绩、赛程、比分、BP 和地图资源线索。

```jsonc
{
  "version": "cs2-demo-analysis-kit/event-package-1.0",
  "source": "rivalhub",                 // rivalhub | manual | r2
  "exportedAt": "2026-06-16T08:00:00Z",
  "event": {
    "slug": "nju-rivals-2026",
    "name": "NJU Rivals 2026",
    "kind": "league",                   // 自由文本，仅展示/筛选
    "stages": [{ "key": "swiss", "name": "瑞士轮" }]
  },
  "teams": [
    { "key": "team-a-uuid", "name": "Team A", "players": [{ "name": "p1" }] }
  ],
  "series": [
    {
      "key": "match-uuid",
      "stage": "swiss",
      "round": 1,
      "format": "bo3",
      "teamAKey": "team-a-uuid",
      "teamBKey": "team-b-uuid",
      "scoreA": 2, "scoreB": 1,
      "scheduledAt": "2026-05-01T12:00:00Z",
      "veto": { /* 复用 series-veto-0.1 的 steps/maps/sideChoices */ },
      "maps": [
        {
          "order": 1, "mapName": "de_inferno",
          "pickedBy": "teamA", "teamAStartSide": "ct",
          "scoreA": 13, "scoreB": 9,
          // demo 配对线索（可选）：用于把本地 demo 自动挂到这张图
          "demoHint": { "fileName": null, "sha256": null }
        }
      ]
    }
  ]
}
```

要点：

- `veto` 直接复用 `series-veto-0.1`，导入即可填进 `StudioSeriesRecord.veto`。
- `demoHint` 可空：RivalHub 不持有 demo，所以多数情况靠 DAK 侧**按图名 + 顺序**
  自动配对（已有 `sortEntriesByVeto` / `suggestSeriesGroups` 逻辑可复用），
  配不上的留给用户手动指派。
- 合同**只新增、不 fork**：`teams/series/veto` 引用现有 contract 类型。

## 6. DAK 侧落点

1. **Event 层（Series 之上的新分组）**：新增 `StudioEventRecord`
   `{ id, slug, name, kind, stages[], seriesIds[] }`，与现有 `StudioSeriesRecord`
   建立父子关系。Series 仍可独立存在（无 Event 的散场 demo 不受影响）。
2. **导入模块**：解析 `event-package/1.0` → 建 Event + 各 Series（含 BP）→
   对每个 series 调用现有配对逻辑把本地 demo entry 挂上；缺图的 series 标记
   "待补 demo"。**不**自动下载 demo（RivalHub 无 demo）。
3. **一次性导入 1–5 demo 作为一场比赛**（独立于 RivalHub 也能用）：
   选 1–5 个已导入 entry → 选 format → 录/导入 BP → 落成一个 Series，
   可选挂到某个 Event。这是 §2.B 的最小闭环，**不依赖 RivalHub**。
4. **facts 投影**：Event/Series 是组织层，不改 facts 抽取；
   现有 `extractMatchFacts` / `FactsStore` 不动，视图按 Event→Series 读投影。

## 7. 与 R2 资产层的关系（§2.A）

复用自动更新已建的 R2 + manifest + sha256 基建：

- 资产路径约定（与 [`auto-update.md`](auto-update.md) 同 bucket `cs2dak-assets`）：
  - 资产清单：`https://dakupdate.starfie1d.top/events/manifest.json`
  - 单个赛事包：`https://dakupdate.starfie1d.top/events/<slug>/<file>.zip`
- 清单 `events-manifest`（每包 `slug / name / size / sha256 / urls[]`）；Studio 按 `urls[]`
  顺序下载并强校验 sha256。R2 域名必须允许 Studio WebView 跨域读取。
- 资产包内容 = 已脱敏 v3 ZIP（或 analysis bundle）+ 可选 `event-package/1.0`，
  下载即同时落"可分析数据 + 赛事框架"。
- 首发候选：**Cologne Major 内置示例**、若干职业局样本。

构建与上传：

```bash
pnpm events:build fixtures/events/cologne-major-2026 dist/events
# 或直接登记 Studio 制作器生成的 ZIP：
pnpm events:build ~/Downloads/cologne-major-2026.zip dist/events
R2_ENDPOINT=... R2_BUCKET=... pnpm events:publish dist/events
```

上传顺序固定为 ZIP 先、manifest 后。ZIP 使用不可变长缓存，manifest 使用 5 分钟短缓存。

## 8. 分期与当前状态

**已落地**
- [x] `event-package/1.0` 与 `events-manifest-1.0` Zod 合同。
- [x] DAK Event 层；读 JSON/资产包建立 Event → Stage → Series → Map/BP。
- [x] 本地 demo 自动配对与缺图资源计数；移除组织记录不删除原始 ZIP。
- [x] 选择 1–5 个已导入地图建立 BO1/3/5，并复用现有 BP 编辑器。
- [x] 在线赛事资产列表、下载、sha256 校验、导入与 R2 构建/上传脚本。
- [x] 桌面端外层赛事 ZIP 保留在 Python，逐图解压并分块传输；失败继续、取消后可重试补图。
- [x] 在线资产由 Python 后台下载与 sha256 校验，不再让完整赛事包进入 WebView 内存。
- [x] 单循环、Swiss、单败、双败的专用展示；淘汰赛合同保存 bracket 节点和胜败去向，GSL 当前复用小组积分视图。

**待真实内容与跨仓工作**
- [ ] Cologne Major 完赛后补真实队伍、赛程、BP、比分与 v3 ZIP，再发布 R2 manifest。
- [ ] RivalHub 增加 `event-package/1.0` 文件导出（本仓库只消费合同）。
- [ ] Windows 真机验证 WebView 的 R2 CORS、下载、校验与大包导入。

**赛事资源制作器**
- [x] 预设单循环、瑞士轮、单败、双败及 Major（三阶段瑞士轮 + 单败）赛事框架。
- [x] 逐系列赛填写阶段、轮次、淘汰节点、双方、BO、赛程状态与 BP。
- [x] 每系列附加 1–5 场原始 `.dem` 或 v3 ZIP；`.dem` 调用现有 `cs2df` 桥导出。
- [x] 解析真实 ZIP 校验对阵，按系列赛 A/B 方向校正比分并生成赛事资源 ZIP。
- [x] 草稿持久化；二进制资源不写入 localStorage，刷新后需重新附加。
- [x] 赛后制作默认 `finished`；series key 为内部只读标识，slug 与比赛时间从赛事名/demo 元数据自动生成。
- [x] 模板同时生成阶段、轮次与 bracket series skeleton；桌面端从原生路径增量写最终 ZIP。

**v2+（可选）**
- [ ] RivalHub HTTP 只读 API 导出（免下载文件，需 RivalHub 暴露鉴权端点）。
- [ ] BP/赛程/队伍/选手元数据更完整的双向同步。

**非目标（本稿明确不做）**
- 托管原始 `.dem`。
- 复杂的赛事管理平台 / 付费墙 / 账号体系（赛事管理仍是 RivalHub 的职责）。

## 9. 开放问题

- Event 与现有 Series 的迁移：已有散场 series 是否要回填进 Event？（倾向"可选挂载"，不强制。）
- `demoHint.sha256`：DAK 导出 entry 时是否暴露稳定 sha 供 RivalHub 未来回填配对线索？
- 资产包脱敏口径：v3 ZIP 已脱敏，analysis bundle 是否需要进一步裁剪选手可识别信息？
- RivalHub 队伍/选手 key 用 UUID 导出后，DAK 身份归并如何与现有 `identity` 映射对齐？
