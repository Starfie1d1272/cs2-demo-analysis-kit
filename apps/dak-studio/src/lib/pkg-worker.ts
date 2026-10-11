import { normalizeDiagnostic, type SafeDiagnostic } from "@cs2dak/rivalhub-upload";
import { loadDemoPackageFromZip, buildMatchRadarField, type DemoPackageLoadProfile } from "@cs2dak/core";
import { buildRadarFieldGrid, type TriangleBvh } from "@cs2dak/maps";
import { loadCalloutGridBrowser } from "@cs2dak/maps/callout-grid-browser";
import { buildTriBvh, fetchTriBuffer, type TriDiagnosticSink } from "./tri-loading";
import { extractMatchData } from "./extract-match-facts";
import { metaFromPackage } from "./demo-meta";

/**
 * 导入 worker：解析 v3 ZIP，并（import 模式下）就地生成可重建 facts 与 derived cache。
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
  profile?: DemoPackageLoadProfile;
}

interface ImportMsg {
  id: number;
  op: "import";
  buffer: ArrayBuffer;
  matchId: string;
  triBaseUrl: string;
  calloutUrls: Record<string, string>;
}

interface RadarFieldMsg {
  id: number;
  op: "radarField";
  buffer: ArrayBuffer;
  matchId: string;
  triBaseUrl: string;
  economy: "gun" | "all";
}

type InMsg = ParseMsg | ImportMsg | RadarFieldMsg;

// BVH 树构建较重；同一 worker 处理同图的多场时复用（按图缓存）。
const bvhByMap = new Map<string, Promise<TriangleBvh | null>>();

function loadTriBvh(mapName: string, triBaseUrl: string, sink: TriDiagnosticSink): Promise<TriangleBvh | null> {
  const cached = bvhByMap.get(mapName);
  if (cached) return cached;
  const promise = (async () => {
    const buffer = await fetchTriBuffer(mapName, triBaseUrl, sink);
    return buffer ? buildTriBvh(buffer, mapName, sink) : null;
  })();
  bvhByMap.set(mapName, promise);
  return promise;
}

self.onmessage = async (event: MessageEvent<InMsg>) => {
  const msg = event.data;
  const diagnostics: SafeDiagnostic[] = [];
  const observe = (diagnostic: unknown) => {
    if (diagnostics.length < 16) diagnostics.push(normalizeDiagnostic(diagnostic, { fileId: `worker-${msg.id}` }));
  };
  try {
    const pkg = await loadDemoPackageFromZip(msg.buffer, { profile: msg.op === "parse" ? msg.profile ?? "full" : "full", onDiagnostic: observe });
    if (msg.op === "parse") {
      self.postMessage({ id: msg.id, diagnostics, ok: true, pkg });
      return;
    }
    if (msg.op === "radarField") {
      const mapName = pkg.match.mapName;
      const grid = buildRadarFieldGrid(mapName);
      if (!grid) {
        self.postMessage({ id: msg.id, diagnostics, ok: true, radarFields: [] });
        return;
      }
      const bvh = await loadTriBvh(mapName, msg.triBaseUrl, observe);
      const radarFields = buildMatchRadarField(pkg, { matchId: msg.matchId, grid, bvh, economy: msg.economy });
      self.postMessage({ id: msg.id, diagnostics, ok: true, radarFields });
      return;
    }
    const mapName = pkg.match.mapName;
    const [bvh, calloutGrid] = await Promise.all([
      loadTriBvh(mapName, msg.triBaseUrl, observe),
      loadCalloutGridBrowser(mapName, { urls: msg.calloutUrls })
    ]);
    const data = extractMatchData(pkg, {
      matchId: msg.matchId,
      visibilityFor: (name) => (name === mapName ? bvh : null),
      calloutGrid
    });
    const meta = metaFromPackage(pkg);
    self.postMessage({ id: msg.id, diagnostics, ok: true, meta, data });
  } catch (err) {
    const diagnostic = normalizeDiagnostic(err, { stage: `worker.${msg.op}` });
    self.postMessage({ id: msg.id, diagnostics, ok: false, error: diagnostic.message, diagnostic });
  }
};
