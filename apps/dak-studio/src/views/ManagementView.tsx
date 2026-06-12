import { useEffect, useMemo, useRef, useState } from "react";
import type { SeasonCohortBundle } from "@cs2dak/contract";
import { CohortScope, type CohortScopeState } from "../components/CohortScope";
import { EmptyState } from "../components/primitives";
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
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [teamMergeName, setTeamMergeName] = useState("");
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

  const selectedTeamGroups = teamGroups.filter((t) => selectedTeams.has(t.displayName));

  // 选中 2+ 支队伍时预填合并名
  useEffect(() => {
    if (selectedTeamGroups.length >= 2) {
      setTeamMergeName(selectedTeamGroups[0]?.displayName ?? "");
    }
  }, [selectedTeams.size]);  // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelectTeam = (displayName: string) => {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(displayName)) next.delete(displayName); else next.add(displayName);
      return next;
    });
  };

  /** 队伍合并：所有选中组的全部原名映射到同一显示名（与选手合并同语义，可撤销）。 */
  async function handleTeamMerge() {
    if (selectedTeamGroups.length < 2 || !teamMergeName.trim()) return;
    const displayName = teamMergeName.trim();
    setWorking(true);
    try {
      let next = identity;
      for (const team of selectedTeamGroups) {
        for (const original of team.originals) {
          next = await setTeamRename(next, original, displayName === original ? "" : displayName);
        }
      }
      onIdentityChange(next);
      setSelectedTeams(new Set());
    } finally {
      setWorking(false);
    }
  }

  /** 拆分合并的队伍：清掉所有原名映射，恢复各自原名显示。 */
  async function handleTeamSplit(originals: string[], displayName: string) {
    setWorking(true);
    try {
      setTeamInputs((prev) => ({ ...prev, [displayName]: "" }));
      let next = identity;
      for (const original of originals) {
        next = await setTeamRename(next, original, "");
      }
      onIdentityChange(next);
      setSelectedTeams(new Set());
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
        <EmptyState
          mark
          title="还没有选手数据"
          hint="先导入几场 demo，才能管理选手身份。"
          action={<button type="button" className="stu-button" onClick={onGoLibrary}>去资料库</button>}
        />
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

      {/* ── 队伍身份：与选手相同的"勾选 → 合并/改名"交互 ── */}
      <section className="stu-mgmt-teams">
        <div className="stu-mgmt-section-head">
          <h2>队伍身份</h2>
          {selectedTeams.size > 0 && (
            <button type="button" className="stu-mgmt-clear" onClick={() => setSelectedTeams(new Set())}>
              清除选择
            </button>
          )}
        </div>
        <div className="stu-view-body stu-mgmt-layout">
          <div className="stu-mgmt-player-list">
            {teamGroups.map((team) => {
              const merged = team.originals.length > 1;
              return (
                <label
                  key={team.displayName}
                  className={`stu-mgmt-player-row${selectedTeams.has(team.displayName) ? " stu-mgmt-player-row-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTeams.has(team.displayName)}
                    onChange={() => toggleSelectTeam(team.displayName)}
                  />
                  <span className="stu-mgmt-player-name">{team.displayName}</span>
                  <span className="stu-mgmt-player-meta">
                    {merged && <span className="stu-mgmt-multi-badge">{team.originals.length} 原名</span>}
                    <span>{team.matchCount} 场</span>
                  </span>
                </label>
              );
            })}
            {teamGroups.length === 0 && <p className="stu-muted">当前范围无队伍数据</p>}
          </div>
          <aside className="stu-mgmt-actions">
            {selectedTeamGroups.length >= 2 && (
              <div className="stu-mgmt-action-panel">
                <h3>合并 {selectedTeamGroups.length} 支队伍</h3>
                <p className="stu-muted">{selectedTeamGroups.map((t) => t.displayName).join(" + ")}</p>
                <label className="stu-mgmt-label">
                  显示名
                  <input
                    type="text"
                    className="stu-input"
                    value={teamMergeName}
                    onChange={(e) => setTeamMergeName(e.target.value)}
                    placeholder="合并后显示名"
                  />
                </label>
                <button
                  type="button"
                  className="stu-button"
                  disabled={working || !teamMergeName.trim()}
                  onClick={handleTeamMerge}
                >
                  确认合并
                </button>
              </div>
            )}
            {selectedTeamGroups.length === 1 && (() => {
              const team = selectedTeamGroups[0];
              const local = teamInputs[team.displayName] ?? team.displayName;
              const merged = team.originals.length > 1;
              return (
                <div className="stu-mgmt-action-panel">
                  <h3>{team.displayName}</h3>
                  <p className="stu-muted">
                    {merged ? `已合并：${team.originals.join(" / ")}` : team.originals[0]} · {team.matchCount} 场
                  </p>
                  <label className="stu-mgmt-label">
                    显示名
                    <div className="stu-mgmt-rename-row">
                      <input
                        type="text"
                        className="stu-input"
                        value={local}
                        placeholder={team.displayName}
                        onChange={(e) =>
                          setTeamInputs((prev) => ({ ...prev, [team.displayName]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="stu-button-sm"
                        disabled={working || local === team.displayName || !local.trim()}
                        onClick={() => handleTeamRename(team.originals, team.displayName)}
                      >
                        保存
                      </button>
                    </div>
                  </label>
                  {merged && (
                    <button
                      type="button"
                      className="stu-button-danger"
                      disabled={working}
                      onClick={() => handleTeamSplit(team.originals, team.displayName)}
                    >
                      拆分回原名（可撤销）
                    </button>
                  )}
                </div>
              );
            })()}
            {selectedTeams.size === 0 && <p className="stu-muted">勾选队伍可改名；勾选多支可合并（同队改名导致的分裂用合并修复）</p>}
          </aside>
        </div>
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
