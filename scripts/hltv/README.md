# scripts/hltv — 赛事包 dev 侧流水线

HLTV → 赛事包的**开发机工具**。**不随 DAK Studio 分发**：依赖 Playwright + CDP 接管真实
Chrome + 手过 Cloudflare，天然绑开发机；且产品内置 HLTV 爬虫有 ToS/法务风险。
分工：**官方赛事包**由维护者在本机爬取→装配→传 R2（用户只下成品）；**用户自己的 demo**
走 Studio 手动制作器拖 `.dem`。对外只出「Console 提取片段 + 本机下载脚本 + 教程」，不做代爬服务。

## 全链路

```
HLTV results 页 (Console 片段提取 URL)
  → matches.txt
  → download-hltv-demos.ts   (CDP + 并发池 → 下载 .rar)
        ⇒ fixtures/demos/pro/<Event>/_src/*.rar   (gitignored)
  → extract-bp.ts            (CDP → 爬 veto 文本)
        ⇒ bp-output.txt / *-bp-complete.txt
  → bp-to-spec.mjs           (文本 → spec.series 的 bp + 真实对阵 + matchUrl)   ★ 关键修复点
        ⇒ --merge 覆盖 scripts/cologne/<event>.spec.json
  → pnpm 事件导出 (scripts/event-export.mjs)   (.rar → cs2df export --research --compress-level 9)
        ⇒ fixtures/demos/pro/<Event>/<Stage>/*.zip
  → scripts/cologne-build.mjs  (按队伍/地图匹配 → event-package-1.0)
        ⇒ Stage1/2 → R2 (publish-event-assets.sh)；Stage3/Playoff → Studio 内置
```

## URL 提取（results 页 Console 粘贴）

```js
// 当前页全部 Cologne Major 2026 比赛 URL
copy([...document.querySelectorAll('a[href*="/matches/"]')]
  .map(a => new URL(a.getAttribute('href'), location.origin).href.split('#')[0])
  .filter(v => v.includes('iem-cologne-major-2026'))
  .filter((v, i, arr) => arr.indexOf(v) === i).join('\n'));
```
只要 Stage 2：把 filter 换成 `v.includes('iem-cologne-major-2026-stage-2')`。
Stage 3 + Playoff 共用 `-major-2026` slug，**不要自动猜 stage**，整页存下来，按对阵清单
（spec `export.Playoff.pairs`）在导出时路由。

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
node scripts/event-export.mjs scripts/cologne/cologne-major-2026.spec.json --stage Stage3
# 装配
node scripts/cologne-build.mjs
```

> 爬虫脚本要 `@playwright/test`，本仓库不装它（不污染 monorepo），用上面的 `npx -p` 临时拉起，
> 或在独立目录跑。`.download-state.json` / `.extract-state.json` 是断点续跑状态，可删重跑。
