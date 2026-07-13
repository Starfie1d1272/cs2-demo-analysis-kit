import type { DoubleAwpAnalysis, EvidenceRef, PlayerMapPoolRow, PlayerMapRoleProfile, TeamMapRoleMatrix } from "@cs2dak/contract";
import { DataTable, DAK_TABLE_CLASSES, type DataTableColumn } from "./DataTable";
import { EmptyState, EvidenceLink, LimitNote, MetricInfo } from "./Primitives";

const STATUS_LABEL = { ready: "可用", mixed: "混合", insufficient: "样本不足", unknown: "未知" } as const;
const DUTY_LABEL = { primary_awper: "主 AWP", secondary_awper: "副 AWP", situational_awper: "情境 AWP", rifler: "步枪" } as const;
const DYNAMIC_LABEL = { stable: "稳定", isolated: "孤立", rotating: "轮转", mixed: "混合", unknown: "未知" } as const;
const RESPONSIBILITY_LABEL = { core_pack: "核心 / 主体", map_control: "控图", extremity: "边翼", lurk_late_join: "游走 / 晚汇合", support: "辅助", anchor: "守点", rotator: "轮转", active_control: "主动控制", supportive: "协同辅助", mixed: "混合", unknown: "未知" } as const;

function Status({ value }: { value: keyof typeof STATUS_LABEL }) {
  return <span className={`dak-role-status dak-role-status-${value}`}>{STATUS_LABEL[value]}</span>;
}

function Evidence({ evidence, onOpenEvidence }: { evidence: EvidenceRef[]; onOpenEvidence?: (evidence: EvidenceRef) => void }) {
  const first = evidence[0];
  return first && onOpenEvidence ? <EvidenceLink onOpen={() => onOpenEvidence(first)}>R{first.roundNumber}</EvidenceLink> : "—";
}

export function PlayerMapRoleProfilePanel({
  profile,
  onOpenEvidence,
}: {
  profile: PlayerMapRoleProfile | null;
  onOpenEvidence?: (evidence: EvidenceRef) => void;
}) {
  if (!profile) return <EmptyState variant="insufficient" title="地图 / 位置画像不可用" hint="需要当前选手的地图位置 facts；缺失时可在资料库重建 facts。" />;
  const rows = profile.perMapEvidence;
  const positionLabels = new Map(profile.positionGroupDisplay.map((row) => [`${row.mapName}:${row.side}:${row.positionGroupId}`, row]));
  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: "map", label: "地图 / 边", format: (row) => `${row.mapName.replace("de_", "")} · ${row.side.toUpperCase()}` },
    { key: "sample", label: "样本", numeric: true, sortable: true, sortValue: (row) => row.sample.eligibleRounds, format: (row) => `${row.sample.eligibleRounds} 回合` },
    { key: "position", label: "位置组", format: (row) => {
      const group = row.positionGroups[0];
      if (!group) return "—";
      const display = positionLabels.get(`${row.mapName}:${row.side}:${group.positionGroupId}`);
      return display ? `${display.displayName}${display.officialName ? ` / ${display.officialName}` : ""}` : "未映射位置";
    } },
    { key: "responsibility", label: "逐侧职责", format: (row) => RESPONSIBILITY_LABEL[row.responsibility] },
    { key: "duty", label: "武器职责", format: (row) => DUTY_LABEL[row.awp.duty] },
    { key: "confidence", label: <>置信度 <MetricInfo note="来自 position group、队内相对空间、AWP 责任和样本覆盖；不是固定槽位或战术真相。" /></>, numeric: true, sortable: true, sortValue: (row) => row.confidence, format: (row) => `${Math.round(row.confidence * 100)}%` },
    { key: "evidence", label: "代表回合", render: (row) => <Evidence evidence={row.representativeRounds.map((ref) => ({ ...ref, reason: `${row.mapName} ${row.side.toUpperCase()} 的位置职责代表回合`, role: "example" as const }))} onOpenEvidence={onOpenEvidence} /> },
  ];
  return (
    <section className="dak-role-panel">
      <div className="dak-role-head"><div><h3>地图 / 位置</h3><p>自动推断与人工声明并列展示；不会互相覆盖。</p></div><Status value={profile.status} /></div>
      <div className="dak-role-summary">
        <span>自动画像：<b>{profile.inferredPrimaryRole ?? "—"}</b></span>
        <span>标题角色：<b>{profile.headlineRole ?? "—"}</b></span>
        <span>武器职责：<b>{profile.weaponDuty ? DUTY_LABEL[profile.weaponDuty] : "—"}</b></span>
        <span>次选：<b>{profile.runnerUpRole ?? "—"}</b></span>
        <span>区分度：<b>{profile.separationMargin == null ? "—" : `${Math.round(profile.separationMargin * 100)}%`}</b></span>
      </div>
      <div className="dak-role-summary"><span>AWPer 相似度 <b>{Math.round(profile.roleSimilarities.awper * 100)}%</b></span><span>Anchor 相似度 <b>{Math.round(profile.roleSimilarities.anchor * 100)}%</b></span><span>Opener 相似度 <b>{Math.round(profile.roleSimilarities.opener * 100)}%</b></span><span>Closer 相似度 <b>{Math.round(profile.roleSimilarities.closer * 100)}%</b></span></div>
      <div className="dak-role-declarations"><b>用户声明</b>{profile.declaredRoles.filter((row) => row.source === "user").map((row, index) => <span key={`user-${row.role}-${index}`} className="dak-role-tag">{row.role}{row.mapName ? ` · ${row.mapName.replace("de_", "")}` : ""}{row.teamKey ? ` · ${row.teamKey}` : ""}</span>)}{!profile.declaredRoles.some((row) => row.source === "user") && <span>未提供</span>}<b>可信元数据</b>{profile.declaredRoles.filter((row) => row.source === "trusted_metadata").map((row, index) => <span key={`metadata-${row.role}-${index}`} className="dak-role-tag">{row.role}</span>)}{!profile.declaredRoles.some((row) => row.source === "trusted_metadata") && <span>未提供</span>}</div>
      {rows.length ? <DataTable classes={DAK_TABLE_CLASSES} rows={rows} rowKey={(row) => `${row.teamKey}:${row.mapName}:${row.side}`} columns={columns} initialSortKey="sample" /> : <EmptyState variant="insufficient" title="没有可用地图样本" hint="当前范围没有满足角色证据条件的地图 / 阵营数据。" />}
      <p className="dak-role-note"><b>声明与观察</b>{profile.alignment.tSide}；{profile.alignment.ctSide}</p>
      {profile.basis[0] && <p className="dak-role-note"><b>依据</b>{profile.basis[0]}</p>}
      {profile.limitations[0] && <LimitNote>{profile.limitations[0]}</LimitNote>}
    </section>
  );
}

