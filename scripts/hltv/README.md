# scripts/hltv — 赛事包批量制作工具

**把 HLTV 赛事页面变成 DAK Studio 可用的 event-package，全链路命令行完成。**

## 这个工具是给谁的

| 你的情况 | 你应该 |
|---|---|
| **DAK Studio 用户**，只想导入现成赛事 | 打开 Studio → EventGallery → 下载或一键载入。**不需要看这篇。** |
| **教练 / 主办方 / 爱好者**，想要一个还没人做好的赛事包 | 到 [GitHub Issues](https://github.com/Starfie1d1272/cs2-demo-analysis-kit/issues) 提赛事名 + HLTV 链接，等维护者跑完上传 R2 即可。**不需要看这篇。** |
| **有命令行基础**，想自己批量制作赛事包 | **看这篇。** 下面讲的都是命令行操作。 |

## 开始之前

你得有这些：

- **Node.js 24+**（`node --version`）
- **Chrome 浏览器**（只要还能正常上 HLTV 就行）
- **终端**（macOS 自带 Terminal；Windows 用 **Git Bash** 或 **WSL**）
- **一个 HLTV 账号**（已经在 Chrome 里登录过，过了一次 Cloudflare 验证就行）
- 本仓库 clone 到本地，依赖已装（`pnpm install`、`uv sync`）

> **Windows 用户注意**：Chrome 和 Node 在 Windows 上都正常跑，但管线的最后一步——`event-export.sh` 当前是 bash 脚本，
> 需要用 **Git Bash** 或 **WSL** 来跑。如果都没有，只跑"下载 + BP 提取"两步也行（把 .rar 和 bp 文本交给 macOS 侧出包）。

## macOS 快速上手（完整链路）

```bash
# 0. 启动 Chrome（打开一次，后面一直用）
open -a "Google Chrome" --args \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/hltv-real-chrome-profile"

# 0b. 在打开的 Chrome 里登录 HLTV，手动过一次 CF 验证

# 1. 提取 URL（二选一）
#    a) CDP 自动化：在 HLTV results 页开着的情况下
node scripts/hltv/extract-stage-urls.mjs --stage stage1
#    b) 手动：打开对应 results 页 → F12 Console → 粘贴下面的片段

# 2. 下载 demo（各阶段 matches 文件名见下表）
#    Chrome 保持 9222 端口，另开终端
npx -y -p @playwright/test -p tsx tsx scripts/hltv/download-hltv-demos.ts \
  --matches fixtures/events/cologne-major-2026/data/matches-stage1.txt \
  --download-dir fixtures/demos/pro/IEM-Cologne-Major-2026/_src

# 3. 提取 BP
npx -y -p @playwright/test -p tsx tsx scripts/hltv/extract-bp.ts \
  --matches fixtures/events/cologne-major-2026/data/matches-stage1.txt \
  --out fixtures/events/cologne-major-2026/data/bp-output.txt

# 4. BP → spec
node scripts/hltv/bp-to-spec.mjs fixtures/events/cologne-major-2026/data/stage3-bp-complete.txt \
  --matches fixtures/events/cologne-major-2026/data/matches.txt
node scripts/hltv/bp-to-spec.mjs fixtures/events/cologne-major-2026/data/*.txt \
  --matches fixtures/events/cologne-major-2026/data/matches.txt \
  --merge fixtures/events/cologne-major-2026/spec.json

# 5. 导出（回到仓库根目录）
node scripts/event-export.mjs fixtures/events/cologne-major-2026/spec.json

# 6. 装配
node scripts/build-event-package.mjs fixtures/events/cologne-major-2026/spec.json
```

## Windows 上手

跟上面差不多，区别在这：

```powershell
# 0. 启动 Chrome（PowerShell）
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:USERPROFILE\hltv-real-chrome-profile"

# 步骤 1–4：同上（Node 跨平台，extract-stage-urls / bp-to-spec 都是 .mjs）

# 步骤 5–6：需要 Git Bash 或 WSL
#   → 在 Git Bash 里 cd 到仓库根目录，跑同上的 node 命令即可
```

> `download-hltv-demos.ts` / `extract-bp.ts` 在 PowerShell 里也能跑（npx 是跨平台的），
> 只有 `event-export.sh` 绑 bash——未来会重写为 `.mjs`。

## Console 提取片段（手动方式，Windows/macOS/任何 OS 都能用）

打开对应 HLTV results 页，F12 打开 Console，粘贴并回车：

```js
// Stage 1（https://www.hltv.org/results?event=9028）
copy([...document.querySelectorAll('a[href*="/matches/"]')]
  .map(a => new URL(a.getAttribute('href'), location.origin).href.split('#')[0])
  .filter(v => v.includes('iem-cologne-major-2026-stage-1'))
  .filter((v, i, arr) => arr.indexOf(v) === i).join('\n'));

// Stage 2（https://www.hltv.org/results?event=9029）
//   把 filter 换成 .includes('iem-cologne-major-2026-stage-2')

// Stage 3 + Playoff（https://www.hltv.org/results?event=8301）
//   把 filter 换成 .includes('iem-cologne-major-2026')
//   （不要加 stage 后缀——这页两个阶段混在一起，导出时由 spec 的 pairs 自动分开）
```

`copy()` 会把 URL 列表拷到剪贴板，粘到对应赛事的 `fixtures/events/<event>/data/matches-{stage}.txt` 即可。

## 命令速查

```bash
# CDP 提取 URL（Node 24 原生 WebSocket，零依赖）
node scripts/hltv/extract-stage-urls.mjs                   # 全 stage
node scripts/hltv/extract-stage-urls.mjs --stage stage1    # 单 stage

# 下载 + 提取 BP（需 Chrome CDP + npx 临时拉 playwright）
npx -y -p @playwright/test -p tsx tsx scripts/hltv/download-hltv-demos.ts --matches fixtures/events/<event>/data/matches.txt --download-dir fixtures/demos/pro/<Event>/_src
npx -y -p @playwright/test -p tsx tsx scripts/hltv/extract-bp.ts --matches fixtures/events/<event>/data/matches.txt --out fixtures/events/<event>/data/bp-output.txt

# BP 文本 → spec
node scripts/hltv/bp-to-spec.mjs fixtures/events/cologne-major-2026/data/stage3-bp-complete.txt \
  --matches fixtures/events/cologne-major-2026/data/matches.txt
node scripts/hltv/bp-to-spec.mjs fixtures/events/cologne-major-2026/data/*.txt \
  --matches fixtures/events/cologne-major-2026/data/matches.txt \
  --merge fixtures/events/cologne-major-2026/spec.json

# 导出 + 装配
node scripts/event-export.mjs fixtures/events/cologne-major-2026/spec.json
node scripts/build-event-package.mjs fixtures/events/cologne-major-2026/spec.json
```

## 科隆 Major 2026 数据文件参考

| 文件 | 内容 |
|---|---|
| `fixtures/events/cologne-major-2026/data/matches-stage1.txt` | Stage 1 的 33 个 HLTV match URL |
| `fixtures/events/cologne-major-2026/data/matches-stage2.txt` | Stage 2 的 33 个 HLTV match URL |
| `fixtures/events/cologne-major-2026/data/matches.txt` | Stage 3 + Playoff 的 28 个 HLTV match URL |
| `fixtures/events/cologne-major-2026/data/stage3-bp-complete.txt` | 40 场 BP 全量（33 stage3 + 7 playoff） |
| `fixtures/events/cologne-major-2026/data/bp-output.txt` | 早期爬取输出（可能不全，以 complete 为准） |
