# 赛事包上传隔离区 Worker

用户在 DAK Studio 里制作好赛事包后，可一键**投稿**——上传不会立即开放下载，而是落进 R2 的
`events/_submissions/` 隔离前缀（不进 manifest、公开不可下载）。你在本地审核、通过后才 promote
进 `events/` 并重生 manifest。

## 安全模型

- **边缘只能收**：Worker 只能 `put` 到 `events/_submissions/`，无法列出、删除或 promote 已发布资产。
- **promote 全在本地**：审核与发布用 `scripts/promote-event-submission.mjs` + 你的 R2 凭证完成，
  边缘永不持有 promote 能力。即使 Worker 被滥用，最坏后果是隔离区堆垃圾文件（有大小上限 + 可选人机校验），
  绝不会污染已发布赛事。

## 部署（需 Cloudflare 凭证）

```bash
cd infra/event-upload-worker
npm install
npx wrangler deploy
# 可选：开 Turnstile 人机校验防滥用（强烈建议生产开启）
npx wrangler secret put TURNSTILE_SECRET
```

部署后拿到 Worker URL（workers.dev 子域或你绑的自定义域），填进 Studio 的
`VITE_EVENTS_UPLOAD_URL`（见 `apps/dak-studio`）。

`wrangler.toml` 里 `ALLOWED_ORIGINS` 生产应收窄到 Studio 的来源；`MAX_UPLOAD_BYTES` 默认 512MB。

## 审核与发布（本地）

```bash
# 与 publish-event-assets.sh 同一套 R2 S3 凭证
export R2_ENDPOINT=... R2_BUCKET=cs2dak-assets

pnpm event:submissions                       # 列出待审投稿
pnpm event:promote inspect <key>             # 取回、校验 sha256 + event-package 合同、打印摘要
pnpm event:promote approve <key>             # 通过：build+publish 进 events/、重生 manifest、删投稿
pnpm event:promote reject  <key>             # 拒绝：删投稿
```

`approve` 会先把线上现有 manifest 拉下来做种子再合并新包，因此不会抹掉已发布赛事。
