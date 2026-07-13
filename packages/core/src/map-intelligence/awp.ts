import { decodeDelta, FLAG_ALIVE, type DemoPackage } from "@cs2dak/contract";
import { replayWeaponAt, type ReplayRoundContext, type ReplayRoundTrack } from "../tactics/replay-round-context.js";

function isAwp(weapon: string | null | undefined): boolean {
  return weapon?.trim().toLowerCase().replace(/^weapon_/, "") === "awp";
}

export interface AwpRoundFacts {
  freezeAwpOwnership: boolean | null;
  activeAwpSeconds: number | null;
  awpShots: number | null;
  awpKills: number | null;
}

/** AWP is deliberately exact-name only: SSG 08 and other snipers do not qualify. */
export function extractAwpRoundFacts(
  pkg: DemoPackage,
  context: ReplayRoundContext | null,
  track: ReplayRoundTrack | null,
): AwpRoundFacts {
  const playerIndex = track?.playerIndex ?? -1;
  const roundNumber = context?.round.roundNumber ?? -1;
  if (!context || !track) {
    return { freezeAwpOwnership: null, activeAwpSeconds: null, awpShots: null, awpKills: null };
  }
  const economy = pkg.playerEconomies.find((row) => row.roundNumber === roundNumber && row.playerIndex === playerIndex);
  const freezeAwpOwnership = economy ? isAwp(economy.primaryWeapon) : null;
  const frameSeconds = context.tickStep / (pkg.match.tickrate || 64);
  let activeFrames = 0;
  for (let index = 0; index < context.frameCount; index += 1) {
    const tick = context.startTick + index * context.tickStep;
    if (tick < context.round.freezeEndTick || tick > context.round.endTick) continue;
    if (((track.flags[index] ?? 0) & FLAG_ALIVE) === 0) continue;
    if (![track.x[index], track.y[index], track.z[index]].every((value) => value != null && Number.isFinite(value))) continue;
    if (isAwp(replayWeaponAt(context, track, index))) activeFrames += 1;
  }
  const shotTrack = pkg.shots?.tracks.find((row) => row.roundNumber === roundNumber && row.playerIndex === playerIndex);
  const awpShots = shotTrack
    ? decodeDelta(shotTrack.tick).filter((_, index) => isAwp(pkg.shots?.weaponDict[shotTrack.weapon[index] ?? -1])).length
    : pkg.shots ? 0 : null;
  const awpKills = pkg.kills
    .filter((kill) => kill.roundNumber === roundNumber && kill.killerIndex === playerIndex)
    .filter((kill) => isAwp(kill.killerActiveWeapon) || isAwp(kill.weapon)).length;
  return { freezeAwpOwnership, activeAwpSeconds: activeFrames * frameSeconds, awpShots, awpKills };
}
