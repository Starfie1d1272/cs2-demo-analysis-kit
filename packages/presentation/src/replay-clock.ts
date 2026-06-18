export type ReplayClockPhase = "freeze" | "round" | "bomb" | "round-end";

export interface ReplayClockRound {
  freezeEndTick: number;
  officialEndTick?: number;
  targetEndTick?: number;
  bomb: {
    plantTick: number;
    defuseTick: number | null;
    explodeTick: number | null;
  } | null;
}

export interface ReplayClockState {
  phase: ReplayClockPhase;
  label: string;
  secondsRemaining: number | null;
  display: string;
}

const STANDARD_ROUND_SECONDS = 115;
const STANDARD_BOMB_SECONDS = 40;

export function formatClockSeconds(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function deriveReplayClock(
  round: ReplayClockRound,
  currentTick: number,
  tickrate: number,
): ReplayClockState {
  const safeTickrate = tickrate > 0 ? tickrate : 64;
  if (currentTick < round.freezeEndTick) {
    return { phase: "freeze", label: "准备", secondsRemaining: null, display: "准备" };
  }

  if (round.officialEndTick != null && currentTick >= round.officialEndTick) {
    const endTick = round.targetEndTick ?? round.officialEndTick;
    const secondsRemaining = Math.max(0, (endTick - currentTick) / safeTickrate);
    return {
      phase: "round-end",
      label: "下一回合",
      secondsRemaining,
      display: formatClockSeconds(secondsRemaining),
    };
  }

  if (round.bomb && currentTick >= round.bomb.plantTick) {
    const bombDuration = round.bomb.explodeTick != null
      ? Math.max(0, (round.bomb.explodeTick - round.bomb.plantTick) / safeTickrate)
      : STANDARD_BOMB_SECONDS;
    const secondsRemaining = Math.max(0, bombDuration - (currentTick - round.bomb.plantTick) / safeTickrate);
    return { phase: "bomb", label: "C4", secondsRemaining, display: formatClockSeconds(secondsRemaining) };
  }

  const secondsRemaining = Math.max(0, STANDARD_ROUND_SECONDS - (currentTick - round.freezeEndTick) / safeTickrate);
  return { phase: "round", label: "回合", secondsRemaining, display: formatClockSeconds(secondsRemaining) };
}

