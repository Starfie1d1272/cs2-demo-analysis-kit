#!/usr/bin/env node
// CDP 轻量提取器：连已运行 Chrome → 导航 HLTV results → 提取 stage match URL。
// 不依赖 Playwright，仅 Node 24 内置 WebSocket。
//
// 用法（先确保 Chrome --remote-debugging-port=9222 已启动并已登录 HLTV）：
//   node scripts/hltv/extract-stage-urls.mjs
//   node scripts/hltv/extract-stage-urls.mjs --stage stage1  # 只爬一个
import { writeFileSync } from "node:fs";

const CDP = "http://127.0.0.1:9222";
const STAGES = [
  {
    key: "stage1",
    url: "https://www.hltv.org/results?event=9028",
    filter: "iem-cologne-major-2026-stage-1",
  },
  {
    key: "stage2",
    url: "https://www.hltv.org/results?event=9029",
    filter: "iem-cologne-major-2026-stage-2",
  },
];

const only = process.argv.includes("--stage") ? process.argv[process.argv.indexOf("--stage") + 1] : null;

// CDP helpers over a single WS connection
class CdpClient {
  #ws;
  #id = 0;
  #pending = new Map();

  constructor(wsUrl) {
    this.#ws = new WebSocket(wsUrl);
    this.#ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data.toString());
      if (msg.id && this.#pending.has(msg.id)) {
        const { resolve, reject } = this.#pending.get(msg.id);
        this.#pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  async ready() {
    if (this.#ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.#ws.addEventListener("open", resolve, { once: true });
      this.#ws.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.#ws.close(); }
}

async function main() {
  // 找到第一个 HLTV 页面
  const pagesResp = await fetch(`${CDP}/json`);
  const pages = await pagesResp.json();
  const hltvPage = pages.find((p) => p.url.includes("hltv.org"));
  if (!hltvPage) {
    console.error("❌ 未找到 HLTV 页面。请在 Chrome 中打开 HLTV 并登录。");
    process.exit(1);
  }
  console.log(`📌 复用页面：${hltvPage.title}`);

  const client = new CdpClient(hltvPage.webSocketDebuggerUrl);
  await client.ready();

  for (const stage of STAGES) {
    if (only && stage.key !== only) continue;

    console.log(`\n🌐 导航到 ${stage.key}：${stage.url}`);
    await client.send("Page.enable");
    await client.send("Page.navigate", { url: stage.url });

    // 等待页面加载（纯超时，简单可靠）
    await new Promise((resolve) => setTimeout(resolve, 8000));

    // 提取 URL
    const js = `(() => {
      const urls = [...document.querySelectorAll('a[href*="/matches/"]')]
        .map(a => new URL(a.getAttribute('href'), location.origin).href.split('#')[0])
        .filter(v => v.includes("${stage.filter}"))
        .filter((v, i, arr) => arr.indexOf(v) === i);
      return JSON.stringify(urls);
    })()`;

    const result = await client.send("Runtime.evaluate", { expression: js, returnByValue: true });
    const urls = JSON.parse(result.result?.value || "[]");

    if (urls.length === 0) {
      console.log(`  ⚠️  未提取到匹配 "${stage.filter}" 的 URL（可能需在页面上选择正确的 stage filter）`);
      // 尝试不带 filter 提取当前页全部
      const allJs = `(() => {
        const urls = [...document.querySelectorAll('a[href*="/matches/"]')]
          .map(a => new URL(a.getAttribute('href'), location.origin).href.split('#')[0])
          .filter((v, i, arr) => arr.indexOf(v) === i);
        return JSON.stringify(urls);
      })()`;
      const allResult = await client.send("Runtime.evaluate", { expression: allJs, returnByValue: true });
      const allUrls = JSON.parse(allResult.result?.value || "[]");
      console.log(`  ℹ️ 当前页全部 URL：${allUrls.length} 个`);
      if (allUrls.length > 0) {
        console.log(`  💡 提示：可能需要手动在页面选择 stage filter。`);
        // 尽力：如果全部 URL 数量合理（<80），直接保存让用户筛选
        if (allUrls.length <= 80) {
          const out = `scripts/hltv/matches-${stage.key}.txt`;
          writeFileSync(out, allUrls.join("\n") + "\n", "utf8");
          console.log(`  📄 已保存全部 ${allUrls.length} URL → ${out}`);
        }
      }
      continue;
    }

    const out = `scripts/hltv/matches-${stage.key}.txt`;
    writeFileSync(out, urls.join("\n") + "\n", "utf8");
    console.log(`  ✅ ${urls.length} URL → ${out}`);
  }

  client.close();
  console.log("\n🎉 完成。Chrome 保持打开。");
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
