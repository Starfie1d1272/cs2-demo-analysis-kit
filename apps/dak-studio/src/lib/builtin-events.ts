// 内置赛事/示例 registry —— 与在线赛事共用同一条导入管线（importEventAssetArchive）
// 与 EventGallery 卡片 UI。
//
// 0.7.0：Stage3/Playoff 已迁至 installer 预装模式（放入 userdata/bundled-events/，
// Python 静态服务暴露 /bundled-events/，前端通过本地 URL 加载）。
// BUILTIN_EVENTS 只保留小 sample；大赛事走 bundled-events 发现层 + R2 在线清单。
import samplePackageUrl from "../../../../fixtures/input/sample-pro-finals-2026.zip?url";

/** 内置条目：与在线赛事共用展示形状（slug/name/description/group），载入即走 event 包导入路径。 */
export interface BuiltinEvent {
  slug: string;
  name: string;
  description: string;
  group?: string;
  /** 随包发布的 event-package zip（Vite ?url，构建后为静态资源路径）。 */
  packageUrl: string;
}

export const BUILTIN_EVENTS: BuiltinEvent[] = [
  {
    slug: "pro-samples-2026",
    name: "示例职业局",
    description: "IEM Kraków 2026 决赛（FURIA vs Vitality）+ PGL Astana 2026 决赛（Spirit vs Falcons），两场 BO5 共 7 图，含真实 BP。一键载入即可体验完整分析。",
    packageUrl: samplePackageUrl,
  },
];
