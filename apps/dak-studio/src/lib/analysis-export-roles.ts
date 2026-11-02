import type {
  PlayerMapRoleProfile,
  PlayerMapPoolRow,
  TeamMapRoleMatrix,
  DoubleAwpAnalysis,
} from "@cs2dak/tactics";
import {
  sortTableRows,
  playerRoleSortColumns,
  teamRoleSortColumns,
  playerMapPoolSortColumns,
} from "@cs2dak/react";
import type { PlayerRolesState, TeamRolesState } from "./studio-page-state";
import {
  captureAnalysisResult,
  type AnalysisExportSource,
  type AnalysisResultSection,
} from "./analysis-export";

const roleLabels: Record<string, string> = {
  pack: "主体组",
  extremity: "边翼",
  late_joining: "晚汇合",
  stable_default: "稳定默认位",
  anchor_tendency: "守点倾向",
  component_mobile: "组间移动",
  independent_mobile: "独立移动",
  stable_position: "稳定位置",
  mixed: "混合",
  unknown: "未知",
  primary_awper: "主 AWP",
  secondary_awper: "副 AWP",
  situational_awper: "情境 AWP",
  rifler: "步枪",
  utility_supportive: "道具协同",
  positionally_stable: "位置稳定",
  spatially_isolated: "空间孤立",
};
const label = (value: string | null) =>
  value === null ? null : (roleLabels[value] ?? value);

