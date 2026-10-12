# 首批代码 / 文档 / 测试治理

## 范围与判断依据

基于 main `2638958`，仅修改 cs2-demo-analysis-kit。先读 `AGENTS.md`、
`.agents/skills/fixture-verify/SKILL.md`、`docs/module-boundaries.md` 与 CI。
启动时的 open PR 为 #6（producer 生命周期）和 #104–#107（Actions 依赖更新），
本批不与这些实现重复。近期 #98 / #103 已建立全包 AST graph 与冷构建验证。

权威职责以 module-boundaries 为准；源码文本不是行为合同。此次确认的文档漂移
是 AGENTS 的测试说明：实际 `pnpm test` 为 `test:fast` 别名，Vitest 收集
packages、apps、scripts，排除 integration 与 season-validation。修正文档即可，
无实现违约，不改变产品规则、公开 API、解析、上传、权限或发布配置。

验证时另发现 `python:test` 只启用 dev，导致已有真实 webview reflection 测试
报 `ModuleNotFoundError: webview`（199 passed / 1 failed / 10 skipped）。CI 已安装
dev + gui，而 uv run 会按声明的 extra 同步环境；修正本地测试命令以启用 gui，
不跳过或删除这个失败用例，不改变 Python 依赖版本或锁文件。

## 删除理由与剩余覆盖

| 删除项 | 理由 | 剩余风险覆盖 |
| --- | --- | --- |
| `scripts/data-producer-boundaries.test.ts` 的 Evidence 文本断言 | 针对固定文件的字符串检查重复 graph gate；函数名称、具体 `.find` 拼写不是合同 | `scripts/package-boundaries.test.mjs` 实扫所有生产 import / manifest；`packages/rivalhub-upload/src/evidence.test.ts` 验证同名队伍、昵称变化、稳定 target ID、canonical frozen projection 与 identity collision |
| 同文件 Core 文本断言 | “恰好一条 import”和名字正则耦合实现排版；graph gate 更完整地覆盖 type / runtime import | graph gate 拒绝 Core→Presentation、Core→Tournament runtime；`packages/core/src/tournament-facts.test.ts` 用真实 ZIP 验证名字不影响 economy/performance projection、跨图身份与缺失/冲突 ID |
| `packages/contract/src/dependency-boundaries.test.ts` 的 presentation manifest 用例 | 只抽查一个已被完整 graph gate 覆盖的依赖；`workspace:*` 字面值与是否同时列入 devDependencies 不能说明 runtime 合同正确性 | graph gate 的 declared 集合只包含 dependencies / peer / optional，拒绝 dev-only production import；CI tarball consumer gate 验证实际传递安装闭包 |

保留 dependency-boundaries 的上游精确版本检查：graph gate 只验证边，不验证
版本一致性。保留所有解析 / Evidence / pipeline / HTTP / native export 行为测试，
未删除失败测试。合计删除三个用例和一个仅做字符串检查的文件；无生产代码变更。

## 全仓测试类别与耗时矩阵

[逐文件清单](2026-10-12-test-inventory.csv) 覆盖 158 个入口：135 个 Vitest 文件、
15 个 pytest 文件、7 个 node:test 文件和 1 个 Windows 手工验收脚本。
分类按 owner，同时记录 real-ZIP、SSR-render、persistence、adapter-mocks 等标签；
标签可重叠，不把同一测试重复算进总数。库存基线是上述三个重复边界用例删除后
的 `bc7cb3f`。以下累计耗时来自 Vitest JSON 的用例 body duration，**不含 import / hooks，
且并行用例可重叠，不能相加当作 wall time**。

