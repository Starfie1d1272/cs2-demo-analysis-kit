import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { buildMatchWorkspaceModel, loadDemoPackageFromZip } from "@cs2dak/core";
import type { MatchWorkspaceModel } from "@cs2dak/contract";
import { MatchWorkspace } from "@cs2dak/react";
import "@cs2dak/react/theme.css";
import sampleZipUrl from "../../../fixtures/input/sample-match.zip?url";

function DemoLab() {
  const [model, setModel] = useState<MatchWorkspaceModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(sampleZipUrl);
        const pkg = await loadDemoPackageFromZip(await response.arrayBuffer());
        const nextModel = buildMatchWorkspaceModel(pkg);
        if (!cancelled) {
          setModel(nextModel);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <div className="dak-shell"><div className="dak-workspace dak-loading">Failed to load sample: {error}</div></div>;
  }

  if (!model) {
    return <div className="dak-shell"><div className="dak-workspace dak-loading">Loading strict v2 export...</div></div>;
  }

  return <MatchWorkspace model={model} />;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DemoLab />
  </React.StrictMode>
);
