import { useEffect, useState } from "react";
import {
  backupLibrary,
  cleanupStorage,
  hasLibraryMaintenance,
  loadStorageOverview,
  repairLibrary,
  restoreLibrary,
  type StorageCategory,
  type StorageOverview,
} from "../lib/library-maintenance";
import { bytesLabel } from "../lib/format";

const LABELS: Record<StorageCategory["id"], string> = {
  database: "资料库数据库",
  demos: "原始 ZIP",
  cache: "派生缓存",
  tris: ".tri 地图资产",
  updates: "更新暂存",
  reports: "报告",
  logs: "日志",
  backups: "本机备份",
};
const CLEANABLE = new Set<StorageCategory["id"]>(["cache", "tris", "updates", "reports", "logs"]);

export function LibraryMaintenance({ onNotice }: { onNotice: (message: string) => void }) {
  const [overview, setOverview] = useState<StorageOverview | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setOverview(await loadStorageOverview());
  }

  useEffect(() => { void refresh(); }, []);
  if (!hasLibraryMaintenance()) return null;

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(true);
    try {
      const result = await action();
      onNotice(result.ok ? success : result.error ?? "操作失败");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="stu-card">
      <summary><b>资料库备份与存储维护</b></summary>
      <p className="stu-muted">备份包含 SQLite 中的标签、身份、BP、Playbook、设置与原始 ZIP；缓存和 .tri 可重新生成，不进入备份。</p>
      <div className="stu-header-actions">
        <button className="stu-button stu-button-ghost" type="button" disabled={busy} onClick={() => void run(backupLibrary, "资料库备份已写入 backups 目录")}>创建备份</button>
        <button className="stu-button stu-button-ghost" type="button" disabled={busy} onClick={() => {
          if (window.confirm("恢复会替换当前资料库，完成后需要重启 Studio。继续？")) void run(restoreLibrary, "备份已恢复，请重启 Studio");
        }}>恢复备份</button>
        <button className="stu-button stu-button-ghost" type="button" disabled={busy} onClick={() => void run(repairLibrary, "资料库一致性检查与修复完成")}>检查并修复</button>
      </div>
      {overview && (
        <table className="stu-mini-table">
          <thead><tr><th>分类</th><th>文件</th><th>占用</th><th /></tr></thead>
          <tbody>{overview.categories.map((category) => (
            <tr key={category.id}>
              <td>{LABELS[category.id]}</td>
              <td>{category.files}</td>
              <td>{bytesLabel(category.bytes)}</td>
              <td>{CLEANABLE.has(category.id) && category.bytes > 0 && (
                <button className="stu-button-sm" type="button" disabled={busy} onClick={() => {
                  if (window.confirm(`清理${LABELS[category.id]}？需要时会重新生成或下载。`)) {
                    void run(() => cleanupStorage(category.id), `${LABELS[category.id]}已清理`);
                  }
                }}>清理</button>
              )}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </details>
  );
}
