import { useMemo, useState } from "react";
import type { EventsManifest } from "@cs2dak/contract";
import type { BuiltinEvent } from "../lib/builtin-events";

// 统一画廊：内置示例 + 本地预装 + 在线 R2 赛事并列，共用同一张卡片。同 group 折叠成一个赛事、
// 展开见各阶段（如科隆按 stage 拆的 4 个包）。内置走 onLoadBuiltin，预装走 onLoadBundled，在线走 onDownloadOnline。
export interface GalleryItem {
  source: "builtin" | "bundled" | "online";
  slug: string;
  name: string;
  description?: string;
  group?: string;
  sizeLabel?: string;
  builtin?: boolean;
  onLoad: () => void;
}

function groupLabel(items: GalleryItem[]): string {
  // 取首项名 "·" 前的部分作赛事名（"IEM 科隆 Major 2026 · 第一阶段" → "IEM 科隆 Major 2026"）。
  const head = items[0]?.name ?? "";
  const cut = head.split("·")[0]?.trim();
  return cut || items[0]?.group || "赛事";
}

function Card({ item, busy, disabled }: { item: GalleryItem; busy: boolean; disabled: boolean }) {
  const stageName = item.name.includes("·") ? item.name.split("·").slice(1).join("·").trim() : item.name;
  return (
    <button
      type="button"
      className="stu-event-card"
      disabled={disabled}
      onClick={item.onLoad}
    >
      <span className="stu-event-card-head">
        <b>{stageName}</b>
        {item.source === "bundled" && <span className="stu-event-badge">已安装</span>}
        {item.source === "builtin" && item.builtin !== true && <span className="stu-event-badge">示例</span>}
        {item.source === "builtin" && item.builtin === true && <span className="stu-event-badge">内置</span>}
      </span>
      {item.description && <span className="stu-muted">{item.description}</span>}
      <span className="stu-event-card-action">
        {busy ? "处理中…" : item.source === "online" ? `下载并导入${item.sizeLabel ? `（${item.sizeLabel}）` : ""}` : "一键载入"}
      </span>
    </button>
  );
}

export function EventGallery({
  builtins,
  bundledManifest,
  manifest,
  busySlug,
  onLoadBuiltin,
  onLoadBundled,
  onDownloadOnline,
}: {
  builtins: BuiltinEvent[];
  bundledManifest: EventsManifest | null;
  manifest: EventsManifest | null;
  busySlug: string | null;
  onLoadBuiltin: (builtin: BuiltinEvent) => void;
  onLoadBundled: (asset: EventsManifest["events"][number]) => void;
  onDownloadOnline: (asset: EventsManifest["events"][number]) => void;
}) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const items: GalleryItem[] = [
      ...builtins.map((b): GalleryItem => ({
        source: "builtin", slug: b.slug, name: b.name, description: b.description,
        group: b.group, onLoad: () => onLoadBuiltin(b),
      })),
      ...(bundledManifest?.events ?? []).map((e): GalleryItem => ({
        source: "bundled", slug: e.slug, name: e.name, description: e.description,
        group: e.group, sizeLabel: e.size ? `${(e.size / 1024 / 1024).toFixed(1)} MB` : undefined,
        onLoad: () => onLoadBundled(e),
      })),
      ...(manifest?.events ?? []).map((e): GalleryItem => ({
        source: "online", slug: e.slug, name: e.name, description: e.description,
        group: e.group, builtin: e.builtin, sizeLabel: `${(e.size / 1024 / 1024).toFixed(1)} MB`,
        onLoad: () => onDownloadOnline(e),
      })),
    ];
    // 按 group 归组（无 group 的自成一组，键用 slug 保证唯一）。
    const byGroup = new Map<string, GalleryItem[]>();
    for (const item of items) {
      const key = item.group ?? `__solo__${item.slug}`;
      const arr = byGroup.get(key) ?? [];
      arr.push(item);
      byGroup.set(key, arr);
    }
    return [...byGroup.entries()].map(([key, groupItems]) => ({ key, items: groupItems }));
  }, [builtins, bundledManifest, manifest, onLoadBuiltin, onLoadBundled, onDownloadOnline]);

  if (groups.length === 0) {
    return <p className="stu-event-gallery-empty">暂无可下载的赛事。内置示例与在线赛事会显示在这里。</p>;
  }

  return (
    <div className="stu-event-gallery">
      {groups.map(({ key, items }) => {
        if (items.length === 1) {
          const item = items[0];
          return <Card key={key} item={item} busy={busySlug === item.slug} disabled={busySlug != null} />;
        }
        const open = openGroups[key] ?? false;
        return (
          <div key={key} className="stu-event-group">
            <button type="button" className="stu-event-group-head" onClick={() => setOpenGroups((s) => ({ ...s, [key]: !open }))}>
              <b>{groupLabel(items)}</b>
              <span className="stu-muted">{items.length} 阶段 {open ? "▾" : "▸"}</span>
            </button>
            {open && (
              <div className="stu-event-group-body">
                {items.map((item) => (
                  <Card key={item.slug} item={item} busy={busySlug === item.slug} disabled={busySlug != null} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
