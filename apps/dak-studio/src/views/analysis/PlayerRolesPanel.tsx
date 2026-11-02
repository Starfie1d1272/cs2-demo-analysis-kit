import { canExportSnapshot, withCapabilityConditions, unionExportEntries, withAnalysisExportEntries } from "../../lib/analysis-export";
import { getAnalysisDataSnapshot, subscribeAnalysisDataInvalidation, assertAnalysisGeneration } from "../../lib/queries/query-cache";
import { CapabilityBar, useCapability } from "../../components/CapabilityBar";
import type { CapabilityRepairAction } from "../../lib/capability-availability";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnalysisExportButtons } from "../../components/AnalysisExportButtons";
import { buildPlayerRolesAnalysisResult } from "../../lib/analysis-export-roles";
import type { AnalysisExportSource } from "../../lib/analysis-export";
import { EmptyState, PlayerMapPoolPanel, PlayerMapRoleProfilePanel } from "@cs2dak/react";
import type { DeclaredRole, PlayerMapPoolRow, PlayerMapRoleProfile, WeaponDuty } from "@cs2dak/tactics";
import { getPlayerMapPool, getPlayerMapRoleProfiles, type RoleTeamGroup } from "../../lib/queries/spatial-queries";
import { loadRoleDeclarations, removeRoleDeclaration, replaceOrdinaryUserRoleDeclarations } from "../../lib/identity-commands";
import type { RoleDeclarationsState } from "../../lib/role-declarations";
import { matchIdForEntry, type StudioDemoEntry } from "../../lib/demo-entry";
import type { IdentityOptions } from "../../lib/identity";
import type { OpenEvidence } from "../../lib/evidence-continuation";
import type { PlayerRolesState } from "../../lib/studio-page-state";

const DUTY_LABEL: Record<WeaponDuty, string> = { primary_awper: "主 AWP", secondary_awper: "副 AWP", situational_awper: "情境 AWP", rifler: "步枪" };

