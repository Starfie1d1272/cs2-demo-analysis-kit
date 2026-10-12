# @cs2dak/tournament

## 1.1.2

### Patch Changes

- 31b461f: 公共包统一发布编译后的 ESM 与 declarations，保留既有 root/subpath API；React theme.css 继续公开并保留 CSS side effect。移除 tournament 发布产物中的测试文件，保持零 runtime dependency。真实 tgz 的逐包 Node ESM、strict NodeNext 与完整传递依赖 consumer gate 在 CI/publish 前执行；不修改分析算法、稳定身份或 UI。

  在 DAK build 中将精确的 cs2-demo-format@3.1.0 / @rivalhub/rival-rating@0.3.0 原版 registry 源码生成 ESM dependency 模块，仅重写 DAK 生成 JS 的依赖路径；保留模块身份、上游唯一语义 owner 与 MIT notices，声明引用相同精确版本。附源码哈希/原包 integrity/许可证 provenance，消除上游 source-only npm 入口造成的 Node 闭包阻塞，不修改原分析公式或 schema。

## 1.1.1

### Patch Changes

- 9da18a7: Keep Tournament validation at the frozen-fact aggregation boundary. The performance aggregator no longer re-derives Core semantic relationships between `deaths`, `survived`, `teamWonRound`, and `clutch.won`; it continues to enforce structural, referential, duplicate, and aggregation-safety invariants.

## 1.1.0

### Minor Changes

- 532faf7: 收口 Core canonical player-round performance facts，并补齐冻结赛事事实的透明 Player / Team / Map performance analytics；所有 rate 保留 numerator/denominator，支持 overall/T/CT 与 identity-safe 跨图聚合。同步将 Core parity QA 纳入 Evidence 生成门禁，并失效旧 derived cache，避免旧语义继续进入确认数据链路。
