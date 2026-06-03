import { demoPackageSchema, type DemoPackage, type TeamKey } from "@cs2dak/contract";

export function parsePackageJson(text: string): unknown {
  return JSON.parse(text.replace(/\bNaN\b/g, "null"));
}

export function normalizeDemoPackage(input: unknown): DemoPackage {
  const raw = input as Record<string, unknown>;
  const manifest = raw.manifest as Record<string, unknown> | undefined;

  if (manifest?.schemaVersion === "cs2-demo-format/1.0") {
    return demoPackageSchema.parse(normalizeV1Package(raw));
  }

  return demoPackageSchema.parse(input);
}

function normalizeV1Package(raw: Record<string, unknown>): Record<string, unknown> {
  const match = raw.match as Record<string, unknown>;
  const rounds = asRecords(raw.rounds).filter((round) => numberValue(round.roundNumber) > 0);
  const roundByNumber = new Map(rounds.map((round) => [numberValue(round.roundNumber), round]));

  return {
    manifest: {
      ...(raw.manifest as Record<string, unknown>),
      schemaVersion: "cs2-demo-format/2.0"
    },
    match: {
      ...match,
      durationSeconds: numberValue(match.durationSeconds) > 0 ? match.durationSeconds : undefined
    },
    players: raw.players,
    rounds: rounds.map((round) => normalizeV1Round(round)),
    playerEconomies: asRecords(raw.playerEconomies)
      .filter((row) => numberValue(row.roundNumber) > 0)
      .map((row) => ({ ...row, type: normalizeEconomyType(row.type) })),
    playerStats: raw.playerStats ?? [],
    kills: asRecords(raw.kills)
      .filter((kill) => numberValue(kill.roundNumber) > 0)
      .map((kill) => normalizeV1Kill(kill, roundByNumber)),
    damages: asRecords(raw.damages)
      .filter((row) => numberValue(row.roundNumber) > 0)
      .map((row) => normalizeV1Damage(row, roundByNumber)),
    blinds: asRecords(raw.blinds).filter((row) => numberValue(row.roundNumber) > 0),
    grenades: asRecords(raw.grenades)
      .filter((row) => numberValue(row.roundNumber) > 0)
      .map((row) => normalizeV1Grenade(row, roundByNumber)),
    clutches: asRecords(raw.clutches).filter((row) => numberValue(row.roundNumber) > 0)
  };
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row)) : [];
}

function normalizeV1Round(round: Record<string, unknown>): Record<string, unknown> {
  return {
    ...round,
    startTick: positiveInt(round.startTick),
    freezeEndTick: positiveInt(round.freezeEndTick),
    endTick: positiveInt(round.endTick),
    teamASide: normalizeSide(round.teamASide) ?? "t",
    teamBSide: normalizeSide(round.teamBSide) ?? "ct",
    teamAEconomy: normalizeEconomyType(round.teamAEconomy),
    teamBEconomy: normalizeEconomyType(round.teamBEconomy),
    winnerSide: normalizeSide(round.winnerSide) ?? sideForTeam(round.winnerTeamKey, round) ?? "t"
  };
}

function normalizeV1Kill(kill: Record<string, unknown>, rounds: Map<number, Record<string, unknown>>): Record<string, unknown> {
  const round = rounds.get(numberValue(kill.roundNumber));
  return {
    ...kill,
    tick: positiveInt(kill.tick),
    killerTeamKey: normalizeTeamKey(kill.killerTeamKey),
    victimTeamKey: normalizeTeamKey(kill.victimTeamKey) ?? "teamA",
    killerSide: normalizeSide(kill.killerSide) ?? sideForTeam(kill.killerTeamKey, round),
    victimSide: normalizeSide(kill.victimSide) ?? sideForTeam(kill.victimTeamKey, round) ?? "t",
    killerPosition: sanitizeNullablePosition(kill.killerPosition),
    victimPosition: sanitizePosition(kill.victimPosition)
  };
}

function normalizeV1Damage(row: Record<string, unknown>, rounds: Map<number, Record<string, unknown>>): Record<string, unknown> {
  const round = rounds.get(numberValue(row.roundNumber));
  return {
    ...row,
    tick: positiveInt(row.tick),
    weapon: typeof row.weapon === "string" && row.weapon.length > 0 ? row.weapon : "unknown",
    attackerTeamKey: normalizeTeamKey(row.attackerTeamKey),
    victimTeamKey: normalizeTeamKey(row.victimTeamKey) ?? "teamA",
    attackerSide: normalizeSide(row.attackerSide) ?? sideForTeam(row.attackerTeamKey, round),
    victimSide: normalizeSide(row.victimSide) ?? sideForTeam(row.victimTeamKey, round) ?? "t",
    attackerPosition: sanitizeNullablePosition(row.attackerPosition),
    victimPosition: sanitizeNullablePosition(row.victimPosition) ?? undefined
  };
}

function normalizeV1Grenade(row: Record<string, unknown>, rounds: Map<number, Record<string, unknown>>): Record<string, unknown> {
  const round = rounds.get(numberValue(row.roundNumber));
  const teamKey = normalizeTeamKey(row.throwerTeamKey ?? row.teamKey);
  return {
    roundNumber: row.roundNumber,
    tick: positiveInt(row.effectTick ?? row.throwTick ?? row.tick),
    steamId64: row.throwerSteamId64 ?? row.steamId64 ?? null,
    teamKey,
    side: normalizeSide(row.throwerSide ?? row.side) ?? sideForTeam(teamKey, round),
    grenadeType: typeof row.grenade === "string" && row.grenade.length > 0 ? row.grenade : row.grenadeType ?? "unknown",
    eventType: row.eventType ?? "effect",
    position: sanitizeNullablePosition(row.effectPosition ?? row.throwPosition ?? row.position)
  };
}

function sideForTeam(teamKey: unknown, round: Record<string, unknown> | undefined): "t" | "ct" | null {
  const team = normalizeTeamKey(teamKey);
  if (!team || !round) {
    return null;
  }
  return normalizeSide(team === "teamA" ? round.teamASide : round.teamBSide);
}

function normalizeTeamKey(value: unknown): TeamKey | null {
  return value === "teamA" || value === "teamB" ? value : null;
}

function normalizeSide(value: unknown): "t" | "ct" | null {
  return value === "t" || value === "ct" ? value : null;
}

function normalizeEconomyType(value: unknown): "pistol" | "eco" | "semi" | "force" | "full" | "conversion" {
  return value === "pistol" || value === "eco" || value === "semi" || value === "force" || value === "full" || value === "conversion" ? value : "full";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function positiveInt(value: unknown): number {
  return Math.max(1, Math.trunc(numberValue(value)));
}

function sanitizeNullablePosition(value: unknown): { x: number; y: number; z: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const point = value as Record<string, unknown>;
  const x = numberValue(point.x);
  const y = numberValue(point.y);
  const z = numberValue(point.z);
  if (x === 0 && y === 0 && z === 0) {
    return null;
  }
  return { x, y, z };
}

function sanitizePosition(value: unknown): { x: number; y: number; z: number } {
  return sanitizeNullablePosition(value) ?? { x: 0, y: 0, z: 0 };
}
