# Cologne Major 2026 CT/T 职责研究归档

本目录保存 `main@9602d8276259864e1a55f0b4f380cf92c17cfc4c` 上完成的同赛事职责研究冻结结果，用于约束后续生产实现和未来外部验证。它不是产品合同，也不表示当前生产分类已经达到报告中的 agreement。

## 研究范围

- 202 个地图 ZIP、160 个赛事选手画像、32 支队伍。
- 159 个可用于个体 agreement 的参考；FL4MUS 仅作为 s1ren 阵容槽位的替补敏感性案例。
- 非主狙 CT：Anchor / Rotator，Mixed 作为 abstention。
- 非主狙 T：Pack / Lurker，Flex 作为 abstention。
- HLTV 同赛事标签是强参考，不是绝对真值；报告使用 agreement，不称准确率。

## 文件

- [`research-freeze-v1.md`](research-freeze-v1.md)：人类可读的冻结结论、指标和验证边界。
- [`research-freeze-v1.json`](research-freeze-v1.json)：特征顺序、预处理、模型、分组验证、abstention 和输入哈希。
- [`identity-provenance-audit.json`](identity-provenance-audit.json)：直接身份、名称变体、来源文本纠正与替补槽位代理审计。
- [`fl4mus-roster-proxy-sensitivity.json`](fl4mus-roster-proxy-sensitivity.json)：包含/排除替补代理的敏感性结果。
- [`t-pack-lurker-candidate-spec.md`](t-pack-lurker-candidate-spec.md)：T 方并行研究投影的语义和验证门槛。
- [`t-projection-implementation-audit.json`](t-projection-implementation-audit.json)：生产实现对冻结 15 特征的复现误差与同赛事 full-fit 诊断；不得替代队伍留出结果。
- [`ct-rotation-minimum-facts-spec.md`](ct-rotation-minimum-facts-spec.md)：CT 轮转最小事实 v1 的冻结语义与实现边界。
- [`ct-rotation-map-distribution.csv`](ct-rotation-map-distribution.csv)：当前 v1 facts 在 202 个 ZIP 上的逐地图 `true/false/null` 与死亡截尾分布。
- [`ct-rotation-closeout-audit.json`](ct-rotation-closeout-audit.json)：新增 CT facts 的完整性不变量、增量诊断和最终裁决。
- [`module-closeout.md`](module-closeout.md)：T 严格复现、CT 语义/缓存审计和当前阶段停止条件。

大型 notebook、逐选手特征矩阵和原始 202 ZIP 不进入仓库。冻结 JSON 中的 SHA-256 用于核对研究时的输入；路径已归一化为文件名，原始研究工作区不构成长期依赖。

## 后续实现边界

1. T 方可先并行输出 Pack/Lurker 连续 evidence 与 Flexible abstention，但不得直接替换现有职责或宣称外部验证通过。
2. CT 先物化接触、离区、跨区响应、相对轮转顺序和死亡截尾事实，不在 core 中生成 Anchor/Rotator 标签。
3. 新赛事验证恢复时，必须使用冻结特征、预处理、参数和默认阈值，不得看完新标签后重新调参仍称外部验证。
4. CT facts 已证明有稳定解释信号，但当前 augmented 诊断损害 abstention 与队伍折稳定性；不实现 CT 研究投影，不继续调 Cologne。

## 重现入口

研究脚本和 notebook 保留在生成该冻结版本的本地研究快照中。仓库内生产复现应通过 `@cs2dak/core` 的 compact facts 和 `@cs2dak/cohort` 的聚合 API，并使用提交的 fixture/测试验证；不得让 Studio 重新解码 replay。
