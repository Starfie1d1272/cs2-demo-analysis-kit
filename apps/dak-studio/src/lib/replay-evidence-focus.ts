import type { EvidenceRef, MatchWorkspaceModel } from "@cs2dak/contract";

/**
 * 将当前 EvidenceRef 投影为回放参与者。只消费 presentation 已从 v3 player index
 * 唯一解析出的 stable ID；姓名不参与绑定。
 */
export function replayEvidenceParticipantIds(
  replay: MatchWorkspaceModel["replay"],
  evidence: EvidenceRef | null | undefined,
  subjectId?: string | null,
): string[] {
  if (!evidence) return [];
  const round = replay.rounds.find((candidate) => candidate.roundNumber === evidence.roundNumber);
  if (!round) return [];
  const validPlayers = new Set(round.players.map((player) => player.steamId64));
  const ids = new Set<string>();
  if (subjectId && validPlayers.has(subjectId)) ids.add(subjectId);

  for (const kill of round.kills) {
    const matches = evidence.eventKey === kill.id
      || (evidence.tick != null && kill.tick === evidence.tick);
    if (!matches) continue;
    if (kill.killerSteamId64 && validPlayers.has(kill.killerSteamId64)) ids.add(kill.killerSteamId64);
    if (kill.victimSteamId64 && validPlayers.has(kill.victimSteamId64)) ids.add(kill.victimSteamId64);
  }
  if (evidence.tick != null) {
    for (const grenade of round.grenades) {
      if (grenade.throwTick !== evidence.tick && grenade.effectTick !== evidence.tick) continue;
      if (grenade.throwerSteamId64 && validPlayers.has(grenade.throwerSteamId64)) ids.add(grenade.throwerSteamId64);
    }
  }
  return [...ids];
}
