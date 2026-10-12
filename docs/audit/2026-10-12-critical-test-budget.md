# 关键流程测试保留集

## 固定基线与口径

清理前 main 固定为 `263895839f8a4f334b6c92be2a38639fb09523ad`，不是 #108。
在独立 worktree 执行冻结安装、build、完整 Vitest、pytest 和 node:test 后盘点。
#108 的 `b13347b` 保持不动；本批另开 PR，既不等待它合并，也不修改其审查 head。

[逐文件基线、删除决定、剩余覆盖与实际耗时](2026-10-12-critical-test-budget.csv)
使用 LF，不包含历史断言的可执行副本。用例数是 runner 实际收集数，含参数展开和
基线的 10 个平台 skipped；不以 assertion 数、覆盖率或“经过同一路径”替代行为判断。

| 口径 | 固定 main | 保留集 | 剩余 |
| --- | ---: | ---: | ---: |
| 全部 runner 用例 | 1,119 | 57 | 5.09% |
| Vitest | 876 / 136 文件 | 35 / 5 文件 | 4.00% 用例 |
| pytest | 210 / 15 文件 | 12 / 1 文件 | 5.71% 用例 |
| node:test | 33 / 7 文件 | 10 / 2 文件 | 30.30% 用例；全仓统一预算，非逐 runner 限额 |
| 常规测试入口（含 Windows installer 脚本） | 159 文件 / 17,531 行 | 9 文件 / 1,129 行 | 5.66% 文件 / 6.43% 行 |
| 扩大到 check/smoke gate 与专用 helper | 167 文件 / 18,369 行 | 16 文件 / 1,776 行 | 9.58% 文件 / 9.67% 行 |
| 扩大口径非空行 | 16,658 | 1,665 | 9.995% |

扩大口径包含原有 package graph、release policy、desktop notices、maps consumer、
七包 consumer、Windows startup smoke 六个脚本；保留这六个脚本原样。
另计入 `vitest.config.ts`；单条 pywebview reflection 流程归入同一 native flow 模块，
没有隐藏用例。也计入原有专用 `presentation/src/test-fixtures.ts`，其消费者删除后移除该 helper。
未把 helper 搬到生产目录，也未用循环或压缩排版藏起数百个用例。
现存 3 个确认故障变体、4 个写入边界和 2 个错误回执字段仍由 runner 展开计数。

fixtures、地图资产、历史 client 快照等输入数据完全保留。两个历史 client 文本快照
共 346 行，是 legacy regression 的输入/被测对象，不计为测试实现；若连这些
历史源码输入也计入，物理量是 169→18 文件、18,715→2,122 行，**该扩大口径未达 10%**。
源码字符数也不是 10%：858,345→102,714（约 12%）。这些额外口径如实记录，
不将其与用例或非空行目标混用；没有删改资料来降低数字。

## 保留项为什么有独有价值

| 关键流程 | 永久故障保护 | 边界 |
| --- | --- | --- |
| committed ZIP → canonical analysis | 精确 Nuke 身份、事件数量、luchov 10 kills / 12 deaths；拒绝缺失必需流、非法 JSON / v2；可选 replay 损坏降级；teamkill 不得获得敌方首杀；缺源 context 保持 null | 一个真实黄金样本与两个反例，不声称覆盖每张地图、所有评分字段 |
| 同一个 Ancient pkg → 完整空间 facade 连跑两次 | actual nav 必须 available、有已解析 CT 初始职责；首次 CT rows 做 deep snapshot，第二次完整 facade 与之比较 | 承接旧集成重复输入保护，不能由新对象、null-nav owner 用例等价替代；未保留整个空间算法单测矩阵 |
| canonical facts → Evidence / identity | 所有 whole-map summaries 对齐 canonical owner；同名队伍 / 改昵称不改 facts；target ID 碰撞、缺 roster member、真实 QA 错误拒绝；反向 A/B；稳定 ID 跨图 merge | owner 透传一致性，不是第二套评分公式 oracle |
| 上传与重试 | POST receipt 后状态失败只查询、不再 export/POST；换 raw file、错 matchMapId / SHA 回执拒绝；歧义目标选择；同 idempotency key；cleanup 不能覆盖主失败；HTTP 错误不泄露私密内容 | transport 以可控 stub 驱动，真实 ZIP、producer 与公开 client 都运行；不声称真实服务器 RBAC 验证 |
| ZIP 资料库生命周期 | 真实导入、编辑 metadata、duplicate、丢 facts 后重导、stored ZIP rebuild、删除后再导入 | 真实解析/提取/IndexedDB；未用 mock 绕过这条链 |
| 资料库半写与隔离 | 四个实际持久化边界失败回滚；等待 sibling write；取消回滚；同名不同 raw file 分开；并发同一 replacement 只留下一个 survivor | 故障注入 seam 使用小型 storage/analysis harness，不声称等价于所有 OS 的 SQLite/文件锁 |
| 原生 bridge 与凭据 | 保存 metadata 不含 token；请求有 native Authorization；拒绝越权 path/origin；过期 pairing 不能保存；cancel 只撤销自己拥有的授权；1.5MB 完整 chunk 回读且 raw source 不删 | stub vault/HTTP，不弹真实系统凭据窗口 |
| native startup / 安全更新 | actual pywebview reflection 不碰 native getter；runtime install 保留资料；拒绝 ZIP traversal；拒绝覆盖内部 custom-data 与 native relay 移动非白名单 custom-data | 不宣称仍测试所有真实 Windows relay 锁/重启情况 |
| 发布资产的外部消费者 | 实扫 production graph、七包真实 tarball 安装与 strict declarations、maps 资产与入口、actual 0.8.5 client 安全首跳、Windows installer/startup | 保留现有 CI gate；不发布、不触碰 npm 授权问题 |

