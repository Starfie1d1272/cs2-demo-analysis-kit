#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""
grid-to-zones — 从 callout-grid 10-unit 网格数据自动提取多边形区域。

算法：
  1. 按 callout 分组 → XY 投影 → 8-连通分量分析
  2. Moore-Neighbor 边界追踪 → RDP 简化
  3. Z 平面拟合（斜坡检测：线性最小二乘 Z = A*x + B*y + C）
  4. 输出 map-zones 兼容 JSON (auto-<map>.json)

角色语义（role / bombsite）读取自两个权威源：
  - 现有 manual zone (map-zones/<map>.json) — 最优先
  - 对 unregistered 的 callout 做名称启发式推断

斜坡处理：
  如果 RMSE < 8 units → 存 zGradient（时空连续的斜坡感知）
  否则 → 存 zMin/zMax（多层/跳跃地形）

用法：
  uv run python packages/maps/scripts/grid-to-zones.py [de_mirage ...]
  缺省 = 所有现役图
"""

import json, math, sys, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
GRID_SIZE = 10
MIN_CELLS = 4
MIN_SAMPLES = 3
SLOPE_RMSE_THRESHOLD = 8


# ════════════════════════════════════════════
# 角色语义：从权威源加载
# ════════════════════════════════════════════

def load_role_mappings(map_name: str) -> dict[str, tuple[str, str | None]]:
    """从现有 manual zone JSON + 名称启发式构建 callout→(role, bombsite) 映射。"""
    result: dict[str, tuple[str, str | None]] = {}

    # 1. 从 manual zone 文件读取已知映射
    manual_path = os.path.join(ROOT, "packages/maps/map-zones", f"{map_name}.json")
    if os.path.exists(manual_path):
        with open(manual_path) as f:
            manual = json.load(f)
        for z in manual["zones"]:
            # callout 名与 zone id 完全一致时，优先采用 manual 的 role/bombsite
            callout_name = z["id"]
            # 驼峰转 callout 名（BombsiteA → BombsiteA，保留原样）
            result[callout_name] = (z.get("role", "other"), z.get("bombsite", None))
            # 也尝试匹配 zone 的 display name（如有）

    # 2. 名称启发式（仅对上面没匹配的 callout 生效）
    # 纯命名规则，不涉及具体地图知识
    heuristic_map: dict[str, tuple[str, str | None]] = {
        # site
        "BombsiteA": ("site", "a"),
        "BombsiteB": ("site", "b"),
        "Bombsite": ("site", None),
        # spawn
        "TSpawn": ("spawn", None),
        "CTSpawn": ("spawn", None),
        "CTSpawnLower": ("spawn", None),
        "CTSpawnUpper": ("spawn", None),
        # mid
        "Middle": ("mid", None),
        "MidBottom": ("mid", None),
        # approach（进攻方接近区）
        "PalaceInterior": ("approach", "a"),
        "PalaceAlley": ("approach", "a"),
        "TRamp": ("approach", "a"),
        "Ramp": ("approach", None),
        "Catwalk": ("approach", "a"),
        "CatwalkUpper": ("approach", "a"),
        "Apartments": ("approach", "b"),
        "Banana": ("lane", "b"),
        "LongA": ("lane", "a"),
        "LongB": ("lane", "b"),
        # connector
        "Connector": ("connector", None),
        "Underpass": ("connector", "b"),
        "Jungle": ("connector", "a"),
        "Stairs": ("connector", "a"),
        # backsite
        "BackAlley": ("backsite", None),
        "SideAlley": ("backsite", None),
        "BackofB": ("backsite", "b"),
        "Truck": ("backsite", None),
        "House": ("backsite", None),
        # 多层地图
        "TopofMid": ("mid", None),
    }

    for name, (role, bombsite) in heuristic_map.items():
        if name not in result:
            result[name] = (role, bombsite)

    return result


def infer_role_from_name(name: str) -> str:
    """最底层的纯名称启发式 fallback。"""
    if name.startswith("Bombsite"):
        return "site"
    if name.endswith("Spawn"):
        return "spawn"
    if "Ramp" in name or "Palace" in name:
        return "approach"
    if name in ("Middle", "TopofMid", "MidBottom"):
        return "mid"
    if name in ("Catwalk", "Apartments", "Banana", "LongA", "LongB"):
        return "approach" if name in ("Catwalk", "Apartments") else "lane"
    if "Alley" in name or name in ("BackofB", "Truck", "House", "Tetris"):
        return "backsite"
    if name in ("Connector", "Underpass", "Jungle", "Stairs", "Tunnel",
                "Market", "Window", "MidWindow", "MidDoors", "CTMid",
                "TunnelStairs", "UpperTunnel", "LowerTunnel",
                "ShortStairs", "SideEntrance", "Water"):
        return "connector"
    return "other"


def infer_bombsite_from_name(name: str, role: str) -> str | None:
    """最底层的 bombsite 启发式 fallback。"""
    if name.endswith("A") or "BombsiteA" in name:
        return "a"
    if name.endswith("B") or "BombsiteB" in name:
        return "b"
    if role == "spawn":
        return None
    # 大部分带有 "Alley" 的后巷连接 B 的居多，但不确定
    if "Alley" in name:
        return "a"  # 多数 alley 在 A 侧
    if name in ("PalaceInterior", "PalaceAlley", "Catwalk", "CatwalkUpper",
                "Jungle", "Stairs", "Connector", "Tetris", "Truck"):
        return "a"
    if name in ("Apartments", "Market", "Underpass", "Shop"):
        return "b"
    return None


# ════════════════════════════════════════════
# 几何工具
# ════════════════════════════════════════════

def connected_components_2d(cells: set[tuple[int, int]]) -> list[list[tuple[int, int]]]:
    """8-连通分量分析。"""
    visited: set[tuple[int, int]] = set()
    comps: list[list[tuple[int, int]]] = []

    for cell in cells:
        if cell in visited:
            continue
        stack = [cell]
        comp: list[tuple[int, int]] = []
        while stack:
            c = stack.pop()
            if c in visited:
                continue
            visited.add(c)
            comp.append(c)
            cx, cy = c
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nb = (cx + dx, cy + dy)
                    if nb in cells and nb not in visited:
                        stack.append(nb)
        comps.append(comp)
    return comps


def moore_neighbor_trace(cells: list[tuple[int, int]]) -> list[tuple[int, int]] | None:
    """Moore-Neighbor 边界追踪。返回有序的边界单元格（grid 坐标）。

    从最左单元格出发，逆时针沿 8-邻域追踪外边界。
    """
    occ: set[tuple[int, int]] = set(cells)
    if len(occ) < 3:
        return None

    DIRS = [
        (1, 0), (1, 1), (0, 1), (-1, 1),
        (-1, 0), (-1, -1), (0, -1), (1, -1),
    ]

    # 最左（x 最小，同 x 取最下 y 最小）
    start = min(cells, key=lambda p: (p[0], -p[1]))

    back: tuple[int, int] | None = None
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            nb = (start[0] + dx, start[1] + dy)
            if nb not in occ:
                back = nb
                break
        if back is not None:
            break
    if back is None:
        return None

    current = start
    boundary: list[tuple[int, int]] = [start]
    back_at_start = back

    for _ in range(len(cells) * 10):
        in_vec = (current[0] - back[0], current[1] - back[1])
        try:
            in_idx = DIRS.index(in_vec)
        except ValueError:
            return None

        found = False
        for j in range(1, 9):
            d = DIRS[(in_idx + j) % 8]
            nxt = (current[0] + d[0], current[1] + d[1])
            if nxt in occ:
                back = current
                current = nxt
                found = True
                break

        if not found:
            return None

        if current == start and back == back_at_start:
            break
        boundary.append(current)

    return boundary


def ramer_douglas_peucker(points: list[tuple[float, float]], epsilon: float) -> list[tuple[float, float]]:
    """RDP 多边形简化。"""
    if len(points) <= 2:
        return points

    x1, y1 = points[0]
    x2, y2 = points[-1]
    dx_line = x2 - x1
    dy_line = y2 - y1
    len_sq = dx_line * dx_line + dy_line * dy_line

    max_dist = 0.0
    max_idx = 0

    for i in range(1, len(points) - 1):
        x, y = points[i]
        if len_sq == 0:
            dist = math.hypot(x - x1, y - y1)
        else:
            t = max(0.0, min(1.0, ((x - x1) * dx_line + (y - y1) * dy_line) / len_sq))
            px = x1 + t * dx_line
            py = y1 + t * dy_line
            dist = math.hypot(x - px, y - py)
        if dist > max_dist:
            max_dist = dist
            max_idx = i

    if max_dist > epsilon:
        left = ramer_douglas_peucker(points[: max_idx + 1], epsilon)
        right = ramer_douglas_peucker(points[max_idx:], epsilon)
        return left[:-1] + right
    else:
        return [points[0], points[-1]]


def fit_z_plane(points: list[tuple[int, int, int]]) -> tuple[float, float, float, float] | None:
    """最小二乘拟合 Z = A*x + B*y + C。返回 (A, B, C, RMSE) 或 None。"""
    n = len(points)
    if n < 3:
        return None

    sx = sy = sz = sxx = syy = sxy = sxz = syz = 0.0
    for gx, gy, gz in points:
        x, y, z = float(gx), float(gy), float(gz)
        sx += x
        sy += y
        sz += z
        sxx += x * x
        syy += y * y
        sxy += x * y
        sxz += x * z
        syz += y * z

    det = (sxx * (syy * n - sy * sy)
           - sxy * (sxy * n - sy * sx)
           + sx * (sxy * sy - syy * sx))
    if abs(det) < 1e-12:
        return None

    a = (sxz * (syy * n - sy * sy) - syz * (sxy * n - sy * sx) + sz * (sxy * sy - syy * sx)) / det
    b = (sxx * (syz * n - sy * sz) - sxy * (sxz * n - sx * sz) + sx * (sxz * sy - syz * sx)) / det
    c = (sxx * (syy * sz - sy * syz) - sxy * (sxy * sz - sx * syz) + sx * (sxy * syz - syy * sxz)) / det

    rmse = math.sqrt(sum((gz - (a * gx + b * gy + c)) ** 2 for gx, gy, gz in points) / n)
    return (a, b, c, rmse)


# ════════════════════════════════════════════
# 核心流程
# ════════════════════════════════════════════

def grid_to_zones(map_name: str, grid: dict) -> dict:
    """从 callout-grid JSON 提取 zone JSON。"""
    role_map = load_role_mappings(map_name)
    zones: list[dict] = []

    # 按 callout 分组收集三维格点
    callout_points: dict[str, list[tuple[int, int, int]]] = defaultdict(list)
    for key, cell in grid["cells"].items():
        gx, gy, gz = map(int, key.split(","))
        if cell[2] < MIN_SAMPLES:
            continue
        name = grid["vocabulary"][cell[0]]
        callout_points[name].append((gx, gy, gz))

    for callout_name, points in sorted(callout_points.items()):
        xy_set: set[tuple[int, int]] = {(x, y) for x, y, _z in points}
        if len(xy_set) < MIN_CELLS:
            continue

        for comp_idx, xy_comp in enumerate(connected_components_2d(xy_set)):
            if len(xy_comp) < MIN_CELLS:
                continue

            # ── 边界追踪 ──
            boundary = moore_neighbor_trace(xy_comp)
            if boundary is None or len(boundary) < 3:
                continue

            # 去重
            deduped: list[tuple[int, int]] = []
            for p in boundary:
                if not deduped or p != deduped[-1]:
                    deduped.append(p)
            while len(deduped) >= 2 and deduped[-1] == deduped[0]:
                deduped.pop()
            if len(deduped) < 3:
                continue

            # RDP 简化
            poly_world: list[tuple[float, float]] = [(float(gx), float(gy)) for gx, gy in deduped]
            simplified = ramer_douglas_peucker(poly_world, epsilon=GRID_SIZE)
            if len(simplified) < 3:
                if len(poly_world) >= 3:
                    simplified = poly_world if len(poly_world) <= 5 else ramer_douglas_peucker(poly_world, epsilon=GRID_SIZE * 0.5)
            if len(simplified) < 3:
                continue

            # ── Z 分析 ──
            comp_xy_set = set(xy_comp)
            z_points = [(gx, gy, gz) for gx, gy, gz in points if (gx, gy) in comp_xy_set]
            z_values = [gz for _, _, gz in z_points]
            z_min = min(z_values)
            z_max = max(z_values)

            # 平面拟合（斜坡检测）
            z_gradient: list[float] | None = None
            z_gradient_tol: float | None = None

            if len(z_points) >= 3 and (z_max - z_min) >= GRID_SIZE:
                fit = fit_z_plane(z_points)
                if fit is not None:
                    a, b, c_val, rmse = fit
                    if rmse < SLOPE_RMSE_THRESHOLD:
                        z_gradient = [round(a, 4), round(b, 4), round(c_val, 2)]
                        z_gradient_tol = round(min(GRID_SIZE * 2, rmse * 3), 1)

            # ── 角色语义 ──
            if callout_name in role_map:
                role, bombsite = role_map[callout_name]
            else:
                role = infer_role_from_name(callout_name)
                bombsite = infer_bombsite_from_name(callout_name, role)

            zone_id = _make_zone_id(callout_name, comp_idx)

            zone: dict = {
                "id": zone_id,
                "name": callout_name,
                "role": role,
                "bombsite": bombsite,
                "polygon": [[round(x, 0), round(y, 0)] for x, y in simplified],
                "zMin": z_min,
                "zMax": z_max,
            }

            if z_gradient is not None:
                zone["zGradient"] = z_gradient
                zone["zGradientTolerance"] = z_gradient_tol

            zone["_meta"] = {
                "source": "grid-to-zones.py",
                "gridSize": GRID_SIZE,
                "callout": callout_name,
                "componentIndex": comp_idx,
                "xyCells": len(xy_comp),
                "zSamples": len(z_points),
                "zRange": [z_min, z_max],
            }

            zones.append(zone)

    return {
        "mapName": map_name,
        "version": f"auto-v1-{map_name}",
        "_gridMeta": {
            "origin": grid.get("origin", [0, 0, 0]),
            "maxCoord": grid.get("maxCoord", [0, 0, 0]),
            "dims": grid.get("dims", []),
            "vocabularySize": len(grid.get("vocabulary", [])),
        },
        "zones": zones,
    }


def _make_zone_id(callout_name: str, comp_idx: int) -> str:
    """驼峰 → 下划线 zone id。BombsiteA → bombsite_a, CTSpawn → ct_spawn"""
    result = ""
    for ch in callout_name:
        if ch.isupper() and result:
            result += "_"
        result += ch.lower()
    if comp_idx > 0:
        result += f"_{comp_idx}"
    return result


def format_z_desc(z_min, z_max, gradient, tolerance) -> str:
    if gradient:
        a, b, c = gradient
        return f"Z:[{z_min},{z_max}] ∇:[{a:.4f},{b:.4f},{c:.0f}] tol={tolerance}"
    return f"Z:[{z_min},{z_max}]"


def load_manual_zones(map_name: str) -> dict | None:
    path = os.path.join(ROOT, "packages/maps/map-zones", f"{map_name}.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None


def compare_polygons(poly_a: list[list[float]], poly_b: list[list[float]]) -> float:
    """基于双向最近点距离的打分。值越大越相似。"""
    if not poly_a or not poly_b:
        return 0.0

    def avg_min_dist(p, qs):
        return sum(min(math.hypot(p[i][0] - q[0], p[i][1] - q[1]) for q in qs) for i in range(len(p))) / len(p)

    d1 = avg_min_dist(poly_a, poly_b)
    d2 = avg_min_dist(poly_b, poly_a)
    avg_d = (d1 + d2) / 2

    extent = math.hypot(
        max(p[0] for p in poly_a) - min(p[0] for p in poly_a),
        max(p[1] for p in poly_a) - min(p[1] for p in poly_a),
    ) or 100

    return max(0.0, 1.0 - avg_d / max(1, extent * 0.05))


# ════════════════════════════════════════════
# 主入口
# ════════════════════════════════════════════

def process_map(map_name: str, grid: dict):
    print(f"\n{'=' * 60}")
    print(f"  {map_name}")
    print(f"{'=' * 60}")

    result = grid_to_zones(map_name, grid)
    out_path = os.path.join(ROOT, "packages/maps/map-zones", f"auto-{map_name}.json")
    with open(out_path, "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    n_zones = len(result["zones"])
    slope_count = sum(1 for z in result["zones"] if z.get("zGradient"))
    print(f"  自动提取 {n_zones} 个 zone（其中斜坡 {slope_count} 个）")
    print(f"  输出: {out_path} ({os.path.getsize(out_path) / 1024:.1f} KB)")

    print(f"\n  ── 自动 zone 列表 ──")
    print(f"  {'ID':28s} {'Cells':>6s} {'Z/∇':>36s} {'Role':12s} {'PolyVerts':>9s}")
    print(f"  {'─' * 28} {'─' * 6} {'─' * 36} {'─' * 12} {'─' * 9}")
    for z in result["zones"]:
        m = z.get("_meta", {})
        zd = format_z_desc(z["zMin"], z["zMax"], z.get("zGradient"), z.get("zGradientTolerance"))
        label = f"∇{z.get('zGradientTolerance', '')}" if z.get("zGradient") else ""
        print(f"  {z['id']:28s} {m.get('xyCells', '?'):>6d} {zd:>36s} {z['role']:12s} {len(z['polygon']):>4d}vt")

    # ── 与人工标注对比 ──
    manual = load_manual_zones(map_name)
    if manual is not None:
        manual_map = {z["id"]: z for z in manual["zones"]}
        auto_map = {z["id"]: z for z in result["zones"]}
        matched = set(manual_map.keys()) & set(auto_map.keys())
        manual_only = set(manual_map.keys()) - set(auto_map.keys())
        auto_only = set(auto_map.keys()) - set(manual_map.keys())

        print(f"\n  ── 与 manual zone 对比 ──")
        print(f"  匹配: {len(matched)} | 人工有自动无: {len(manual_only)} | 自动多出: {len(auto_only)}")
        if manual_only:
            print(f"  人工有: {', '.join(sorted(manual_only))}")
        if auto_only:
            print(f"  自动多: {', '.join(sorted(auto_only))}")

        print(f"\n  多边形差异（双向平均距离归一化 score，越高越相似）:")
        for zid in sorted(matched):
            mz = manual_map[zid]
            az = auto_map[zid]
            mp = [[float(x), float(y)] for x, y in mz.get("polygon", [])]
            ap = az.get("polygon", [])
            if mp and ap:
                sc = compare_polygons(mp, ap)
                marker = "✓" if sc > 0.5 else "?"
                print(f"    {zid:24s} manual({len(mp)}vt) ↔ auto({len(ap)}vt) score={sc:.3f} {marker}")
            elif mp:
                print(f"    {zid:24s} manual({len(mp)}vt) ↔ auto(empty) score=0 ?")
            else:
                print(f"    {zid:24s} manual(empty) ↔ auto({len(ap)}vt) score=0 ?")
    else:
        print(f"\n  ⚠ 无 manual zone 可对比 ({map_name}.json 不存在)")


def main():
    args = sys.argv[1:]
    targets = [a for a in args if a.startswith("de_")] if args else [
        "de_ancient", "de_anubis", "de_dust2", "de_inferno",
        "de_mirage", "de_nuke", "de_overpass",
    ]

    for map_name in targets:
        grid_path = os.path.join(ROOT, "packages/maps/callout-grid", f"{map_name}.json")
        if not os.path.exists(grid_path):
            print(f"  跳过 {map_name}: callout-grid 不存在")
            continue
        with open(grid_path) as f:
            grid = json.load(f)
        process_map(map_name, grid)


if __name__ == "__main__":
    main()
