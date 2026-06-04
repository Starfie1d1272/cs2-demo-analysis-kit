#!/usr/bin/env python3
"""
generate-routes — 基于已确认的动线与 callout 命名，生成：
  1. callout-review.md      —— 全量 callout 核对表（频次/T%/质心/中文名）
  2. viz/<map>_callouts.png —— 每图 callout 命名雷达图
  3. viz/<map>_routes.png   —— 每图已确认动线叠加雷达图

用法：
  uv run python packages/maps/scripts/generate-routes.py
"""
import zipfile, json, re, glob, os, collections, math
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
RADAR = f"{ROOT}/apps/demo-lab/public/maps/radars"
VIZ = f"{ROOT}/packages/maps/viz"
CJK = font_manager.FontProperties(fname="/System/Library/Fonts/STHeiti Medium.ttc")

CAL = {
    "de_mirage":(-3230,1713,5),"de_dust2":(-2476,3239,4.4),"de_inferno":(-2087,3870,4.9),
    "de_anubis":(-2796,3328,5.22),"de_nuke":(-3453,2887,7),"de_ancient":(-2953,2164,5),
    "de_overpass":(-4831,1781,5.2),
}
def w2r(mp,x,y): px,py,sc = CAL[mp]; return (x-px)/sc,(py-y)/sc

COLORS = ["#ff3b3b","#3b8cff","#22c55e","#f59e0b"]
ROUTE_TYPE_LABEL = {
    "primary_entry":"主攻", "secondary_entry":"副攻", "mid_connector":"中连接",
    "lurk_lane":"单挂", "rotation_cut":"断回",
}

# load callout names & routes
callout_ts = open(f"{ROOT}/packages/maps/src/callout-names.ts").read()
ZH = {}
for m in re.finditer(r'(de_\w+):\s*\{(.*?)\n  \}', callout_ts, re.S):
    ZH[m.group(1)] = {k:v for k,v in re.findall(r'\n    (\w+):\s*"([^"]*)"', m.group(2))}

routes_by_map = {}
for f in sorted(glob.glob(f"{ROOT}/packages/maps/map-routes/de_*.json")):
    mp = re.search(r'(de_\w+)', os.path.basename(f)).group(1)
    data = json.load(open(f))
    routes_by_map[mp] = data.get("routes", [])

zips = glob.glob(f"{ROOT}/fixtures/output/pro/*.zip") + glob.glob(f"{ROOT}/fixtures/output/nju-rivals-2026/*.zip")
maps = collections.defaultdict(list)
for zp in zips:
    mp = re.search(r'(de_[a-z0-9]+)', os.path.basename(zp))
    if mp: maps[mp.group(1)].append(zp)

def centroids(mp):
    """{placeName: (x,y,z,T%,n)}"""
    agg = collections.defaultdict(lambda: {"n":0,"sx":0.0,"sy":0.0,"sz":0.0,"t":0})
    for zp in maps[mp]:
        for r in json.loads(zipfile.ZipFile(zp).read("positions-1s.json")):
            pl = r.get("lastPlaceName")
            if not pl: continue
            p = r.get("position") or {}
            a = agg[pl]; a["n"] += 1; a["sx"] += p.get("x",0); a["sy"] += p.get("y",0); a["sz"] += p.get("z",0)
            if r.get("side") == "t": a["t"] += 1
    return {pl: (a["sx"]/a["n"], a["sy"]/a["n"], a["sz"]/a["n"],
                 round(100*a["t"]/a["n"]), a["n"]) for pl, a in agg.items()}

# ── 1. callout-review.md ──
os.makedirs(VIZ, exist_ok=True)
lines = ["# CS2 Callout 位置字段核对表", "",
         "源：79 场 demo（pro 24 + NJU 55）positions-1s 全量 `lastPlaceName`。",
         "用途：确认中文命名 / 标注 side 归属 / 为动线提供 T%·质心 依据。",
         "T% = 该区域采样里 T 方占比（高=T 进攻地盘，低=CT 防守地盘，~50=争夺区）。", ""]
