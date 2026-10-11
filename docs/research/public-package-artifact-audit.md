# #64 Phase A/B artifact audit（2026-10-11）

基线：main `6beb85c876c8f3f6d18d6403ac39798a52b9fb46`。工具：Node 24.19.0 / npm 11.9.0 / pnpm 12.9.1 / TypeScript 7.0.2。

## 当前结论：A 的完整 Node 依赖闭包阻塞，不能合并/发布

本 PR 将五个 source-export 公共包改为 dist JS/declarations，保留入口及 React theme.css，并移除 tournament tgz 中的测试文件。B 的实际源码和 manifest graph gate 已通过，包括 Core → Tournament DTO-only 和 private Evidence → Core canonical adapter。**A/B 整体尚不能标为 Ready 或已验收**：真实 npm consumer 暴露了两个上游 registry 源码入口，不能把 DAK 仓内成功当成外部可消费证据。

独立临时 npm 项目（只安装精确 registry 版本，无 workspace links / tsx / source alias）分别直接 import：

| 上游 | 当前 registry root export | Node 24 结果 |
|---|---|---|
| cs2-demo-format@3.1.0 | ./schemas/index.ts | ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING |
| @rivalhub/rival-rating@0.3.0 | ./src/index.ts | ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING |

需要各上游 owner 提供 compiled ESM/declarations 的真实 tarball 和兼容版本合同，再验证 DAK 的完整 tgz 闭包；后续正式 registry 更新必须另走发布授权。本 PR 不 bundle/fork 上游公式或 schema，不修改上游已安装包掩盖失败，不正式 publish/tag。默认 CI 和 publish gate 都保留真实失败，阻止误合与误发。

## 实际 tgz 验证

命令：`pnpm check:package-consumers`。逐包 consumer 只声明该包及所需 React peers；所有传递 DAK dependency 用 npm overrides 固定到本次 pack 的对应 tgz。验证安装目录不是 workspace symlink、没有源文件/测试/build metadata；检查每个公开导出 JS/types 文件；strict NodeNext 声明全闭包使用 skipLibCheck=false。七包声明检查均成功；没有 NodeNext TS diagnostics。以下 Node 结果是实际 import/call，不是 tsc 输出推测。

| Root consumer | 自动安装的 DAK 闭包 | Node import/call | strict TS |
|---|---|---|---|
| contract | contract | 上游源码阻塞 | 通过 |
| maps | maps | 通过 | 通过 |
| core | core, contract, maps, tournament | 上游源码阻塞 | 通过 |
| cohort | cohort, contract, core, maps, tournament | 上游源码阻塞 | 通过 |
| tournament | tournament | 通过 | 通过 |
| presentation | presentation, contract, cohort, core, maps, tournament | 上游源码阻塞 | 通过 |
| react | react, contract, maps, presentation, cohort, core, tournament | 上游源码阻塞 | 通过 |

consumer API checks 已写入 gate：schema parse、maps calibration、真实 ZIP → Core analyze、空 cohort/Tournament aggregation、presentation formatter、React SSR。被上游阻塞的五包未执行其 API 调用，不能声称调用验证通过。maps 专项 gate 另外通过五入口 API、JSON/tri 资产、strict NodeNext 以及移除所有空间资产后的新进程 calibration 隔离。

## 真实 pack-size 记录

同一运行实际 `.tgz` 经 `npm pack <archive> --dry-run --json` 记录；包含自动附带的 manifest/LICENSE/README。版本未执行 Changesets version，因此是当前开发版本的 artifact 记录，不能推定 registry 内容。

| Package | Compressed bytes | Unpacked bytes | Files |
|---|---:|---:|---:|
| contract | 51,729 | 356,949 | 45 |
| maps | 3,600,756 | 18,897,489 | 74 |
| core | 90,116 | 333,990 | 87 |
| cohort | 20,108 | 83,877 | 12 |
| tournament | 13,219 | 68,764 | 10 |
| presentation | 64,588 | 235,907 | 49 |
| react | 59,755 | 235,483 | 36 |

此记录只完成 D 的体积测量部分；尚无外部轻 consumer 的安装/CI/冷启动成本证据，保持 maps 资产和五入口不拆包。

## 验证与未完成范围

- B：6 项 architecture tests（真实 graph + forbidden type/re-export/dynamic/require/import-type、manifest-only 反向边、DTO-only、未声明/跨包路径、生产导入测试模块拒绝）通过。
- `pnpm typecheck`、`pnpm build`、837 fast tests、8 ZIP integration、145 Python tests（uv dev/gui extras）、21 项 release/build 脚本测试、release policy 通过。
- frozen install + pnpm exec 未改变锁文件 SHA-256：`5eb25a5b36c2412ea11a7284f5dcfaea8f56e126c45a5a5797f315f22743fba5`。
- `pnpm check:package-consumers` **失败**，原因见上游表；所有本次 DAK tgz file/export 检查和 strict TS 均通过。

#68 是已关闭的重复记录；#69 的 canonical stable-identity correctness 已完成，B 固定了该 adapter 方向。本 PR 不重新修改分析/identity/UI，不触碰 #95 diagnostics/receipt。C 的跨消费者总体 seam 验收不在本 PR 重新宣告完成；D 尚需外部 consumer 成本决策，E 尚需真实 DTO ownership/consumer inventory。browser consumer matrix 尚未验证。

#64 必须保持 open；#47 等待正式发布后的 registry Node 24 smoke，不能从本地 tgz 通过关闭它。A/B PR 仅在上游依赖合同修复并且完整 tarball gate 通过后，交父独立审再合 main。
