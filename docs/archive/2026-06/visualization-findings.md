# 可视化调研记录（2026-06）

> 范围：`@cs2dak/react` 的 MatchWorkspace 2D 回放查看器 + 周边组件。
> 定位：现状是可用框架，本文记录已发现的问题与按优先级排的待办，供迭代。
> 设计规格见 [match-workspace.md](match-workspace.md)。

---

## 已修复

### 🔴 回放选手朝向镜像错误（已修）

- **现象**：2D 回放里选手朝向不对。
- **根因**：**渲染端**而非导出端。`MatchWorkspace.tsx` 用 `rotate(${yaw}deg)` 直接转 marker，
  但 (1) marker 默认朝向指示器（`.dak-replay-token::after`）指**上=北**，而世界 yaw 0°=东；
  (2) `worldToRadar` 翻转了 Y 轴（北朝上），CSS rotate 是顺时针，世界 yaw 是逆时针。
- **修复**：marker 转 `90 − yaw`（同时吸收 90° 偏移与 Y 翻转的符号），内部文字/kit 反向补偿
  `yaw − 90` 保持水平。导出器存的原始世界 yaw（−180..180）是对的，未改。
- **约定备注**：世界 yaw = 逆时针自东（Source 标准，demoparser2 原样透出）；radar 北朝上。
  以后任何"世界角度 → radar 屏幕角度"都用 `screenDeg = 90 − worldYaw`。

---

## 回放查看器的功能缺口（按优先级）

### 🟠 P1 炸弹 / C4 未在回放时间轴上渲染
- 现状：C4 显示"暂不显示"；选手 token 有 `hasBomb` flag，但地图上无 C4 marker。
- 数据：`core` 已生成 `type:"bomb"` 的 `WorkspaceSpatialPoint`（下包/拆包点），但那是**热力图层**，
  不是逐帧时间同步。回放帧模型不带每帧 C4 世界坐标。
- 建议：回放帧补一个 bomb 实体轨迹（持有者携带 → 落地 → 引爆/拆除），或至少在下包后于包点画固定 C4。

### 🟠 P1 道具（烟/火/闪/雷）未在回放上渲染
- 数据：`core` 已有 `type:"grenade"` 的 `WorkspaceSpatialPoint`（effectPosition），同样只在热力层。
- 缺口：2D 战术回放看不到烟墙/火/闪——对复盘价值极高（也是 P4 Utility Block 的可视化对应）。
- 建议：按 tick 把 grenade 效果叠加到回放（烟=半透明圆，火=区域，闪=瞬时），用 `destroyTick` 控生命周期。

### 🟡 P2 死亡选手回退到陈旧帧
- `currentPlayers` 在当前帧缺失时回退 `find(alive) ?? frames[0]`，可能把已死选手画在出生点/旧位置。
- 建议：死亡帧应明确隐藏或定格在死亡点，而非回退到首个存活帧。

### 🟡 P2 无事件叠加 / 时间轴标记
- 回放没有击杀/交火/下包等事件标注，scrubber 上也无事件刻度，难快速跳到关键时刻。
- 建议：scrubber 叠加事件刻度（kill/plant/defuse），点击跳帧。

### 🟢 P3 轨迹拖尾 / 朝向锥
- 仅显示当前点，无短轨迹拖尾、无视野锥，难判断移动方向与对枪朝向。

### 🟢 P3 播放体验
- `setInterval` 帧进（msPerFrame ≥35ms）在高倍速/低采样下不平滑；可考虑 rAF + 插值。
- 死亡/重生、回合切换时 frameIndex 不复位检查 ok，但切回合后播放状态保留，体验待打磨。

---

## 周边组件快扫

- **HeatmapCanvas**（111 行）：吃 `WorkspaceSpatialPoint`，bomb/grenade/kill/death 分层 OK。
  与回放是两套（热力 vs 时间同步），数据同源但未打通——可共享 zone 叠加（P4 zones 就绪后）。
- **EconomyPanel / ScoreboardTable / RoundTimeline / QaReportPanel**：展示型，结构清晰，
  本次未发现功能性 bug（仅随主题/布局微调）。
- **DemoAnalysisDashboard**：聚合容器，OK。

---

## 数据可用性结论

回放的"看不到炸弹/道具"**不是数据缺失**——`positions-1s`/`grenades`/`bombs` 都在 v2 ZIP 里，
`core` 也已派生为空间点。缺的是**把这些实体接进时间同步的回放帧模型**（目前只有选手 token 进了回放，
其余只进了热力图层）。这是渲染/建模接线问题，不需要改导出器或 schema。

## 建议优先级
1. 朝向修复（✅ 本次）。
2. P1：炸弹 + 道具接入回放时间轴（复盘价值最高，数据已就绪）。
3. P2：死亡帧处理 + 事件刻度。
4. P4 zones 就绪后：回放/热力叠加区域语义，与地图控制指标联动。
