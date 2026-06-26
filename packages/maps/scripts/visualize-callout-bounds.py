#!/usr/bin/env python3
# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "matplotlib>=3.11.0",
#     "pillow>=12.2.0",
# ]
# ///
"""
visualize-callout-bounds — 在雷达图上叠加 callout bounding box + 现有 zone 多边形。

功能：
  1. 每图一张雷达图，显示每个 callout 的采样坐标范围（矩形）+ 质心
  2. 叠加上现有 zone 多边形（如果已标定），做交叉验证
  3. 输出到 viz/ 目录

用法：
  uv run python packages/maps/scripts/visualize-callout-bounds.py
"""
import json, os, re
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import Rectangle, Polygon as MplPolygon
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
RADAR = f"{ROOT}/apps/dak-studio/public/maps/radars"
VIZ = f"{ROOT}/packages/maps/viz"

# 中文字体
FONT_PATH = "/System/Library/Fonts/STHeiti Medium.ttc"
CJK = font_manager.FontProperties(fname=FONT_PATH) if os.path.exists(FONT_PATH) else None

# 世界坐标 → radar 像素校准 (offsetX, offsetY, scale)
CAL = {
    "de_mirage":  (-3230, 1713, 5),
    "de_dust2":   (-2476, 3239, 4.4),
    "de_inferno": (-2087, 3870, 4.9),
    "de_anubis":  (-2796, 3328, 5.22),
    "de_nuke":    (-3453, 2887, 7),
    "de_ancient": (-2953, 2164, 5),
    "de_overpass":(-4831, 1781, 5.2),
}

def w2r(mp, x, y):
    """世界坐标 → radar 像素坐标。"""
    px, py, sc = CAL[mp]
    return (x - px) / sc, (py - y) / sc

# 加载 callout bounds
with open(f"{ROOT}/packages/maps/callout-bounds.json") as f:
    CALLOUT_BOUNDS = json.load(f)

# 加载 zone 多边形
ZONES = {}
zones_dir = f"{ROOT}/packages/maps/map-zones"
for fname in os.listdir(zones_dir):
    if not fname.endswith(".json") or "template" in fname:
        continue
    mp = fname.replace(".json", "")
    with open(os.path.join(zones_dir, fname)) as f:
        ZONES[mp] = json.load(f)

ZONE_CALIBRATED = set(ZONES.keys())
print(f"已标定的地图：{ZONE_CALIBRATED}")

# 未标定的地图（有 callout 数据但无 zone 多边形）
ALL_MAPS = sorted(CALLOUT_BOUNDS.keys())
UNCALIBRATED = set(ALL_MAPS) - ZONE_CALIBRATED
if UNCALIBRATED:
    print(f"未标定 zones 的地图：{UNCALIBRATED}")