| Owner / 类别 | Vitest 文件 | 基线用例 | 累计 body 秒 | 治理判断 |
| --- | ---: | ---: | ---: | --- |
| Core：解析、canonical facts、QA、空间 / 战术 | 29 | 167 | 94.270 | 保留多地图、空源、变异源；合并同源正常分析，缩窄重复 CT 确定性检查 |
| Studio：持久化、导入、修复、投影、UI | 45 | 282 | 181.968 | 优先归并 Library 生命周期；保留 canonical identity binding、隔离与失败恢复 |
| Presentation：视图模型与跨场投影 | 16 | 71 | 6.838 | 只读 fixture 共享；保留不同 options / 缺失流的独立分支 |
| CLI：真实文件与子进程集成 | 2 | 6 | 7.765 | 保留真实 ZIP / cohort、输出及错误入口 |
| RivalHub upload：配对、Evidence、传输、pipeline | 8 | 142 | 1.185 | 上传完整性、身份、错误恢复与 idempotency 不删减 |
| Cohort：聚合与身份 | 4 | 19 | 1.197 | 独立口径 / 身份风险，保留 |
| Maps：地图资产、查询、生成 | 16 | 81 | 0.219 | 去掉重复 manifest 抽查，合并同一资产成功查询与元数据遍历 |
| Contract：公共 schema、nullable、上游版本 | 3 | 53 | 0.072 | 保留实际合同与版本锁定 |
| Tournament：frozen facts 跨图聚合 | 2 | 17 | 0.035 | 保留 identity / reference / denominator guards |
| React：SSR 展示合同 | 5 | 14 | 0.095 | 同 props 的重复渲染归并，保留交互与缺失值展示 |
| Uploader app：native seam 与错误恢复 | 4 | 20 | 0.034 | 保留 |
| TS scripts：Evidence 工具入口 | 1 | 1 | 0.003 | 保留 |

其他 runner 分别测量，不与上表相加：pytest **15 文件 / 210 用例**，
200 passed / 10 平台条件 skipped，wall 3.86s；node:test **7 文件 / 33 用例**
全通过，runner wall 1.204s。PowerShell 安装验收在 Linux 未运行，无耗时数据。
真实 pack / clean consumer 等 CI gate 也保留，独立于单测库存。Python 最慢的两个
大日志诊断用例约 2.07s / 1.10s，保护最新失败不被截断，未为缩短耗时删掉。

## 归并 / 重复覆盖矩阵

| 文件与前后用例数 | 重复来源与处理 | 剩余独立覆盖 |
| --- | --- | --- |
| Studio `library.test.ts` 10→6 | 五个同 ZIP 成功测试归并为一个生命周期，减少为铺垫重新导入 / 删除的分析 | 初次 manifest、metadata 编辑、identity index、duplicate tags、缺失 facts 重导、stored ZIP rebuild、删除后重导全部保留；unknown id 与 transient File / persisted cache 分支独立 |
| Studio `library-repair.test.ts` 5→3 | raw-hash dedupe 后直接查找和回填同一 entry，取消仅为查找 / 回填准备的另两次真实导入 | 不同 ZIP bytes 同 raw hash 去重、uppercase lookup、historic metadata 回填；不同 raw hashes 保持分离、同名 file 的引用重连与 facts 保全独立保留 |
| Core `index.test.ts` 9→4 | 六个相同输入的正常分析归并成一份 bundle；变异源对照也只算一份 baseline | 所有实质 scoreboard、RR 基线、context、rich availability、weapon 守恒断言保留；只移除已由精确长度 153 蕴含的两项 `some`；变异 aggregate 与缺失 source 分支独立 |
| Core `radar-field.test.ts` 3→1 | 同一输入产生三遍加性场改为一遍 | 原 golden digest 不变；shape、非零采样和逐元素聚合守恒都保留 |
| Core map-intelligence / CT owner 5→5、6→6 | Ancient 用例为了比较 CT 再算整场空间 / 战术；将同输入确定性断言移到 `ct-rotation.test.ts` owner 场景 | Ancient 真实 CT 输出、Nuke / Inferno / Overpass 空间证据、missing replay/nav 保留；CT 确定性在轻量 owner 场景验证，未声称仍双跑整场 |
| Maps `callout-grid-node.test.ts` 3→1 | loaded grid 的两次成功查询合并；删除 `files` 字符串检查 | committed grid mapName、cells、calloutAt 查询保留；真实 pack / install / node loader 由 CI maps smoke 覆盖 |
| Maps `route-assets.test.ts` 4→2 | 三次同地图资产遍历合为一遍；删除 `table[id] ?? id` 非空等弱断言 | 七图至少一条 route、中文名不重复、metadata 枚举、唯一 route / zone ID、start / bombsite end、callout 引用保留；Dust2 公共 helper 独立 |
| React MatchWorkspace 5→4、SeasonLeaderboard 3→2 | 相同 props 重复 SSR render 合并 | roster / utility / smoke side、格式 / missing marker / default sort 原断言保留；clickable 分支独立。移除“nulls last”的误导标题：原排序列两个值均非 null |
| Presentation trails 3→3、team 2→2 | 同文件同 ZIP 分别解析 3 次 / 2 次改为 beforeAll 一次；源码确认消费者不修改输入 | 默认 / custom window 与 missing replay 分支仍独立；persisted facts equivalence / overview 分支仍独立 |