export function TeamMapRoleMatrixPanel({
  matrix,
  playerNames = {},
  onOpenEvidence,
}: {
  matrix: TeamMapRoleMatrix | null;
  playerNames?: Record<string, string>;
  onOpenEvidence?: (evidence: EvidenceRef) => void;
}) {
  if (!matrix) return <EmptyState variant="insufficient" title="该地图暂无职责矩阵" hint="选择有位置 facts 的地图和阵营；样本不足会明确保留，而不是补零。" />;
  const columns: DataTableColumn<TeamMapRoleMatrix["players"][number]>[] = [
    { key: "player", label: "选手", format: (row) => playerNames[row.playerKey] ?? row.playerKey },
    { key: "position", label: "主要位置组", format: (row) => row.primaryPositionGroups.map((group) => `${group.displayName}${group.officialName ? ` / ${group.officialName}` : ""} ${Math.round(group.share * 100)}%`).join(" · ") || "—" },
    { key: "responsibility", label: <>动态职责 <MetricInfo note="描述位置稳定、孤立或轮转状态，不是固定 T 槽位或战术指挥结论。" /></>, format: (row) => DYNAMIC_LABEL[row.dynamicResponsibility] },
    { key: "side-duty", label: "逐侧职责", format: (row) => RESPONSIBILITY_LABEL[row.responsibility] },
    { key: "awp", label: "AWP", format: (row) => row.weaponDuty ? DUTY_LABEL[row.weaponDuty] : "—" },
    { key: "sample", label: "样本", numeric: true, sortable: true, sortValue: (row) => row.sampleRounds, format: (row) => `${row.sampleRounds} 回合` },
    { key: "evidence", label: "证据", render: (row) => <Evidence evidence={row.evidence} onOpenEvidence={onOpenEvidence} /> },
  ];
  return (
    <section className="dak-role-panel">
      <div className="dak-role-head"><div><h3>{matrix.mapName.replace("de_", "")} · {matrix.side.toUpperCase()} 位置职责</h3><p>描述队伍地图盘面；不自动生成强弱判断或对策。</p></div><Status value={matrix.status} /></div>
      <div className="dak-role-summary"><span>置信度：<b>{Math.round(matrix.confidence * 100)}%</b></span><span>覆盖不稳：<b>{matrix.unstableCoverage ? "是" : "否"}</b></span><span>职责冲突：<b>{matrix.responsibilityConflict ? "有" : "无"}</b></span><span>位置重叠：<b>{matrix.positionOverlap.length}</b></span></div>
      <DataTable classes={DAK_TABLE_CLASSES} rows={matrix.players} rowKey={(row) => row.playerKey} columns={columns} initialSortKey="sample" />
      {matrix.representativeRounds.length > 0 && <div className="dak-role-evidence"><b>队伍代表回合</b><Evidence evidence={matrix.representativeRounds} onOpenEvidence={onOpenEvidence} /></div>}
      {matrix.limitations[0] && <LimitNote>{matrix.limitations[0]}</LimitNote>}
    </section>
  );
}

