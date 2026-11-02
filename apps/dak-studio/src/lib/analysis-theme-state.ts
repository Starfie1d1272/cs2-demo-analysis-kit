import type { TableState } from "@cs2dak/presentation";
import type { LineupCluster, LineupClusterMode } from "@cs2dak/maps";

export type DuelTab = "records" | "opening" | "mechanics";
export type EvidenceFilter = "contested_duel" | "suppressed_kill" | "caught_off_guard" | "low_hp" | "third_party" | "all";
export type WeaponCategory = "步枪" | "狙击" | "手枪" | "冲锋枪" | "霰弹机枪" | "其他" | "全部";
export interface DuelPageState {
  tab: DuelTab; evidenceFilter: EvidenceFilter; weaponCategory: WeaponCategory;
  recordPage: number; openingMapName: string | null; openingPage: number;
  mechanicsPage: number; selectedRowId: string | null;
}
export const emptyDuelState = (): DuelPageState => ({ tab: "records", evidenceFilter: "contested_duel", weaponCategory: "全部", recordPage: 0, openingMapName: null, openingPage: 0, mechanicsPage: 0, selectedRowId: null });
export interface EconomyPageState { teamDetails: TableState; economyMatrix: TableState; smallBuyUpsets: TableState }
export const emptyEconomyState = (): EconomyPageState => ({ teamDetails: { sort: { key: "rw", direction: "desc" }, page: 0 }, economyMatrix: { sort: { key: null, direction: "desc" }, page: 0 }, smallBuyUpsets: { sort: { key: null, direction: "desc" }, page: 0 } });
export interface LineupsPageState { mode: LineupClusterMode; mapName: string | null; grenade: LineupCluster["grenade"] | null; side: LineupCluster["side"]; selectedClusterId: string | null; radarTopN: 20 | 40 | 60; table: TableState }
export const emptyLineupsState = (): LineupsPageState => ({ mode: "strict", mapName: null, grenade: null, side: null, selectedClusterId: null, radarTopN: 20, table: { sort: { key: "sample", direction: "desc" }, page: 0 } });
