# Changelog

DAK Studio 桌面应用及 `@cs2dak/*` 分析管道面向用户的变更记录。格式遵循 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循 [Semantic Versioning](https://semver.org/)。

> 0.1.3 起面向 Studio 用户维护。`@cs2dak/*` npm 包版本由 changesets 独立管理（见各包的 CHANGELOG.md）；本文件聚焦 DAK Studio 桌面应用变更。

## [0.4.1] — 2026-06-11

### 新增

- **管理视图**：选手身份归并（合并/拆分/改名）、队伍改名、操作历史撤销。
- **回放回合结束时间**：2D 回放 scrubber 延伸到回合结算时间，时间轴完整覆盖回合全周期。

### 变更

- 比赛工作台「开局对枪」改名「首杀尝试」。
- 赛季缓存绑定身份版本号，身份变更自动失效重算。

### 测试

- 新增 14 个 identity 单元测试（合并/拆分/改名/队伍改名/buildCohortIdentityMap）。

## [0.4.0] — 2026-06-11

### 新增

- **经济与节奏模块**（赛事中台子页 + 独立页面）：经济类型胜率矩阵、队伍手枪局胜率与
  第二局转化率、eco/semi 翻盘排行三项经济洞察表。支持聚合范围过滤。
- **道具实验室模块**（独立页面）：跨场 Flash Value 排行（投掷数 / 敌我致盲秒数 /
  净价值每颗）与负收益队闪 Top 证据列表，每点击可跳转对应比赛回放。
- **选手档案武器画像**：武器击杀数柱状图，替换旧式表格，更直观展示武器偏好。
- **选手档案个人趋势**：ADR / KAST / FK-FD / Util/R 按比赛时序的交互柱状图，
  每柱可点击跳转到对应比赛工作台。
- **赛事中台武器击杀榜**：跨场武器击杀数、HS%、最高选手。
- **证据 + insights → 2D 回放深链**：选手档案内 Flash Value / Mistake Review 的
  证据按钮、个人趋势柱图均携带 round/tick，点击直达比赛工作台对应回合。
- **资料库批量标签**：多选 demo 后批量添加或移除标签。
- **资料库重新导出**：对有记录原始 .dem 路径的条目，一键重新导出并替换。
- **资料库 ZIP 解析移至 Web Worker**：批量导入时主线程不再卡死。
- **RR 透明化面板**（比赛工作台·选手故事页）：展示选手 single-match RR、
  combined RR、职业基线状态、combat context factor，以及全部 68 项 indicators
  分组可视化（Combat / Opening & Trade / Clutch & Weapon / Utility & Economy）。
- **选手故事页 RR indicator**：scoreboard row 列头旁展示小圆点 indicators。

### 变更

- **RR 口径统一为 frozen pro baseline**：`@rivalhub/rival-rating` 升级 0.3.0。
  单场和赛季 RR 均锚定同一份职业 baseline（不再赛季内正态归一化），跨赛季
  可比。PRISM / strong / weak 标签仍保持 cohort 相对语义不变。
- **exporter OT 换边逻辑**：优先从 freeze end 后 tick 采集玩家 team_num 判断
  阵营；旧公式仅作为采样数据不可用时的 fallback（已一并修复 OT 公式 bug）。
- **exporter 烟雾结束时间**：弃用 projectile 段尾采样，改用引擎事件
  `smokegrenade_expired` + entity ID 配对，烟雾实际结束时归零。

### 修复

- **OT 换边公式反了**：`ot_block % 2 == 0` 时本应交替阵营，旧代码却保持初态。
  现已修正（采样优先 + 公式 fallback 同时修）。

### 性能

- **烟雾 pairing 从 O(n×m) 降为 O(n+m)**：Python exporter 中用 dict index 替代
  线性扫描，单场 30+ 烟雾的效率改进。
- **`formatPercent` / `formatMatchLabel` 工具函数**：消除 9+ 处重复的百分比
  格式化 ternary 和 3 处重复的比赛标签拼接。

### 模块边界

- `packages/core/src/scoreboard.ts`：`playerScoreboardRowSchema` 新增 `indicators` 字段。
- `packages/contract/src/analysis.ts`：类型对齐 `@rivalhub/rival-rating` 0.3.0，
  RR 注释从联赛均值口径改为 frozen pro baseline。
- `apps/dak-studio/src/lib/dem.ts`：导出 `ExportedDemoFile` 接口，统一 `.dem` 导入的
  source 路径追踪。

## [0.3.2] — 2026-06-11

### 修复

- **2D 回放火出现延迟 7–10 秒**：exporter 此前用 `inferno_expire`（火熄灭）作为
  molotov 的 effect 事件，火在真实燃烧结束时才开始渲染。改用 `inferno_startburn`
  （起火），`inferno_expire` 单独解析并按回合+就近位置配对为 `destroyTick`，
  燃烧时长还原为真实 ~5.5–7s。**库内旧 demo 需重新导出才能看到正确时序**。
- **开局动线"最近 N 场"口径**：此前在选地图之前就按全库切最近 N 场，导致换图后
  样本不足且不是"该图最近 N 场"。现改为地图先行（直接读库条目元数据），范围按
  所选地图的最近 N 场比赛计算。
- **赛事总览数字列错位**：表头被强制左对齐而数字单元格右对齐，数字看起来漂在
  表头右侧很远。现表头与数字同向右对齐。
- **资料库导入工具条控件高低不齐**：标签输入框与按钮字号/对齐统一。

### 新增

- **2D 回放烟雾倒计时**：烟雾效果圈中央显示剩余秒数。

### 性能

- **赛事中台/排行榜/选手档案首屏提速**：跨场聚合派生产物（cohort、排行榜、
  档案、赛事洞察）持久化到 IndexedDB，资料库内容不变时重开应用直接命中缓存，
  不再重新解压解析全部 ZIP；逐场原始数据仅在查看个人洞察时懒加载。
- **批量导入**：逐场入库进度提示，场间让出主线程帧，减轻 UI 冻结感。

## [0.3.1] — 2026-06-11

### 修复

- **批量导入卡死在「解析回合事件 5%」**：PyInstaller 仅对 `demoparser2` 做
  `collect_all`，其运行时传递依赖（`pyarrow`、`polars`、`pandas`、`numpy` 等）
  大量遗漏，导致 `parse_events` 静态初始化失败后线程静默终止。`.spec` 显式全量
  `collect_all` 13 个核心包。同时 `_safe_events` 异常回退路径现记录 `WARNING`
  日志，`on_progress` 每个阶段都写日志（不再要求 10% 进度差），便于日后诊断。

## [0.3.0] — 2026-06-11

### 修复

- **打包版「导入 .dem」长时间无响应**：导出从同步阻塞的 bridge 调用改为后台任务——
  立即返回任务 id，前端每 0.5s 轮询阶段进度（解析回合/击杀/走位回放等 + 百分比 +
  已用时长 + 预计剩余），结果 ZIP 按 512KB 分块取回，单条 bridge 消息不再随文件
  大小膨胀。桌面壳现把日志写入 `userdata/studio.log`，导入是否开始、卡在哪一步
  一看便知。

### 新增

- **de_nuke / de_vertigo 双层雷达**：2D 回放与热力图支持上/下层切换；当前层实心
  显示，另一层选手以半透明幽灵态保留，道具效果与 C4 只画在所属层。
- **回合筛选器**（v0.2 query-first）：胜方阵营 / 经济类型 / 下包点 / 首杀方 /
  残局 / 多杀 3+ / 穿墙穿烟 / 结束方式 / 参与选手多维过滤回合列表。
- **统计跳回放**：回合事件行、选手回合卡片可点击，直接跳到 2D 回放对应回合与 tick。
- **2D 回放时间轴锚点**：scrubber 上方标出首杀/击杀/下包/拆包，点击跳帧。
- **回放叠加图层开关**：走位轨迹（最近 10 秒）、击杀连线（保留 3 秒）、道具可独立开关。
- **个人趋势**：ADR / KAST / FK-FD / Util/R 按比赛时间序列折线（个人实验室）。
- **Playstyle Fingerprint**：PRISM 八维风格雷达图。
- **Flash Value**：投掷数、敌我致盲秒数、净价值/颗、最严重队闪 Top（可跳回比赛）。
- **Mistake Review**：低买局首死、残局失利、死亡时间分布，每条附可点击回合证据。
- **买局质量**（比赛工作台·经济页）：两队各经济类型胜率链 + 手枪局转化率。
- **赛事总览**（赛事中台子页）：地图使用率、T/CT 胜率、手枪局 T 胜率与转化率。
- **报表导出**：比赛工作台一键导出 Markdown 比赛报告（记分板/关键回合/逐回合经济）；
  选手档案导出 Markdown 选手图卡。

### 变更

- Python 包许可证从 AGPL-3.0 统一为 MIT（与仓库根 LICENSE 一致），新增
  `THIRD-PARTY-NOTICES.md` 记录移植与改编出处。

## [0.2.0] — 2026-06-11

### 修复

- **Windows「导入 .dem」按钮报错**：`Demo/v2 ZIP(*.dem;*.zip) is not a valid file filter`。pywebview Windows 端校验过滤器标签只允许字母数字与空格，0.1.3 引入的标签含 `/` 直接抛错（macOS 不校验故未复现）。已改为合法标签 `CS2 Demo (*.dem;*.zip)`，并加兜底：过滤器仍被拒绝时退化为无过滤对话框，导入入口永远可用。

### 变更

- **资料库随应用走（Windows）**：数据从 `%APPDATA%/DAK Studio/userdata` 改为 exe 同目录 `userdata/`（便携式：直观可见、拷目录即迁移）。首次启动自动迁移旧 APPDATA 数据；目录不可写（如 Program Files）时自动回退 APPDATA。macOS 仍用 `~/Library/Application Support`（.app 内部不可写）。
- **按八模块框架重构导航**（见 docs/roadmap.md）：资料库 / 比赛工作台 / 个人实验室 / 对枪实验室 / 道具实验室 / 经济与节奏 / 赛事中台 / 教练工作台。未实现模块展示「制作中」占位页，附排期能力清单与现有替代入口。
- **开局动线归入「个人实验室」**：不再占一级入口，与选手档案以子页签并列。
- **动线地图限高**：地图不再独占视口，筛选控件与播放条同屏可见。

## [0.1.5] — 2026-06-11

### 修复

- **macOS 拖入 .dem OOM**：拖拽使用标准浏览器 drop 事件，pywebview 不注入 `pywebviewFullPath`，导致回退到字节传输将整文件读入内存。现 Studio 在 Python 端强制启用 `_dnd_state` 路径捕获，并通过新增的 `get_drop_path` API 将本机路径传回前端，拖入 .dem 走路径导出不再经过字节回退。
- **「导入 .dem」按钮无响应不报错**：原生对话框调用失败时 `importViaNativeDialog` 缺少 catch 分支，错误被静默吞没。已补全错误提示。

## [0.1.4] — 2026-06-10

### 修复

- **数据库持久化**：pywebview 默认 `private_mode=True` 导致 Windows 下 IndexedDB 存临时目录、重启丢失。现显式 `private_mode=False` + `storage_path` 落盘到 `%APPDATA%/DAK Studio/userdata/`（macOS 为 `~/Library/Application Support/DAK Studio/userdata/`）。

## [0.1.3] — 2026-06-10

### 修复

- **桌面导入按钮回归**：0.1.2 互斥替换导致原生对话框不可用时零导入途径。现改为双按钮共存（「导入 .dem」原生对话框 + 「导入 ZIP」文件选择），互不替代。
- **拖入 .dem 全平台可用**：Windows pywebview 拖入的 File 无 `pywebviewFullPath`，新增 `export_dem_bytes` API 回退字节传输，拖入不再要求文件系统路径。

### 新增

- **C4 掉落标记**：2D 回放中 C4 掉落地面后以半透明闪烁标记显示位置，直至被捡起或安放。
- **道具飞行轨迹尾迹线**：2D 回放中随播放逐帧延伸的 SVG 虚线，颜色与对应道具落点一致。

### 移除

- 回放模块入口与 Fact 栏中的「含拆弹器状态」/「无拆弹器状态」占位文案（该状态已通过玩家 token 上的 kit/c4 标签表达）。

## [0.1.2] — 2026-06-10

### 变更

- **Release 只发 DAK Studio**：不再产出 `cs2dak` 独立导出器 DMG/zip（Studio 自带 exporter bridge）。本地需纯导出器时 `PACKAGE_EXPORTER=1 bash scripts/package.sh`。
- **内置示例换为职业局**：FURIA vs Vitality de_mirage（之前为 NJU 校赛 demo）。
- **修复按钮文字换行**：CSS `white-space: nowrap` + `flex-shrink: 0`。
- **README 以 Studio 为主导重写**：下载入口优先，功能表格，管道图保留。

## [0.1.1]

### 修复

- vitest 4 根治 CI worker RPC 超时。

## [0.1.0] — 2026-06-08

### 新增

- DAK Studio 首个桌面版本：pywebview 壳 + React 前端 + Python exporter bridge。
- 资料库：IndexedDB 本地存储，导入 .dem（自动转 v2 ZIP）/ v2 ZIP，标签检索，全窗口拖拽。
- 比赛工作台：回合浏览、经济面板、武器统计、对位矩阵、地图图层、8Hz 2D 回放。
- 选手档案：个人 RR 拆解、回合事实、跨场趋势。
- 开局动线：跨场走位与道具习惯（按地图聚合）。
- 排行榜：跨场 RR/PRISM 指标对比。
- 启动时自动检测 GitHub Release 更新。

## 历史版本

[0.2.1] 为 npm 包层级的废弃 tag，未对应 Studio 桌面版本。

[0.4.1]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.4.1
[0.4.0]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.4.0
[0.3.2]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.3.2
[0.3.1]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.3.1
[0.3.0]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.3.0
[0.2.0]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.2.0
[0.1.5]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.1.5
[0.1.4]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.1.4
[0.1.3]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.1.3
[0.1.2]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.1.2
[0.1.1]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.1.1
[0.1.0]: https://github.com/Starfie1d1272/cs2-demo-analysis-kit/releases/tag/v0.1.0