export function DoubleAwpAnalysisPanel({ model, playerNames = {}, onOpenEvidence }: { model: DoubleAwpAnalysis | null; playerNames?: Record<string, string>; onOpenEvidence?: (evidence: EvidenceRef) => void }) {
  if (!model) return <EmptyState variant="insufficient" title="双 AWP 样本不可用" hint="需要逐回合 AWP 与经济 facts；T/CT 会分别统计。" />;
  return <section className="dak-role-panel">
    <div className="dak-role-head"><div><h3>{model.side.toUpperCase()} 双 AWP</h3><p>仅描述 qualified full-buy / long-gun round 的观测指标，不作因果归因。</p></div><Status value={model.status} /></div>
    <div className="dak-role-summary"><span>双 AWP 回合 <b>{model.doubleAwpRoundCount}/{model.qualifiedRoundCount}</b></span><span>占比 <b>{model.eligibleRoundShare == null ? "—" : `${Math.round(model.eligibleRoundShare * 100)}%`}</b></span><span>战绩 <b>{model.wins}/{model.doubleAwpRoundCount}</b></span><span>开局 <b>{model.openingKills}:{model.openingDeaths}</b></span><span>保狙 <b>{model.saves}</b></span><span>AWP kills <b>{model.awpKills ?? "—"}</b></span></div>
    <div className="dak-role-declarations"><b>常见组合</b>{model.combinations.map((combo) => <span key={combo.playerKeys.join("|")} className="dak-role-tag">{combo.playerKeys.map((key) => playerNames[key] ?? key).join(" + ")} · {combo.rounds}</span>)}{model.combinations.length === 0 && <span>无</span>}</div>
    {model.evidence.length > 0 && <div className="dak-role-evidence"><b>代表回合</b><Evidence evidence={model.evidence} onOpenEvidence={onOpenEvidence} /></div>}
    {model.limitations.map((item) => <LimitNote key={item}>{item}</LimitNote>)}
  </section>;
}

export function PlayerMapPoolPanel({ rows, onOpenEvidence }: { rows: PlayerMapPoolRow[]; onOpenEvidence?: (evidence: EvidenceRef) => void }) {
  const columns: DataTableColumn<PlayerMapPoolRow>[] = [
    { key: "map", label: "地图", format: (row) => row.mapName.replace("de_", "") },
    { key: "record", label: "场次 / 战绩", sortable: true, sortValue: (row) => row.matchCount, format: (row) => `${row.matchCount} · ${row.wins}胜 ${row.losses}负` },
    { key: "rounds", label: "回合", numeric: true, sortable: true, sortValue: (row) => row.roundCount, format: (row) => row.roundCount },
    { key: "rr", label: "RR", numeric: true, sortable: true, sortValue: (row) => row.rr, format: (row) => row.rr?.toFixed(2) ?? "—" },
    { key: "adr", label: "ADR", numeric: true, sortable: true, sortValue: (row) => row.adr, format: (row) => row.adr?.toFixed(1) ?? "—" },
    { key: "kast", label: "KAST", numeric: true, sortable: true, sortValue: (row) => row.kast, format: (row) => row.kast == null ? "—" : `${row.kast.toFixed(1)}%` },
    { key: "opening", label: "Opening", format: (row) => `${row.openingKills}:${row.openingDeaths}` },
    { key: "weapon", label: "主武器 / 全局职责", format: (row) => `${row.mainWeapon ?? "—"} · ${row.globalWeaponDuty ? DUTY_LABEL[row.globalWeaponDuty] : "—"}` },
    { key: "position", label: "T / CT 位置", format: (row) => `${row.tPositionGroup ?? "—"} / ${row.ctPositionGroup ?? "—"}` },
    { key: "responsibility", label: "T / CT 职责", format: (row) => `${RESPONSIBILITY_LABEL[row.tResponsibility]} / ${RESPONSIBILITY_LABEL[row.ctResponsibility]}` },
    { key: "quality", label: "样本 / 置信度", format: (row) => `${Math.round(row.sampleQuality * 100)}% / ${Math.round(row.confidence * 100)}%` },
    { key: "evidence", label: "证据", render: (row) => <Evidence evidence={row.evidence} onOpenEvidence={onOpenEvidence} /> },
  ];
  return rows.length ? <div className="dak-table-scroll"><DataTable classes={DAK_TABLE_CLASSES} rows={rows} rowKey={(row) => row.mapName} columns={columns} initialSortKey="record" /></div> : <EmptyState variant="insufficient" title="地图池样本不足" hint="当前选手没有可聚合的地图级 facts。" />;
}
