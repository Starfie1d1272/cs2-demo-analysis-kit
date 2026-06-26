/**
 * 临时 OOM 归因探针：复现浏览器赛事包导入的解析 + facts 提取内存曲线。
 * 走 worker 同款代码（loadDemoPackageFromZip + extractMatchFacts），逐图打印 RSS / heapUsed。
 * 用法：node_modules/.bin/tsx scripts/cologne/oom-probe.mts [N]
 */
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { loadDemoPackageFromZip } from "../../packages/core/src/index.ts";
import { extractMatchFacts } from "../../apps/dak-studio/src/lib/facts.ts";

const ZIP = "fixtures/demos/pro/IEM-Cologne-Major-2026/_build/iem-cologne-major-2026.zip";
const limit = Number(process.argv[2] ?? "49");

const mb = (n: number) => (n / 1024 / 1024).toFixed(0);
function snap(tag: string) {
  const m = process.memoryUsage();
  console.log(
    `${tag.padEnd(28)} rss=${mb(m.rss).padStart(6)}MB heap=${mb(m.heapUsed).padStart(6)}MB ext=${mb(m.external).padStart(6)}MB ab=${mb(m.arrayBuffers).padStart(6)}MB`,
  );
}

const outer = await JSZip.loadAsync(readFileSync(ZIP));
snap("after outer loadAsync");

const demoFiles = Object.values(outer.files)
  .filter((f) => !f.dir && /^maps\/.+\.zip$/i.test(f.name))
  .sort((a, b) => a.name.localeCompare(b.name))
  .slice(0, limit);

for (const [i, demo] of demoFiles.entries()) {
  try {
    const data = await demo.async("arraybuffer");
    const pkg = await loadDemoPackageFromZip(data);
    const facts = extractMatchFacts(pkg, {
      matchId: demo.name.split("/").at(-1)!.replace(/\.zip$/, ""),
      visibilityFor: () => null,
      calloutGrid: null,
    });
    const factsBytes = Buffer.byteLength(JSON.stringify(facts));
    snap(`[${i + 1}/${demoFiles.length}] facts=${mb(factsBytes)}MB`);
  } catch (err) {
    snap(`[${i + 1}/${demoFiles.length}] ERR ${(err as Error).message.slice(0, 30)}`);
  }
}

if (global.gc) {
  global.gc();
  snap("after forced gc");
}
