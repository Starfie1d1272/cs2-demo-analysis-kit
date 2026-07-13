import { OPENING_RESPONSIBILITY_WINDOW_VERSION, type ResponsibilityWindow } from "@cs2dak/contract";

/**
 * Default-position/responsibility evidence ends before normal mid-round rotations dominate.
 * Bump the public window version whenever this duration or anchoring semantics change.
 */
export const OPENING_RESPONSIBILITY_SECONDS = 20;

export function openingResponsibilityWindow(
  round: { freezeEndTick: number; endTick: number },
  tickrate: number,
): ResponsibilityWindow {
  return {
    version: OPENING_RESPONSIBILITY_WINDOW_VERSION,
    startTick: round.freezeEndTick,
    endTick: Math.min(round.endTick, round.freezeEndTick + Math.round(OPENING_RESPONSIBILITY_SECONDS * (tickrate || 64))),
    configuredSeconds: OPENING_RESPONSIBILITY_SECONDS,
  };
}