for mp in sorted(maps):
    C = centroids(mp)
    total = sum(a[4] for a in C.values())
    lines.append(f"\n## {mp}  ({len(C)} 个区域)\n")
    lines.append("| callout | 中文名 | 采样 | 占比 | T% | 质心(x,y,z) |")
    lines.append("|---|---|---:|---:|---:|---|")
    for pl, (x,y,z,tp,n) in sorted(C.items(), key=lambda kv: -kv[1][4]):
        sh = round(100 * n / total, 1)
        cn = ZH.get(mp, {}).get(pl, "❓未命名")
        lines.append(f"| {pl} | {cn} | {n} | {sh}% | {tp} | ({x:.0f},{y:.0f},{z:.0f}) |")
open(f"{ROOT}/packages/maps/callout-review.md","w").write("\n".join(lines))
print("1/3  callout-review.md  已更新")

# ── 2. callout 雷达图 ──
for mp in sorted(maps):
    C = centroids(mp)
    img = Image.open(f"{RADAR}/{mp}.png")
    fig, ax = plt.subplots(figsize=(12,12)); ax.imshow(img); ax.axis("off")
    ax.set_title(f"{mp} — callout 命名核对（黄=T地盘 蓝=CT地盘 灰=争夺区）", fontproperties=CJK, fontsize=14)
    for pl, (x,y,z,tp,n) in C.items():
        rx, ry = w2r(mp, x, y)
        col = "#ffd000" if tp >= 55 else ("#3b8cff" if tp <= 35 else "#aaaaaa")
        ax.plot(rx, ry, "o", color=col, ms=7, mec="black")
        ax.annotate(f"{ZH[mp].get(pl,'❓'+pl)}\n{pl}·T{tp}", (rx, ry), fontsize=7, color="white",
            fontproperties=CJK, ha="center", va="bottom",
            bbox=dict(boxstyle="round,pad=0.15", fc="black", alpha=0.6, ec="none"))
    plt.tight_layout(); plt.savefig(f"{VIZ}/{mp}_callouts.png", dpi=95, bbox_inches="tight"); plt.close()
    print(f"2/3  {mp}_callouts.png")
print("2/3  callout 雷达图  已更新")

# ── 3. 动线叠加图 ──
for mp in sorted(maps):
    C = centroids(mp)
    routes = routes_by_map.get(mp, [])
    img = Image.open(f"{RADAR}/{mp}.png")
    # separate by bombsite
    a_routes = [r for r in routes if r["bombsite"] == "a"]
    b_routes = [r for r in routes if r["bombsite"] == "b"]
    fig, axes = plt.subplots(1, 2, figsize=(22, 11))
    for ax, (site_routes, label) in zip(axes, [(a_routes, "→ A 包点"), (b_routes, "→ B 包点")]):
        ax.imshow(img); ax.axis("off")
        ax.set_title(f"{mp}  {label}  ({len(site_routes)}条)", fontproperties=CJK, fontsize=15)
        # background: all callouts
        for pl, (x,y,z,tp,n) in C.items():
            rx, ry = w2r(mp, x, y)
            ax.plot(rx, ry, "o", color="#888", ms=3)
            ax.annotate(ZH[mp].get(pl, pl), (rx, ry), fontsize=6, color="#ccc",
                fontproperties=CJK, ha="center", va="bottom")
        # routes
        for i, route in enumerate(site_routes):
            col = COLORS[i % len(COLORS)]
            zone_ids = [z["id"] for z in route["zones"]]
            pts = [w2r(mp, *C[z][:2]) for z in zone_ids if z in C]
            off = (i - 1.5) * 6
            xs = [p[0]+off for p in pts]; ys = [p[1]+off for p in pts]
            rtype = ROUTE_TYPE_LABEL.get(route.get("type",""), "")
            conf = route.get("confidence","")
            ax.plot(xs, ys, "-", color=col, lw=2.4, alpha=0.85,
                    label=f"{route['name']} [{conf}] {rtype}")
            for j in range(len(pts)-1):
                ax.annotate("", xy=(xs[j+1], ys[j+1]), xytext=(xs[j], ys[j]),
                    arrowprops=dict(arrowstyle="-|>", color=col, lw=2.0, alpha=0.85))
            ax.plot(xs[0], ys[0], "s", color=col, ms=9, mec="white")
        if site_routes:
            ax.legend(prop=CJK, loc="upper left", fontsize=9, framealpha=0.8)
    plt.tight_layout(); plt.savefig(f"{VIZ}/{mp}_routes.png", dpi=95, bbox_inches="tight"); plt.close()
    print(f"3/3  {mp}_routes.png  ({len(routes)} routes)")
print("3/3  动线叠加图  已更新")
print(f"\n全部输出: {VIZ}/")
