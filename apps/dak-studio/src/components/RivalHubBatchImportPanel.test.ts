import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { currentRivalHubBatchItem, RivalHubBatchImportPanel } from "./RivalHubBatchImportPanel";
import type { RivalHubBatchSession } from "../lib/rivalhub-import";

function session(overrides: Partial<RivalHubBatchSession> = {}): RivalHubBatchSession {
  return {
    id: "session",
    status: "running",
    currentIndex: 2,
    awaitingTargetItemId: null,
    total: 3,
    items: [
      { id: "skipped", fileName: "skipped.zip", phase: "skipped", message: "已跳过", detail: "用户跳过目标" },
      { id: "target", fileName: "target.zip", phase: "needs_target", message: "等待选择目标", targetCandidates: [{ matchMapId: "map", mapName: "de_ancient", stageName: "Swiss", teamAName: "A", teamBName: "B", scoreA: 13, scoreB: 10, completedAt: null, demoStatus: "finished_pending_demo" }] },
      { id: "current", fileName: "current.zip", phase: "importing", message: "写入本地资料库" },
    ],
    counts: { synced: 0, needsAttention: 0, alreadySynced: 0, needsTarget: 1, skipped: 1, failed: 0, reusedLocal: 0 },
    ...overrides,
  };
}

describe("RivalHub batch current item", () => {
  it("follows awaitingTargetItemId instead of an earlier needs_target item", () => {
    expect(currentRivalHubBatchItem(session())?.id).toBe("current");
    expect(currentRivalHubBatchItem(session({ awaitingTargetItemId: "target", currentIndex: 2 }))?.id).toBe("target");
  });

  it("keeps terminal results visible and exposes an explicit dismiss action", () => {
    const html = renderToStaticMarkup(createElement(RivalHubBatchImportPanel, {
      session: session({
        status: "completed",
        currentIndex: 0,
        total: 1,
        items: [{ id: "failed", fileName: "failed.dem", phase: "failed", message: "失败", detail: "server unavailable" }],
        counts: { synced: 0, alreadySynced: 0, needsAttention: 0, needsTarget: 0, skipped: 0, failed: 1, reusedLocal: 0 },
      }),
      onDismiss: () => undefined,
    }));

    expect(html).toContain("已完成 · 1/1 文件");
    expect(html).toContain("关闭结果");
    expect(html).toContain("server unavailable");
    expect(html).not.toContain("当前文件完成后停止");
  });
});
