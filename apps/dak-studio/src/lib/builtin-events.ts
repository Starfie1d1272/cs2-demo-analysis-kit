// 内置赛事/示例 registry —— 打包进 App 的本地 event-package（不走 R2），与在线赛事共用同一条
// 导入管线（importEventAssetArchive）与 EventGallery 卡片 UI。BP 直接写在包里（见
// scripts/build-sample-event.mjs），不再按队名匹配回填——内置示例与真实赛事完全同一路径。
//
// 往 BUILTIN_EVENTS 加一条（slug/name/description/group + Vite ?url import）即可让新内置赛事
// 出现在画廊，无需改组件代码。注意：大文件（>10MB）不入 git —— 由 `scripts/cologne-build.mjs`
// 产出后手工拷到 fixtures/input/，再加到 .gitignore。package.sh 构建前确保文件存在。
import samplePackageUrl from "../../../../fixtures/input/sample-pro-finals-2026.zip?url";
// 科隆 Major 2026 内置阶段（cologne-build 产出后 cp 到 fixtures/input/，随仓库分发）
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
