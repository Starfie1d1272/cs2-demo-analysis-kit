import type { MatchWorkspaceModel } from "./models/workspace.js";

// ── 赛事报表（Markdown）─────────────────────────────────────────────────────

/** 单场比赛报告：half-by-half、关键回合、记分板。给主办方发布用。 */
export function buildMatchReportMarkdown(model: MatchWorkspaceModel): string {
  const lines: string[] = [];
  lines.push(`# ${model.title}`);
  lines.push("");
  lines.push(`**${model.mapName}** · 比分 **${model.scoreline}**`);
  lines.push("");
  for (const beat of model.overview.story) {
    lines.push(`> ${beat}`);
  }
  lines.push("");
  lines.push("## 记分板");
  lines.push("");
  lines.push("| 选手 | 队伍 | K/D/A | ADR | KAST | RR |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of model.scoreboard) {
    const teamName = row.teamKey === "teamA" ? model.teams.teamA.name : model.teams.teamB.name;
    lines.push(
      `| ${row.name} | ${teamName} | ${row.kills}/${row.deaths}/${row.assists} | ${row.adr.toFixed(1)} | ${row.kast.toFixed(1)}% | ${row.accountRR.toFixed(2)} |`
    );
  }
  lines.push("");
  lines.push("## 关键回合");
  lines.push("");
  if (model.reportHighlights.length === 0) {
    lines.push("（本场无 3+ 多杀或残局回合）");
  }
  for (const row of model.reportHighlights) {
    lines.push(`- **R${row.roundNumber}**（${row.scoreBefore}，${row.winnerSide.toUpperCase()} 胜）：${row.tags.join("、")}`);
  }
  lines.push("");
  lines.push("## 经济与回合");
  lines.push("");
  lines.push("| 回合 | 比分 | 胜方 | A 队经济 | B 队经济 | 结束方式 |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of model.rounds) {
    lines.push(
      `| R${row.roundNumber} | ${row.scoreBefore} | ${row.winnerSide.toUpperCase()} | ${row.teamAEconomy} | ${row.teamBEconomy} | ${row.endReason} |`
    );
  }
  lines.push("");
  lines.push(`---\n由 DAK Studio 生成 · cs2-demo-analysis-kit`);
  return lines.join("\n");
}
