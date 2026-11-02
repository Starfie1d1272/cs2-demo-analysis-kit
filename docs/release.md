# 版本与发布流程

本仓库有 **两条独立版本流**，不要混用：

| 版本流 | 对象 | 版本来源 | tag 形式 | 发布渠道 |
|---|---|---|---|---|
| 桌面应用 | DAK Studio / RivalHub Demo Uploader / cs2dak GUI 壳（根 `package.json`、私有 workspaces、`python/`） | `vX.Y.Z` git tag | `v0.1.0` | GitHub Release（DMG / zip） |
| npm 包 | `@cs2dak/*` 公共包 | Changesets | `@cs2dak/core@1.0.0` | npm registry |

两条流版本号互不对应是正常的（如桌面 0.1.0 时 npm 包是 1.0.0）。
`scripts/sync-version.mjs` 只同步桌面流（根 + private apps/packages + python），绝不碰
Changesets 管理的公共包；Changesets 显式关闭 private package versioning，避免 npm 发版改动桌面版本。

## 桌面应用发布（vX.Y.Z）

1. 确认 main 上 CI 全绿；
2. 先确认本次 release 覆盖范围。`CHANGELOG.md` 必须按上一个桌面 tag 到当前
   release commit 的完整提交归纳，不按当前对话或单个任务记忆写：

   ```bash
   PREV=v0.7.6
   git fetch origin --tags
   git log --oneline "$PREV"..HEAD
   git diff --stat "$PREV"..HEAD
   ```

