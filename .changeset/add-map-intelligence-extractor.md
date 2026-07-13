---
"@cs2dak/core": minor
---

新增 `extractMatchMapIntelligenceFacts` 与共享 tactical 的组合 facade：从 v3 `DemoPackage` 输出紧凑的逐回合位置、队形和 AWP 观测事实；缺失 replay、nav、callout 或 shots 时保留明确 availability 与 null/unknown 状态，原始 replay frame 不进入公共 API。
