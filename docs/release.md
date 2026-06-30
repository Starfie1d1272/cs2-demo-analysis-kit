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
2. 在根 `CHANGELOG.md` 维护本次桌面版本段，并确认能被发版 CI 抽取：

   ```bash
   VERSION=0.2.0
   awk -v ver="$VERSION" '
     BEGIN { in_section=0 }
     $0 ~ "^## \\[" ver "\\]" { in_section=1; next }
     in_section && /^## \[/ { exit }
     in_section { print }
   ' CHANGELOG.md | tee /tmp/changelog-notes.txt
   grep -q '[^[:space:]]' /tmp/changelog-notes.txt
   ```

3. 同步版本号并提交：

   ```bash
   node scripts/sync-version.mjs 0.2.0
   git commit -am "chore(release): 0.2.0"
   ```

4. 打 tag 推送，Release CI 自动构建并发布：

   ```bash
   git tag v0.2.0
   git push origin main v0.2.0
   ```

   `release.yml` 在 macOS / Windows runner 上跑 `scripts/package.sh`，只产出
   DAK Studio 产物：`dak-studio-X.Y.Z.dmg`、`DAK-Studio-Setup-X.Y.Z.exe`、
   `dak-studio-windows-X.Y.Z-full.zip`、`dak-studio-windows-X.Y.Z.zip`。
   纯导出器 cs2dak 不进 Release。

5. 发布后无需额外通知。Release CI 会随产物生成 `latest.json` 更新 manifest，
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

## npm 包发布（@cs2dak/*，Changesets）

仅当 RivalHub / CS2 Insight Agent 需要消费新的包 API 时发：

```bash
pnpm changeset            # 写变更说明，选 bump 级别
pnpm version:packages     # changeset version：改版本号 + CHANGELOG
git commit -am "chore: version packages"
pnpm release:npm          # build + test + typecheck + changeset publish（自动打 @cs2dak/*@x.y.z tag）
git push --follow-tags
```

`@cs2dak/cli` 是私有工作区应用，不发 npm。

## tag 规则

- `vX.Y.Z`：桌面应用发布，唯一触发 Release CI 的 tag；
- `@cs2dak/<pkg>@X.Y.Z`：changeset publish 自动打，不要手工创建；
- 不要打裸 `X.Y.Z` 或其他形式的 tag。

历史遗留：`v0.2.0`、`v0.2.1`、`v1.0.0` 是 2026-06 之前废弃的版本流残留，
应删除（`git push origin :refs/tags/<tag>` + 删除对应 GitHub Release），
桌面流从 `v0.1.0` 重新起算。
