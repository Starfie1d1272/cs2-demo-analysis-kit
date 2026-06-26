/**
 * download-hltv-demos.ts
 * HLTV Demo 下载器 — CDP 接管 + 并发下载池
 *
 * 设计策略：页面访问串行，下载并发受限。
 *   - 每 10–15s 触发一个新下载
 *   - 最多同时保留 MAX_ACTIVE_DOWNLOADS 个后台保存任务
 *   - 失败 URL 不写入 done，下次重试
 *
 * 用法：
 *   1. 先启动系统 Chrome（开一个新终端窗口运行）：
 *      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *        --remote-debugging-port=9222 \
 *        --user-data-dir="$HOME/hltv-real-chrome-profile"
 *   2. 在该 Chrome 里打开 HLTV，手动通过一次 CF 验证
 *   3. 另开终端运行脚本：
 *      cd ~/hltv-demo-downloader
 *      npx tsx download-hltv-demos.ts --matches fixtures/events/<event>/data/matches.txt --download-dir fixtures/demos/pro/<Event>/_src
 *   4. Chrome 保持打开，脚本跑完后手动关闭即可
 */

import { chromium, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";

// ── 配置 ──────────────────────────────────────────────
function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const MATCHES_FILE = argValue("--matches") ?? "matches.txt";
const CDP_URL = argValue("--cdp") ?? "http://127.0.0.1:9222";
const DOWNLOAD_DIR = path.resolve(argValue("--download-dir") ?? "demos");
const STATE_FILE = argValue("--state") ?? ".download-state.json";
const DELAY_BASE_MS = 10_000;
const DELAY_JITTER_MS = 5_000;
const MAX_ACTIVE_DOWNLOADS = 3;
const MAX_CHALLENGES = 2;

// ── 日志 & 工具 ───────────────────────────────────────

const log = (...args: unknown[]) => process.stdout.write(args.map(String).join(" ") + "\n");

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay() {
  return DELAY_BASE_MS + Math.floor(Math.random() * DELAY_JITTER_MS);
}

function fileSafeNameFromUrl(url: string): string {
  const m = url.match(/\/matches\/(\d+)\/([^/?#]+)/);
  return m ? `${m[1]}-${m[2]}` : `match-${Date.now()}`;
}

// ── 下载池 ────────────────────────────────────────────

const activeDownloads = new Set<Promise<void>>();

async function waitForDownloadSlot() {
  while (activeDownloads.size >= MAX_ACTIVE_DOWNLOADS) {
    await Promise.race(activeDownloads);
  }
}

function trackDownload(task: Promise<void>) {
  activeDownloads.add(task);
  task.finally(() => activeDownloads.delete(task));
}

// ── CF 验证检测 ──────────────────────────────────────

async function waitIfChallenge(page: Page): Promise<boolean> {
  try {
    const title = await page.title().catch(() => "");
    const body = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");

    const isChallenge =
      title.toLowerCase().includes("just a moment") ||
      body.toLowerCase().includes("verify you are human") ||
      body.toLowerCase().includes("checking your browser") ||
      body.toLowerCase().includes("cloudflare") ||
      body.toLowerCase().includes("安全验证");

    if (!isChallenge) return false;

    log("\n⚠️  [CF] 检测到 Cloudflare 验证");
    log("[CF] 请在 Chrome 窗口中手动完成验证");
    log("[CF] 完成后回到终端按 Enter 继续...");

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question("");
    rl.close();

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await delay(3000);
    return true;
  } catch {
    return false;
  }
}

// ── Demo 点击 & 下载触发 ────────────────────────────

async function clickDemoDownload(page: Page, baseName: string): Promise<boolean> {
  const selectors = [
    page.locator("div.flexbox.left-right-padding").filter({ hasText: /demo download/i }),
    page.getByRole("link", { name: /^demo$/i }),
    page.getByRole("button", { name: /download demo/i }),
    page.getByRole("button", { name: /^demo$/i }),
    page.locator('a[href*="download"]').filter({ hasText: /demo/i }),
    page.locator('a[href*="demo"]').filter({ hasText: /download/i }),
    page.locator('a[href*="demo"]').first(),
    page.locator("a:has-text('Demo')").first(),
    page.locator("button:has-text('Demo')").first(),
  ];

  for (const locator of selectors) {
    try {
      const count = await locator.count();
      if (count === 0) continue;

      // 等下载池有空位
      await waitForDownloadSlot();

      // 触发下载
      const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
      await locator.first().click({ timeout: 10_000 });
      const download = await downloadPromise;

      const suggested = download.suggestedFilename() || `${baseName}.rar`;
      const safeName = suggested.replace(/[<>:"/\\|?*]/g, "_");
      const savePath = path.join(DOWNLOAD_DIR, safeName);

      // 检查是否已存在
      try {
        await fs.access(savePath);
        log(`  ⏭️  已存在：${safeName}，跳过`);
        return true;
      } catch {
        // 文件不存在，正常下载
      }

      log(`  📥 已触发下载：${safeName}`);

      // 后台保存（不阻塞主循环）
      const task = download
        .saveAs(savePath)
        .then(async () => {
          const size = (await fs.stat(savePath)).size;
          log(`  ✅ 下载完成：${safeName} (${(size / 1024 / 1024).toFixed(1)} MB)`);
        })
        .catch((err) => {
          log(`  ❌ 下载失败：${safeName}`, err);
          throw err;
        });

      trackDownload(task);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

// ── 主流程 ────────────────────────────────────────────

async function main() {
  log("🚀 Demo 下载器启动（CDP + 并发下载池）");
  log(`CDP: ${CDP_URL}`);
  log(`并发下载数：${MAX_ACTIVE_DOWNLOADS}`);

  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

  // 读取 URL 列表
  const raw = await fs.readFile(MATCHES_FILE, "utf8");
  const allUrls = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("http"));

  if (allUrls.length === 0) {
    log("❌ matches.txt 为空或无有效 URL");
    process.exit(1);
  }

  // ── 断点续跑 ──
  let done = new Set<string>();
  try {
    const stateRaw = await fs.readFile(STATE_FILE, "utf8");
    done = new Set(JSON.parse(stateRaw));
    log(`📌 之前已触发下载 ${done.size} 个，继续未完成的`);
  } catch {
    log("📌 全新运行");
  }

  const urls = allUrls.filter((u) => !done.has(u));
  log(`📋 共 ${allUrls.length} 个，待处理 ${urls.length} 个`);

  // ── CDP 连接 ──
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  if (!context) {
    log("❌ 未找到已有浏览器上下文");
    await browser.close();
    process.exit(1);
  }
  const page = context.pages()[0] ?? (await context.newPage());

  let challengesInARow = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const baseName = fileSafeNameFromUrl(url);

    log(`\n[${i + 1}/${urls.length}] ${url}`);

    // 导航
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    } catch {
      log(`  ⚠️  导航超时`);
    }

    await delay(5000);

    // CF 验证
    const hadChallenge = await waitIfChallenge(page);
    if (hadChallenge) {
      challengesInARow++;
      if (challengesInARow >= MAX_CHALLENGES) {
        log(`\n❌ 连续 ${MAX_CHALLENGES} 次 CF 验证，退出`);
        break;
      }
    } else {
      challengesInARow = 0;
    }

    // 触发下载
    log("  查找 Demo 下载按钮...");
    const ok = await clickDemoDownload(page, baseName);

    if (!ok) {
      log(`  ❌ 未找到 Demo 下载入口（不写入断点，下次重试）`);
      const failScreenshot = path.join(DOWNLOAD_DIR, `${baseName}.fail.png`);
      await page.screenshot({ path: failScreenshot, fullPage: true });
      log(`  截图：${failScreenshot}`);
      continue; // 不写入 done，下次重试
    }

    // 成功触发 → 写入断点
    done.add(url);
    await fs.writeFile(STATE_FILE, JSON.stringify([...done], null, 2), "utf8");

    // 页面间隔（最后一个不用等）
    if (i < urls.length - 1) {
      const waitMs = randomDelay();
      log(`  ⏳ ${(waitMs / 1000).toFixed(0)}s`);
      await delay(waitMs);
    }
  }

  // ── 等待所有后台下载完成 ──
  if (activeDownloads.size > 0) {
    log(`\n⏳ 等待 ${activeDownloads.size} 个下载任务完成...`);
    const results = await Promise.allSettled([...activeDownloads]);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) log(`  ⚠️ ${failed} 个下载失败`);
  }

  log(`\n✅ 完成！Chrome 保持打开，手动关闭即可。`);
  // 不关闭 browser，让用户手动关 Chrome
}

main().catch((err) => {
  log("❌ 脚本异常：", err);
  process.exit(1);
});
