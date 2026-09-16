# 版本与发布流程

本仓库有 **两条独立版本流**，不要混用：

| 版本流 | 对象 | 版本来源 | tag 形式 | 发布渠道 |
|---|---|---|---|---|
| 桌面应用 | DAK Studio / cs2dak GUI 壳（根 `package.json`、私有 apps、`python/`） | `vX.Y.Z` git tag | `v0.1.0` | GitHub Release（DMG / zip） |
| npm 包 | `@cs2dak/*` 公共包 | Changesets | `@cs2dak/core@1.0.0` | npm registry |

两条流版本号互不对应是正常的（如桌面 0.1.0 时 npm 包是 1.0.0）。
`scripts/sync-version.mjs` 只同步桌面流（根 + private apps + python），绝不碰
Changesets 管理的公共包。

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

   `release.yml` 在 macOS / Windows runner 上跑 `scripts/package.sh`，只产出
   DAK Studio 产物：`dak-studio-X.Y.Z.dmg`、`DAK-Studio-Setup-X.Y.Z.exe`、
   `dak-studio-windows-X.Y.Z-full.zip`、`dak-studio-windows-X.Y.Z.zip`。
   纯导出器 cs2dak 不进 Release。

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

   **发版后验证（R2 链路）**：Release CI 会自动核 `latest.json` /
   `install-manifest.json` 的版本和 R2 runtime 的 size/sha256；本地手动复核可跑：

   ```bash
   # 1) R2 上的 manifest 可访问
   curl -fsSL https://dakupdate.starfie1d.top/releases/latest.json | tee /tmp/latest.json
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

`@cs2dak/cohort`、`@cs2dak/contract`、`@cs2dak/core`、`@cs2dak/maps`、
`@cs2dak/presentation`、`@cs2dak/react`、`@cs2dak/tournament`。
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
`ubuntu-latest`、Node `24.x`、仓库锁定的 pnpm `11.7.0` 和 `npm-publish` environment；
先运行完整的 build、test、typecheck，再运行 `pnpm exec changeset publish --no-git-tag`。
OIDC 需要 job 级 `id-token: write`，package tag 推送需要 `contents: write`。

工作流不使用长期 npm write token，不要求生产发布前 `npm login`，也不设置
`NPM_TOKEN` / `NODE_AUTH_TOKEN`。Trusted Publishing 成功时 npm 会自动生成 provenance。
本地 `pnpm release:npm` 保留作 release path 验证命令，但它最后仍会执行
`changeset publish`；正式 registry publish 不走本机认证路径。

Changesets 会按 registry 上的精确版本跳过已发布包。工作流关闭 Changesets 自己的
本地 tag 创建，由 `scripts/reconcile-npm-publish.mjs` 先查询每个精确版本是否已经在
npm 上存在，只为确认成功的版本创建并显式推送
`@cs2dak/<package>@X.Y.Z` tag；推送不使用 force。这样部分发布失败时不会给未发布包
预先打 tag，重跑会继续缺失版本，并保留已经成功发布的状态。远端已有但指向其他
commit 的 tag 会直接使工作流失败，不会删除、回滚、移动 tag 或 unpublish。

### 首次配置（仓库外的运维步骤）

以下设置不保存到仓库 secret，需要在网页端完成：

1. 在 GitHub 仓库 Settings → Environments 创建 `npm-publish`。建议给它设置 required
   reviewers、禁止 self-review，并将部署分支限制为 `main`。
2. 对上面列出的 7 个包分别在 npm → Package → Settings → Trusted publishing 添加
   **GitHub Actions** publisher：

   - Organization or user：`Starfie1d127`
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
