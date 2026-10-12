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

## 下一批候选与待讨论

1. **测试 fixture 重复加载**：`presentation/src/trails.test.ts` 每个用例重新加载
   同一 ZIP，`team.test.ts` 也有重复。先证实消费者不修改 pkg，再考虑按文件
   `beforeAll` 共享 fixture；保留窗口、缺失 replay 与 persisted facts 的独立行为断言。
   目标是减少解析成本，不减少独立风险覆盖。
2. **maps manifest 抽查**：`maps/src/callout-grid-node.test.ts` 的 `files` 字符串断言
   与 `scripts/maps-package-smoke.mjs` 的真实 pack / 安装 / loadCalloutGrid 覆盖重叠。
   下一批先确认各平台 gate 的适用范围，再删除 manifest 抽查；保留资产查询行为。
3. **可选 tri 验证的可见性**：utility integration 缺 `.tri` 时直接 return，CI 的
   pass 不代表 LOS 已验证。讨论明确 skip 与小型合成 tri fixture 的覆盖分工；
   不把真解析/空间验证删掉，也不要求 CI 下载所有地图资产。
4. **架构取舍待讨论**：Evidence wire `diagnostic-safety.ts` 与运行时
   `diagnostics.ts` 都有脱敏逻辑，但一个维护稳定 wire 限额并去除 run-specific
   字段，另一个保留 requestId / stage / cause 用于恢复。相似代码尚不足以证明
   可统一；先定义各自合同及差异矩阵，再判断能否提取公共片段。

本批未确认可安全删除的生产死代码，不以“看起来未引用”删除公开 exports。
后续按唯一 owner / 外部消费合同逐项审查，不扩展到别的项目或 npm 授权发布。
