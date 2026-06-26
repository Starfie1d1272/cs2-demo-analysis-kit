/**
 * extract-bp.ts
 * HLTV 比赛 BP（Ban/Pick）提取器 — CDP 接管版
 *
 * 用法：
 *   1. 先启动系统 Chrome：
 *      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *        --remote-debugging-port=9222 \
 *        --user-data-dir="$HOME/hltv-real-chrome-profile"
 *   2. 在 Chrome 里手动登录 HLTV，通过一次 CF 验证
 *   3. 另开终端：
 *      cd ~/hltv-demo-downloader
 *      npx tsx extract-bp.ts --matches fixtures/events/<event>/data/matches.txt --out fixtures/events/<event>/data/bp-output.txt
 *
 * 特性：
 *   - 通过 CDP 接管真实 Chrome，避免 Playwright 自动化检测
 *   - 遇到 CF 验证时暂停，让你手动过
 *   - 自动断点续跑（处理过的 URL 跳过）
 *   - 按阶段（0-0, 1-0, 0-1, playoff等）分组输出
 */

import { chromium, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import { createInterface } from "node:readline/promises";

// ── 配置 ──────────────────────────────────────────────
function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const MATCHES_FILE = argValue("--matches") ?? "matches.txt";
const CDP_URL = argValue("--cdp") ?? "http://127.0.0.1:9222";
const OUT_FILE = argValue("--out") ?? "bp-output.txt";
const STATE_FILE = argValue("--state") ?? ".extract-state.json"; // 记录已处理的 URL

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 行缓冲日志（确保后台进程也能实时输出） */
const log = (...args: unknown[]) => process.stdout.write(args.map(String).join(" ") + "\n");

/** 从页面文本推断比赛阶段 */
function inferStage(text: string): string {
  const lower = text.toLowerCase();

  const swissMatch = lower.match(
    /swiss round [23]?.*?([0-2]-[0-2])|teams with a ([0-2]-[0-2]) record/i
  );
  if (swissMatch) {
    const score = swissMatch[1] || swissMatch[2];
    if (score) return score;
  }

  // 每条是 [正则, 阶段名]
  // 先检查 playoff 模式（优先于 Swiss 数值匹配）
  const stageMapping: [RegExp, string][] = [
    [/\*\s*quarter[- ]?\s*final/i, "playoff / quarter-final"],
    [/\*\s*semi[- ]?\s*final/i, "playoff / semi-final"],
    [/\*\s*grand[- ]?\s*final/i, "playoff / grand final"],
    [/playoff/i, "playoff"],
    [/0-0|teams with no wins/i, "0-0"],
    [/1-0|teams with 1 win/i, "1-0"],
    [/0-1|teams without a win/i, "0-1"],
    [/2-0|teams with 2 wins/i, "2-0"],
    [/1-1|teams with 1 win 1 loss/i, "1-1"],
    [/1-2|teams with 2 losses/i, "1-2"],
    [/2-1|teams with 2 wins 1 loss/i, "2-1"],
    [/elimination|teams facing elimination/i, "elimination"],
  ];

  for (const [pattern, label] of stageMapping) {
    if (pattern.test(lower)) return label;
  }

  if (text.includes("removed") || text.includes("picked") || text.includes("left over")) {
    return "unknown-stage";
  }

  return "unknown-stage";
}

/** 从页面文本提取 ban/pick 行 */
function extractVetoLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^[1-7]\.\s+.+\b(removed|picked|was left over)\b/i.test(s));
}

/** 检测并处理 Cloudflare 人机验证 */
async function waitIfChallenge(page: Page) {
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
    log("[CF] 请手动在该 Chrome 窗口中完成验证");
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

// ── 主流程 ────────────────────────────────────────────

async function main() {
  log("🚀 BP 提取器启动（CDP 接管模式）");
  log(`CDP: ${CDP_URL}`);

  // 读取比赛 URL 列表
  const raw = await fs.readFile(MATCHES_FILE, "utf8");
  const allUrls = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("http"));

  if (allUrls.length === 0) {
    log("❌ matches.txt 为空或无有效 URL");
    process.exit(1);
  }

  // ── 断点续跑：读取已处理记录 ──
  let done = new Set<string>();
  try {
    const stateRaw = await fs.readFile(STATE_FILE, "utf8");
    done = new Set(JSON.parse(stateRaw));
    log(`📌 之前已处理 ${done.size} 个 URL，继续未完成的`);
  } catch {
    log("📌 未发现断点记录，从头开始");
  }

  const urls = allUrls.filter((u) => !done.has(u));
  log(`📋 共 ${allUrls.length} 个，待处理 ${urls.length} 个\n`);

  // ── 连接已有 Chrome ──
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  if (!context) {
    log("❌ 未找到已有浏览器上下文。请确认 Chrome 已打开且 CDP 端口 9222 已启动。");
    await browser.close();
    process.exit(1);
  }
  const page = context.pages()[0] ?? (await context.newPage());

  const groups = new Map<string, { url: string; lines: string[] }[]>();
  let challengesSeen = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    log(`\n[${i + 1}/${urls.length}] ${url}`);

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    } catch {
      log(`  ⚠️  导航超时`);
    }

    await delay(4000);
    const hadChallenge = await waitIfChallenge(page);
    if (hadChallenge) {
      challengesSeen++;
      // CF 连续出现？暂停并提示
      if (challengesSeen > 1) {
        log("  ⚠️  CF 验证连续出现，建议降低频率或检查网络");
      }
    }

    const body = await page.locator("body").innerText().catch(() => "");

    const stage = inferStage(body);
    const veto = extractVetoLines(body);

    if (veto.length === 0) {
      log(`  ⚠️  未提取到 BP`);
      // 也记录到 done，避免卡住
    } else {
      if (!groups.has(stage)) groups.set(stage, []);
      groups.get(stage)!.push({ url, lines: veto });
      log(`  ✅ (${stage})`);
    }

    // 记录已处理
    done.add(url);
    await fs.writeFile(STATE_FILE, JSON.stringify([...done]), "utf8");
  }

  // 关闭 CDP 连接（不会关掉 Chrome）
  await browser.close();

  // ── 输出 ────────────────────────────────────────────
  // 读取已有输出（兼容多次运行追加）
  let existing = "";
  try {
    existing = await fs.readFile(OUT_FILE, "utf8");
  } catch {
    // 首次运行，没有已有输出
  }

  const outputParts: string[] = [];
  if (existing.trim()) {
    outputParts.push(existing.trimEnd());
    outputParts.push("");
  }

  for (const [stage, entries] of groups) {
    outputParts.push(`\n${"=".repeat(40)}`);
    outputParts.push(`阶段：${stage}（${entries.length} 场）`);
    outputParts.push(`${"=".repeat(40)}\n`);

    for (const entry of entries) {
      const name = entry.url.match(/\/matches\/\d+\/([^/?#]+)/)?.[1] || entry.url;
      outputParts.push(`# ${name}`);
      outputParts.push(...entry.lines);
      outputParts.push("");
    }
  }

  await fs.writeFile(OUT_FILE, outputParts.join("\n"), "utf8");

  log(`\n✅ 本次处理完成！结果已写入 ${OUT_FILE}`);
  log(`共 ${groups.size} 个阶段组，${urls.length} 场`);
  log(`💡 处理记录保存在 ${STATE_FILE}，下次会自动跳过已完成 URL`);
}

main().catch((err) => {
  log("❌ 脚本异常：", err);
  process.exit(1);
});
