# DAK Studio

> **License: AGPL-3.0-only**（见本目录 [LICENSE](LICENSE)，Copyright (c) 2026 Starfie1d）。
> 与仓库其余部分（MIT 生态包）不同：Studio 是产品，分发或以网络服务提供衍生版本时必须开源。

本地 Demo 工作台：导入 `cs2-demo-format/3.x` ZIP，做战术分析与个人打法复盘。
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

- **资料库**：导入 .dem / v3 ZIP（多选 / 拖拽 / 示例 / 批量标签）、检索、地图与标签筛选。ZIP 字节存 IndexedDB（内容哈希去重），.dem 经 cs2df 转 ZIP 后入库（不存 .dem），解析结果只缓存内存。
- **比赛工作台**：嵌入 `MatchWorkspace`（总览/回合/选手/经济/武器/对位/地图/回放）+ QA 徽章（strict validator + 分析 QA）。
- **选手档案**：跨场画像（RR / Rating 2.0 / 六账户 / PRISM / 武器 / 每场走势 / 比赛列表）+ 关注选手 + 双人对比。
- **开局动线**：选手在长枪局开局前 30 秒的走位 + 道具投掷叠加动画（默认最近 5 场，地图/阵营筛选，逐回合开关）。数据由 `@cs2dak/presentation` `buildOpeningTrails` 派生。
- **排行榜**：`SeasonLeaderboard`，点选手跳档案。

选手档案、开局动线与排行榜共享同一个「聚合范围」（地图多选 + 标签 + 单场勾选），对应 `buildSeasonCohort` 的输入集合。

## .dem 导入与打包形态

数据库长期只存 v3 ZIP；.dem 在导入时即时转换：

- **开发模式**（`pnpm dev:studio`）：Vite 中间件 `POST /api/export-dem` 调 `uv run cs2df export`。
- **打包版**（`scripts/package.sh`）：pywebview 桌面壳 `cs2dak-studio` 托管 Studio 构建产物，
  `.dem` 经 JS bridge（`python/src/cs2dak/studio.py`）走本机 cs2df。Python 与前端打进同一个
  应用（PyInstaller `packaging/cs2dak-studio.spec`），运行时不需要 Node。

## 设计语言「Tactical Slate」

`src/studio.css` 覆盖 `:root` 的 `--dak-*` 设计变量（青绿 accent #2fe0a8）统一嵌入组件，不 fork 组件；
Studio 自有壳层用 `stu-*` 前缀；`.stu-embed .dak-shell` 去掉全屏壳背景。

## Roadmap（未实现，按价值排序）

1. 选手跨场热力图（CSDM PlayerHeatmap 形态）—— 需要 presentation 聚合多场 spatial points。
2. 资料库备注 / 比赛评论（CSDM comment 形态）。
3. 开局动线扩展：CT 默认站位对比、强起局开关、按 zone 的到点时间统计。
4. Demo 下载集成（Valve / Faceit 分享码）。