3. 在根 `CHANGELOG.md` 维护本次桌面版本段，并确认能被发版 CI 抽取：

   Changelog 维护规则：

   - 只写用户、安装/更新、集成方或维护者实际会感知的变化；纯过程 commit、临时探针、
     WIP 修补和没有行为差异的机械改动不单列。
   - 多个提交属于同一体验或同一问题时合并成一条，按结果写，不按提交历史逐条抄。
   - 用户可见的新能力放「新增」，体验/口径/布局变化放「变更」，bug、兼容性、
     性能与缓存失效放「修复」，测试瘦身、删除死代码、脚本整理等放「内部与维护」。
   - 每条用用户能理解的名词开头，说明影响面和结果；避免写“调整若干文件”“继续优化”这类过程话。

   ```bash
   VERSION=0.2.0
   VERSION="$VERSION" node - <<'NODE' | tee /tmp/changelog-notes.txt
   const fs = require("node:fs");
   const version = process.env.VERSION;
   const text = fs.readFileSync("CHANGELOG.md", "utf8");
   const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
   const match = text.match(new RegExp(`^## \\\\[${escaped}\\\\].*\\\\n([\\\\s\\\\S]*?)(?=^## \\\\[|\\\\z)`, "m"));
   if (!match || !match[1].trim()) process.exit(1);
   process.stdout.write(match[1]);
   NODE
   grep -q '[^[:space:]]' /tmp/changelog-notes.txt
   ```

4. 同步版本号并提交：

   ```bash
   node scripts/sync-version.mjs 0.2.0
   git commit -am "chore(release): 0.2.0"
   ```

5. 打 tag 推送，Release CI 自动构建并发布：

   ```bash
   git tag v0.2.0
   git push origin main v0.2.0
   ```

   `release.yml` 在 macOS / Windows runner 上构建两类桌面产物：
   DAK Studio 的 `dak-studio-X.Y.Z.dmg`、`DAK-Studio-Setup-X.Y.Z.exe`、
   `dak-studio-windows-X.Y.Z-full.zip`、`dak-studio-windows-X.Y.Z.zip`，以及
   RivalHub Demo Uploader 的 `rivalhub-demo-uploader-X.Y.Z.dmg` /
   `RivalHub-Demo-Uploader-Setup-X.Y.Z.exe` 与 `rivalhub-demo-uploader-windows-X.Y.Z.zip`。纯导出器 cs2dak 不进 Release。

   若已发布 tag 的 Release workflow 因流水线故障失败，先通过普通 PR 修复 workflow，
   再从 `main` 手动 dispatch **Release** 并输入该既有 `vX.Y.Z` tag 安全重试；工作流会显式
   用该输入创建/更新对应 GitHub Release。不得移动、删除或重新指向该 tag。

   `.tri` 碰撞几何由独立资产发布路径维护。桌面版 release 复用已发布 R2 manifest，
   不在每次应用发版时重新生成或上传；客户端按需下载，缺失时按既有能力提示降级。

6. 发布后无需额外通知。Release CI 会随产物生成 `latest.json` 更新 manifest，
   同时发到 GitHub Release **并上传到 Cloudflare R2**
   （`R2_*` secrets，`aws s3 cp --endpoint-url`）。DAK Studio 启动时按
   **R2 → GitHub → ghproxy** 顺序拉取 manifest（失败转移，绕开 `api.github.com`），
   旧版本侧栏出现更新入口：桌面壳（Windows）显示"更新到 vX.Y.Z"一键更新，否则退回手动下载链接。
   机制详见 [`docs/design/auto-update.md`](design/auto-update.md)。
   应用内更新会按 `release-update-policy.json` 自动决定优先发前端 `web` 小包还是完整
   `runtime` zip；未知路径保守走 runtime。

   0.8.6 起采用两个真实版本 manifest：旧客户端固定读取 `latest.json`，该入口保留
   版本、日志和经过 size/SHA-256 校验的 `manualInstall`，不给不安全 relay 提供
   `assets.windows/web`。旧版首次升级须关闭 Studio，运行本版 Web Installer，选择
   原安装目录，保留 SQLite / Demo ZIP 与其他持久目录；旧嵌套安装含资料时停止并
   给出恢复指引，不删除原目录。新 native runtime 暴露 `update_apply_runtime_safe`，
   从 `latest-v2.json` 读取完整真实 runtime（以及未来允许的 web 资产），正常自动
   更新继续可用。新版 web overlay 不能替旧 native 声明该能力。Beta 路径维持原入口。

   **发版后验证（R2 链路）**：Release CI 会自动核 `latest.json` / `latest-v2.json` /
   `install-manifest.json`、`releases/uploader/latest.json` 的版本，并校验
   R2 runtime 与 Uploader Windows/macOS 产物的 size/sha256；本地手动复核可跑：

   ```bash
   # 1) R2 上的 manifest 可访问
   curl -fsSL https://dakupdate.starfie1d.top/releases/latest-v2.json | tee /tmp/latest.json
   # 2) manifest 里第一个（R2）zip URL 可访问，且 sha256/size 与 manifest 一致
   URL=$(node -p "require('/tmp/latest.json').assets.windows.urls[0]")
   curl -fsSL "$URL" -o /tmp/dak.zip
   node -e "const c=require('crypto'),f=require('fs'),m=require('/tmp/latest.json').assets.windows; \
     const b=f.readFileSync('/tmp/dak.zip'); \
     console.assert(b.length===m.size,'size mismatch'); \
     console.assert(c.createHash('sha256').update(b).digest('hex')===m.sha256,'sha256 mismatch'); \
     console.log('R2 zip OK', b.length, m.sha256)"
   ```

本地验证打包（发版前建议跑一次）：

```bash
bash scripts/package.sh 0.2.0
open "python/dist/DAK Studio.app"
```

RivalHub Demo Uploader 与 Studio 一起构建并附在 GitHub Release，同时镜像到 R2。它不进入
Studio 的自动更新包：macOS 使用 `rivalhub-demo-uploader-X.Y.Z.dmg`，Windows 推荐 `RivalHub-Demo-Uploader-Setup-X.Y.Z.exe`，完整 ZIP
`rivalhub-demo-uploader-windows-X.Y.Z.zip` 保留兜底。公开下载入口读取
`https://dakupdate.starfie1d.top/releases/uploader/latest.json`，manifest 提供当前版本、
size、SHA-256 以及 R2 → GitHub Release → ghproxy 下载顺序；版本化快照保存在
`releases/vX.Y.Z/uploader-manifest.json`。独立本地打包命令为 `bash scripts/package-uploader.sh`。

GitHub Release 正文以仓库维护的 `CHANGELOG.md` 版本段为唯一变更摘要，不再叠加
GitHub 自动生成的跨 tag `What's Changed`，避免历史 tag 范围与桌面 release 边界不一致。

## macOS 桌面候选（RC）

