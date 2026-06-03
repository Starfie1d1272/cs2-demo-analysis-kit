import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { buildMatchWorkspaceModel, loadDemoPackageFromZip } from "@cs2dak/core";
import type { MatchWorkspaceModel } from "@cs2dak/contract";
import { MatchWorkspace } from "@cs2dak/react";
import "@cs2dak/react/theme.css";
import sampleZipUrl from "../../../fixtures/input/sample-match.zip?url";

// Minimal pywebview bridge surface this viewer relies on (see python gui/app.py).
interface PyApi {
  get_pending_zip?: () => Promise<string | null>;
}
function pyApi(): PyApi | undefined {
  return (window as unknown as { pywebview?: { api?: PyApi } }).pywebview?.api;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return bytes.buffer;
}

/** Wait briefly for the pywebview bridge to be injected, if we're inside the GUI. */
function waitForBridge(timeoutMs = 1500): Promise<PyApi | undefined> {
  if (pyApi()) return Promise.resolve(pyApi());
  return new Promise((resolve) => {
    const done = () => resolve(pyApi());
    window.addEventListener("pywebviewready", done, { once: true });
    setTimeout(done, timeoutMs);
  });
}

function DemoLab() {
  const [model, setModel] = useState<MatchWorkspaceModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFromBuffer = useCallback(async (buffer: ArrayBuffer) => {
    setLoading(true);
    setError(null);
    try {
      const pkg = await loadDemoPackageFromZip(buffer);
      setModel(buildMatchWorkspaceModel(pkg));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // 1. GUI viewer: render the just-exported ZIP handed over by Python.
        const api = await waitForBridge();
        if (api?.get_pending_zip) {
          const b64 = await api.get_pending_zip();
          if (b64) {
            if (!cancelled) await loadFromBuffer(base64ToArrayBuffer(b64));
            return;
          }
        }
        // 2. Standalone: fall back to the bundled sample export.
        const response = await fetch(sampleZipUrl);
        if (!cancelled) await loadFromBuffer(await response.arrayBuffer());
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadFromBuffer]);

  // Drag-drop / file picker lets a user load any v2 ZIP (standalone or to override).
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) void file.arrayBuffer().then(loadFromBuffer);
    },
    [loadFromBuffer]
  );
  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void file.arrayBuffer().then(loadFromBuffer);
    },
    [loadFromBuffer]
  );

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <label
        style={{
          position: "fixed",
          top: 10,
          right: 10,
          zIndex: 50,
          display: "inline-flex",
          alignItems: "center",
          padding: "5px 10px",
          fontSize: 11,
          lineHeight: 1,
          borderRadius: 2,
          background: "var(--dak-panel, #10131a)",
          color: "var(--dak-fg-dim, #525a6a)",
          border: "1px solid var(--dak-border, #1f2530)",
          cursor: "pointer",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          fontFamily: "inherit",
        }}
      >
        加载 ZIP
        <input type="file" accept=".zip" onChange={onPick} hidden />
      </label>
      {error ? (
        <div className="dak-shell">
          <div className="dak-workspace dak-loading">加载失败：{error}（可拖入 v2 ZIP 重试）</div>
        </div>
      ) : loading || !model ? (
        <div className="dak-shell">
          <div className="dak-workspace dak-loading">加载 strict v2 导出中…</div>
        </div>
      ) : (
        <MatchWorkspace model={model} />
      )}
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DemoLab />
  </React.StrictMode>
);
