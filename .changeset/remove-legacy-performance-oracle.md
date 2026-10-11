---
"@cs2dak/core": major
---

删除已完成迁移的 playerStats 旧口径对照、assertPlayerStatsParity/findPlayerStatsParityMismatches 公开 API 与专用 openingParity 元数据；新分析不再输出旧 parity 诊断。canonical FK/FD 保持首个有效敌对击杀的成对 opening-duel 定义，新增直接源事件守恒与 supplied facts 校验，保留真实源 QA、playerStats 合同读取和 collateral 观察字段。历史 ZIP/Evidence 不改写，历史诊断仍可安全读取。analysisVersion 升为 1.0.4，semantic profile 保持 dak-stable/3；本变更不发版。