RC 使用独立 `Desktop RC` workflow：先按正式流程核最终源码与 CI、同步尚未使用的数字桌面版本并提交；按上一正式 tag 到候选提交的完整变化维护 `CHANGELOG.md` 中该数字版本段，候选说明与正式发行共用该段，缺失或为空时停止。由发行负责人在最终冻结提交打 `vX.Y.Z-rc.N`（N 从 1 开始），推送后构建 Apple Silicon DMG 并创建 GitHub prerelease。当前稳定版为 0.8.8 时可考虑 `0.8.9-rc.1`，发行前仍须核实远端 tag 和版本。不要提前打 tag，也不要移动已有 tag。数字版本仍是应用内版本；候选 tag 与 build-info 的 revision/candidateTag 标明准确来源。同一数字版本的正式版不保证向已安装 RC 触发更新提示，正式版需要手动安装验证。

候选流程核对 tag、全部私有版本及 clean checkout，复用 `scripts/package.sh`，校验 arm64 并附 SHA-256；不上传 R2、不创建正式更新 manifest、不发 npm，也不将 prerelease 设为 latest。其产物为未签名、未公证的 `dak-studio-X.Y.Z-rc.N-macos-arm64.dmg`；拖入 Applications 后可能需在系统设置中允许打开。候选是独立的手动安装验收，不自动替换或验证现有资料；使用前备份，真实安装、升级、恢复和资源联网仍须 Mac 实测。缺失 `.tri`/赛事资源按现有逻辑降级或下载。该流程不产 Windows 候选；Windows 测试仍使用下方既有 Beta 流程。

失败后可手动 dispatch 同一个已存在的候选 tag；发布前先核实对应 GitHub prerelease 和附件状态。若已部分创建 Release，不要覆盖已有附件或移动 tag，先检查实际结果再决定恢复方式。

## Windows 测试版更新

不打正式 tag。手动触发 GitHub Actions 的 **Beta Update** workflow：

- `version`：填一个比当前测试机版本大的数字版本（例如 `0.7.99` 或 `0.8.0`）；
- `update_kind`：默认 `auto`，也可强制 `web` / `runtime`；
- `base_ref`：auto 判断的 diff 基准，默认 `origin/main`。

workflow 只面向 Windows 应用内测试：

- `web`：只上传 `dak-studio-web-<version>.zip` 和 `releases/beta/latest.json`；
- `runtime`：只上传 `dak-studio-windows-<version>.zip` 和 `releases/beta/latest.json`；
- 不构建 macOS、installer、full zip、events、tris。

Studio 里把「更新通道」切到「测试版」后，检查更新会读
`https://dakupdate.starfie1d.top/releases/beta/latest.json`。

## npm 包发布（@cs2dak/*，Changesets + Trusted Publishing）

仅当 RivalHub / CS2 Insight Agent 需要消费新的包 API 时发。当前 npm 公共包为：

`@cs2dak/contract`、`@cs2dak/core`、`@cs2dak/demo-io`、`@cs2dak/rating`、
`@cs2dak/cohort`、`@cs2dak/tournament`、`@cs2dak/maps`、`@cs2dak/map-assets`、
`@cs2dak/tactics`、`@cs2dak/analytics`、`@cs2dak/pipeline`、
`@cs2dak/presentation`、`@cs2dak/react`。
`@cs2dak/cli` 是私有工作区应用，不发 npm。

正式 production 路径：

```text
feature PR + changeset
→ Version Packages / release PR
→ merge 到 main
→ GitHub Actions: Publish npm packages（手动触发）
→ npm Trusted Publishing / OIDC
→ 验证 npm versions、provenance 与 package tags
```

准备 release PR 仍使用 Changesets：

```bash
pnpm changeset            # 写变更说明，选择 bump 级别
pnpm version:packages     # 消费 changeset，更新版本号 + CHANGELOG
git commit -am "chore: version packages"
```

合并 release PR 后，在 GitHub Actions 选择 **Publish npm packages**，确认 ref 为
`main` 后手动运行。`.github/workflows/npm-publish.yml` 使用 GitHub-hosted
`ubuntu-latest`、Node `24.x`、由根 `package.json` 声明精确版本的 pnpm 和 `npm-publish` environment；
先运行完整的 build、test、typecheck，再运行 `pnpm exec changeset publish --no-git-tag`。
OIDC 需要 job 级 `id-token: write`，package tag 推送需要 `contents: write`。

工作流不使用长期 npm write token，不要求生产发布前 `npm login`，也不设置
`NPM_TOKEN` / `NODE_AUTH_TOKEN`。Trusted Publishing 成功时 npm 会自动生成 provenance。
本地 `pnpm check:release` 执行发布前验证，不上传包或创建 tag。
本地 `pnpm release:npm` 会报错并指向 GitHub Actions 的 **Publish npm packages**；
实际发布统一由 `npm-publish.yml` 执行 OIDC 上传和有界 registry 对账。

