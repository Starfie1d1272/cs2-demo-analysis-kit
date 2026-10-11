import "fake-indexeddb/auto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { EventsView } from "./EventsView";

it.each(["connected", "error", "disconnected"] as const)("offers direct refresh for retained authorization in %s", status => {
  const html = renderToStaticMarkup(createElement(EventsView, {
    entries: [], onOpenMatch: vi.fn(), onAnalyzeEvent: vi.fn(), onGoLibrary: vi.fn(),
    onConnectRivalHub: vi.fn(), onRefreshRivalHub: vi.fn(),
    rivalHubConnection: { status, baseUrl: "https://synthetic.example", pairingId: status === "disconnected" ? null : "synthetic-pairing", connectedAt: 1, lastSyncAt: null, error: status === "error" ? "connection refused" : null },
  }));
  if (status === "disconnected") expect(html).not.toContain(">刷新赛事</button>");
  else expect(html).toContain(">刷新赛事</button>");
  if (status === "error") expect(html).toContain("connection refused");
});
