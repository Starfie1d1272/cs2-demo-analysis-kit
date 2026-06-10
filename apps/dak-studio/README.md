# DAK Studio

本地 Demo 工作台：导入 `cs2-demo-format/2.0` ZIP，做战术分析与个人打法复盘。
形态对标 CS Demo Manager，分析能力全部来自 `@cs2dak/*` 共享包——Studio 只做适配与编排（模块边界见 `docs/module-boundaries.md`）。

```bash
pnpm dev:studio   # http://127.0.0.1:5178
```

## 目标用户与对应能力

| 用户 | 用法 |
|---|---|
| 普通玩家 | 导入自己的 demo，「关注选手」标星自己，看跨场趋势与强弱项 |
| 高校赛主办方 | 导入赛事全部导出包，排行榜 + 比赛 QA 徽章检查导出质量 |
| 参赛选手 | 聚合范围筛到本赛季，档案页逐场跳转复盘 |
| 数据分析师 | 导入职业 demo，按地图筛聚合范围，选手对比 |

## 视图

- **资料库**：导入（多选 / 拖拽 / 示例）、检索、地图筛选。ZIP 字节存 IndexedDB（内容哈希去重），解析结果只缓存内存。
- **比赛工作台**：嵌入 `MatchWorkspace`（总览/回合/选手/经济/地图/回放）+ QA 徽章（strict validator + 分析 QA）。
- **选手档案**：跨场画像（RR / Rating 2.0 / 六账户 / PRISM / 武器 / 每场走势 / 比赛列表）+ 关注选手 + 双人对比。
- **排行榜**：`SeasonLeaderboard`，点选手跳档案。

选手档案与排行榜共享同一个「聚合范围」（地图多选 + 单场勾选），对应 `buildSeasonCohort` 的输入集合。

## 设计语言「Tactical Slate」

`src/studio.css` 覆盖 `:root` 的 `--dak-*` 设计变量（青绿 accent #2fe0a8）统一嵌入组件，不 fork 组件；
Studio 自有壳层用 `stu-*` 前缀；`.stu-embed .dak-shell` 去掉全屏壳背景。

## Roadmap（未实现，按价值排序）

1. 比赛工作台增加武器 / 对位（duels）tab —— 归 `@cs2dak/react` 共享层，kills/damages 数据已具备。
2. 选手跨场热力图（CSDM PlayerHeatmap 形态）—— 需要 presentation 聚合多场 spatial points。
3. 资料库 tags / 备注（CSDM demos 管理形态）。
4. 直接导入 `.dem`（调用本仓库 Python exporter 或打包 sidecar）。
