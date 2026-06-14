export interface DefaultAnchor {
  /** 展示名（社区叫法），如 "A1"。 */
  name: string;
  /** 归并到该 anchor 的原始 callout id 列表。 */
  callouts: string[];
}

export interface SideDefaults {
  /** anchorId -> anchor（有序：决定 basis 展示顺序）。 */
  anchors: Record<string, DefaultAnchor>;
  /** 非 default callout 的角色（advanced/ct/terminal）；不在表内的为 other。 */
  roles: Record<string, "advanced" | "ct" | "terminal">;
}

export interface MapDefaults {
  t: SideDefaults;
  ct: SideDefaults;
}

export type DefaultPositionSide = "t" | "ct";

export type CalloutRole =
  | { kind: "default"; anchorId: string }
  | { kind: "advanced" }
  | { kind: "ct" }
  | { kind: "terminal" }
  | { kind: "other" };

export const DEFAULT_POSITIONS: Record<string, MapDefaults> = {
  de_mirage: {
    t: {
      anchors: {
        a_ramp: { name: "A1", callouts: ["PalaceAlley", "TRamp"] },
        a_palace: { name: "A二楼", callouts: ["PalaceInterior", "Scaffolding"] },
        mid: { name: "中路", callouts: ["TopofMid", "SideAlley", "Middle"] },
        underpass: { name: "下水道", callouts: ["Underpass"] },
        b_apps: { name: "B二楼", callouts: ["House", "BackAlley", "Apartments"] },
      },
      roles: {
        Catwalk: "advanced",
        Connector: "advanced",
        Stairs: "advanced",
        Ladder: "advanced",
        Jungle: "ct",
        SnipersNest: "ct",
        Shop: "ct",
        Truck: "ct",
        BombsiteA: "terminal",
        BombsiteB: "terminal",
        CTSpawn: "terminal",
      },
    },
    ct: {
      anchors: {
        a_site: { name: "A点", callouts: ["BombsiteA", "Stairs", "Jungle"] },
        mid: { name: "中路", callouts: ["SnipersNest", "Connector", "Catwalk", "Ladder"] },
        b_site: { name: "B点", callouts: ["BombsiteB", "Shop", "Truck"] },
      },
      roles: {
        PalaceAlley: "advanced",
        TopofMid: "advanced",
        Apartments: "advanced",
        TSpawn: "terminal",
        Underpass: "terminal",
      },
    },
  },
};

function sideDefaults(mapName: string, side: DefaultPositionSide): SideDefaults | null {
  return DEFAULT_POSITIONS[mapName]?.[side] ?? null;
}

export function roleOf(mapName: string, side: DefaultPositionSide, callout: string): CalloutRole {
  const defaults = sideDefaults(mapName, side);
  if (!defaults) return { kind: "other" };

  for (const [anchorId, anchor] of Object.entries(defaults.anchors)) {
    if (anchor.callouts.includes(callout)) return { kind: "default", anchorId };
  }

  const role = defaults.roles[callout];
  return role ? { kind: role } : { kind: "other" };
}

export function anchorOf(mapName: string, side: DefaultPositionSide, callout: string): string | null {
  const role = roleOf(mapName, side, callout);
  return role.kind === "default" ? role.anchorId : null;
}