export function PlayerRolesPanel({ exportSource, onCapabilityRepair, entries, playerKey, playerLabel, selectedTeam, identityOptions, onOpenEvidence, state, onStateChange, onPageReady }: {
  exportSource?: AnalysisExportSource | null;
  onCapabilityRepair: (action: CapabilityRepairAction) => void; entries: StudioDemoEntry[]; playerKey: string; playerLabel: string; selectedTeam: string | null;
  identityOptions?: IdentityOptions; onOpenEvidence: OpenEvidence; state: PlayerRolesState;
  onStateChange: (state: PlayerRolesState) => void; onPageReady?: (keys: string[]) => void;
}) {
  const capability = useCapability(entries, "map-role");
  const roleEntries = capability.eligible;
  const playerScope = useMemo(() => ({
    playerKeys: [playerKey],
    steamIds: [...new Set([...(playerKey.startsWith("steam:") ? [playerKey.slice(6)] : []), ...Object.entries(identityOptions?.map ?? {}).filter(([, mapped]) => (typeof mapped === "string" ? mapped : mapped.playerKey) === playerKey).map(([steamId]) => steamId)])],
  }), [playerKey, identityOptions?.map]);
  const poolCapability = useCapability(entries, "player-map-pool", playerScope);
  const poolEntries = poolCapability.eligible;
  const [roleSnapshot, setRoleSnapshot] = useState<{ key: string; generation: number; value: Array<PlayerMapRoleProfile & { teamGroup: RoleTeamGroup }> } | null>(null);
  const analysis = useSyncExternalStore(subscribeAnalysisDataInvalidation, getAnalysisDataSnapshot);
  const [poolSnapshot, setPoolSnapshot] = useState<{ key: string; generation: number; rows: PlayerMapPoolRow[]; unsupported: string[] } | null>(null);
  const [mapPoolReady, setMapPoolReady] = useState(false);

  const [mapPoolError, setMapPoolError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleDeclarations, setRoleDeclarations] = useState<RoleDeclarationsState | null>(null);
  const [declarationsError, setDeclarationsError] = useState<string | null>(null);
  const [declarationsRetry, setDeclarationsRetry] = useState(0);
  const [declarationsSaving, setDeclarationsSaving] = useState(false);
  const declarationsSavingRef = useRef(false);
  const roleKey = JSON.stringify([roleEntries?.map(entry => entry.id), playerKey, selectedTeam, identityOptions?.version, roleDeclarations]);
  const roleProfiles = roleSnapshot?.key === roleKey ? roleSnapshot.value : null;
  const playerProfiles = roleProfiles?.filter(profile => profile.playerKey === playerKey) ?? [];
  const [profileTeam, setProfileTeam] = useState<string | null>(null);
  const selectedRoleProfile = playerProfiles.find(profile => profile.teamKey === profileTeam) ?? playerProfiles[0] ?? null;
  // A pool refreshed after a role failure must not incorporate an older role snapshot.
  const poolRoleProfile = !roleError && !capability.error && !capability.stale && canExportSnapshot(roleSnapshot, analysis) ? selectedRoleProfile : null;
  const poolKey = JSON.stringify([poolEntries?.map(entry => entry.id), playerKey, selectedTeam, identityOptions?.version, poolRoleProfile]);
  const pool = poolSnapshot?.key === poolKey ? poolSnapshot : null;
  const mapPool = pool?.rows ?? [];
  const unsupportedMaps = pool?.unsupported ?? [];
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [declaredRole, setDeclaredRole] = useState<DeclaredRole | "">("awper");
  const [declaredSecondaryRole, setDeclaredSecondaryRole] = useState<DeclaredRole | "">("");
  const [declaredWeaponDuty, setDeclaredWeaponDuty] = useState<WeaponDuty | "">("");
  const [scopeIndex, setScopeIndex] = useState(0);
  const [roleFormError, setRoleFormError] = useState<string | null>(null);
  const roleDialogRef = useRef<HTMLDivElement>(null);
  const entryByMatchId = useMemo(() => new Map(entries.map(entry => [matchIdForEntry(entry), entry])), [entries]);

  useEffect(() => {
    let cancelled = false;
    setRoleDeclarations(null);
    setDeclarationsError(null);
    void loadRoleDeclarations().then(value => { if (!cancelled) setRoleDeclarations(value); })
      .catch(reason => { if (!cancelled) setDeclarationsError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [declarationsRetry]);
  useEffect(() => {
    if (!roleEditorOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !declarationsSavingRef.current) setRoleEditorOpen(false); };
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
    if (!poolEntries) return;
    if (!poolEntries.length) { setPoolSnapshot({ key: poolKey, generation: analysis.generation, rows: [], unsupported: [] }); setMapPoolReady(true); return; }
    if (analysis.status !== "ready") return;
    let cancelled = false;
    setMapPoolReady(false); setMapPoolError(null);
    void getPlayerMapPool(poolEntries, playerKey, poolRoleProfile, identityOptions)
      .then(result => { if (!cancelled) { assertAnalysisGeneration(analysis.generation); setPoolSnapshot({ key: poolKey, generation: analysis.generation, rows: result.rows, unsupported: result.unsupportedMapNames }); setMapPoolReady(true); } })
      .catch(reason => { if (!cancelled) { setMapPoolError(reason instanceof Error ? reason.message : String(reason)); setMapPoolReady(true); } });
    return () => { cancelled = true; };
  }, [poolEntries, playerKey, selectedTeam, poolRoleProfile, identityOptions?.version, poolKey, analysis]);
  useEffect(() => {
    if (!onPageReady || (entries.length > 0 && ((!roleProfiles && !roleError && !capability.error && !declarationsError) || (!mapPoolReady && !mapPoolError && !poolCapability.error)))) return;
    onPageReady(Array.from(document.querySelectorAll<HTMLElement>("[id]"), node => node.id));
  }, [onPageReady, entries.length, roleProfiles, roleError, capability.error, declarationsError, mapPoolReady, mapPoolError, poolCapability.error]);
  const scopeOptions = selectedRoleProfile?.teamGroup.scopes ?? [];
  const selectedScope = scopeOptions[scopeIndex] ?? scopeOptions[0];
  const declarationTeam = selectedScope?.teamKey ?? null;
  const declarationScope = selectedScope?.teamScope;
  const scopeMatches = (declaration: import("@cs2dak/tactics").RoleDeclaration) => {
    const scope = declaration.teamScope;
    return (declaration.teamKey ?? null) === declarationTeam && (scope == null && declarationScope == null
      || scope?.kind === "entity" && declarationScope?.kind === "entity" && scope.key === declarationScope.key
      || scope?.kind === "observation" && declarationScope?.kind === "observation" && scope.matchId === declarationScope.matchId && scope.slot === declarationScope.slot);
  };
  const selectedDeclarations = roleDeclarations?.declarations.filter(row => row.declaration.source === "user" && row.declaration.playerKey === playerKey && scopeMatches(row.declaration)) ?? [];
  const ambiguousDeclarations = roleDeclarations?.declarations.filter(row => row.declaration.source === "user" && row.declaration.playerKey === playerKey && !row.declaration.teamScope && row.declaration.teamKey != null && selectedRoleProfile?.teamGroup.ambiguousNames.includes(row.declaration.teamKey)) ?? [];

  const editorOwner = JSON.stringify([playerKey, selectedRoleProfile?.teamKey, declarationTeam, declarationScope]);
  const editorOwnerRef = useRef(editorOwner);
  editorOwnerRef.current = editorOwner;
  useLayoutEffect(() => {
    if (!roleEditorOpen) return;
    const ordinary = selectedDeclarations.filter(({ declaration }) => declaration.mapName == null && declaration.validFrom == null && declaration.validTo == null);
    const main = ordinary.find(({ declaration }) => declaration.kind === "main_role" && declaration.priority === "primary")?.declaration;
    const secondary = ordinary.find(({ declaration }) => declaration.kind === "main_role" && declaration.priority === "secondary")?.declaration;
    const weapon = ordinary.find(({ declaration }) => declaration.kind === "weapon_duty")?.declaration;
    setDeclaredRole(main?.kind === "main_role" ? main.role : ordinary.length ? "" : "awper");
    setDeclaredSecondaryRole(secondary?.kind === "main_role" ? secondary.role : "");
    setDeclaredWeaponDuty(weapon?.kind === "weapon_duty" ? weapon.weaponDuty : "");
    setRoleFormError(null);
  }, [roleEditorOpen, editorOwner]);

  if (!entries.length) return <div className="stu-view"><EmptyState variant="insufficient" title="聚合范围为空" hint="请调整分析范围。" /></div>;

  async function openRoleEditor() {
    if (declarationsSavingRef.current) return;
    const openingOwner = editorOwner;
    declarationsSavingRef.current = true;
    setDeclarationsSaving(true);
    setDeclarationsError(null);
    try {
      const current = await loadRoleDeclarations();
      if (editorOwnerRef.current !== openingOwner) return;
      setRoleDeclarations(current);
      setScopeIndex(0); setRoleFormError(null); setRoleEditorOpen(true);
    } catch (reason) {
      if (editorOwnerRef.current === openingOwner) setDeclarationsError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      declarationsSavingRef.current = false;
      setDeclarationsSaving(false);
    }
  }

  async function saveRoleDeclaration() {
    if (!roleDeclarations || !declaredRole || declarationsSavingRef.current) return;
    const savingOwner = editorOwner;
    declarationsSavingRef.current = true;
    setDeclarationsSaving(true);
    setRoleFormError(null);
    const scope = {
      playerKey, source: "user" as const, provenance: "Studio 用户声明",
      ...(declarationTeam ? { teamKey: declarationTeam } : {}),
      ...(declarationScope ? { teamScope: declarationScope } : {}),
    };
    try {
      const declarations: import("@cs2dak/tactics").RoleDeclaration[] = [
        { ...scope, kind: "main_role", role: declaredRole, priority: "primary" },
        ...(declaredSecondaryRole ? [{ ...scope, kind: "main_role" as const, role: declaredSecondaryRole, priority: "secondary" as const }] : []),
        ...(declaredWeaponDuty ? [{ ...scope, kind: "weapon_duty" as const, weaponDuty: declaredWeaponDuty }] : []),
      ];
      const next = await replaceOrdinaryUserRoleDeclarations(playerKey, declarationTeam, declarations, roleDeclarations, declarationScope);
      setRoleDeclarations(next);
      if (editorOwnerRef.current === savingOwner) setRoleEditorOpen(false);
    } catch (reason) {
      if (editorOwnerRef.current === savingOwner) setRoleFormError(reason instanceof Error ? reason.message : "保存声明失败，请重试。");
    } finally {
      declarationsSavingRef.current = false;
      setDeclarationsSaving(false);
    }
  }

  async function clearRoleDeclaration(id: string) {
    if (!roleDeclarations || declarationsSavingRef.current) return;
    declarationsSavingRef.current = true;
    setDeclarationsSaving(true);
    setRoleFormError(null);
    try {
      setRoleDeclarations(await removeRoleDeclaration(roleDeclarations, id));
    } catch (reason) {
      setRoleFormError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      declarationsSavingRef.current = false;
      setDeclarationsSaving(false);
    }
  }

  const rolePanels = <>
            <div className="stu-card stu-card-wide" id="players:map-roles">
                {capability.availability && <CapabilityBar availability={capability.availability} onRepair={onCapabilityRepair} />}
              {capability.error && <p role="alert">地图位置能力读取失败：{capability.error} <button type="button" className="stu-button-sm" onClick={capability.retry}>重试</button>{capability.availability && " · 显示旧版本"}</p>}
              <div className="stu-card-head"><h3>地图 / 位置</h3>{playerProfiles.length > 1 && <select className="stu-form-control" disabled={declarationsSaving || roleEditorOpen} style={{ width: "auto", maxWidth: "18rem" }} aria-label="选择队伍画像" value={selectedRoleProfile?.teamKey ?? ""} onChange={event => { setProfileTeam(event.target.value); setScopeIndex(0); }}>{playerProfiles.map(profile => <option key={profile.teamKey} value={profile.teamKey}>{profile.teamGroup.label}</option>)}</select>}<button type="button" className="stu-button-sm" disabled={!roleDeclarations || !selectedRoleProfile || declarationsSaving} onClick={() => void openRoleEditor()}>编辑声明</button></div>
              {declarationsError && <p role="alert">角色声明读取失败：{declarationsError} <button type="button" className="stu-button-sm" onClick={() => setDeclarationsRetry(value => value + 1)}>重试</button></p>}
              {roleProfiles && (roleError || analysis.status !== "ready" || roleSnapshot?.generation !== analysis.generation) && <p className="stu-muted" role="status">{roleError || analysis.status === "error" ? "更新失败，显示旧版本结果。" : "正在更新，显示旧版本结果。"}</p>}
              {roleError && !roleProfiles ? <EmptyState variant="error" title="地图角色不可用" hint={roleError} /> : !roleProfiles && !capability.error && !declarationsError ? <div className="stu-loading">读取地图位置事实…</div> : !roleProfiles ? null : roleEntries?.length === 0 && roleProfiles.length === 0 ? (capability.error ? null : <p className="stu-muted" role="status">当前范围暂无可用比赛，请查看上方原因和操作。</p>) : <PlayerMapRoleProfilePanel state={state.tables.roles ?? { sort: { key: "sample", direction: "desc" }, page: 0 }} onStateChange={table => onStateChange({ ...state, tables: { ...state.tables, roles: table } })} profile={selectedRoleProfile ? { ...selectedRoleProfile, teamKey: selectedRoleProfile.teamGroup.label } : null} onOpenEvidence={(evidence) => {
                const entry = entryByMatchId.get(evidence.matchId);
                if (entry) onOpenEvidence({ entryId: entry.id, evidence, sourceKey: "players:map-roles" });
              }} />}
            </div>
            <div className="stu-card stu-card-wide" id="players:map-pool"><h3>完整个人地图池</h3>{poolCapability.availability && <CapabilityBar availability={poolCapability.availability} onRepair={onCapabilityRepair} />}{poolCapability.error && <p role="alert">地图池能力读取失败：{poolCapability.error} <button type="button" className="stu-button-sm" onClick={poolCapability.retry}>重试</button>{poolCapability.availability && " · 显示旧版本"}</p>}{mapPoolError && <p role="alert">地图池更新失败：{mapPoolError}</p>}{pool && (!mapPoolReady || mapPoolError || analysis.status !== "ready" || pool.generation !== analysis.generation) && <p role="status" className="stu-muted">{mapPoolError || analysis.status === "error" ? "更新失败，显示旧版本结果。" : "正在更新，显示旧版本结果。"}</p>}{unsupportedMaps.length > 0 && <p>未支持的地图：{unsupportedMaps.join("、")}</p>}{!pool && (poolCapability.error || mapPoolError) ? null : !pool ? <div className="stu-loading">读取个人地图池…</div> : poolEntries?.length === 0 && mapPool.length === 0 ? (poolCapability.error ? null : <p className="stu-muted" role="status">当前范围暂无可用比赛，请查看上方原因和操作。</p>) : <PlayerMapPoolPanel state={state.tables.mapPool ?? { sort: { key: "record", direction: "desc" }, page: 0 }} onStateChange={table => onStateChange({ ...state, tables: { ...state.tables, mapPool: table } })} rows={mapPool} onOpenEvidence={(evidence) => { const entry = entries.find((row) => matchIdForEntry(row) === evidence.matchId); if (entry) onOpenEvidence({ entryId: entry.id, evidence, sourceKey: "players:map-pool" }); }} />}</div>
          {roleEditorOpen && (
            <div className="stu-modal-backdrop" role="dialog" aria-modal="true" aria-label="编辑角色声明" onClick={() => { if (!declarationsSavingRef.current) setRoleEditorOpen(false); }}>
              <div className="stu-dialog stu-dialog-form" ref={roleDialogRef} onClick={(event) => event.stopPropagation()}>
                <header className="stu-modal-head"><h3>角色声明 · {playerLabel}</h3><button type="button" className="stu-modal-close" disabled={declarationsSaving} onClick={() => { if (!declarationsSavingRef.current) setRoleEditorOpen(false); }} aria-label="关闭">✕</button></header>
                <div className="stu-modal-body">{scopeOptions.length > 0 && <label className="stu-form-field"><span className="stu-form-label">声明范围</span><select className="stu-form-control" disabled={declarationsSaving} value={Math.min(scopeIndex, scopeOptions.length - 1)} onChange={event => setScopeIndex(Number(event.target.value))}>{scopeOptions.map((scope, index) => <option key={index} value={index}>{scope.label}</option>)}</select></label>}{ambiguousDeclarations.length > 0 && <section className="stu-declaration-list"><p className="stu-muted">原有同名声明的范围不明确，已保留；请选择明确范围重新声明。</p>{ambiguousDeclarations.map(row => <div key={row.id} className="stu-declaration-row"><span>{row.declaration.kind === "main_role" ? `${row.declaration.priority === "primary" ? "主角色" : "副角色"} · ${row.declaration.role}` : DUTY_LABEL[row.declaration.weaponDuty]}</span><button type="button" className="stu-button-sm" disabled={declarationsSaving} onClick={() => void clearRoleDeclaration(row.id)}>清除</button></div>)}</section>}<p className="stu-muted">副角色和武器职责可留空。</p>
                  <div className="stu-form-grid">
                    <label className="stu-form-field"><span className="stu-form-label">主角色</span><select className="stu-form-control" disabled={declarationsSaving} value={declaredRole} onChange={(event) => { const role = event.target.value as DeclaredRole | ""; setDeclaredRole(role); if (declaredSecondaryRole === role) setDeclaredSecondaryRole(""); }}><option value="" disabled>请选择</option>{(["igl", "awper", "anchor", "opener", "closer"] as const).map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
                    <label className="stu-form-field"><span className="stu-form-label">副角色（可选）</span><select className="stu-form-control" disabled={declarationsSaving} value={declaredSecondaryRole} onChange={(event) => setDeclaredSecondaryRole(event.target.value as DeclaredRole | "")}><option value="">不声明</option>{(["igl", "awper", "anchor", "opener", "closer"] as const).filter((role) => role !== declaredRole || role === declaredSecondaryRole).map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
                    <label className="stu-form-field"><span className="stu-form-label">武器职责（可选）</span><select className="stu-form-control" disabled={declarationsSaving} value={declaredWeaponDuty} onChange={(event) => setDeclaredWeaponDuty(event.target.value as WeaponDuty | "")}><option value="">不声明</option>{(["primary_awper", "secondary_awper", "situational_awper", "rifler"] as const).map((duty) => <option key={duty} value={duty}>{DUTY_LABEL[duty]}</option>)}</select></label>
                  </div>
                  {roleFormError && <p className="stu-form-error" role="alert">{roleFormError}</p>}
                  {selectedDeclarations.length > 0 && <section className="stu-declaration-list"><h4>已有声明</h4>{selectedDeclarations.map((row) => <div key={row.id} className="stu-declaration-row"><span>{row.declaration.kind === "main_role" ? `${row.declaration.priority === "primary" ? "主角色" : "副角色"} · ${row.declaration.role}` : DUTY_LABEL[row.declaration.weaponDuty]}{row.declaration.mapName ? ` · ${row.declaration.mapName.replace("de_", "")}` : ""}</span><button type="button" className="stu-button-sm" disabled={declarationsSaving} onClick={() => void clearRoleDeclaration(row.id)}>清除</button></div>)}</section>}
                </div>
                <footer className="stu-modal-foot"><div className="stu-modal-actions"><button type="button" className="stu-button" disabled={declarationsSaving} onClick={() => setRoleEditorOpen(false)}>取消</button><button type="button" className="stu-button stu-button-primary" disabled={declarationsSaving || !declaredRole || !selectedRoleProfile} onClick={() => void saveRoleDeclaration()}>{declarationsSaving ? "保存中…" : "保存声明"}</button></div></footer>
              </div>
            </div>
          )}
  </>;
  const roleCurrent = !!selectedRoleProfile && !roleError && !declarationsError && !capability.error &&
    !capability.stale && canExportSnapshot(roleSnapshot, analysis);
  const poolCurrent = !!pool && !!poolEntries?.length && mapPoolReady && !mapPoolError && !poolCapability.error &&
    !poolCapability.stale && canExportSnapshot(poolSnapshot, analysis);
  const omitted = [
    !roleCurrent ? "地图 / 位置未导出：无当前可用结果或正在更新。" : null,
    !poolCurrent ? "个人地图池未导出：无当前可用结果或正在更新。" : null,
  ].filter((value): value is string => value !== null);
  return <div className="stu-view">
    <header className="stu-view-header">
      <h1>位置与职责 · {playerLabel}</h1>
      {exportSource && (roleCurrent || poolCurrent) && <AnalysisExportButtons capture={() => {
        const source = withCapabilityConditions(
          withAnalysisExportEntries(exportSource, unionExportEntries(
            roleCurrent ? roleEntries : null, poolCurrent ? poolEntries : null,
          )),
          roleCurrent ? capability.availability : null,
          poolCurrent ? poolCapability.availability : null,
        );
        return buildPlayerRolesAnalysisResult(source, roleCurrent ? selectedRoleProfile : null,
          poolCurrent ? mapPool : null, state, playerLabel, poolCurrent ? unsupportedMaps : [], omitted);
      }} />}
    </header>
    {rolePanels}
  </div>;
}
