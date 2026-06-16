import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { canOpenLibraryDir, getLibraryDir, openLibraryDir } from "../lib/library-dir";

/**
 * 侧栏「打开数据目录」入口。仅桌面壳（pywebview）显示——浏览器无本地目录概念。
 * 点击在系统文件管理器中打开 userdata 目录（资料库 / blobs / 缓存 / 日志 / `.tri`），
 * 便于用户手动备份与排错。路径作为 tooltip 展示。
 */
export function LibraryDirButton({ onError }: { onError?: (msg: string) => void }) {
  const [available] = useState(() => canOpenLibraryDir());
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    if (available) void getLibraryDir().then(setPath);
  }, [available]);

  if (!available) return null;

  async function run() {
    const res = await openLibraryDir();
    if (!res.ok) onError?.(res.error ?? "打开数据目录失败");
  }

  return (
    <button type="button" className="stu-libdir-btn" onClick={run} title={path ?? undefined}>
      <FolderOpen size={12} />
      <span>数据目录</span>
    </button>
  );
}