export function buildPlayerRolesAnalysisResult(
  source: AnalysisExportSource,
  profile: PlayerMapRoleProfile | null,
  pool: PlayerMapPoolRow[] | null,
  state: PlayerRolesState,
  player: string,
  unsupportedMaps: string[],
  omitted: string[],
) {
  const roles = sortTableRows(
    profile?.perMapEvidence ?? [],
    playerRoleSortColumns,
    state.tables.roles?.sort ?? { key: "sample", direction: "desc" },
  );
  const maps = sortTableRows(
    pool ?? [],
    playerMapPoolSortColumns,
    state.tables.mapPool?.sort ?? { key: "record", direction: "desc" },
  );
  const sections: AnalysisResultSection[] = [
    ...(profile
      ? [
          {
            title: "地图 / 位置",
            text: [
              `自动画像：${profile.inferredPrimaryRole ?? "未知"}；人工角色声明：${
                profile.declaredRoles
                  .filter((row) => row.source === "user")
                  .map((row) => `${row.priority} ${row.role}`)
                  .join("、") || "未提供"
              }。`,
              ...profile.basis,
            ],
            sampleDescription: `${roles.length} 行 · 全部筛选结果`,
            limitations: profile.limitations,
            columns: [
              { key: "map", label: "地图", unit: null },
              { key: "side", label: "阵营", unit: null },
              { key: "sample", label: "样本回合", unit: null },
              { key: "position", label: "位置组", unit: null },
              { key: "responsibility", label: "逐侧职责", unit: null },
              { key: "duty", label: "武器职责", unit: null },
              { key: "confidence", label: "置信度", unit: "比例 (0–1)" },
              { key: "evidence", label: "代表回合", unit: null },
            ],
            rows: roles.map((row) => ({
              map: row.mapName,
              side: row.side,
              sample: row.sample.eligibleRounds,
              position: (() => {
                const group = row.positionGroups[0];
                if (!group) return null;
                const display = profile.positionGroupDisplay.find(
                  (item) =>
                    item.mapName === row.mapName &&
                    item.side === row.side &&
                    item.positionGroupId === group.positionGroupId,
                );
                return display
                  ? `${display.displayName}${display.officialName ? ` / ${display.officialName}` : ""}`
                  : "未映射位置";
              })(),
              responsibility: label(row.responsibility),
              duty: label(row.awp.duty),
              confidence: row.confidence,
              evidence: row.representativeRounds[0]
                ? `${row.representativeRounds[0].matchId} R${row.representativeRounds[0].roundNumber}`
                : null,
            })),
          } satisfies AnalysisResultSection,
        ]
      : []),
    ...(pool
      ? [
          {
            title: "完整个人地图池",
            text: unsupportedMaps.length
              ? [`未支持的地图：${unsupportedMaps.join("、")}`]
              : [],
            sampleDescription: `${maps.length} 行 · 全部筛选结果`,
            limitations: [],
            columns: [
              { key: "map", label: "地图", unit: null },
              { key: "matches", label: "场次", unit: null },
              { key: "wins", label: "胜", unit: null },
              { key: "losses", label: "负", unit: null },
              { key: "rounds", label: "回合", unit: null },
              { key: "rr", label: "RR", unit: null },
              { key: "adr", label: "ADR", unit: null },
              { key: "kast", label: "KAST", unit: "%" },
              { key: "openingKills", label: "首杀", unit: null },
              { key: "openingDeaths", label: "首死", unit: null },
              { key: "weapon", label: "主武器", unit: null },
              { key: "globalDuty", label: "全局职责", unit: null },
              { key: "t", label: "T 位置", unit: null },
              { key: "ct", label: "CT 位置", unit: null },
              { key: "tResponsibility", label: "T 职责", unit: null },
              { key: "ctResponsibility", label: "CT 职责", unit: null },
              { key: "roleMatches", label: "位置证据场次", unit: null },
              { key: "quality", label: "样本质量", unit: "比例 (0–1)" },
              { key: "confidence", label: "置信度", unit: "比例 (0–1)" },
              { key: "evidence", label: "代表回合", unit: null },
            ],
            rows: maps.map((row) => ({
              map: row.mapName,
              matches: row.matchCount,
              wins: row.wins,
              losses: row.losses,
              rounds: row.roundCount,
              rr: row.rr,
              adr: row.adr,
              kast: row.kast,
              openingKills: row.openingKills,
              openingDeaths: row.openingDeaths,
              weapon: row.mainWeapon,
              globalDuty: label(row.globalWeaponDuty),
              t: row.tPositionGroup,
              ct: row.ctPositionGroup,
              tResponsibility: label(row.tResponsibility),
              ctResponsibility: label(row.ctResponsibility),
              roleMatches: row.roleMatchCount,
              quality: row.roleMatchCount ? row.sampleQuality : null,
              confidence: row.roleMatchCount ? row.confidence : null,
              evidence: row.evidence[0]
                ? `${row.evidence[0].matchId} R${row.evidence[0].roundNumber}`
                : null,
            })),
          } satisfies AnalysisResultSection,
        ]
      : []),
  ];
  return captureAnalysisResult({
    ...source,
    title: `${player} · 位置与职责`,
    page: "roles",
    sections,
    limitations: ["人工声明与自动观察分开记录。", ...omitted],
  });
}
export function buildTeamRolesAnalysisResult(
  source: AnalysisExportSource,
  matrix: TeamMapRoleMatrix | null,
  awp: DoubleAwpAnalysis | null,
  state: TeamRolesState,
  names: Record<string, string>,
  teamName: string,
  omitted: string[],
) {
  const players = sortTableRows(
    matrix?.players ?? [],
    teamRoleSortColumns,
    state.tables.roles?.sort ?? { key: "sample", direction: "desc" },
  );
  const sections: AnalysisResultSection[] = matrix
    ? [
        {
          title: "职责矩阵摘要",
          text: [
            `状态：${matrix.status}；覆盖不稳：${matrix.unstableCoverage ? "是" : "否"}。`,
          ],
          sampleDescription: `${players.length} 名选手`,
          limitations: matrix.limitations,
          columns: [
            { key: "metric", label: "指标", unit: null },
            { key: "value", label: "数值", unit: null },
            { key: "unit", label: "单位", unit: null },
          ],
          rows: [
            { metric: "置信度", value: matrix.confidence, unit: "比例 (0–1)" },
            {
              metric: "位置集中度",
              value: matrix.positionConcentration,
              unit: "比例 (0–1)",
            },
            {
              metric: "位置重叠",
              value: matrix.positionOverlap.length,
              unit: "组",
            },
          ],
        },
        {
          title: `${matrix.mapName} · ${matrix.side} 位置职责`,
          text: [
            `状态：${matrix.status}；覆盖不稳：${matrix.unstableCoverage ? "是" : "否"}。`,
          ],
          sampleDescription: `${players.length} 行 · 全部筛选结果`,
          limitations: matrix.limitations,
          columns: [
            { key: "player", label: "选手", unit: null },
            { key: "position", label: "主要位置组", unit: null },
            { key: "responsibility", label: "结构职责", unit: null },
            { key: "modifiers", label: "附加属性", unit: null },
            { key: "duty", label: "AWP", unit: null },
            { key: "sample", label: "样本回合", unit: null },
            { key: "evidence", label: "代表回合", unit: null },
          ],
          rows: players.map((row) => ({
            player: names[row.playerKey] ?? row.playerKey,
            position: row.primaryPositionGroups
              .map(
                (group) =>
                  `${group.displayName}${group.officialName ? ` / ${group.officialName}` : ""} · ${group.share}（比例）`,
              )
              .join("、"),
            responsibility: label(row.responsibility),
            modifiers: row.modifiers.map(label).join("、"),
            duty: label(row.weaponDuty),
            sample: row.sampleRounds,
            evidence: row.evidence[0]
              ? `${row.evidence[0].matchId} R${row.evidence[0].roundNumber}`
              : null,
          })),
        },
      ]
    : [];
  if (awp) {
    sections.push({
      title: "双 AWP 条件统计",
      text: awp.combinations.map(
        (combo) =>
          `${combo.playerKeys.map((key) => names[key] ?? key).join(" + ")} · ${combo.rounds} 回合`,
      ),
      sampleDescription: `${awp.qualifiedRoundCount} 个符合条件回合`,
      limitations: awp.limitations,
      columns: [
        { key: "metric", label: "指标", unit: null },
        { key: "value", label: "数值", unit: null },
        { key: "unit", label: "单位", unit: null },
      ],
      rows: [
        { metric: "双 AWP 回合", value: awp.doubleAwpRoundCount, unit: "回合" },
        {
          metric: "符合条件回合",
          value: awp.qualifiedRoundCount,
          unit: "回合",
        },
        { metric: "占比", value: awp.eligibleRoundShare, unit: "比例 (0–1)" },
        { metric: "胜回合", value: awp.wins, unit: "回合" },
        { metric: "首杀", value: awp.openingKills, unit: null },
        { metric: "首死", value: awp.openingDeaths, unit: null },
        { metric: "AWP kills", value: awp.awpKills, unit: null },
        { metric: "AWP damage", value: awp.awpDamage, unit: null },
      ],
    });
    sections.push({
      title: "双 AWP 代表回合",
      text: [
        `双 AWP ${awp.doubleAwpRoundCount}/${awp.qualifiedRoundCount} 回合；获胜 ${awp.wins}；首杀/首死 ${awp.openingKills}/${awp.openingDeaths}。`,
      ],
      columns: [
        { key: "match", label: "比赛", unit: null },
        { key: "round", label: "回合", unit: null },
        { key: "tick", label: "Tick", unit: null },
      ],
      rows: awp.evidence.slice(0, 1).map((row) => ({
        match: row.matchId,
        round: row.roundNumber,
        tick: row.tick ?? null,
      })),
      sampleDescription: `${awp.qualifiedRoundCount} 个符合条件回合`,
      limitations: awp.limitations,
    });
  }
  return captureAnalysisResult({
    ...source,
    title: `${teamName} · 位置与职责`,
    page: "roles",
    conditions: [
      ...source.conditions,
      `地图：${matrix?.mapName ?? state.matrixMapName ?? "未选择"}`,
      `阵营：${state.matrixSide}`,
    ],
    sections,
    limitations: omitted,
  });
}
