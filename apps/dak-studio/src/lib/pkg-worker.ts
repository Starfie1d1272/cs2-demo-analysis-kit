import { loadDemoPackageFromZip } from "@cs2dak/core";
import { buildTriangleBvh, parseAwpyTri, type TriangleBvh } from "@cs2dak/maps";
import { loadCalloutGridBrowser } from "@cs2dak/maps/callout-grid-browser";
import { extractMatchFacts } from "./facts";
import { metaFromPackage } from "./demo-meta";

/**
 * 导入 worker：解析 v3 ZIP，并（import 模式下）就地把 DemoPackage 榨成 facts。
 *
 * facts 抽取是导入管线最重的一步（视野锥/LOS 遍历），原先在主线程串行跑会冻结 UI；
 * 移进 worker 后多场可在 worker 池里真正并行。输出按构造与主线程等价：
 * worker fetch 的是同一份静态 `.tri`（base 由主线程传绝对 URL，避免 worker chunk
 * 相对路径歧义）与同一份 callout grid JSON，`buildTriangleBvh` 确定性 →
 * 同一 visibilityFor → 同一 MatchFacts。tri/callout 缺失时降级（与主线程一致）。
 *
 * `parse` 模式仅返回整包（逐场证据/工作台用），不触发资产加载。
 */

interface ParseMsg {
  id: number;
  op: "parse";
  buffer: ArrayBuffer;
}

interface ImportMsg {
  id: number;
  op: "import";
  buffer: ArrayBuffer;
  matchId: string;
  triBaseUrl: string;
  calloutUrls: Record<string, string>;
}

type InMsg = ParseMsg | ImportMsg;

// BVH 树构建较重；同一 worker 处理同图的多场时复用（按图缓存）。
const bvhByMap = new Map<string, Promise<TriangleBvh | null>>();

function loadTriBvh(mapName: string, triBaseUrl: string): Promise<TriangleBvh | null> {
  const cached = bvhByMap.get(mapName);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const response = await fetch(`${triBaseUrl}${mapName}.tri`);
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type") ?? "";
      // dev server 对缺失文件可能回退 index.html（200 + text/html）
      if (contentType.includes("text/html")) return null;
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0 || buffer.byteLength % 36 !== 0) return null;
      return buildTriangleBvh(parseAwpyTri(buffer));
    } catch {
      return null;
    }
  })();
  bvhByMap.set(mapName, promise);
  return promise;
}

self.onmessage = async (event: MessageEvent<InMsg>) => {
  const msg = event.data;
  try {
    const pkg = await loadDemoPackageFromZip(msg.buffer);
    if (msg.op === "parse") {
      self.postMessage({ id: msg.id, ok: true, pkg });
      return;
    }
    const mapName = pkg.match.mapName;
    const [bvh, calloutGrid] = await Promise.all([
      loadTriBvh(mapName, msg.triBaseUrl),
      loadCalloutGridBrowser(mapName, { urls: msg.calloutUrls })
    ]);
    const facts = extractMatchFacts(pkg, {
      matchId: msg.matchId,
      visibilityFor: (name) => (name === mapName ? bvh : null),
      calloutGrid
    });
    const meta = metaFromPackage(pkg);
    self.postMessage({ id: msg.id, ok: true, meta, facts });
  } catch (err) {
    self.postMessage({
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
};
