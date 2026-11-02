import { analysisResultMarkdown, type AnalysisResultSnapshotV1 } from "./analysis-export";

export function downloadAnalysisResult(snapshot: AnalysisResultSnapshotV1, format: "markdown" | "json"): void {
  const content = format === "json" ? JSON.stringify(snapshot, null, 2) : analysisResultMarkdown(snapshot);
  const blob = new Blob([content], { type: format === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    const slug = snapshot.title.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "-").trim().replace(/[. ]+$/g, "").slice(0, 100) || "analysis-result";
    const safeSlug = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(slug) ? `_${slug}` : slug;
    link.href = url;
    link.download = `${safeSlug}-${new Date(snapshot.generatedAt).toISOString().slice(0, 10)}.${format === "json" ? "json" : "md"}`;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