for mp in ALL_MAPS:
    if mp not in CAL:
        print(f"跳过 {mp}：无 radar 校准参数")
        continue

    radar_img_path = f"{RADAR}/{mp}.png"
    if not os.path.exists(radar_img_path):
        print(f"跳过 {mp}：无雷达图 {radar_img_path}")
        continue

    cal = CAL[mp]
    bounds = CALLOUT_BOUNDS[mp]
    zones = ZONES.get(mp.replace("de_", ""), ZONES.get(mp))

    # 加载雷达底图
    img = Image.open(radar_img_path)
    fig, ax = plt.subplots(figsize=(14, 12))
    ax.imshow(img, extent=[0, img.width, img.height, 0])  # radar 坐标：左上为原点
    ax.set_xlim(0, img.width)
    ax.set_ylim(img.height, 0)  # Y 轴反转（radar 坐标）
    ax.axis("off")

    title = f"{mp} — callout bounding box + zone 多边形交叉验证"
    subtitle_parts = []
    has_zones = zones is not None
    if has_zones:
        subtitle_parts.append(f"已标定 {len(zones['zones'])} 个 zone")
    subtitle_parts.append(f"{len(bounds)} 个 callout")
    subtitle = " | ".join(subtitle_parts)
    ax.set_title(f"{title}\n{subtitle}", fontproperties=CJK, fontsize=13, linespacing=1.4)

    # ── 第一步：画 zone 多边形（底层）──
    zone_names = set()
    if has_zones:
        for z in zones["zones"]:
            zid = z["id"]
            zone_names.add(zid)
            poly_pts = [w2r(mp, p[0], p[1]) for p in z["polygon"]]
            patch = MplPolygon(poly_pts, closed=True,
                               facecolor="#22c55e", edgecolor="#166534",
                               linewidth=1.5, alpha=0.12, zorder=2)
            ax.add_patch(patch)
            # zone 名称标注在第一个顶点附近
            if poly_pts:
                lx, ly = poly_pts[0]
                ax.plot(lx, ly, "s", color="#22c55e", ms=3, zorder=3)
                zh_name = z.get("name", zid)
                ax.annotate(f"[Z] {zh_name}",
                            (lx + 5, ly + 5), fontsize=5.5, color="#166534",
                            fontproperties=CJK,
                            bbox=dict(boxstyle="round,pad=0.1", fc="white", alpha=0.5, ec="#22c55e"))

    # ── 第二步：画 callout bounding box ──
    seen_callout_names = set()
    # 按样本量排序，大的先画（底）
    sorted_callouts = sorted(bounds.items(), key=lambda kv: -kv[1]["n"])

    for pl, data in sorted_callouts:
        xn = data["x"]
        yn = data["y"]
        cn = data["cn"] or pl

        # 转 radar 坐标
        r_min = w2r(mp, xn["min"], yn["min"])
        r_max = w2r(mp, xn["max"], yn["max"])
        r_cen = w2r(mp, xn["centroid"], yn["centroid"])

        # bounding box 矩形（radar 像素坐标，注意 Y 翻转）
        rx = min(r_min[0], r_max[0])
        ry = min(r_min[1], r_max[1])  # radar Y 已翻转
        rw = abs(r_max[0] - r_min[0])
        rh = abs(r_max[1] - r_min[1])

        # 判断是否已标定 zone
        has_zone = pl in zone_names

        # 颜色：有 zone 的绿，无 zone 的蓝
        box_color = "#22c55e" if has_zone else "#3b8cff"
        fill_color = "#22c55e" if has_zone else "#3b8cff"
        fill_alpha = 0.08 if has_zone else 0.06

        rect = Rectangle((rx, ry), rw, rh,
                         linewidth=1.0, edgecolor=box_color,
                         facecolor=fill_color, alpha=fill_alpha,
                         linestyle="-" if has_zone else "--",
                         zorder=4)
        ax.add_patch(rect)

        # 质心点
        marker_color = "#22c55e" if has_zone else "#3b8cff"
        ax.plot(r_cen[0], r_cen[1], "o", color=marker_color, ms=4,
                mec="white", mew=0.5, zorder=5)

        # 标签：英文 callout + 中文名
        label = f"{pl}"
        if cn:
            label += f"\n{cn}"
        label += f" [{data['n']:,}]"

        # 同一个中文名只标注第一个（避免重复标注同一区域的不同引擎 callout）
        tag = cn or pl
        if tag not in seen_callout_names:
            ax.annotate(label, (r_cen[0], r_cen[1]),
                        fontsize=5, color="white",
                        fontproperties=CJK,
                        ha="center", va="bottom",
                        bbox=dict(boxstyle="round,pad=0.12",
                                  fc=marker_color, alpha=0.55, ec="none"),
                        zorder=6)
            seen_callout_names.add(tag)

    # ── 第三步：检查 zone 中有但 callout 中无的区域 ──
    if has_zones:
        callout_names_in_data = set(bounds.keys())
        zone_only = zone_names - callout_names_in_data
        if zone_only:
            ax.text(0.01, 0.99,
                    f"⚠ zone 中有但 callout 数据中未出现: {', '.join(sorted(zone_only))}",
                    transform=ax.transAxes, fontsize=9, color="#f59e0b",
                    fontproperties=CJK, va="top",
                    bbox=dict(boxstyle="round,pad=0.3", fc="white", alpha=0.7, ec="#f59e0b"))

    # ── 第四步：图例 ──
    legend_elements = [
        plt.Rectangle((0, 0), 1, 1, facecolor="#3b8cff", alpha=0.15, edgecolor="#3b8cff",
                      linestyle="--", linewidth=1, label="callout bounds（无 zone）"),
        plt.Rectangle((0, 0), 1, 1, facecolor="#22c55e", alpha=0.15, edgecolor="#22c55e",
                      linestyle="-", linewidth=1, label="callout bounds（有 zone）"),
        plt.Rectangle((0, 0), 1, 1, facecolor="#22c55e", alpha=0.12, edgecolor="#166534",
                      linestyle="-", linewidth=1.5, label="zone 多边形"),
    ]
    ax.legend(handles=legend_elements, loc="lower left",
              prop=CJK, fontsize=8, framealpha=0.8)

    # 保存
    out_path = f"{VIZ}/{mp}_bounds+zone.png"
    plt.tight_layout()
    plt.savefig(out_path, dpi=110, bbox_inches="tight")
    plt.close()
    zone_status = f"✓ {len(zones['zones'])} zones" if has_zones else "⚠ 未标定 zone"
    print(f"  {mp}: {len(bounds)} callouts | {zone_status} → {out_path}")

print(f"\n全部输出：{VIZ}/")