## 明确移除的独有保护

这次不是全套行为等价替换。以下旧断言有独立价值，但不属于这次永久保留集；
相关功能变更时应做针对性临时验证，不能仅依赖当前 suite 跑绿。

| 被移除的具体保护 | 当前 suite 仍可能漏掉的故障 |
| --- | --- |
| cohort 借用 Steam 账号 / 外部身份归并、round-weighted rate | 同一 externalUserId 的两个 Steam 账号变成两个档案；不同回合数的 ADR/KAST 错误取平均。现有 stable Tournament ID 与单场黄金断言不等价 |
| 地图 AWP、CT death censor、同步组 / pack-lurker、callout 邻域 | 已阵亡 CT 被计入后续轮转、Nuke 上下层邻格误命中、无唯一多数 core 时仍推断职责。重复 CT snapshot 只能查稳定性，不能裁决这些语义 |
| tournament 全量 duplicate/reference/zero-denominator 反例 | duplicate map 重复累加；零机会 win rate 显示 0 而非 null。现有双图身份 merge 和空模型 consumer 调用不验证这些反例 |
| ReplayViewer 初始 1:35、武器 UI、空数据 tooltip / 排序键盘细项 | replay 从错误帧开始、可交互行不能键盘访问。打包 React EmptyState smoke 不保护这些行为 |
| 全矩阵 vault errno / macOS status、diagnostics 文本脱敏 | macOS “不存在凭据”与真正读取失败混淆；特殊 quoted secret 或私密路径泄露。保留的 token/HTTP 反例不能代表所有文本形态 |
| queued alias replacement、interrupted legacy split、rollback 自身再次失败 | 重启中断迁移后重新关联到第三个同名 Demo；不同 queued replacement 的回滚覆盖另一已提交操作。当前普通并发 survivor 与四种半写反例不等价 |
| 真实 Windows relay 文件锁 / junction alias 与死进程等待 | 文件锁下恢复失败、junction 别名绕过 custom-data 检测。Windows startup/installer 和普通路径 refusal 不替代原真实 relay tests |
| sync-version atomic rollback / build-info / web patch 自证单测 | version 写入中断留下部分更新；web overlay 取到错误构建来源。原脚本/发布流程没改，现有消费者与 legacy首跳不证明这些操作原子性 |

这些是 10% 保留目标的具体覆盖取舍，未称“无新增风险”。生产行为、数据合同、
评分口径、权限规则和发布流程实现均不变；本轮不以修改实现来迁就测试。
后续需要长期保留某个上述故障时，应替换较低价值的永久断言或显式讨论预算，
不能悄悄隐藏用例，也不能声称 E2E “走过”就已保护该行为。

## 实际验证和耗时

Node 24.19.0、pnpm 12.9.1、Vitest 5.0.3。同工作区，先 build；完整 Vitest 命令
均为 `pnpm vitest run --pool=forks --reporter=json --outputFile=...`。正式测量期间
未并行执行其他 build/typecheck/test。单次观测，不当作稳定 benchmark：

| 验证 | 固定 main | 最终保留集 |
| --- | --- | --- |
| 完整 Vitest | 876 passed；wall 130.977s | 35 passed；wall 45.733s（−85.244s，−65.1%） |
| pytest | 200 passed / 10 skipped；3.90s | 12 passed；0.16s |
| node:test | 33 passed；runner 0.949s | 10 passed；runner 0.787s |
| typecheck / committed sample analyze | baseline build/测试通过 | typecheck 与 `pnpm analyze:sample` 通过 |

保留集的 Library 单条完整生命周期约 41.56s，CT facade flow 所在文件累计 body
约 24.33s；并行时间不能相加当 wall。代码/用例达到 10% **不代表耗时也只有 10%**。

临时 Vite transform 故障注入、不改生产文件、不永久入库：

- 将 missing required stream 制造为 `[]`，必需流用例按预期失败。
- 去掉 POST response identity guard，错误 matchMapId 和错误 SHA 两项按预期失败。
- 正常完整 suite 通过；后续去掉未用 hook 和重复 imports/factory 后，对应 12 项
  及 Python 12 项重新通过。临时配置已删除；没有通过删掉失败断言使这些回归跑绿。

新增 custom-data 用例曾漏造 `_internal` payload，因此最初未触发覆盖保护；
按原基线场景补齐归档后原拒绝断言通过，生产逻辑未改。

CSV 写入明确 `lineterminator="\n"`；只有在全部文件纳入 Git 后执行标准
`git diff --check` / `git diff --cached --check` 才确认 whitespace 结果。
#108 的 CSV CRLF / diff-check 陈述不在本 PR 内修改，不以那次声明证明本批检查。

## 后续开发方式

默认不要求每次改动新增永久测试。先识别是否存在关键用户流程的独有故障，
优先在现有流程中保留少量明确断言；其他改动可以用可审阅的临时验证，提交
运行结果与其边界，不把一次验证包装成长期保障。架构调整、评分和空间规则
仍需单独讨论，不由这次删测决定。这个保留集可复审，不冻结正常开发。
