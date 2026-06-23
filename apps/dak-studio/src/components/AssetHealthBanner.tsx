import { useCallback, useEffect, useState } from "react";

/**
 * 启动资产完整性校验横幅。
 *
 * 四种状态：
 * - ok           不显示（2s 后自动消失的绿色提示）
 * - not_installed 蓝色信息横幅 "可安装官方示例资产"
 * - incomplete   黄色警告横幅 "资产缺失，部分分析可能降级"
 * - corrupt      红色横幅 "资产校验失败"
 *
 * 仅 pywebview 桌面环境生效（浏览器 dev 不触发）。
 */

interface AssetStatus {
  status: "ok" | "not_installed" | "incomplete" | "corrupt";
  noManifest?: boolean;
  checkedAt?: string;
  assetSet?: string;
  missingEvents?: Array<{ slug: string; name: string; reason: string }>;
  missingTris?: Array<{ mapName: string; requiredBy: string[]; reason: string }>;
  canRepair?: boolean;
}

type RepairState = { id: string; state: string; progress: number; current: number; total: number; errors: string[] } | null;

interface NativeAssetApi {
  check_assets(deep?: boolean): Promise<AssetStatus>;
  repair_assets(items: Array<{ type: string; slug?: string; mapName?: string }>): Promise<string>;
  asset_repair_status(jobId: string): Promise<RepairState | null>;
}

function nativeApi(): NativeAssetApi | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = typeof window === "undefined" ? undefined : (window as any).pywebview?.api;
  return api?.check_assets ? (api as NativeAssetApi) : null;
}

export function AssetHealthBanner() {
  const [status, setStatus] = useState<AssetStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairProgress, setRepairProgress] = useState("");
  const [repairDone, setRepairDone] = useState(false);

  const api = nativeApi();

  const check = useCallback(async (deep = false) => {
    if (!api) return;
    try {
      const result = await api.check_assets(deep);
      setStatus(result);
    } catch {
      // 桥调用失败静默
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;
    // 启动后延迟 1s 再检查，避免阻塞首屏渲染
    const timer = setTimeout(() => void check(false), 1000);
    return () => clearTimeout(timer);
  }, [api, check]);

  if (!api || !status) return null;

  // ok 状态：短暂绿色提示后消失
  if (status.status === "ok" && !repairDone) return null;
  if (status.status === "ok" && repairDone) {
    // 修复完成提示 5s 后消失
    const timer = setTimeout(() => { setRepairDone(false); setDismissed(true); }, 5000);
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

  // 安装/修复中
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

  const repair = async () => {
    if (!api) return;
    setRepairing(true);
    setRepairProgress("准备修复…");
    try {
      const items: Array<{ type: string; slug?: string; mapName?: string }> = [
        ...missingEvents.map((e) => ({ type: "event", slug: e.slug })),
        ...missingTris.map((t) => ({ type: "tri", mapName: t.mapName })),
      ];
      if (items.length === 0) {
        setRepairing(false);
        return;
      }
      const jobId = await api.repair_assets(items);
      // 轮询进度
      const poll = setInterval(async () => {
        try {
          const job = await api.asset_repair_status(jobId);
          if (!job) { clearInterval(poll); setRepairing(false); return; }
          if (job.state === "done" || job.state === "error") {
            clearInterval(poll);
            setRepairProgress(job.errors.length ? `修复完成，${job.errors.length} 项失败` : "修复完成");
          } else {
            setRepairProgress(`下载中 ${job.current + 1}/${job.total}…`);
          }
        } catch {
          clearInterval(poll);
          setRepairing(false);
        }
      }, 800);
    } catch (e) {
      setRepairing(false);
      setRepairProgress(`修复失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const installOfficial = async () => {
    if (!api) return;
    setRepairing(true);
    setRepairProgress("正在安装官方示例资产…");
    try {
      const result = await api.check_assets(false); // 重新检查获取完整缺失列表
      const allEvents = result.missingEvents ?? [];
      const allTris = result.missingTris ?? [];
      // not_installed 状态下 miss 列表为空（因为 manifest 不存在），需要安装全部
      // 此时尝试获取 manifest 全部内容
      const items: Array<{ type: string; slug?: string; mapName?: string }> = [];
      if (allEvents.length > 0 || allTris.length > 0) {
        items.push(
          ...allEvents.map((e) => ({ type: "event" as const, slug: e.slug })),
          ...allTris.map((t) => ({ type: "tri" as const, mapName: t.mapName })),
        );
      } else {
        // not_installed: 没有任何缺失列表，尝试全量安装
        // 目前从 status 中无法获取完整 asset 列表，直接通知用户通过 installer 安装
        setRepairProgress("未找到安装清单，请用 Web Installer 安装或从 R2 手动下载赛事包。");
        setRepairing(false);
        return;
      }
      const jobId = await api.repair_assets(items);
      const poll = setInterval(async () => {
        try {
          const job = await api.asset_repair_status(jobId);
          if (!job) { clearInterval(poll); setRepairing(false); return; }
          if (job.state === "done" || job.state === "error") {
            clearInterval(poll);
            setRepairProgress(job.errors.length ? `安装完成，${job.errors.length} 项失败` : "安装完成");
          } else {
            setRepairProgress(`下载中 ${job.current + 1}/${job.total}…`);
          }
        } catch {
          clearInterval(poll);
          setRepairing(false);
        }
      }, 800);
    } catch (e) {
      setRepairing(false);
      setRepairProgress(`安装失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // not_installed
  if (status.status === "not_installed") {
    return (
      <div className="stu-notice stu-notice-info">
        <span>可安装官方示例资产（IEM Cologne Major 2026），获得完整的赛事分析体验。</span>
        <button type="button" className="stu-button-sm" onClick={() => void installOfficial()}>
          安装 Cologne 示例资产
        </button>
        <button type="button" className="stu-button-sm" onClick={() => setDismissed(true)}>
          以后再说
        </button>
      </div>
    );
  }

  // incomplete
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
        <button type="button" className="stu-button-sm" onClick={() => void repair()}>
          修复安装
        </button>
        <button type="button" className="stu-button-sm" onClick={() => setDismissed(true)}>
          忽略
        </button>
      </div>
    );
  }

  // corrupt
  if (status.status === "corrupt") {
    return (
      <div className="stu-notice stu-notice-err">
        <span>资产校验失败（{totalMissing} 项），建议重新下载。</span>
        <button type="button" className="stu-button-sm" onClick={() => void check(true)}>
          重新校验
        </button>
        <button type="button" className="stu-button-sm" onClick={() => void repair()}>
          修复安装
        </button>
      </div>
    );
  }

  return null;
}
