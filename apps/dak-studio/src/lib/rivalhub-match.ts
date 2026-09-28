export * from "@cs2dak/rivalhub-upload/match";
import { entryDate, type StudioDemoEntry } from "./library";
import type { StudioSeriesRecord } from "./series";
import type { RivalHubRemoteMap, RivalHubRemoteTeam, RivalHubMatchCandidate } from "@cs2dak/rivalhub-upload";
export function candidateFromSeriesMap(series: StudioSeriesRecord, map: RivalHubRemoteMap, eventTeams: RivalHubRemoteTeam[] = []): RivalHubMatchCandidate {
  return { series, map, eventTeams };
}
export function demoDateForEntry(entry: Pick<StudioDemoEntry, "fileName" | "meta">): string | null {
  return entryDate(entry);
}
