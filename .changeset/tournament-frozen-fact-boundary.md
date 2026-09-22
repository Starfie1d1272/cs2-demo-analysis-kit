---
"@cs2dak/tournament": patch
---

Keep Tournament validation at the frozen-fact aggregation boundary. The performance aggregator no longer re-derives Core semantic relationships between `deaths`, `survived`, `teamWonRound`, and `clutch.won`; it continues to enforce structural, referential, duplicate, and aggregation-safety invariants.
