# #64 Phase A/B artifact audit（2026-10-11）

初始验证基线：main `6beb85c876c8f3f6d18d6403ac39798a52b9fb46`；最终分支已 rebase 到 #95 已审 main `67684857814c31c2b07456d5ed34974aa983d95d`，完整保留其 diagnostics/receipt 实现。工具：Node 24.19.0 / npm 11.9.0 / pnpm 12.9.1 / TypeScript 7.0.2 / esbuild 0.28.2。

## 最终解决路径：DAK 编译精确上游依赖，七包 tgz consumer 通过

五个 source-export 公共包统一为 dist JS/declarations，保留入口及 React theme.css；tournament tgz 移除测试、保持零 runtime/peer/optional 依赖。B 的源码和 manifest graph gate 固定 Core → Tournament DTO-only 与 private Evidence → Core canonical adapter。

只读核查 npm dist-tags/versions 与实际 exports：最新正式版本仍为 format 3.1.0 / rating 0.3.0，没有 compiled 升级路线。最初真实 consumer 被两上游阻断，分别在只安装 registry 精确版本的独立项目中 Node 24 直接 import 均报 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`。可访问的版本化原始证据：

| 上游 | 正式包 metadata / archive | root export |
|---|---|---|
| cs2-demo-format@3.1.0 | [metadata](https://registry.npmjs.org/cs2-demo-format/3.1.0) / [tgz](https://registry.npmjs.org/cs2-demo-format/-/cs2-demo-format-3.1.0.tgz) | ./schemas/index.ts |
| @rivalhub/rival-rating@0.3.0 | [metadata](https://registry.npmjs.org/@rivalhub%2Frival-rating/0.3.0) / [tgz](https://registry.npmjs.org/@rivalhub/rival-rating/-/rival-rating-0.3.0.tgz) | ./src/index.ts |

本 PR 在 DAK 既有 build 范围内解决，无需先写入/发布上游仓库：

- 只 bundle 两个**精确版本的原版 registry dependency** 为生成 ESM 模块，DAK 自身模块和包间 exports 不 bundle。一个 package 内多个模块引用同一个生成 dependency module；Core 私有事实缓存和 canonical adapter 不被复制。
- DAK 生产源码继续 import 原 owner；只改生成 JS 的 module specifier。声明继续引用原包，manifest dependency 固定相同精确版本（包括 rating type-only 依赖），使 runtime/types 版本一致。Zod、JSZip、React 等仍是正常 npm dependency/peer，不 bundle。
- `scripts/lib/bundled-dependencies.mjs` 固定 version、原 tgz integrity、输入源码 SHA-256 和许可证 SHA-256；build 检查所有实际 bundle 输入，只允许来自该原包，拒绝源文件漂移。每个 tgz 附完整 MIT notice、输入/生成 JS 哈希和版本化来源，不复制/改写公式或 schema 源码到仓库，不造 fork。
- rating 的发布源码与 [MIT licensed commit](https://github.com/Starfie1d1272/rival-rating/tree/17b565f0f826b0b9f78548e9059d8a572b922182) 全部源码文件的 git blob 哈希一致。format 正式包 manifest 明确标 MIT；附 [固定 commit 的完整 MIT notice](https://github.com/Starfie1d1272/cs2-demo-format/blob/aea485d8163e1b0caa729157cf2f137159a94ff0/LICENSE)。原 npm tgz 未附 LICENSE 文件，此缺项由生成产物中的 notice 补齐。

这是原版依赖的分发编译，不改变 schema/评分/分析 owner 或算法；升级上游时必须同时更新精确依赖与 hashes/license provenance，再验真实 consumer。上游自己的 npm root 仍未修复，不声称直接 import 它们已通过。#98 是普通 Ready 审查状态，不等于已批准合并或正式发布。

## 实际 tgz 验证

`pnpm check:package-consumers` 实际 pack 七 tgz。逐包 consumer 只声明 root/React peers，全部传递 DAK dependency 用 npm overrides 固定到本次 tgz；安装目录无 workspace symlink，tgz 无 src/test/build metadata。检查公开 JS/types、生成模块 provenance/完整许可证，并禁止任何发布 JS 再 import 两上游的 source-only npm 入口。

七包均在仓外 npm consumer 通过 Node ESM、实际 API 调用、strict NodeNext（skipLibCheck=false）完整声明闭包。声明检查之后还移除已安装两上游的 source trees，在新 Node 进程重新 import/call，证明 runtime 不依赖 TS fallback；没有改写/编译安装后的依赖来隐藏失败，没有 tsx/workspace source aliases。

| Root | 自动安装的 DAK 闭包 | 实际 API smoke | Node / strict TS |
|---|---|---|---|
| contract | contract | 原 schema parse | 通过 |
| maps | maps | calibration | 通过 |
| core | core, contract, maps, tournament | 真实 ZIP load → analyze | 通过 |
| cohort | cohort, contract, core, maps, tournament | cohort aggregation | 通过 |
| tournament | tournament | economy/performance aggregation | 通过 |
| presentation | presentation, contract, cohort, core, maps, tournament | formatter | 通过 |
| react | react, contract, maps, presentation, cohort, core, tournament | React SSR | 通过 |

maps 专项另外通过五入口 API、JSON/tri 资产、strict NodeNext，以及删除全部空间资产后的新进程 calibration 隔离。

## 真实 pack-size 记录

本次实际 tgz 经 `npm pack <archive> --dry-run --json` 记录。包含自动附带的 manifest/LICENSE/README 与生成 dependency module/notices/provenance；没有 Changesets version/publish，不推定 registry 已更新。

| Package | Compressed bytes | Unpacked bytes | Files |
|---|---:|---:|---:|
| contract | 56,313 | 373,458 | 48 |
| maps | 3,600,756 | 18,897,489 | 74 |
| core | 102,684 | 372,724 | 90 |
| cohort | 32,740 | 122,609 | 15 |
| tournament | 13,219 | 68,764 | 10 |
| presentation | 77,074 | 274,639 | 52 |
| react | 59,755 | 235,483 | 36 |

D 仅完成体积量化；尚无外部轻 consumer 的安装/CI/冷启动成本证据，maps 资产和五入口不拆包。

## 验证与未完成范围

- 6 architecture tests：真实 graph；forbidden type/re-export/dynamic/require/import-type；manifest-only 反向边；DTO-only；未声明/跨包路径；生产导入测试模块拒绝。
- 初始基线上冷清理全部生成 dist/tsbuildinfo 后 build:packages → typecheck → build:uploader → Studio dependency-closure build；release-policy、837 fast、8 ZIP integration、145 Python（uv dev/gui extras）、21 release/build 脚本测试均通过。最终集成 #95 后的完整数量和结果以对应 PR head 的 CI logs 为准。
- 七包真实 tgz Node/API/strict TS/完整传递依赖与 source-free runtime isolation；maps 专项资产隔离。
- 最终 frozen install + pnpm exec 锁文件 SHA-256：`609b912213d8f06edc390c27d6bb403c49ccc502ad1cdb62870d4763fdd1fc7a`。

#68 是已关闭重复记录；#69 canonical identity correctness 已完成，本 PR 固定该 adapter graph。不改分析/identity/UI，不碰 #95 diagnostics/receipt。C 总体跨消费者 seam 验收不由本 PR 重新宣告完成；D 尚需外部 consumer 成本决策，E 尚需 DTO ownership/consumer inventory，browser matrix 尚未验收。

#64 保持 open；#47 仍需正式发布后的 registry Node 24 smoke。A/B 改动等待完整 CI 与父独立审再合 main。未写入上游仓库、未正式 publish/tag。
