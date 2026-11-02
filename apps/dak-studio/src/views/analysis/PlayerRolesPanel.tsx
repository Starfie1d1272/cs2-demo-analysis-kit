import { getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation, assertAnalysisGeneration } from "../../lib/queries/query-cache";
import { CapabilityBar, useCapability } from "../../components/CapabilityBar";
import type { CapabilityRepairAction } from "../../lib/capability-availability";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { EmptyState, PlayerMapPoolPanel, PlayerMapRoleProfilePanel } from "@cs2dak/react";
import type { DeclaredRole, PlayerMapPoolRow, PlayerMapRoleProfile, WeaponDuty } from "@cs2dak/tactics";
import { getPlayerMapPool, getPlayerMapRoleProfiles } from "../../lib/queries/spatial-queries";
import { loadRoleDeclarations, removeRoleDeclaration, upsertRoleDeclaration, type RoleDeclarationsState } from "../../lib/role-declarations";
import { matchIdForEntry, type StudioDemoEntry } from "../../lib/demo-entry";
import type { IdentityOptions } from "../../lib/identity";
import type { OpenEvidence } from "../../lib/evidence-continuation";
import type { PlayerRolesState } from "../../lib/studio-page-state";

export function PlayerRolesPanel({ onCapabilityRepair, entries, playerKey, playerLabel, selectedTeam, identityOptions, onOpenEvidence, state, onStateChange, onPageReady }: {
  onCapabilityRepair: (action: CapabilityRepairAction) => void; entries: StudioDemoEntry[]; playerKey: string; playerLabel: string; selectedTeam: string | null;
  identityOptions?: IdentityOptions; onOpenEvidence: OpenEvidence; state: PlayerRolesState;
  onStateChange: (state: PlayerRolesState) => void; onPageReady?: (keys: string[]) => void;
}) {
  const capability = useCapability(entries, "map-role");
  const roleEntries = capability.eligible;
  const [roleSnapshot, setRoleSnapshot] = useState<{ key: string; generation: number; value: PlayerMapRoleProfile[] } | null>(null);
  const analysis = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  const [mapPool, setMapPool] = useState<PlayerMapPoolRow[]>([]);
  const [mapPoolReady, setMapPoolReady] = useState(false);
  const [unsupportedMaps, setUnsupportedMaps] = useState<string[]>([]);
  const [mapPoolError, setMapPoolError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleDeclarations, setRoleDeclarations] = useState<RoleDeclarationsState | null>(null);
  const roleKey = JSON.stringify([roleEntries?.map(entry => entry.id), playerKey, selectedTeam, identityOptions?.version, roleDeclarations]);
  const roleProfiles = roleSnapshot?.key === roleKey ? roleSnapshot.value : null;
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [declaredRole, setDeclaredRole] = useState<DeclaredRole>("awper");
  const [declaredSecondaryRole, setDeclaredSecondaryRole] = useState<DeclaredRole | "">("");
  const [declaredWeaponDuty, setDeclaredWeaponDuty] = useState<WeaponDuty | "">("");
  const [roleFormError, setRoleFormError] = useState<string | null>(null);
  const roleDialogRef = useRef<HTMLDivElement>(null);
  const entryByMatchId = useMemo(() => new Map(entries.map(entry => [matchIdForEntry(entry), entry])), [entries]);

  useEffect(() => {
    let cancelled = false;
    void loadRoleDeclarations().then(value => { if (!cancelled) setRoleDeclarations(value); })
      .catch(reason => { if (!cancelled) setRoleError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!roleEditorOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setRoleEditorOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    roleDialogRef.current?.querySelector<HTMLElement>("select, input, button")?.focus();
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [roleEditorOpen]);
  useEffect(() => {
    if (!roleDeclarations || !roleEntries) return;
    if (!roleEntries.length) { setRoleSnapshot({ key: roleKey, generation: analysis.generation, value: [] }); return; }
    if (analysis.status !== "ready") return;
    let cancelled = false;
    setRoleError(null);
    void getPlayerMapRoleProfiles(roleEntries, roleDeclarations.declarations.map(row => row.declaration), identityOptions, selectedTeam ? [selectedTeam] : [])
      .then(value => { if (!cancelled) { assertAnalysisGeneration(analysis.generation); setRoleSnapshot({ key: roleKey, generation: analysis.generation, value }); } })
      .catch(reason => { if (!cancelled) setRoleError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [roleEntries, playerKey, roleDeclarations, identityOptions?.version, selectedTeam, roleKey, analysis]);
  useEffect(() => {
    if (entries.length === 0 || (!roleProfiles && !roleError)) { setMapPool([]); setMapPoolReady(false); return; }
    let cancelled = false;
    setMapPoolReady(false); setMapPoolError(null);
    const profile = roleProfiles?.find(item => item.playerKey === playerKey && (selectedTeam == null || item.teamKey === selectedTeam)) ?? null;
    void getPlayerMapPool(entries, playerKey, profile, identityOptions)
      .then(result => { if (!cancelled) { setMapPool(result.rows); setUnsupportedMaps(result.unsupportedMapNames); setMapPoolReady(true); } })
      .catch(reason => { if (!cancelled) { setMapPool([]); setUnsupportedMaps([]); setMapPoolError(reason instanceof Error ? reason.message : String(reason)); setMapPoolReady(true); } });
    return () => { cancelled = true; };
  }, [entries, playerKey, selectedTeam, roleProfiles, roleError, identityOptions?.version]);
  useEffect(() => {
    if (!onPageReady || (entries.length > 0 && ((!roleProfiles && !roleError) || (!mapPoolReady && !mapPoolError)))) return;
    onPageReady(Array.from(document.querySelectorAll<HTMLElement>("[id]"), node => node.id));
  }, [onPageReady, entries.length, roleProfiles, roleError, mapPoolReady, mapPoolError]);
  if (!entries.length) return <div className="stu-view"><EmptyState variant="insufficient" title="聚合范围为空" hint="请调整分析范围。" /></div>;
  const selectedRoleProfile = roleProfiles?.find((profile) => profile.playerKey === playerKey && (selectedTeam == null || profile.teamKey === selectedTeam)) ?? null;
  const declarationTeam = selectedTeam ?? selectedRoleProfile?.teamKey ?? null;
  const selectedDeclarations = roleDeclarations?.declarations.filter((row) => row.declaration.source === "user" && row.declaration.playerKey === playerKey && (declarationTeam == null || row.declaration.teamKey === declarationTeam)) ?? [];

  function openRoleEditor() {
    setDeclaredRole("awper"); setDeclaredSecondaryRole(""); setDeclaredWeaponDuty("");
    setRoleFormError(null); setRoleEditorOpen(true);
  }

  async function saveRoleDeclaration() {
    if (!roleDeclarations) return;
    const scope = {
      playerKey: playerKey, source: "user" as const, provenance: "Studio 用户声明",
      ...(declarationTeam ? { teamKey: declarationTeam } : {}),
    };
    try {
      let next = roleDeclarations;
      const ordinaryUserDeclarations = next.declarations.filter((row) => row.declaration.playerKey === playerKey
        && row.declaration.source === "user"
        && (row.declaration.teamKey ?? null) === declarationTeam
        && row.declaration.mapName == null && row.declaration.validFrom == null && row.declaration.validTo == null);
      for (const row of ordinaryUserDeclarations) next = await removeRoleDeclaration(next, row.id);
      next = await upsertRoleDeclaration(next, { ...scope, kind: "main_role", role: declaredRole, priority: "primary" });
      if (declaredSecondaryRole) next = await upsertRoleDeclaration(next, { ...scope, kind: "main_role", role: declaredSecondaryRole, priority: "secondary" });
      if (declaredWeaponDuty) next = await upsertRoleDeclaration(next, { ...scope, kind: "weapon_duty", weaponDuty: declaredWeaponDuty });
      setRoleDeclarations(next); setRoleEditorOpen(false);
    } catch (reason) {
      setRoleFormError(reason instanceof Error ? reason.message : "保存声明失败，请检查字段后重试。");
    }
  }

  const rolePanels = <>
            <div className="stu-card stu-card-wide" id="players:map-roles">
                {capability.availability && <CapabilityBar availability={capability.availability} onRepair={onCapabilityRepair} />}
              <div className="stu-card-head"><h3>地图 / 位置</h3><button type="button" className="stu-button-sm" disabled={!roleDeclarations} onClick={openRoleEditor}>编辑声明</button></div>
              {roleProfiles && (roleError || analysis.status !== "ready" || roleSnapshot?.generation !== analysis.generation) && <p className="stu-muted" role="status">{roleError || analysis.status === "error" ? "更新失败，显示旧版本结果。" : "正在更新，显示旧版本结果。"}</p>}
              {roleError && !roleProfiles ? <EmptyState variant="error" title="地图角色不可用" hint={roleError} /> : !roleProfiles ? <div className="stu-loading">读取地图位置事实…</div> : <PlayerMapRoleProfilePanel state={state.tables.roles ?? { sort: { key: "sample", direction: "desc" }, page: 0 }} onStateChange={table => onStateChange({ ...state, tables: { ...state.tables, roles: table } })} profile={selectedRoleProfile} onOpenEvidence={(evidence) => {
                const entry = entryByMatchId.get(evidence.matchId);
                if (entry) onOpenEvidence({ entryId: entry.id, evidence, sourceKey: "players:map-roles" });
              }} />}
            </div>
            <div className="stu-card stu-card-wide" id="players:map-pool"><h3>完整个人地图池</h3>{mapPoolError && <p role="alert">地图池不可用：{mapPoolError}</p>}{unsupportedMaps.length > 0 && <p>未支持的地图：{unsupportedMaps.join("、")}</p>}{!mapPoolReady && !mapPoolError ? <div className="stu-loading">读取个人地图池…</div> : <PlayerMapPoolPanel state={state.tables.mapPool ?? { sort: { key: "record", direction: "desc" }, page: 0 }} onStateChange={table => onStateChange({ ...state, tables: { ...state.tables, mapPool: table } })} rows={mapPool} onOpenEvidence={(evidence) => { const entry = entries.find((row) => matchIdForEntry(row) === evidence.matchId); if (entry) onOpenEvidence({ entryId: entry.id, evidence, sourceKey: "players:map-pool" }); }} />}</div>
          {roleEditorOpen && (
            <div className="stu-modal-backdrop" role="dialog" aria-modal="true" aria-label="编辑角色声明" onClick={() => setRoleEditorOpen(false)}>
              <div className="stu-dialog stu-dialog-form" ref={roleDialogRef} onClick={(event) => event.stopPropagation()}>
                <header className="stu-modal-head"><h3>角色声明 · {playerLabel}</h3><button type="button" className="stu-modal-close" onClick={() => setRoleEditorOpen(false)} aria-label="关闭">✕</button></header>
                <div className="stu-modal-body"><p className="stu-muted">只声明当前队伍下的通常职责；副角色和武器职责都可留空。地图与日期由可信赛事/阵容元数据管理。</p>
                  <div className="stu-form-grid">
                    <label className="stu-form-field"><span className="stu-form-label">主角色</span><select className="stu-form-control" value={declaredRole} onChange={(event) => { const role = event.target.value as DeclaredRole; setDeclaredRole(role); if (declaredSecondaryRole === role) setDeclaredSecondaryRole(""); }}>{(["igl", "awper", "anchor", "opener", "closer"] as const).map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
                    <label className="stu-form-field"><span className="stu-form-label">副角色（可选）</span><select className="stu-form-control" value={declaredSecondaryRole} onChange={(event) => setDeclaredSecondaryRole(event.target.value as DeclaredRole | "")}><option value="">不声明</option>{(["igl", "awper", "anchor", "opener", "closer"] as const).filter((role) => role !== declaredRole).map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
                    <label className="stu-form-field"><span className="stu-form-label">武器职责（可选）</span><select className="stu-form-control" value={declaredWeaponDuty} onChange={(event) => setDeclaredWeaponDuty(event.target.value as WeaponDuty | "")}><option value="">不声明</option>{(["primary_awper", "secondary_awper", "situational_awper", "rifler"] as const).map((duty) => <option key={duty} value={duty}>{duty}</option>)}</select></label>
                  </div>
                  {roleFormError && <p className="stu-form-error" role="alert">{roleFormError}</p>}
                  {selectedDeclarations.length > 0 && <section className="stu-declaration-list"><h4>已有声明</h4>{selectedDeclarations.map((row) => <div key={row.id} className="stu-declaration-row"><span>{row.declaration.kind === "main_role" ? `${row.declaration.priority} · ${row.declaration.role}` : row.declaration.weaponDuty}{row.declaration.mapName ? ` · ${row.declaration.mapName.replace("de_", "")}` : ""}</span><button type="button" className="stu-button-sm" onClick={() => void removeRoleDeclaration(roleDeclarations!, row.id).then(setRoleDeclarations).catch(reason => setRoleFormError(reason instanceof Error ? reason.message : String(reason)))}>清除</button></div>)}</section>}
                </div>
                <footer className="stu-modal-foot"><span className="stu-muted">声明不会写入 facts 或自动证据缓存。</span><div className="stu-modal-actions"><button type="button" className="stu-button" onClick={() => setRoleEditorOpen(false)}>取消</button><button type="button" className="stu-button stu-button-primary" onClick={() => void saveRoleDeclaration()}>保存声明</button></div></footer>
              </div>
            </div>
          )}
  </>;
  return <div className="stu-view"><header className="stu-view-header"><h1>位置与职责 · {playerLabel}</h1></header>{rolePanels}</div>;
}