Changesets 会按 registry 上的精确版本跳过已发布包。工作流关闭 Changesets 自己的
本地 tag 创建，由 `scripts/reconcile-npm-publish.mjs` 先查询每个精确版本是否已经在
npm 上存在，只为确认成功的版本创建并显式推送
`@cs2dak/<package>@X.Y.Z` tag；推送不使用 force。这样部分发布失败时不会给未发布包
预先打 tag，重跑会继续缺失版本，并保留已经成功发布的状态。远端已有但指向其他
commit 的 tag 会直接使工作流失败，不会删除、回滚、移动 tag 或 unpublish。

### 发布成功后的 registry 可见性等待

npm 接受上传后，精确版本查询可能暂时返回 404。2026-11-01 的
[发布 run 41302651413](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/actions/runs/41302651413)
第一次执行在 11:39:29.169 UTC 报告七包发布成功，11:39:29.743 UTC 开始对账时七包尚不可见；
同一源码提交的后续执行成功。因此不能把一次查询失败直接解释为上传失败。

对账会并行查询本次选中版本，共享 10 分钟等待预算，每 10 秒重查未确认版本，单请求最多
15 秒（剩余总预算更短时随之缩短）。404、408、429、5xx、网络错误和请求超时可重试；
其他 HTTP 错误、无效 JSON 或包名/版本不符立即报告错误。确认过的版本不重复查询。
`--wait-timeout-ms` 可以显式设置正整数毫秒预算；workflow 使用 `600000`，步骤总超时为
12 分钟，为 tag 对账留出时间。

超时或永久错误仍使 CI 失败；只给已确认的版本补 tag，并输出未确认版本及最后原因。
Changesets 自身报失败时仍保留失败结果。已接受上传可能继续处理，恢复前先确认 registry 状态，
避免盲目重复上传。`--check-only` 仅检查版本选择，不访问 registry、不创建 tag。

### 首次配置（仓库外的运维步骤）

以下设置不保存到仓库 secret，需要在网页端完成：

1. 在 GitHub 仓库 Settings → Environments 创建 `npm-publish`。建议给它设置 required
   reviewers、禁止 self-review，并将部署分支限制为 `main`。
2. 对上面列出的公共包分别在 npm → Package → Settings → Trusted publishing 添加
   **GitHub Actions** publisher：

   - Organization or user：`Starfie1d1272`（GitHub 仓库 owner，不是 npm 用户名）
   - Repository：`cs2-demo-analysis-kit`
   - Workflow filename：`npm-publish.yml`（只填文件名）
   - Environment name：`npm-publish`
   - Allowed actions：明确允许 **direct `npm publish`**；不能只保留默认的 staged publish

3. 合并本仓库的 Trusted Publishing infrastructure PR，并把待发布的 version commit
   放到新的 `main` 上；不要再次运行 `pnpm version:packages` 消费同一批 changeset。
4. 在 Actions → **Publish npm packages** → ref `main` → Run workflow，先通过
   `npm-publish` environment 审批，再观察发布日志。
5. 对每个目标版本验证 `npm view <package>@<version> version`、npm 页面上的 provenance
   以及远端 `@cs2dak/<package>@<version>` tag。`npm whoami` 不反映 Trusted Publishing
   状态，不能作为 OIDC 健康检查。
6. 首次 OIDC 发布成功并完成上述核对后，再撤销旧 npm write/release token，并在 npm
   Publishing access 中开启 token restriction（如 `Require two-factor authentication
   and disallow tokens`）。

