const ECONOMY_LABELS_CN: Record<string, string> = {
  pistol: "手枪局",
  eco: "纯ECO",
  semi: "半起",
  force: "强起",
  full: "全枪全弹",
  // conversion = 长枪局，与 full 同义，不单独区分。
  conversion: "全枪全弹",
};

/** 紧凑版经济标签（图表图例 / SVG 内联用）。 */
export const ECONOMY_LABEL_SHORT: Record<string, string> = {
  pistol: "手枪",
  eco: "Eco",
  semi: "半起",
  force: "强起",
  full: "长枪",
  conversion: "长枪",
};

/**
 * 经济类型中文标签（转化率面板 / 榜单展示用）。
 * 统一了 RivalHub `economy-series.ts` 的 `economyLabelCn`。未知值原样返回。
 */
export function economyLabelCn(type: string | null | undefined): string {
  if (!type) return "";
  return ECONOMY_LABELS_CN[type.toLowerCase()] ?? type;
}
