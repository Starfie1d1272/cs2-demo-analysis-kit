export interface TacticalFakeInput {
  side: "t" | "ct";
  targetSite: "a" | "b" | null;
  siteEntries: { a: { entrants: number }; b: { entrants: number } };
  grenades: Array<{ type: string; targetRegion: "a" | "b" | "mid" | "other" | "unknown" }>;
  c4Route: { endRegion: "a" | "b" | "mid" | "other" | null; rotated: boolean } | null;
}

export interface TacticalInferenceResult {
  suspected: boolean;
  confidence?: "low" | "medium";
  reason?: string;
}

/** 基于独立的道具、进点与 C4 事实推断纯道具佯攻。 */
export function inferTacticalFake(fact: TacticalFakeInput): TacticalInferenceResult {
  if (fact.side !== "t" || !fact.targetSite) return { suspected: false };
  const other = fact.targetSite === "a" ? "b" : "a";
  const otherGrenades = fact.grenades.filter((grenade) => grenade.targetRegion === other);
  const smokeCount = otherGrenades.filter((grenade) => grenade.type === "smoke").length;
  if (otherGrenades.length < 3 || smokeCount < 1 || fact.siteEntries[other].entrants > 0) {
    return { suspected: false };
  }
  const c4Corroborates = Boolean(
    fact.c4Route && (fact.c4Route.endRegion === fact.targetSite || fact.c4Route.rotated),
  );
  const c4Note = fact.c4Route
    ? `；C4 ${fact.c4Route.rotated ? "中途转点" : "走向"}${fact.c4Route.endRegion ? fact.c4Route.endRegion.toUpperCase() : "？"}`
    : "";
  return {
    suspected: true,
    confidence: c4Corroborates ? "medium" : "low",
    reason: `${other.toUpperCase()} 区疑似纯道具佯攻 · Experimental（道具${otherGrenades.length}/烟${smokeCount}/进点0${c4Note}）`,
  };
}

