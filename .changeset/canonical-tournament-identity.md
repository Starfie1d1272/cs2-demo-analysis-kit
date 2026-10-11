---
"@cs2dak/core": minor
"@cs2dak/presentation": major
---

将单图 frozen Tournament economy/performance 数据投影收口到现有 Core，显示队名与昵称不再决定身份；Presentation 保留显示包装并直接消费同一投影。

兼容性变化：手写 TournamentFacts 必须提供完整 stable team/player IDs；两个不同 ID 的同名队伍不再隐式合并。相同 ID 改名仍归并。未绑定本地 Demo 使用 match-scoped 观察身份；Studio 派生缓存需要本地回填。此记录用于后续 npm 版本流程，本变更不发版。
