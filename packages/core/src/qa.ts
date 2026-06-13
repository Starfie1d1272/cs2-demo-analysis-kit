import type { DemoPackage, PlayerScoreboardRow, QaIssue, QaReport } from "@cs2dak/contract";
import { isNamedWeapon, normalizeWeapon, round } from "./utils.js";

export type ScoreboardFieldAvailability = PlayerScoreboardRow["fieldAvailability"];

export function buildQaReport(pkg: DemoPackage): QaReport {
  const issues: QaIssue[] = [];
  const roundNumbers = pkg.rounds.map((round) => round.roundNumber).sort((a, b) => a - b);
  const roundsByNumber = new Map(pkg.rounds.map((round) => [round.roundNumber, round]));

  for (let i = 0; i < roundNumbers.length; i += 1) {
    if (roundNumbers[i] !== i + 1) {
      issues.push({
        severity: "error",
        code: "rounds.not_contiguous",
        message: `Round numbers should be contiguous from 1; found ${roundNumbers[i]} at index ${i}.`,
        path: "rounds"
      });
      break;
    }
  }

  const teamAScore = pkg.rounds.filter((round) => round.winnerTeamKey === "teamA").length;
  const teamBScore = pkg.rounds.filter((round) => round.winnerTeamKey === "teamB").length;
  if (teamAScore !== pkg.match.teamA.score || teamBScore !== pkg.match.teamB.score) {
    issues.push({
      severity: "error",
      code: "score.round_winners_mismatch",
      message: `Match score is ${pkg.match.teamA.score}:${pkg.match.teamB.score}, but rounds imply ${teamAScore}:${teamBScore}.`,
      path: "match"
    });
  }

  for (const roundRow of pkg.rounds) {
    if (!(roundRow.startTick <= roundRow.freezeEndTick && roundRow.freezeEndTick <= roundRow.endTick)) {
      issues.push({
        severity: "error",
        code: "rounds.invalid_tick_order",
        message: `Round ${roundRow.roundNumber} has invalid tick order.`,
        path: "rounds"
      });
    }
    const expectedWinnerSide = roundRow.winnerTeamKey === "teamA" ? roundRow.teamASide : roundRow.teamBSide;
    if (roundRow.winnerSide !== expectedWinnerSide) {
      issues.push({
        severity: "error",
        code: "rounds.winner_side_mismatch",
        message: `Round ${roundRow.roundNumber} winnerSide does not match winnerTeamKey side.`,
        path: "rounds"
      });
    }
  }

  const checkEventTick = (kind: string, roundNumber: number, tick: number, index: number, allowFreeze = false) => {
    const roundRow = roundsByNumber.get(roundNumber);
    if (!roundRow) {
      issues.push({
        severity: "error",
        code: `${kind}.unknown_round`,
        message: `${kind} event ${index} references missing round ${roundNumber}.`,
        path: kind
      });
      return;
    }
    const minTick = allowFreeze ? roundRow.startTick : roundRow.freezeEndTick;
    if (tick < minTick || tick > roundRow.endTick) {
      issues.push({
        severity: "error",
        code: `${kind}.tick_outside_round`,
        message: `${kind} event ${index} tick ${tick} is outside round ${roundNumber} active window.`,
        path: kind
      });
    }
  };

  const expectedEconomyRows = pkg.players.length * pkg.rounds.length;
  if (pkg.playerEconomies.length < expectedEconomyRows) {
    issues.push({
      severity: "warning",
      code: "economy.coverage_incomplete",
      message: `Expected ${expectedEconomyRows} player economy rows, found ${pkg.playerEconomies.length}.`,
      path: "playerEconomies"
    });
  }

  pkg.kills.forEach((kill, index) => {
    checkEventTick("kills", kill.roundNumber, kill.tick, index);
    if (kill.killerIndex !== null && kill.killerIndex >= pkg.players.length) {
      issues.push({
        severity: "warning",
        code: "kill.unknown_killer",
        message: `Killer playerIndex ${kill.killerIndex} is out of range (players.length=${pkg.players.length}).`,
        path: "kills"
      });
    }
    if (kill.victimIndex >= pkg.players.length) {
      issues.push({
        severity: "error",
        code: "kill.unknown_victim",
        message: `Victim playerIndex ${kill.victimIndex} is out of range (players.length=${pkg.players.length}).`,
        path: "kills"
      });
    }
  });

  pkg.damages.forEach((damage, index) => checkEventTick("damages", damage.roundNumber, damage.tick, index, true));
  pkg.blinds.forEach((blind, index) => checkEventTick("blinds", blind.roundNumber, blind.tick, index));
  pkg.grenades.forEach((grenade, index) => {
    checkEventTick("grenades", grenade.roundNumber, grenade.throwTick, index);
    checkEventTick("grenades", grenade.roundNumber, grenade.effectTick, index);
  });

  const bombEventsByRound = new Map<number, typeof pkg.bombs>();
  pkg.bombs.forEach((bomb, index) => {
    checkEventTick("bombs", bomb.roundNumber, bomb.tick, index);
    const events = bombEventsByRound.get(bomb.roundNumber) ?? [];
    events.push(bomb);
    bombEventsByRound.set(bomb.roundNumber, events);
    if (bomb.actorIndex !== null && bomb.actorIndex >= pkg.players.length) {
      issues.push({
        severity: "warning",
        code: "bomb.unknown_actor",
        message: `Bomb actor playerIndex ${bomb.actorIndex} is out of range (players.length=${pkg.players.length}).`,
        path: "bombs"
      });
    }
  });

  for (const [roundNumber, bombs] of bombEventsByRound) {
    const sorted = [...bombs].sort((a, b) => a.tick - b.tick);
    const planted = sorted.find((bomb) => bomb.type === "planted");
    const terminal = sorted.find((bomb) => bomb.type === "exploded" || bomb.type === "defused");
    if (terminal && (!planted || planted.tick > terminal.tick)) {
      issues.push({
        severity: "error",
        code: "bomb.lifecycle_without_plant",
        message: `Round ${roundNumber} has ${terminal.type} before any planted event.`,
        path: "bombs"
      });
    }
  }

  const spatialRows = pkg.kills.filter((kill) => kill.victimPosition.x !== 0 || kill.victimPosition.y !== 0).length;
  if (pkg.kills.length > 0 && spatialRows === 0) {
    issues.push({
      severity: "warning",
      code: "spatial.no_real_kill_positions",
      message: "Kills exist, but no non-origin victim positions were found.",
      path: "kills"
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  return {
    ok: errorCount === 0,
    summary: {
      issueCount: issues.length,
      errorCount,
      warningCount
    },
    issues
  };
}

export function fieldAvailability(pkg: DemoPackage): ScoreboardFieldAvailability {
  return {
    playerStats: pkg.playerStats.length > 0 ? "available" : "missing",
    economy: pkg.playerEconomies.length > 0 ? "available" : "missing",
    rounds: pkg.rounds.length > 0 ? "available" : "missing",
    richKills: richKillAvailability(pkg),
    damages: pkg.damages.length > 0 ? "available" : "missing",
    bombs: pkg.bombs.length > 0 ? "available" : "missing"
  };
}

export function fieldConfidence(availability: ScoreboardFieldAvailability): number {
  const values = [
    availability.playerStats,
    availability.economy,
    availability.rounds,
    availability.richKills,
    availability.damages,
    availability.bombs
  ].map<number>((value) => value === "available" ? 1 : value === "partial" ? 0.5 : 0);
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 3);
}

function richKillAvailability(pkg: DemoPackage): ScoreboardFieldAvailability["richKills"] {
  if (pkg.kills.length === 0) return "missing";
  const hasFlags = pkg.kills.some((kill) => "throughSmoke" in kill && "noScope" in kill && "penetratedObjects" in kill);
  const activeWeaponsAreNames = pkg.kills.some((kill) => kill.killerActiveWeapon && isNamedWeapon(normalizeWeapon(kill.killerActiveWeapon)));
  if (hasFlags && activeWeaponsAreNames) return "available";
  if (hasFlags) return "partial";
  return "missing";
}
