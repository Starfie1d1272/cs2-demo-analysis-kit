# @cs2dak/tournament

## 1.1.1

### Patch Changes

- 9da18a7: Keep Tournament validation at the frozen-fact aggregation boundary. The performance aggregator no longer re-derives Core semantic relationships between `deaths`, `survived`, `teamWonRound`, and `clutch.won`; it continues to enforce structural, referential, duplicate, and aggregation-safety invariants.

## 1.1.0

### Minor Changes

- 532faf7: 收口 Core canonical player-round performance facts，并补齐冻结赛事事实的透明 Player / Team / Map performance analytics；所有 rate 保留 numerator/denominator，支持 overall/T/CT 与 identity-safe 跨图聚合。同步将 Core parity QA 纳入 Evidence 生成门禁，并失效旧 derived cache，避免旧语义继续进入确认数据链路。
