import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { analyzeDemoPackage, buildDemoViewModel, loadDemoPackageFromZip } from "@cs2dak/core";
import type { DemoViewModel } from "@cs2dak/contract";
import { DemoAnalysisDashboard } from "@cs2dak/react";
import "@cs2dak/react/theme.css";
import sampleZipUrl from "../../../fixtures/input/rivalhub-v1-de_mirage-2026-05-29.zip?url";

function DemoLab() {
  const [model, setModel] = useState<DemoViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(sampleZipUrl);
        const pkg = await loadDemoPackageFromZip(await response.arrayBuffer());
        const bundle = analyzeDemoPackage(pkg);
        const nextModel = buildDemoViewModel(bundle);
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
    return <div className="dak-shell"><div className="dak-workspace dak-loading">Loading RivalHub V1 export...</div></div>;
  }

  return <DemoAnalysisDashboard model={model} />;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DemoLab />
  </React.StrictMode>
);
