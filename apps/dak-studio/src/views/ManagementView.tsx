import { useEffect, useMemo, useRef, useState } from "react";
import type { SeasonCohortBundle } from "@cs2dak/contract";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { getSeasonSummary, type IdentityOptions } from "../lib/season";
import {
  buildCohortIdentityMap,
  listAuditEntries,
  mergeIdentities,
  renamePlayer,
  setTeamRename,
  splitIdentity,
  teamRenameGroups,
  undoLastAction,
  type IdentityStoreState
} from "../lib/identity";
import type { StudioDemoEntry } from "../lib/library";

export interface ManagementViewProps {
  allEntries: StudioDemoEntry[];
  entries: StudioDemoEntry[];
  scope: CohortScopeState;
  onScopeChange: (scope: CohortScopeState) => void;
  identity: IdentityStoreState;
  onIdentityChange: (state: IdentityStoreState) => void;
  identityOptions?: IdentityOptions;
  onGoLibrary: () => void;
  teamRenames?: Record<string, string>;
}

type BundlePlayer = SeasonCohortBundle["players"][number];

interface AuditRow {
  id: string;
  timestamp: number;
  description: string;
}

export function ManagementView({
  allEntries,
  entries,
  scope,
  onScopeChange,
  identity,
  onIdentityChange,
  identityOptions,
  onGoLibrary,
  teamRenames = identity.teamRenames
}: ManagementViewProps) {
  const [bundle, setBundle] = useState<SeasonCohortBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeDisplayName, setMergeDisplayName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [teamInputs, setTeamInputs] = useState<Record<string, string>>({});
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [working, setWorking] = useState(false);
  const cancelRef = useRef(false);

  // 加载 bundle
  useEffect(() => {
    if (entries.length === 0) { setBundle(null); return; }
    let cancelled = false;
    cancelRef.current = false;
    setBundle(null);
    setError(null);
    setSelected(new Set());
    getSeasonSummary(entries, identityOptions)
      .then((s) => { if (!cancelled) setBundle(s.bundle); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [entries, identityOptions?.version]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 加载审计记录
  useEffect(() => {
    listAuditEntries().then((rows) =>
      setAuditRows(rows.map((r) => ({ id: r.id, timestamp: r.timestamp, description: r.description })))
    );
  }, [identity.version]);

  // 唯一队伍名
  const teamGroups = useMemo(
    () => teamRenameGroups(allEntries.map((entry) => ({ teamA: entry.meta.teamAName, teamB: entry.meta.teamBName })), teamRenames),
    [allEntries, teamRenames]
  );

  const selectedList = bundle?.players.filter((p) => selected.has(p.playerKey)) ?? [];
  const singleSelected: BundlePlayer | undefined = selectedList.length === 1 ? selectedList[0] : undefined;

  // 选中某个选手时，预填 merge 名和 rename 值
  useEffect(() => {
    if (selectedList.length >= 2) {
      setMergeDisplayName(selectedList[0]?.name ?? "");
    }
    if (selectedList.length === 1) {
      setRenameKey(selectedList[0].playerKey);
      setRenameValue(selectedList[0].name);
    } else {
      setRenameKey(null);
      setRenameValue("");
    }
  }, [selected.size]);  // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelect = (playerKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(playerKey)) next.delete(playerKey); else next.add(playerKey);
      return next;
    });
  };

  async function handleMerge() {
    if (selectedList.length < 2 || !mergeDisplayName.trim()) return;
    setWorking(true);
    try {
      const [primary, ...rest] = selectedList;
      const primarySteamId = primary.steamIds[0];
      const secondaryIds = rest.flatMap((p) => p.steamIds);
      const next = await mergeIdentities(identity, primarySteamId, secondaryIds, mergeDisplayName.trim());
      onIdentityChange(next);
      setSelected(new Set());
    } finally {
      setWorking(false);
    }
  }

  async function handleRename() {
    if (!renameKey || !renameValue.trim()) return;
    setWorking(true);
    try {
      const next = await renamePlayer(identity, renameKey, renameValue.trim());
      onIdentityChange(next);
    } finally {
      setWorking(false);
    }
  }

  async function handleSplit(playerKey: string, steamIds: string[]) {
    if (steamIds.length < 2) return;
    setWorking(true);
    try {
      // 拆出除第一个之外的所有账号（保留主 steamId 在原 mapping）
      const toSplit = steamIds.slice(1);
      const next = await splitIdentity(identity, playerKey, toSplit);
      onIdentityChange(next);
      setSelected(new Set());
    } finally {
      setWorking(false);
    }
  }

  async function handleTeamRename(originals: string[], currentDisplayName: string) {
    const displayName = teamInputs[currentDisplayName] ?? currentDisplayName;
    setWorking(true);
    try {
      let next = identity;
      for (const original of originals) {
        next = await setTeamRename(next, original, displayName === original ? "" : displayName);
      }
      onIdentityChange(next);
    } finally {
      setWorking(false);
    }
  }

  async function handleUndo() {
    setWorking(true);
    try {
      const prev = await undoLastAction(identity);
      if (!prev) return;
      onIdentityChange(prev);
    } finally {
      setWorking(false);
    }
  }

  if (allEntries.length === 0) {
    return (
      <div className="stu-view">
        <div className="stu-empty">
          <div className="stu-empty-mark">⌖</div>
          <h2>还没有选手数据</h2>
          <p>先导入几场 demo，才能管理选手身份。</p>
          <button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>管理</h1>
          <p className="stu-view-sub">选手身份归并 · 别名 · 队伍改名</p>
        </div>
      </header>
      <CohortScope entries={allEntries} scope={scope} onChange={onScopeChange} teamRenames={teamRenames} />
      <div className="stu-view-body stu-mgmt-layout">
        {/* ── 选手身份 ── */}
        <section className="stu-mgmt-players">
          <div className="stu-mgmt-section-head">
            <h2>选手身份</h2>
            {selected.size > 0 && (
              <button type="button" className="stu-mgmt-clear" onClick={() => setSelected(new Set())}>
                清除选择
              </button>
            )}
          </div>
          {error && <p className="stu-error">{error}</p>}
          {!bundle && !error && <p className="stu-loading-text">聚合中…</p>}
          {bundle && (
            <div className="stu-mgmt-player-list">
              {bundle.players.map((player) => (
                <label
                  key={player.playerKey}
                  className={`stu-mgmt-player-row${selected.has(player.playerKey) ? " stu-mgmt-player-row-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(player.playerKey)}
                    onChange={() => toggleSelect(player.playerKey)}
                  />
                  <span className="stu-mgmt-player-name">{player.name}</span>
                  <span className="stu-mgmt-player-meta">
                    {player.steamIds.length > 1 && (
                      <span className="stu-mgmt-multi-badge">{player.steamIds.length} 账号</span>
                    )}
                    <span>{player.mapCount} 场</span>
                  </span>
                </label>
              ))}
              {bundle.players.length === 0 && <p className="stu-muted">当前范围无选手数据</p>}
            </div>
          )}
        </section>

        {/* ── 操作面板 ── */}
        <aside className="stu-mgmt-actions">
          {/* 合并面板（2+ 选中） */}
          {selectedList.length >= 2 && (
            <div className="stu-mgmt-action-panel">
              <h3>合并 {selectedList.length} 名选手</h3>
              <p className="stu-muted">
                {selectedList.map((p) => p.name).join(" + ")}
              </p>
              <label className="stu-mgmt-label">
                显示名
                <input
                  type="text"
                  className="stu-input"
                  value={mergeDisplayName}
                  onChange={(e) => setMergeDisplayName(e.target.value)}
                  placeholder="合并后显示名"
                />
              </label>
              <button
                type="button"
                className="stu-button"
                disabled={working || !mergeDisplayName.trim()}
                onClick={handleMerge}
              >
                确认合并
              </button>
            </div>
          )}

          {/* 详情面板（单选） */}
          {singleSelected && (
            <div className="stu-mgmt-action-panel">
              <h3>{singleSelected.name}</h3>
              <p className="stu-muted">{singleSelected.playerKey}</p>

              {/* 重命名 */}
              <label className="stu-mgmt-label">
                显示名
                <div className="stu-mgmt-rename-row">
                  <input
                    type="text"
                    className="stu-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                  />
                  <button
                    type="button"
                    className="stu-button-sm"
                    disabled={working || !renameValue.trim() || renameValue === singleSelected.name}
                    onClick={handleRename}
                  >
                    保存
                  </button>
                </div>
              </label>

              {/* Steam 账号列表 */}
              <div className="stu-mgmt-steamids">
                <span className="stu-mgmt-label-text">Steam 账号</span>
                {singleSelected.steamIds.map((id) => (
                  <div key={id} className="stu-mgmt-steamid-row">
                    <code className="stu-mono">{id}</code>
                  </div>
                ))}
              </div>

              {/* 拆分（仅多账号） */}
              {singleSelected.steamIds.length > 1 && (
                <button
                  type="button"
                  className="stu-button-danger"
                  disabled={working}
                  onClick={() => handleSplit(singleSelected.playerKey, singleSelected.steamIds)}
                >
                  拆分所有账号（可撤销）
                </button>
              )}
            </div>
          )}

          {selected.size === 0 && (
            <p className="stu-muted">在左侧列表中勾选选手</p>
          )}
        </aside>
      </div>

      {/* ── 队伍改名 ── */}
      <section className="stu-mgmt-teams">
        <h2>队伍改名</h2>
        <table className="stu-table">
          <thead>
            <tr><th>原名</th><th>显示名</th><th /></tr>
          </thead>
          <tbody>
            {teamGroups.map((team) => {
              const current = team.displayName;
              const local = teamInputs[team.displayName] ?? current;
              const merged = team.originals.length > 1;
              return (
                <tr key={team.displayName}>
                  <td>
                    <div className="stu-mgmt-team-cell">
                      <strong>{team.displayName}</strong>
                      <span className="stu-muted">
                        {merged ? `已合并：${team.originals.join(" / ")}` : team.originals[0]}
                      </span>
                      <span className="stu-muted">{team.matchCount} 场相关比赛</span>
                    </div>
                  </td>
                  <td>
                    <input
                      type="text"
                      className="stu-input stu-input-sm"
                      value={local}
                      placeholder={team.displayName}
                      onChange={(e) =>
                        setTeamInputs((prev) => ({ ...prev, [team.displayName]: e.target.value }))
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="stu-button-sm"
                      disabled={working || local === current}
                      onClick={() => handleTeamRename(team.originals, team.displayName)}
                    >
                      更新
                    </button>
                    {merged && (
                      <button
                        type="button"
                        className="stu-button-sm stu-button-ghost"
                        disabled={working}
                        onClick={async () => {
                          setTeamInputs((prev) => ({ ...prev, [team.displayName]: "" }));
                          let next = identity;
                          for (const original of team.originals) {
                            next = await setTeamRename(next, original, "");
                          }
                          onIdentityChange(next);
                        }}
                      >
                        清除
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* ── 操作历史 ── */}
      <section className="stu-mgmt-audit">
        <div className="stu-mgmt-section-head">
          <h2>操作历史</h2>
          {auditRows.length > 0 && (
            <button type="button" className="stu-button-sm" disabled={working} onClick={handleUndo}>
              撤销最近一步
            </button>
          )}
        </div>
        {auditRows.length === 0 ? (
          <p className="stu-muted">暂无操作记录</p>
        ) : (
          <div className="stu-mgmt-audit-list">
            {auditRows.map((row) => (
              <div key={row.id} className="stu-mgmt-audit-row">
                <span className="stu-muted stu-mono">{formatTime(row.timestamp)}</span>
                <span>{row.description}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
