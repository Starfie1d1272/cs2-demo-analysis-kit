import type { DuelFinderRow, EvidenceRef } from "@cs2dak/contract";
import type { TacticalCluster } from "@cs2dak/cohort";
import { duelClassificationLabel } from "./duel.js";
import type {
  EnemyFlashIncident,
  FirstDeathStat,
  MistakeReview,
  UtilityDamageEvidence,
} from "./insights.js";

export type FindingOrigin = "system" | "user";

/** 产品中立的、可交给证据查看器或行动面的系统结论。 */
export interface AnalysisFinding {
  /** capability 内稳定的 key，不承担跨产品持久化 identity。 */
  key: string;
  capability: "mistake-review" | "duel" | "utility" | "tactical";
  producerVersion: string;
  origin: FindingOrigin;
  title: string;
  statement: string;
  subject: { id?: string; label: string };
  relationship?: string;
  sample: {
    label: string;
    numerator?: number;
    denominator?: number;
    coverage?: string;
  };
  baseline: string | null;
  evidence: EvidenceRef[];
  basis: string[];
  limitations: string[];
}

export interface FindingSubject {
  id?: string;
  label: string;
}

const PRODUCER_VERSION = "cs2-demo-analysis-kit/finding-0.1";

function systemFinding(
  finding: Omit<AnalysisFinding, "origin" | "producerVersion">
): AnalysisFinding {
  return { ...finding, origin: "system", producerVersion: PRODUCER_VERSION };
}

function mistakeFinding(
  key: string,
  title: string,
  statementLabel: string,
  stat: FirstDeathStat,
  subject: FindingSubject,
): AnalysisFinding | null {
  if (stat.count === 0 || stat.evidence.length === 0) return null;
  return systemFinding({
    key: `mistake:${key}:${subject.id ?? subject.label}`,
    capability: "mistake-review",
    title,
    statement: `${subject.label} 在 ${stat.attempts} 个${statementLabel}中有 ${stat.count} 次首死。`,
    subject,
    sample: { label: statementLabel, numerator: stat.count, denominator: stat.attempts },
    baseline: null,
    evidence: stat.evidence,
    basis: ["按回合首个死亡事件统计。"],
    limitations: ["该规则只定位首死，不能据此判断首死成因或自动给出训练处方。"],
  });
}

/** 只转换已有稳定规则和证据的 Mistake Review；没有证据的统计不形成系统 Finding。 */
export function buildMistakeFindings(
  mistakes: MistakeReview,
  subject: FindingSubject,
): AnalysisFinding[] {
  const firstDeath = [
    mistakeFinding("full-buy-first-death", "优先复盘：长枪局首死", "长枪局", mistakes.fullBuyFirstDeaths, subject),
    mistakeFinding("anti-eco-first-death", "优先复盘：反 ECO 首死", "对手 ECO/半起局", mistakes.antiEcoFirstDeaths, subject),
    mistakeFinding("low-buy-first-death", "优先复盘：劣势经济首死", "劣势经济局", mistakes.lowBuyFirstDeaths, subject),
  ].filter((finding): finding is AnalysisFinding => finding != null);

  if (mistakes.clutchLosses.count > 0 && mistakes.clutchLosses.evidence.length > 0) {
    firstDeath.push(systemFinding({
      key: `mistake:clutch-loss:${subject.id ?? subject.label}`,
      capability: "mistake-review",
      title: "优先复盘：残局失利",
      statement: `${subject.label} 有 ${mistakes.clutchLosses.count} 次已记录的残局失利。`,
      subject,
      sample: { label: "残局失利", numerator: mistakes.clutchLosses.count },
      baseline: null,
      evidence: mistakes.clutchLosses.evidence,
      basis: ["按导出的残局事实统计。"],
      limitations: ["该规则不判断残局决策、对手配置或失利成因。"],
    }));
  }
  return firstDeath;
}

