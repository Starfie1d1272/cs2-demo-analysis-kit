import { useCallback, useEffect, useState } from "react";
import {
  checkAssets,
  repairAssets,
  supportsAssetHealth,
  type AssetStatus,
} from "../lib/asset-health-bridge";

/**
 * 启动资产完整性校验横幅。
 *
 * 四种状态：
 * - ok           不显示（修复完成后短暂绿色提示）
 * - not_installed 蓝色横幅（R2 不可达）
 * - incomplete   黄色横幅 "资产缺失，部分分析可能降级"
 * - corrupt      红色横幅 "资产校验失败"
 *
 * 仅 pywebview 桌面环境生效（浏览器 dev 不触发）。
 */

export function AssetHealthBanner() {
  const [status, setStatus] = useState<AssetStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairProgress, setRepairProgress] = useState("");
  const [repairDone, setRepairDone] = useState(false);

  const available = supportsAssetHealth();

  const check = useCallback(async (deep = false) => {
    const result = await checkAssets(deep);
    if (result) setStatus(result);
  }, []);

  useEffect(() => {
    if (!available) return;
    const timer = setTimeout(() => void check(false), 1000);
    return () => clearTimeout(timer);
  }, [available, check]);

  if (!available || !status) return null;

  if (status.status === "ok" && !repairDone) return null;
  if (status.status === "ok" && repairDone) {
    setTimeout(() => { setRepairDone(false); setDismissed(true); }, 5000);
    return (
      <div className="stu-notice stu-notice-ok">
        <span>✓ 资产完整，所有内置赛事和地图数据就绪。</span>
      </div>
    );
  }

  if (dismissed) return null;

  const missingEvents = status.missingEvents ?? [];
  const missingTris = status.missingTris ?? [];
  const totalMissing = missingEvents.length + missingTris.length;

  if (repairing) {
    return (
      <div className="stu-notice stu-notice-info">
        <span>{repairProgress || "正在修复资产…"}</span>
        {repairProgress.includes("完成") && (
          <button type="button" className="stu-button-sm" onClick={() => { setRepairing(false); setRepairDone(true); void check(false); }}>
            刷新状态
          </button>
        )}
      </div>
    );
  }

  const doRepair = async () => {
    setRepairing(true);
    setRepairProgress("准备修复…");
    const job = await repairAssets(
      [
        ...missingEvents.map((e) => ({ type: "event" as const, slug: e.slug })),
        ...missingTris.map((t) => ({ type: "tri" as const, mapName: t.mapName })),
      ],
      (j) => setRepairProgress(`下载中 ${j.current + 1}/${j.total}…`),
    );
    setRepairing(false);
    if (job) {
      setRepairProgress(job.errors.length ? `修复完成，${job.errors.length} 项失败` : "修复完成");
    } else {
      setRepairProgress("修复失败");
    }
  };

  if (status.status === "not_installed") {
    return (
      <div className="stu-notice stu-notice-info">
        <span>未安装官方赛事资产。请检查网络连接后重试，或使用 Full Portable Zip 版本。</span>
        <button type="button" className="stu-button-sm" onClick={() => void check(false)}>重试检查</button>
        <button type="button" className="stu-button-sm" onClick={() => setDismissed(true)}>以后再说</button>
      </div>
    );
  }

  if (status.status === "incomplete") {
    return (
      <div className="stu-notice stu-notice-warn">
        <span>
          检测到 {missingEvents.length} 个赛事包和 {missingTris.length} 个地图数据缺失，部分分析可能降级。
          {missingTris.length > 0 && (
            <span style={{ marginLeft: "0.5em" }}>
              {missingTris.map((t) => `${t.mapName}（${t.requiredBy.join("、")} 需要）`).join("；")}
            </span>
          )}
        </span>
        <button type="button" className="stu-button-sm" onClick={() => void doRepair()}>修复安装</button>
        <button type="button" className="stu-button-sm" onClick={() => setDismissed(true)}>忽略</button>
      </div>
    );
  }

  if (status.status === "corrupt") {
    return (
      <div className="stu-notice stu-notice-err">
        <span>资产校验失败（{totalMissing} 项），建议重新下载。</span>
        <button type="button" className="stu-button-sm" onClick={() => void check(true)}>重新校验</button>
        <button type="button" className="stu-button-sm" onClick={() => void doRepair()}>修复安装</button>
      </div>
    );
  }

  return null;
}
