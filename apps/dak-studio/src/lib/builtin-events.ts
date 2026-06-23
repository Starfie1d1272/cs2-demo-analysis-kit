// 内置赛事/示例 registry —— 与在线赛事共用同一条导入管线（importEventAssetArchive）
// 与 EventGallery 卡片 UI。
//
// 0.7.0 迁移中：Stage3/Playoff 当前仍通过 Vite ?url import 打进 bundle（临时），
// 下一步将迁至 installer 预装模式（放入 userdata/bundled-events/，
// Python 静态服务暴露 /bundled-events/，前端通过本地 URL 加载）。
// 完成后 BUILTIN_EVENTS 只保留小 sample，大赛事走 bundled-events 发现层。
import samplePackageUrl from "../../../../fixtures/input/sample-pro-finals-2026.zip?url";
import stage3PackageUrl from "../../../../fixtures/input/iem-cologne-major-2026-stage3.zip?url";
import playoffPackageUrl from "../../../../fixtures/input/iem-cologne-major-2026-playoff.zip?url";

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
  {
    slug: "iem-cologne-major-2026-stage3",
    name: "IEM Cologne Major 2026 — 阶段三",
    description: "科隆 Major 2026 阶段三（Swiss BO3），16 队 33 场，含全量 BP + 对枪/反应分析。",
    group: "iem-cologne-major-2026",
    packageUrl: stage3PackageUrl,
  },
  {
    slug: "iem-cologne-major-2026-playoff",
    name: "IEM Cologne Major 2026 — 淘汰赛",
    description: "科隆 Major 2026 淘汰赛（8 强单败，决赛 BO5），QF 4 场 + SF 2 场 + GF 1 场。",
    group: "iem-cologne-major-2026",
    packageUrl: playoffPackageUrl,
  },
];
