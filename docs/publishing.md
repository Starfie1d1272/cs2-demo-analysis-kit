# npm 发布手册（早上照着做）

> 准备状态：2026-06-04 夜间。所有包已配好 `publishConfig` / `files`，脚本就绪。
> **唯一需要你做的对外操作是 `pnpm login`**（agent 无法代你登录 npm）。

## 为什么需要发 npm

RivalHub（Vercel）和 CS2-insight-agent（Vite/Electron）都要消费 `@cs2dak/*`。
kit 是 monorepo 子包，**无法走 `github:` 依赖**（只有单包仓能）。所以这些包必须发 npm。
包都导出原始 TS，消费方用 `transpilePackages` 即可（两个项目都是 React，OK）。

## 发布依赖图（必须按此顺序）

```
cs2-demo-format ────┐
                    ├─► @cs2dak/contract ─► @cs2dak/maps ─┐
@rivalhub/rival-rating ─────────────────► @cs2dak/core ──┴─► @cs2dak/react
```

## 各仓库就绪度

| 包 | 仓库 | scope | 就绪度 |
|---|---|---|---|
| `cs2-demo-format` | `~/GitHub/cs2-demo-format` (v2.2.0) | 无 scope（默认 public） | ✅ 已有 `files`/`exports`，直接发 |
| `@rivalhub/rival-rating` | `~/GitHub/rival-rating` (v0.1.0) | `@rivalhub` | ✅ 已加 `publishConfig.access=public` + `files` |
| `@cs2dak/contract` `core` `maps` `react` | 本仓库 | `@cs2dak` | ✅ 已加 `publishConfig` + `files`，脚本就绪 |

> `@cs2dak/cli`、`@cs2dak/cohort`、`@cs2dak/demo-lab`（private app）**不发**——消费方用不到。

## 步骤

### 0. 登录（你来）
```bash
pnpm login          # 用你的 npm 账号；需要对 @cs2dak / @rivalhub scope 有发布权
```
> 若 `@cs2dak` / `@rivalhub` scope 尚未在 npm 注册，首次 `pnpm publish --access public` 会自动创建（前提是账号有权）。

### 1. 发 cs2-demo-format（base，无依赖）
```bash
cd ~/GitHub/cs2-demo-format
pnpm publish --no-git-checks         # 无 scope，默认 public
```

### 2. 发 @rivalhub/rival-rating（base）
```bash
cd ~/GitHub/rival-rating
pnpm publish --access public --no-git-checks
```

### 3. 发 @cs2dak/*（本仓库，一条脚本搞定）
```bash
cd ~/GitHub/cs2-demo-analysis-kit
./scripts/publish-npm.sh --dry-run    # 先干跑确认
./scripts/publish-npm.sh              # 实发：contract -> maps -> core -> react
```
脚本会把 contract/core 里的 `github:` 依赖临时改成 npm 版本、`pnpm install`、按序发布。
发完后按提示决定是否持久化依赖改动（建议保留 github: 供本地 dev，则 `git checkout packages/*/package.json`）。

### 4. 验证
```bash
pnpm view @cs2dak/react version
pnpm view @cs2dak/core version
```

## 消费方接入（发布后）

RivalHub / CS2-insight-agent 的 `package.json`：
```jsonc
"dependencies": {
  "@cs2dak/core": "^0.2.1",
  "@cs2dak/maps": "^0.2.1",
  "@cs2dak/react": "^0.2.1"
}
```
`next.config.ts`（RivalHub）：
```ts
transpilePackages: ["@rivalhub/rival-rating", "cs2-demo-format", "@cs2dak/core", "@cs2dak/maps", "@cs2dak/react", "@cs2dak/contract"],
```
然后按 `docs/rivalhub-migration.md` 删重复模块、切 import。

## 后续版本

版本统一由 git tag 驱动：`git tag vX.Y.Z && pnpm sync-version` 后再跑发布脚本。
