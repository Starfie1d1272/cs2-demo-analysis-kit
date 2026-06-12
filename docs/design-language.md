# DAK Studio 设计语言 「Tactical Slate」

> 2026-06-12 成文。本文是 DAK Studio（`apps/dak-studio`）唯一的 UI/前端设计约定，
> **所有新页面与组件改动必须遵守本文**；与 studio.css 现状冲突时以本文为准，
> 逐步把存量页面收敛过来。嵌入的 `@cs2dak/react` 组件通过覆盖 `--dak-*`
> 变量统一外观，不允许在 Studio 侧 fork 组件样式。

## 1. 性格与隐喻

- **战术板**：深石墨底（near-black graphite）+ 荧光青绿 accent，像教练桌上的
  电子战术板。信息密度高、对比克制、无装饰性渐变与阴影堆叠。
- **证据感**：所有数字都是「可质询的证据」——可点击的统计值有 accent 色与
  hover 反馈；不可点击的纯陈述用中性灰。Query-first 是交互语言的一部分。
- **与 demo-lab 区分**：demo-lab 是橙色蓝图风（开发预览用），Studio 永远不用
  橙色作为主 accent。

## 2. 设计 Token（唯一来源：`apps/dak-studio/src/studio.css` `:root`）

### 颜色

| Token | 值 | 用途 |
|---|---|---|
| `--dak-bg` | `#0b0e10` | 页面底 |
| `--dak-bg-subtle` | `#0e1214` | 区块底（比页面底略浅） |
| `--dak-panel` | `#12171a` | 卡片/面板底 |
| `--dak-panel-hi` | `#182025` | 面板 hover / 选中态底 |
| `--dak-border` | `#232d33` | 默认描边 |
| `--dak-border-hi` | `#34424b` | hover / 焦点描边 |
| `--dak-fg` | `#ecf3f1` | 主文字 |
| `--dak-fg-mid` | `#9fb0ac` | 次级文字（标签、说明） |
| `--dak-fg-dim` | `#66766f` | 弱化文字（meta、占位） |
| `--dak-accent` | `#2fe0a8` | 主 accent：可交互、选中、正向强调 |
| `--dak-accent-soft` | `rgba(47,224,168,.12)` | accent 底色（chip、选中底） |
| `--dak-accent-b` | `#6f9bff` | 第二 accent：对照系列、CT 侧、链接性信息 |
| `--dak-accent-b-soft` | `rgba(111,155,255,.13)` | 第二 accent 底色 |
| `--dak-ok` / `--dak-warn` / `--dak-danger` | `#4fd98a` / `#f3c64f` / `#ff5f6e` | 语义状态：QA 通过/警告/错误、收益正/中/负 |

**规则**：
- 禁止新增裸色值。需要新色先在 `:root` 注册 token 并更新本表。
- T/CT 双侧对照统一用 `--dak-warn`（T，暖）vs `--dak-accent-b`（CT，冷）；
  胜负、收益正负统一用 `--dak-ok` / `--dak-danger`。两套语义不得混用。
- 图表系列色顺序固定：accent → accent-b → warn → danger → fg-mid。

### 字体与排版

- 正文：`--dak-font`（Avenir Next / PingFang SC 栈）；数字、tick、ID、坐标
  一律 `--dak-mono`。
- 层级只允许四档：视图标题（18–20px/600）、区块标题（13–14px/600，常配
  `letter-spacing` + `--dak-fg-mid` 大写或小标签风）、正文（13px）、
  meta（11–12px/`--dak-fg-dim`）。不引入更多字号。

### 形状与间距

- 圆角：面板 `--stu-radius`(10px)，控件/chip `--stu-radius-sm`(7px)。无其他圆角。
- 间距走 4 的倍数（4/8/12/16/18/24）。卡片内边距 14–18px。
- 侧边栏宽 `--stu-sidebar-w`(218px)，sticky，全局唯一的一级导航。

## 3. 结构与命名

- Studio 壳层类名一律 `stu-` 前缀；嵌入组件样式只通过 `--dak-*` 变量定制。
- 页面骨架统一：`stu-view`（标题 + 副说明）→ 工具行（筛选器/范围切换）→
  内容区（卡片栅格或主从布局）。所有视图顶部必须有一句话副说明
  （`--dak-fg-mid`）说明本页回答什么问题。
- 禁止组件内联 style 写颜色/字体（布局尺寸类内联可接受）；禁止每个视图
  自造一套按钮/chip/表格样式——公共原语（`EmptyState`/`EvidenceLink`/`MetricInfo`
  在 `components/primitives.tsx`，按钮/tab/chip/stat 卡/数据表样式在 studio.css
  公共段）只在公共位置定义一次。

## 4. 交互规范

1. **Query-first 证据链**：凡跨页跳转到 2D 回放/回合列表的统计值，渲染为
   accent 色可点元素（`EvidenceLink` 原语），hover 显示去向。
2. **ⓘ 口径说明**：所有派生指标必须带 `MetricInfo` 原语（ⓘ tooltip，公式、窗口参数、
   已知误差）。宁缺毋滥：做不准的指标标 beta 或不展示，不给黑箱数。
3. **空态三件套**：每个视图必须处理 无数据 / 数据不足（样本量过小）/
   加载中 三种状态，使用 `EmptyState` 原语（`variant="empty|insufficient|error"`），
   文案说明「需要什么才能点亮本页」。
4. **范围切换**：跨场视图统一使用 CohortScope（赛季/标签/队伍范围），
   不自造范围选择器。
5. **null 即 null**：缺失数据显示 `—`，不显示 0。

## 5. 验收清单（新页面 PR 自查）

- [ ] 无裸色值、无新字号、无视图私有按钮/表格样式
- [ ] 数字证据可点击跳回放；派生指标带 ⓘ
- [ ] 三种空态齐全；缺失值显示 `—`
- [ ] T/CT、胜负配色符合语义规则
- [ ] 视图有一句话副说明