详见 npm 的 [Trusted publishing 文档](https://docs.npmjs.com/trusted-publishers/)
和 [Changesets publish 文档](https://github.com/changesets/changesets/blob/main/docs/command-line-options.md#publish)。

## tag 规则

- `vX.Y.Z`：桌面应用发布，唯一触发 Release CI 的 tag；
- `@cs2dak/<pkg>@X.Y.Z`：npm workflow 在确认发布后由 reconciliation 脚本创建并推送，不要手工创建；
- 不要打裸 `X.Y.Z` 或其他形式的 tag。

历史遗留：`v0.2.0`、`v0.2.1`、`v1.0.0` 是 2026-06 之前废弃的版本流残留，
应删除（`git push origin :refs/tags/<tag>` + 删除对应 GitHub Release），
桌面流从 `v0.1.0` 重新起算。


Windows Uploader 推荐入口为 `RivalHub-Demo-Uploader-Setup-X.Y.Z.exe`（完整离线应用），
原完整 ZIP 保留兜底；manifest 的 `assets.windowsInstaller` 是推荐安装器字段，
`assets.windows` 保持旧 ZIP 合同。详情与独立 Windows 验收见 [安装与诊断](uploader-windows.md)。

### 版本同步失败保护

`sync-version.mjs` 只接受 canonical `x.y.z`（CLI 可带 `v` 前缀），不接受自由 prerelease 或 build suffix。源码 revision 属于 build provenance，不写入 Python / npm release version。脚本先读取并校验全部私有 manifest 和三个 Python target，再开始写入；缺失、重复或无版本字段会在任何写入前失败。`uv.lock` 仅定位唯一 `cs2dak` package block，可恢复历史 malformed version，不修改其他依赖。写入失败时尝试恢复所有已尝试的 target；恢复失败会明确报出，需检查工作树后重试。该保护不宣称对进程被强制结束或磁盘故障提供跨文件事务。

`sync-version` 的原独立回归测试已在 #109 移除，覆盖缺口见[关键流程测试保留集](audit/2026-10-12-critical-test-budget.md#明确移除的独有保护)。修改此脚本时仍需针对性验证全部目标预校验与失败写入恢复，现有 CI gate 不能替代这些保护。本地 `bash scripts/package.sh 0.8.5`（sync enabled）和 `PACKAGE_SKIP_VERSION_SYNC=1 bash scripts/package.sh`（sync skipped）都属于 ad-hoc 构建。脚本在同步之后、生成产物之前抓取一份 provenance，打印 sync / release / revision / dirty / mode / output summary；dirty 本地构建允许但明确警告。releaseVersion 保持 canonical x.y.z，buildRevision 为完整 HEAD SHA，buildDirty 为工作树状态（含未忽略的新文件）。同一份信息写入前端 `build-info.json`，由既有 Studio 侧栏版本入口显示短 SHA 和 clean/dirty，并随 `studio_web` 打入 PyInstaller。

本地产物置于 `python/dist/dak-studio-X.Y.Z-build-<12-char-sha>[-dirty]/`；macOS DMG 文件名同样带该标识，内部 app/exe 名称保持原样。dirty 标记不是工作树内容哈希，同一 revision 的多次 dirty 构建会覆盖同一路径。无 Git 元数据的源码归档使用 `build-unknown`，revision/dirty 为 null，侧栏与 summary 明确显示 unknown，不声称可追溯。

正式 Release CI 显式传 `PACKAGE_RELEASE_TAG=vX.Y.Z`，保留原来的版本化 DMG 与 runtime 目录；匹配 tag/manifest/HEAD 且工作树 clean 才允许进入构建。仅 skip sync 不代表正式 release。CI 获取外部 tris manifest 放在捕获源码 provenance 之后，避免将生成的发布输入误记为源码修改。正式 Windows web patch 直接封装 `python/dist/dak-studio/_internal/studio_web` 内的已构建前端，检查同版本 clean release snapshot；不在下载资产后的新 CI step 重跑 Vite 或重新捕获 working-tree 状态。patch 与 runtime 的 build-info / frontend bytes 一致，只有 patch 额外生成的 version.json 不同。本地不传第四个 desktopWebDir 参数时仍可独立构建 patch。npm 包继续由 Changesets 独立管理，本流程不改变公共包版本。

`build-info` 的原独立回归测试也已在 #109 移除；修改 provenance 相关脚本时需针对性验证 metadata 与实际打包 frontend 的来源一致性，不以当前 suite 跑绿代替。本地 Linux PyInstaller smoke 验证打包 metadata / frontend；macOS DMG 拖拽安装、Windows GUI 启动与正式发布 qualification 仍需对应平台验收。

### Maps 编译发布物验证

`@cs2dak/maps` 发布 root 与 `/calibration` 算法入口。地图数据属于 `@cs2dak/map-assets`，其 root 提供 nav/route/zone，独立子入口提供 callout-grid Node/browser loader 与 tri loader，`/callout-grid/*.json` 提供公开 JSON 资源路径。JS/类型指向 `dist`；原 maps 资产入口已删除，本轮 maps 为 major changeset。

CI 与发布 gate 运行 `node scripts/maps-package-smoke.mjs`：构建并打包两包，仓外安装后调用公开 API、验证 JSON 出口和 strict NodeNext 声明，再卸载 map-assets，确认 maps root/calibration 可独立使用。browser loader 通过注入 fetch 验证。脚本清理临时消费者，不执行发布。

fresh checkout 冻结安装后先 `pnpm build:packages`，再按需进行类型或功能检查；`pnpm dev` 自带公共包准备步骤。正式发布后还需用 registry 版本执行消费验收。

### 公共发布产物与消费检查

发布前必须执行 `pnpm check:package-boundaries`、`pnpm check:package-consumers` 与 maps 专项 smoke。边界检查覆盖生产源码和 manifest；consumer gate 构建并实际打包十三个公共包，为每个包单独建立仓外 npm consumer，以本次 tgz 安装其传递依赖，验证全部 JS 入口、实际 API 和 strict NodeNext 完整声明。消费者使用原生 Node，声明检查启用 `skipLibCheck=false`。

公共 JS/types 指向 dist；React theme.css 按 CSS side effect 发布；map-assets 显式公开 JSON 资源。测试和 build metadata 排除在 tgz 外。UI 消费另外验证 SSR 和浏览器 bundle；安装、声明与浏览器依赖图均检查领域隔离。

format 3.1.0 与 rating 0.3.0 是精确 build-only 输入。DAK 从原版源生成私有 JS 和完整声明，记录源/声明哈希及 MIT 许可证；消费者无需安装上游源码包。更新上游版本时同步 `scripts/lib/bundled-dependencies.mjs` 并重跑完整 consumer gate。历史记录见 [artifact audit](research/public-package-artifact-audit.md)，本轮验证见 [领域重构记录](research/2026-11-01-package-domain-architecture.md)。

默认全包 gate 保留 Linux/Ubuntu 平台要求。其他平台可显式使用 `node scripts/public-package-smoke.mjs --local-platform`，结果仅适用于输出的本机平台；`--skip-build` 只用于已有最新生产包构建的场景。本轮 macOS / Node 26.9.0 的十三包 tgz、UI SSR/browser bundle 与地图专项通过；Linux、Windows 和浏览器交互验收需分别执行。正式 npm publish/tag 继续遵守本文件发布流程。

### npm 构建链修复后的受控重试

发行版本提交与实际发布源码提交必须分别明确。若版本提交之后只合入获独审的
构建链修复，可在 Publish npm packages 输入原40位 `release_commit`，例如
75434c5dcce9477a567761ed5c378b346a4ceebe；工作流实际checkout本次 github.sha
（新的发布源码提交X），不伪造GITHUB_SHA。脚本要求版本提交是X祖先、全部公共
manifest名称/版本与选定版本提交一致，再从该提交与其父的差异选择原七包。
provenance、实际checkout/gitHead和成功npm package tags都指X，桌面v0.8.6仍
固定754，不移动、不重新构建覆盖其公开bytes。省略选择时保持当前版本提交模式；
纯workflow修复提交本身无版本提升会拒绝盲发。冷构建与CI使用相同build:serial，
保留完整测试、typecheck、实际tgz闭包、registry/provenance/tag验收；不创建凭据。

### 原 npm 部分发布的续发边界

2026-10-12 的 run `38204647873` 使用源码
`263895839f8a4f334b6c92be2a38639fb09523ad`，版本选择为
`75434c5dcce9477a567761ed5c378b346a4ceebe`。该次构建与 consumer gates
通过；contract/maps 发布返回 404，tournament 1.1.2 已公开且 provenance 与
package tag 均指向 2638958。其他四包尚未发布。

先由包维护者在 npm 网页核对缺失六包的 GitHub Actions Trusted Publisher：
owner、repository、workflow、environment 必须匹配上表，且允许 direct publish；
检查连接是否过期。404 本身不能确定哪个字段错误，公开 registry 也不提供这些设置。
不要为此生成 token、扩大账户权限或重发 tournament。

设置核对完成并确认目标六版本仍缺失后，使用原 run 的 **Re-run failed jobs**，
保留原 github.sha 与 release_commit；不要在新 main 上 Run workflow。
release_commit 输入只选择版本，不能锁定源码 checkout。重跑前确认 tournament
tag 仍指 2638958；成功后核验六包的 registry provenance 与七个 package tags，
再从 registry 干净安装验证消费。桌面 v0.8.6 不重发、不移动 tag。
