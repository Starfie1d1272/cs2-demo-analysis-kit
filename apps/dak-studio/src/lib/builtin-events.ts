// 内置赛事/示例 registry —— 打包进 App 的本地 event-package（不走 R2），与在线赛事共用同一条
// 导入管线（importEventAssetArchive）与 EventGallery 卡片 UI。BP 直接写在包里（见
// scripts/build-sample-event.mjs），不再按队名匹配回填——内置示例与真实赛事完全同一路径。
//
// 占位框架：往 BUILTIN_EVENTS 加一条（slug/name/description + 随包发布的 event-package zip）即可
// 让新内置赛事出现在画廊，文案走 name/description，无需改组件代码。
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