/** 单条对枪事实可作为有明确回合证据的 Finding，不把分类扩展为因果结论。 */
export function findingFromDuel(row: DuelFinderRow): AnalysisFinding {
  const label = duelClassificationLabel(row.classification);
  return systemFinding({
    key: `duel:${row.id}`,
    capability: "duel",
    title: label,
    statement: `${row.killerName} 在 ${row.mapName} R${row.roundNumber} 使用 ${row.weapon} 击杀 ${row.victimName}。`,
    subject: { id: row.killerSteamId64, label: row.killerName },
    relationship: `${row.killerName} 对 ${row.victimName}`,
    sample: { label: "单次对枪", numerator: 1, denominator: 1 },
    baseline: null,
    evidence: [row.evidence],
    basis: ["使用已有对枪分类与击杀事实。"],
    limitations: ["单条对枪仅用于复核具体交战，不代表长期机制画像或因果判断。"],
  });
}

export function findingFromUtilityDamage(row: UtilityDamageEvidence): AnalysisFinding {
  const label = row.kind === "he" ? "HE 手雷" : "火焰";
  return systemFinding({
    key: `utility:${row.kind}:${row.matchId}:${row.roundNumber}:${row.tick ?? 0}:${row.playerId ?? row.playerName}`,
    capability: "utility",
    title: `${label}伤害证据`,
    statement: `${row.playerName} 在 R${row.roundNumber} 用${label}对 ${row.victimCount} 人造成 ${row.damage} 点伤害。`,
    subject: { id: row.playerId, label: row.playerName },
    sample: { label: "单次道具伤害事件", numerator: row.damage },
    baseline: null,
    evidence: [row],
    basis: ["使用导出的伤害事件聚合。"],
    limitations: ["伤害事件不证明该道具导致了回合胜负，也不构成最佳点位或战术建议。"],
  });
}

export function findingFromUtilityFlash(row: EnemyFlashIncident & { playerId?: string; playerName: string }): AnalysisFinding {
  return systemFinding({
    key: `utility:flash:${row.matchId}:${row.roundNumber}:${row.tick ?? 0}:${row.playerId ?? row.playerName}`,
    capability: "utility",
    title: "闪光贡献证据",
    statement: `${row.playerName} 在 R${row.roundNumber} 致盲 ${row.victimCount} 名敌方，共 ${row.enemySeconds.toFixed(1)} 秒。`,
    subject: { id: row.playerId, label: row.playerName },
    sample: { label: "单颗闪光事件", numerator: row.enemySeconds },
    baseline: null,
    evidence: [row],
    basis: ["按同一闪光事件归并敌方致盲秒数。"],
    limitations: ["致盲时长不证明这颗闪光导致了击杀或回合胜负。"],
  });
}

/** Tactical Cluster 只陈述开局/进点模式与代表回合，不推断完整战术意图或最佳反制。 */
export function findingFromTacticalCluster(cluster: TacticalCluster): AnalysisFinding | null {
  const representative = cluster.rounds[0];
  if (!representative) return null;
  const sample = `${cluster.mapName} ${cluster.side.toUpperCase()} ${cluster.economyEntry}`;
  return systemFinding({
    key: `tactical:${cluster.id}`,
    capability: "tactical",
    title: "开局模式证据",
    statement: `${cluster.teamName} 在 ${sample} 样本中出现 ${cluster.roundCount} 回合相同开局结构。`,
    subject: { id: cluster.teamIdentity, label: cluster.teamName },
    sample: {
      label: sample,
      numerator: cluster.roundCount,
      coverage: `${cluster.entryEvidence.coveredRounds}/${cluster.entryEvidence.totalRounds} 回合有真实进点入口证据`,
    },
    baseline: null,
    evidence: [{
      matchId: representative.matchId,
      roundNumber: representative.roundNumber,
      reason: "该回合是此开局结构的代表样本",
      role: "example",
    }],
    basis: ["按默认位开局结构与真实进点事实聚类。"],
    limitations: ["该聚类不识别完整中期战术、佯攻、转点意图或最佳反制。"],
  });
}
