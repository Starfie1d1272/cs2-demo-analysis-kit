export * from "./zones.js";
export * from "./routes.js";

export interface MapCalibration {
  mapName: string;
  posX: number;
  posY: number;
  scale: number;
  radarSize: number;
  lowerLevelMaxUnits?: number;
}

export interface RadarPoint {
  x: number;
  y: number;
  outOfBounds: boolean;
}

export const MAP_CALIBRATIONS: Record<string, MapCalibration> = {
  de_mirage: { mapName: "de_mirage", posX: -3230, posY: 1713, scale: 5, radarSize: 1024 },
  de_dust2: { mapName: "de_dust2", posX: -2476, posY: 3239, scale: 4.4, radarSize: 1024 },
  de_inferno: { mapName: "de_inferno", posX: -2087, posY: 3870, scale: 4.9, radarSize: 1024 },
  de_anubis: { mapName: "de_anubis", posX: -2796, posY: 3328, scale: 5.22, radarSize: 1024 },
  de_nuke: { mapName: "de_nuke", posX: -3453, posY: 2887, scale: 7, radarSize: 1024, lowerLevelMaxUnits: -495 },
  de_ancient: { mapName: "de_ancient", posX: -2953, posY: 2164, scale: 5, radarSize: 1024 },
  de_vertigo: { mapName: "de_vertigo", posX: -3168, posY: 1762, scale: 4, radarSize: 1024, lowerLevelMaxUnits: 11700 },
  de_train: { mapName: "de_train", posX: -2308, posY: 2078, scale: 4.082077, radarSize: 1024 },
  de_overpass: { mapName: "de_overpass", posX: -4831, posY: 1781, scale: 5.2, radarSize: 1024 },
  de_cache: { mapName: "de_cache", posX: -2000, posY: 3250, scale: 5.5, radarSize: 1024 }
};

export function getMapCalibration(mapName: string): MapCalibration | null {
  return MAP_CALIBRATIONS[mapName] ?? null;
}

export function worldToRadar(
  point: { x: number; y: number },
  calibration: MapCalibration
): RadarPoint {
  const x = (point.x - calibration.posX) / calibration.scale;
  const y = (calibration.posY - point.y) / calibration.scale;
  const pad = 96;

  return {
    x,
    y,
    outOfBounds:
      x < -pad ||
      x > calibration.radarSize + pad ||
      y < -pad ||
      y > calibration.radarSize + pad
  };
}
