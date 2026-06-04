const ECONOMY_LABELS_CN: Record<string, string> = {
  pistol: "手枪局",
  eco: "纯ECO",
  semi: "半起",
  force: "强起",
  full: "全枪全弹",
  // conversion = 长枪局，与 full 同义，不单独区分。
  conversion: "全枪全弹",
};

/**
 * 经济类型中文标签（转化率面板 / 榜单展示用）。
 * 统一了 RivalHub `economy-series.ts` 的 `economyLabelCn`。未知值原样返回。
 */
export function economyLabelCn(type: string | null | undefined): string {
  if (!type) return "";
  return ECONOMY_LABELS_CN[type.toLowerCase()] ?? type;
}
