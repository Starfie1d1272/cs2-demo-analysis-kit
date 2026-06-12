import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MapAnnotator } from "./MapAnnotator";
import { loadDemoPackageFromZip } from "@cs2dak/core";
import { buildSeasonCohort } from "@cs2dak/cohort";
import { buildMatchWorkspaceModel, buildSeasonLeaderboardModel } from "@cs2dak/presentation";
import type { MatchWorkspaceModel, SeasonLeaderboardModel } from "@cs2dak/contract";
import { MatchWorkspace, SeasonLeaderboard } from "@cs2dak/react";
import "@cs2dak/react/theme.css";
import sampleZipUrl from "../../../fixtures/input/sample-match.zip?url";

// 排行榜预览用 cohort fixtures（多场）构建，验收列/格式/排序。
const cohortZipUrls = import.meta.glob("../../../fixtures/input/cohort/*.zip", {
  query: "?url",
  import: "default",
  eager: true
}) as Record<string, string>;

type Mode = "match" | "leaderboard" | "annotator";

function MatchView() {
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
          fontFamily: "inherit"
        }}
      >
        加载 ZIP
        <input type="file" accept=".zip" onChange={onPick} hidden />
      </label>
      {error ? (
        <div className="dak-shell">
          <div className="dak-workspace dak-loading">加载失败：{error}（可拖入 v3 ZIP 重试）</div>
        </div>
      ) : loading || !model ? (
        <div className="dak-shell">
          <div className="dak-workspace dak-loading">加载 v3 导出中…</div>
        </div>
      ) : (
        <MatchWorkspace model={model} />
      )}
    </div>
  );
}

function LeaderboardView() {
  const [model, setModel] = useState<SeasonLeaderboardModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const entries = Object.entries(cohortZipUrls).sort(([a], [b]) => a.localeCompare(b));
        const demos = await Promise.all(
          entries.map(async ([path, url]) => {
            const buffer = await (await fetch(url)).arrayBuffer();
            const matchId = path.split("/").pop()!.replace(/\.zip$/, "");
            return { matchId, pkg: await loadDemoPackageFromZip(buffer) };
          })
        );
        const bundle = buildSeasonCohort(demos);
        if (!cancelled) setModel(buildSeasonLeaderboardModel(bundle));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="dak-shell">
        <div className="dak-workspace dak-loading">排行榜构建失败：{error}</div>
      </div>
    );
  }
  if (!model) {
    return (
      <div className="dak-shell">
        <div className="dak-workspace dak-loading">构建赛季 cohort 中…</div>
      </div>
    );
  }
  return (
    <div className="dak-shell">
      <div className="dak-workspace">
        <SeasonLeaderboard model={model} onPlayerClick={(playerKey) => console.log("player:", playerKey)} />
      </div>
    </div>
  );
}

function DemoLab() {
  const [mode, setMode] = useState<Mode>("match");
  return (
    <div>
      <div className="dak-tabs" style={{ position: "fixed", top: 10, left: 10, zIndex: 50, margin: 0 }}>
        <button type="button" className={mode === "match" ? "dak-tab dak-tab-active" : "dak-tab"} onClick={() => setMode("match")}>
          比赛
        </button>
        <button type="button" className={mode === "leaderboard" ? "dak-tab dak-tab-active" : "dak-tab"} onClick={() => setMode("leaderboard")}>
          排行榜
        </button>
        <button type="button" className={mode === "annotator" ? "dak-tab dak-tab-active" : "dak-tab"} onClick={() => setMode("annotator")}>
          🗺 标注
        </button>
      </div>
      {mode === "annotator" ? (
        <div style={{ paddingTop: 44 }}>
          <MapAnnotator />
        </div>
      ) : mode === "match" ? (
        <MatchView />
      ) : (
        <LeaderboardView />
      )}
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DemoLab />
  </React.StrictMode>
);
