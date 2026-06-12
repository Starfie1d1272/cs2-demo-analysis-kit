# cs2-demo-format v3 迁移计划（exporter 切换 + 全管线升级）

> 2026-06-12 制定，2026-06-12 收口。两件事：①废弃本仓库 Python exporter，转向 PyPI `cs2df`
> （cs2-demo-format 3.0.0 参考导出器）；②TypeScript 全管线从 v2 合同迁到 v3。
> 完成后本仓库不再持有任何 `.dem` 解析代码。

## 0. 完成状态

- ✅ `@cs2dak/contract` 升级到 `cs2-demo-format` 3.0.0，并 re-export 上游合同。
- ✅ loader 只接受 `cs2-demo-format/3.x`，v2 ZIP 直接提示用 `cs2df` 重导。
- ✅ core / cohort / presentation / react / Studio 的 v3 `playerIndex`、列式 `shots`、8Hz `replay` 消费已迁移。
- ✅ `positions-1s` 消费方已切到 replay `place`/坐标流；Pattern Finder 不再保留空 stub。
- ✅ `fixtures/input/` 与 `fixtures/baselines/de_ancient/` 已按 v3 重导，旧 `positions-1s.json` baseline 删除。
- ✅ Python parser/exporter 自有实现删除；Python 仅保留 GUI / Studio / packaging 壳层，内部调用 `cs2df`。
- ✅ 常青文档、Studio 文案、dev middleware 与导出脚本同步到 v3 / `cs2df` 口径。

## 1. 导出器对比结论

| 维度 | 本仓库 `cs2dak`（v2） | PyPI `cs2df` 3.0.0 |
|---|---|---|
| 格式 | v2.x，行式构建 | v3，向量化 DataFrame→numpy→delta 管线 |
| 序列化 | json 标准库 | orjson + deflate level 3 |
| 性能 | 慢（逐行 Python） | hasBomb 状态机推导等，大解析阶段大幅提升 |
| 批量 | 有 | 有 + report.json（timings/吞吐）+ 失败隔离 |
| 校验 | jsonschema 薄层 | `cs2df validate`（含列式流 QA） |
| 新数据 | — | duels.json（反应时间）、replay 全状态流、列式 shots |

**结论：cs2df 全面胜出，直接切换，无保留价值的差异项。**
本仓库保留的只有产品壳层：pywebview GUI、`studio.py`（DAK Studio 本地
server + 导出编排）、PyInstaller 打包。

## 2. Python 侧改造

1. `python/pyproject.toml`：依赖加 `cs2df>=3.0`，删 demoparser2 直接依赖；
   包瘦身为 `cs2dak`（壳）= GUI + studio_web + studio.py。
2. **删除**：`exporter.py`、`parse_worker.py`、`rounds.py`、`enums.py`、
   `validate.py`，以及 `cli.py` 中 export/export-batch/validate 的自有实现
   （改为薄转发 `cs2df` 同名命令，或直接删除 CLI 让用户用 `cs2df`，
   倾向后者——`cs2dak` CLI 退役，AGENTS.md 同步）。
3. `studio.py` / `gui/app.py`：`from cs2dak.exporter import export_demo` →
   `cs2df` 的导出 API；进度回调与失败展示接 cs2df batch report 结构。
4. PyInstaller spec / `scripts/package.sh`：收集 cs2df 及其 pandas/numpy 依赖
   （体积会涨，验证打包产物可导出）。
5. Python 测试：删解析单测，保留壳层冒烟（导出一场 → `cs2df validate` 通过）。

## 3. TypeScript 侧 breaking changes 对照表

| v3 变更 | 影响 | 改造 |
|---|---|---|
| `playerIndex` 替代 `steamId64`（除 players.json） | 66 个文件引用 steamId64 | core loader 入口处建 index→player 解析；下游统一经 normalize 后的 player 对象，禁止散落的 steamId 查找 |
| 事件行去 `teamKey`/`side` | kills/damages/economy 等所有事件消费者 | normalize 层由 playerIndex + rounds.teamASide/BSide 推导，一次注入 |
| `positions-1s.json` 删除，并入 replay 8Hz | heatmap、动线、lastPlaceName 聚合、Pattern Finder | 统一改读 replay 列式流 + `place` 列；`@cs2dak/maps` zones 的兜底路径保留 |
| 差分编码 + 纯整数流 | replay/duels/shots 解码 | 用 `cs2-demo-format` 导出的 `decodeDelta()`，不自写解码 |
| `kast_rounds` → `kastRounds` | core/presentation | 机械替换 |
| `victimHealthAfter` / `victimArmorBefore` / `bombs.siteId` 移除 | damages/bombs 消费者 | 用算术恢复（before − healthDamage 等） |
| `teamEconomyType` 去 `"conversion"` | economy 模块 | 转化语义改由模块 6 从 roundNumber + 前轮 winner 派生（studio-redesign §6 已定 owner） |
| `shots.json` 列式化 | duel/mechanics 信号 | M1/M2 信号层直接按列式实现（尚未落地，正好按 v3 写） |
| manifest `cs2-demo-format/3.0` | contract、loader、QA | `@cs2dak/contract` 升级上游依赖到 3.0.0 并 re-export，不 fork |

新增能力接入（迁移完成后）：`duels.json` → 反应时间/preaim（research profile，
导出默认开启与否在 Studio 导出设置里暴露）；replay `money`/`equipValue`/
`flash`/`place` → 回放实时面板。

## 4. fixtures 与测试

- 用 cs2df 重导 `fixtures/input/` 全部测试输入（sanitized de_ancient、
  cohort 3 场、sample-match），可对照上游 `fixtures/v3-mid/` golden fixture。
- v2 包**不做运行时兼容**：loader 检测到 v2 manifest 直接报「请用 cs2df 重导」
  （资料库已有重导入口）。理由：本地产品、demo 源文件都在用户手里。
- `pnpm test` / `pnpm python:test` / fixture-verify 全绿为迁移完成标准。

## 5. 实施顺序（已完成）

> ⚠️ 2026-06-13：以下 7 步骤已全部合入 `main`，全量 200/200 测试通过。本文档保留为历史参考。

1. contract 升级 3.0.0 + loader（playerIndex/side 推导/decodeDelta）——✅
2. core normalize 及各信号模块过 typecheck + 测试——✅
3. positions-1s 消费方（heatmap/trails/pattern）迁 replay——✅
4. presentation / react / studio 视图修复——✅
5. fixtures 重导 + 全量验证——✅
6. Python 侧切换 cs2df、删解析代码、打包验证——✅
7. 文档同步——✅

各步骤对应 commit 见 git log（`eea6aeb`、`8a5038c`、`014a793`、`6fbfd6d`、`fbfcceb`）。
