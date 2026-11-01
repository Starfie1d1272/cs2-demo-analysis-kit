# 赛事包上传隔离区 Worker

用户在 DAK Studio 里制作好赛事包后，可一键**投稿**——上传不会立即开放下载，而是落进 R2 的
`events/_submissions/` 隔离前缀（不进 manifest、公开不可下载）。你在本地审核、通过后才 promote
进 `events/` 并重生 manifest。

## 安全模型

- HTTP 接口只提供隔离上传，写入 `events/_submissions/`。审核与 promote 由本地脚本执行；R2 binding 本身具有 bucket API 能力，路径限制由本 Worker 实现。
- 请求必须带 64 位十六进制 `x-sha256`。Worker 逐块计数并用 `crypto.DigestStream` 计算 SHA-256，保留一个 5 MiB 缓冲区。较大文件通过 R2 multipart 上传，校验成功后 complete；超限、断流或校验失败时 abort。
- 小文件在校验后单次 put；multipart 的完整长度记录在并列 `.meta.json`。ZIP 魔数校验完整四字节，深度合同检查仍由 promote 执行。
- 服务端默认最多 512 MiB；Cloudflare 账户的 HTTP 请求体限制也适用。没有 Content-Length 的请求按实际读取字节限制。客户声明长度与实际长度不符时拒绝。

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