本表额外归并 19 用例；连同前面三个重复边界用例，main 的完整 Vitest
**136 文件 / 876 用例 → 135 文件 / 854 用例**（fast 868→846；integration 8 不变）。
不使用 mock 跳过实际 analysis / persistence，不改变生产实现或产品口径。

## 验证与耗时

本批使用相同环境、Node 24.19.0、pnpm 12.9.1、Vitest 5.0.3，先冻结安装并
构建公共包。耗时记录包括命令启动，不把构建、安装计入 fast suite。
完整 fast suite 各跑一次；清理后启动时短暂并行运行 typecheck，存在资源竞争。
因此属于单次观测，不能据此认定稳定提速。

| 验证 | 结果 |
| --- | --- |
| 清理前 `pnpm test:fast` | 132 文件 / 868 用例通过；Vitest 122.67s，命令 wall 123.179s |
| 清理后 `pnpm test:fast` | 131 文件 / 865 用例通过；Vitest 126.26s，命令 wall 126.720s |
| AST package boundaries | 8 / 8 通过（含真实 graph、manifest、type/runtime、Windows 路径） |
| `pnpm analyze:sample` | committed Nuke smoke ZIP 成功生成分析产物 |
| `pnpm typecheck` | 通过 |
| `pnpm test:integration` | 4 文件 / 8 用例通过；5.31s；无本地 `.tri` 时 LOS 用例提前返回，不声称完整 LOS 验证 |
| 修正后 `pnpm python:test` | 200 passed / 10 skipped（updater 平台条件），3.73s；真实 webview reflection 用例通过 |

完整 fast 命令观测差值为 **+3.541s（+2.9%）**，本轮未证实性能收益。
收益是去除重复 gate 与固定源码拼写约束；不以测试数或速度作为删测目标。

### 完整归并批次的对照

同环境、同命令，完成各自的 build 后串行测量，未并行运行 typecheck 或其他测试：

```bash
pnpm vitest run --pool=forks --reporter=json --outputFile=/tmp/cs2dak-governance-expanded-{before,after}.json
```

| 完整 Vitest | 文件 / 用例 | 命令 wall 秒 |
| --- | --- | ---: |
| 归并前（`bc7cb3f`） | 135 / 873 全通过 | 130.674 |
| 归并后 | 135 / 854 全通过 | 111.742 |

单次观测差值 **−18.932s（−14.5%）**。这是包括 import / hooks 的完整 suite wall，
与上面的 fast 首批观测不是同一测试集合；不宣称稳定 benchmark 收益。
CSV 保留逐文件前后 body ms；beforeAll 的 fixture 工作移入 hook 后 body 降低
不等于同样的 wall 收益。Library 82.980→62.128s、repair 62.615→46.103s、
map-intelligence 85.907→73.014s 是本批主要的实际冗余工作减少。
扩充后的全工作区 typecheck 与 diff check 均通过。

## 下一批候选与待讨论

1. **Library 剩余成本**：`facts.test.ts` 的显式 tournament identity binding、
   repair 的不同 raw hashes、same-file-name rewire 仍运行真实完整管线。先研究按
   seam 分类或更小的合法 ZIP 能否保留独立风险，不能为了快而 mock 掉共同 owner。
2. **可选 tri / 外部赛季验证的可见性**：utility integration 缺 `.tri` 时直接 return，CI 的
   pass 不代表 LOS 已验证。讨论明确 skip 与小型合成 tri fixture 的覆盖分工；
   season-validation 缺 50+ 外部 ZIP 时也提前返回。不把真解析/空间验证删掉，
   也不要求 CI 下载所有地图资产。
3. **架构取舍待讨论**：Evidence wire `diagnostic-safety.ts` 与运行时
   `diagnostics.ts` 都有脱敏逻辑，但一个维护稳定 wire 限额并去除 run-specific
   字段，另一个保留 requestId / stage / cause 用于恢复。相似代码尚不足以证明
   可统一；先定义各自合同及差异矩阵，再判断能否提取公共片段。

本批未确认可安全删除的生产死代码，不以“看起来未引用”删除公开 exports。
后续按唯一 owner / 外部消费合同逐项审查，不扩展到别的项目或 npm 授权发布。
