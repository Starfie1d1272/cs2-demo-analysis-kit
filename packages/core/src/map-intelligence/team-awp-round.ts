import { FLAG_ALIVE, MAP_INTELLIGENCE_FACT_VERSION, type DemoPackage, type PlayerPositionRoundFact, type TeamAwpRoundFact } from "@cs2dak/contract";
import { replayWeaponAt, type ReplayRoundContext } from "../tactics/replay-round-context.js";
import { rounded } from "./spatial.js";

function isAwp(value: string | null): boolean { return value?.trim().toLowerCase().replace(/^weapon_/, "") === "awp"; }

function phase(roundNumber: number): TeamAwpRoundFact["scorePhase"] {
  return roundNumber <= 12 ? "first_half" : roundNumber <= 24 ? "second_half" : "overtime";
}

export function extractTeamAwpRoundFacts(pkg: DemoPackage, matchId: string, context: ReplayRoundContext | null, rows: PlayerPositionRoundFact[]): TeamAwpRoundFact[] {
  const round = context?.round ?? pkg.rounds.find((candidate) => candidate.roundNumber === rows[0]?.roundNumber);
  if (!round) return [];
  const firstKill = [...pkg.kills].filter((kill) => kill.roundNumber === round.roundNumber).sort((a, b) => a.tick - b.tick)[0] ?? null;
  const frameSeconds = context ? context.tickStep / (pkg.match.tickrate || 64) : 0;
  return (["teamA", "teamB"] as const).map((teamKey) => {
    const side = teamKey === "teamA" ? round.teamASide : round.teamBSide;
    const teamRows = rows.filter((row) => row.teamKey === teamKey);
    const roundStartAwpPlayerIndices = teamRows.filter((row) => row.freezeAwpOwnership).map((row) => row.playerIndex).sort((a, b) => a - b);
    let doubleFrames = 0;
    if (context) for (let frameIndex = 0; frameIndex < context.frameCount; frameIndex += 1) {
      const tick = context.startTick + frameIndex * context.tickStep;
      if (tick < round.freezeEndTick || tick > round.endTick) continue;
      const active = context.tracks.filter((track) => track.teamKey === teamKey && ((track.flags[frameIndex] ?? 0) & FLAG_ALIVE) !== 0 && isAwp(replayWeaponAt(context, track, frameIndex))).length;
      if (active >= 2) doubleFrames += 1;
    }
    const lastFrame = context ? Math.max(0, Math.min(context.frameCount - 1, Math.floor((round.endTick - context.startTick) / context.tickStep))) : -1;
    const won = round.winnerTeamKey === teamKey;
    const savedAwpPlayerIndices = !won && context ? context.tracks.filter((track) => track.teamKey === teamKey && ((track.flags[lastFrame] ?? 0) & FLAG_ALIVE) !== 0 && isAwp(replayWeaponAt(context, track, lastFrame))).map((track) => track.playerIndex).sort((a, b) => a - b) : [];
    const firstKillerTeam = firstKill?.killerIndex == null ? null : pkg.players[firstKill.killerIndex]?.teamKey ?? null;
    const firstVictimTeam = pkg.players[firstKill?.victimIndex ?? -1]?.teamKey ?? null;
    const available = teamRows.some((row) => row.activeAwpSeconds != null);
    return {
      analysisVersion: MAP_INTELLIGENCE_FACT_VERSION, matchId, mapName: pkg.match.mapName, roundNumber: round.roundNumber, teamKey, side,
      economyType: teamKey === "teamA" ? round.teamAEconomy : round.teamBEconomy,
      opponentEconomyType: teamKey === "teamA" ? round.teamBEconomy : round.teamAEconomy,
      scorePhase: phase(round.roundNumber), won, roundStartAwpPlayerIndices,
      doubleAwpActiveSeconds: context ? rounded(doubleFrames * frameSeconds) : null,
      awpActiveSeconds: available ? rounded(teamRows.reduce((sum, row) => sum + (row.activeAwpSeconds ?? 0), 0)) : null,
      awpShots: teamRows.some((row) => row.awpShots != null) ? teamRows.reduce((sum, row) => sum + (row.awpShots ?? 0), 0) : null,
      awpKills: teamRows.some((row) => row.awpKills != null) ? teamRows.reduce((sum, row) => sum + (row.awpKills ?? 0), 0) : null,
      awpDamage: null,
      openingKills: firstKillerTeam === teamKey ? 1 : 0, openingDeaths: firstVictimTeam === teamKey ? 1 : 0, savedAwpPlayerIndices,
      availability: teamRows[0]?.availability ?? { replay: "missing", nav: "missing", callouts: "missing", shots: "missing" },
    };
  });
}
