# scripts/hltv — 赛事包 dev 侧流水线

HLTV → 赛事包的**开发机工具**。**不随 DAK Studio 分发**：依赖 Playwright + CDP 接管真实
Chrome + 手过 Cloudflare，天然绑开发机；且产品内置 HLTV 爬虫有 ToS/法务风险。
分工：**官方赛事包**由维护者在本机爬取→装配→传 R2（用户只下成品）；**用户自己的 demo**
走 Studio 手动制作器拖 `.dem`。对外只出「Console 提取片段 + 本机下载脚本 + 教程」，不做代爬服务。

## 科隆 Major 2026 各阶段 HLTV 入口

| 阶段 | HLTV Results 页 | URL slug 特征 |
|---|---|---|
| Stage 1 | `https://www.hltv.org/results?event=9028` | `iem-cologne-major-2026-stage-1` |
| Stage 2 | `https://www.hltv.org/results?event=9029` | `iem-cologne-major-2026-stage-2` |
| Stage 3 + Playoff | `https://www.hltv.org/results?event=8301` | `iem-cologne-major-2026`（无 stage 后缀） |

Stage 3 和 Playoff 共用 `event=8301` 页面，**无法靠 URL slug 区分**。
导出时靠 spec `export.Playoff.pairs` / `Stage3.excludePairs` 按对阵路由（同名对阵
再遇用 `matchIds` 精确匹配）。

## 全链路

```
HLTV results 页 (Console 片段或 CDP 脚本提取 URL)
  → matches-{stage}.txt
  → download-hltv-demos.ts     (CDP + 并发池 → 下载 .rar)
        ⇒ fixtures/demos/pro/<Event>/_src/*.rar   (gitignored)
  → extract-bp.ts              (CDP → 爬 veto 文本)
        ⇒ bp-output.txt / *-bp-complete.txt
  → bp-to-spec.mjs             (文本 → spec.series 的 bp + 真实对阵 + matchUrl)   ★ 关键修复点
        ⇒ --merge 覆盖 scripts/cologne/<event>.spec.json
  → extract-stage-urls.mjs     (CDP 轻量提取，纯 Node WebSocket，零依赖；备用)
        ⇒ matches-stage1.txt / matches-stage2.txt
  → node scripts/event-export.mjs <spec>   (.rar → cs2df export --research --compress-level 9)
        ⇒ fixtures/demos/pro/<Event>/<Stage>/*.zip
  → node scripts/cologne-build.mjs  (按队伍/地图匹配 → 4 个 per-stage event-package-1.0)
        ⇒ _build/{slug}-stage1.zip … {slug}-playoff.zip
  → Stage1/2 → R2 (build-event-asset.mjs + publish-event-assets.sh)
    Stage3/Playoff → Studio 内置 (随安装包分发)
```

## URL 提取

### 方式一：CDP 自动化（推荐，fast-path）

```bash
# 前提：Chrome 已启动 --remote-debugging-port=9222 并登录 HLTV
node scripts/hltv/extract-stage-urls.mjs                    # 全 stage
node scripts/hltv/extract-stage-urls.mjs --stage stage1     # 单 stage
```
直接在当前 Chrome 页面导航 HLTV results 页并执行 JS 提取，输出
`matches-stage1.txt` / `matches-stage2.txt`。零依赖（Node 24 原生 WebSocket）。

### 方式二：Console 手动粘贴（fallback / 跨平台）

打开对应 results 页，F12 Console 粘贴：

```js
// Stage 1 (event=9028)
copy([...document.querySelectorAll('a[href*="/matches/"]')]
  .map(a => new URL(a.getAttribute('href'), location.origin).href.split('#')[0])
  .filter(v => v.includes('iem-cologne-major-2026-stage-1'))
  .filter((v, i, arr) => arr.indexOf(v) === i).join('\n'));

// Stage 2 (event=9029) — 把 filter 换成 stage-2
// Stage 3 + Playoff (event=8301) — 把 filter 换成 iem-cologne-major-2026（不要 stage 后缀），
//   整页存下来，导出时由 pairs/excludePairs 路由。
```

## 命令速查

```bash
# 下载（先开 Chrome --remote-debugging-port=9222 并手过一次 CF，详见脚本头注释）
npx -y -p @playwright/test -p tsx tsx scripts/hltv/download-hltv-demos.ts
npx -y -p @playwright/test -p tsx tsx scripts/hltv/extract-bp.ts

# BP 文本 → spec（先干跑核对，再 --merge 写回）
node scripts/hltv/bp-to-spec.mjs scripts/hltv/stage3-bp-complete.txt --matches scripts/hltv/matches.txt
node scripts/hltv/bp-to-spec.mjs scripts/hltv/*.txt --matches scripts/hltv/matches.txt \
  --merge scripts/cologne/cologne-major-2026.spec.json

# 导出（--research --compress-level 9 由 spec.export 透传）
node scripts/event-export.mjs scripts/cologne/cologne-major-2026.spec.json    # 全阶段
node scripts/event-export.mjs scripts/cologne/cologne-major-2026.spec.json --stage Stage3

# 装配（per-stage 4 包）
node scripts/cologne-build.mjs

# R2 发布（Stage1/2）
pnpm events:build  # build-event-asset.mjs 生成 manifest assets
bash scripts/publish-event-assets.sh        # 上传 R2
```

> 爬虫脚本要 `@playwright/test`，本仓库不装它（不污染 monorepo），用上面的 `npx -p` 临时拉起，
> 或在独立目录跑。`.download-state.json` / `.extract-state.json` 是断点续跑状态，可删重跑。
