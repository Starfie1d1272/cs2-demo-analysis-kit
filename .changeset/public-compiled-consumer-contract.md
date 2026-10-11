---
"@cs2dak/contract": patch
"@cs2dak/core": patch
"@cs2dak/cohort": patch
"@cs2dak/presentation": patch
"@cs2dak/react": patch
"@cs2dak/tournament": patch
---

公共包统一发布编译后的 ESM 与 declarations，保留既有 root/subpath API；React theme.css 继续公开并保留 CSS side effect。移除 tournament 发布产物中的测试文件，保持零 runtime dependency。真实 tgz 的逐包 Node ESM、strict NodeNext 与完整传递依赖 consumer gate 在 CI/publish 前执行；不修改分析算法、稳定身份或 UI。本记录补充既有语义 Changesets，仅供后续版本流程，不执行 publish/tag。
