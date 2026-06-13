# DAK 模块边界

本文定义 DAK 的目标模块职责。重构、删除旧 API 和新增功能时，以本文为边界依据。

## 总体数据流

```text
.dem
  -> cs2df (PyPI)
  -> cs2-demo-format v3 DemoPackage
  -> @cs2dak/core
       ├─> @cs2dak/cohort
       ├─> CS2 Insight Agent
       └─> @cs2dak/presentation <─ @cs2dak/cohort / @cs2dak/maps
              -> @cs2dak/react
              -> RivalHub / DAK Studio
```

## 模块职责

| 模块                     | 负责                                                            | 不负责                                      | 主要输出                    |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------- | --------------------------- |
| `cs2-demo-format`        | 定义并校验 v3 DemoPackage 数据合同                              | Demo 解析、分析、评分、展示                 | Schema、类型、validator     |
| `cs2df`                  | 将原始 `.dem` 确定性导出为合法 v3 DemoPackage                   | RR/PRISM、产品展示、业务持久化              | v3 ZIP、导出报告            |
| Python CLI / GUI         | 提供 cs2df 的本地 GUI / DAK Studio 桥 / 打包壳                  | 维护独立 parser/exporter、分析或展示实现    | GUI、Studio bridge、桌面应用 |
| `@cs2dak/contract`       | 定义 DAK 派生结果的公共合同；re-export 上游合同                 | 复制 `cs2-demo-format` schema、实现分析逻辑 | Zod schema、TypeScript 类型 |
| `@cs2dak/core`           | 单场 Demo 的标准化、事实派生、QA 和确定性分析                   | 跨场聚合、身份管理、页面叙事、React UI      | `AnalysisBundle`            |
| `@cs2dak/cohort`         | 跨场聚合、身份归并、赛季级 RR/PRISM 输入与结果整形              | 单场解析、数据库、产品 UI                   | `CohortBundle`              |
| `@rivalhub/rival-rating` | RR、PRISM 及相关评分公式                                        | Demo 信号提取、持久化、展示                 | 评分结果                    |
| `@cs2dak/maps`           | 地图标定、坐标变换、进攻动线、区域几何                          | 评分公式、产品 UI、战术结论                 | 地图与空间能力              |
| `@cs2dak/presentation`   | 将 core/cohort 结果转换为比赛、选手、队伍、赛季和排行榜展示模型 | 解析、评分公式、数据库、React               | 产品中立 View Models        |
| `@cs2dak/react`          | 渲染 presentation 合同和基础可视化组件                          | 数据库查询、分析、评分、产品业务规则        | React 组件与样式            |
| Node CLI                 | 将 TypeScript 包接入本地文件系统和自动化流程                    | 复制核心分析逻辑                            | 命令行输出与文件产物        |
| `apps/demo-lab`          | 组件开发、fixture 预览和人工验收                                | 个人 Demo 管理、共享逻辑所有权              | 开发测试应用                |
| DAK Studio（`apps/dak-studio`） | 本地 Demo 管理、导入、检索、比较和个人档案               | RivalHub 赛事业务、共享分析公式             | 独立本地产品                |
| RivalHub                 | 赛事、赛季、身份、权限、持久化和公开展示                        | 复制 DAK 分析与评分逻辑                     | 赛事产品                    |
| CS2 Insight Agent        | 高光录制软件，复用本仓库 demo 展示模块                          | 复制 Demo 解析与评分逻辑                    | 产品                        |

DAK Studio 已落地为 `apps/dak-studio`（资料库 / 比赛工作台 / 选手档案 / 道具实验室 / 经济与节奏 / 排行榜 / 赛事总览），仍须遵守上表边界：只做适配与编排，不拥有共享逻辑。

## DAK Studio 八模块归属

| Studio 模块 | 唯一职责 | 共享逻辑 owner |
|---|---|---|
| 资料库 | 本地 ZIP/.dem 导入、标签、重导、检索 | Studio 本地适配；ZIP 解析仍属 core/contract |
| 比赛工作台 | 单场回合、回放、地图、经济与 RR 解释入口 | `@cs2dak/presentation` + `@cs2dak/react` |
| 个人实验室 | 选手档案、趋势、武器分布、证据跳转 | `@cs2dak/cohort` + `@cs2dak/presentation` |
| 对枪实验室 | duels/mechanics 信号聚合、三分类对枪、TTK、机制画像（含 .tri LOS 反应时间/预瞄） | `@cs2dak/core` + `@cs2dak/presentation` |
| 道具实验室 | 跨场 Flash Value、负收益队闪、道具证据 | `@cs2dak/presentation` |
| 经济与节奏 | 经济矩阵、手枪转化、eco/semi 翻盘 | `@cs2dak/presentation` / core economy |
| 赛事中台 | 跨队横向对比、地图盘面、武器榜、报表 | `@cs2dak/cohort` + `@cs2dak/presentation` |
| 教练工作台 | pattern/playbook/anti-strat；未实现前占位 | 未来 presentation/maps |

RR 口径统一使用 `@rivalhub/rival-rating` 的 frozen pro baseline：单场和跨场聚合都以
`1.0 = 职业基线` 为同一标准；cohort 层只做身份归并、信号汇总和展示模型整形。
PRISM 风格、强弱项等“相对当前范围”的判断可以继续使用 cohort 百分位，但不得改变 RR 标尺。

## 强制规则

1. 每项共享逻辑只能有一个 owner；消费者不得复制实现。
2. 产品和 UI 可以依赖共享模块；共享模块不得反向依赖产品或 UI。
3. v3 ZIP 是 Python / cs2df 与 TypeScript 分析层之间的唯一接口。
4. `cs2-demo-format` 是 DemoPackage 合同的唯一真相源。
5. `@rivalhub/rival-rating` 是评分公式的唯一真相源。
6. 缺失数据保持 `null`；不得为了展示、聚合或兼容伪造为 `0`。
7. Apps 和 CLI 只能负责适配与编排，不能成为共享逻辑 owner。
8. View Model 不包含数据库、权限或产品路由语义。
9. 允许破坏性重构和删除旧 API；不为错误职责边界长期维护兼容层。
10. 跨模块行为必须由公开合同和 fixture 验证，不依赖内部文件结构。

## 边界变更规则

新增或移动功能前，必须先回答：

1. 哪个模块是该功能的唯一 owner？
2. 它消费什么公共合同，输出什么公共合同？
3. 哪些模块明确不得实现它？

无法明确回答时，不应开始实现。
