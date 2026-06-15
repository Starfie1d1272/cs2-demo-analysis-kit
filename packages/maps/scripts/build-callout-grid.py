#!/usr/bin/env python3
# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "matplotlib>=3.11.0",
#     "pillow>=12.2.0",
# ]
# ///
"""
build-callout-grid — 从 110 场 demo 的 replay 流构建 3D 多数表决 callout 网格。

输出：每图一个 JSON（sparse map → compact flat array），
      供 @cs2dak/maps 的 calloutAt(x, y, z) 消费。

用法：
  uv run --project python python packages/maps/scripts/build-callout-grid.py
"""
import zipfile, json, glob, os, re, collections, math, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
GRID = 10  # 每个格点 10 单位
MIN_CONFIDENCE = 0.50  # 多数占比小于等于此 → 标记为 unknown
MIN_SAMPLES = 3  # 少于这个帧数 → 不纳入网格

def decode_delta(values):
    out, acc = [], 0
    for v in values:
        acc += v
        out.append(acc)
    return out

# ── 第 1 步：按地图分组 ──
zips = glob.glob(f"{ROOT}/fixtures/output/**/*.zip", recursive=True)
zips = [z for z in zips if z.endswith(".zip") and not os.path.basename(z).startswith("_")]
print(f"共 {len(zips)} 个 ZIP，分组中…", file=sys.stderr)

maps_zips = collections.defaultdict(list)
for zp in zips:
    try:
        with zipfile.ZipFile(zp) as zf:
            manifest = json.loads(zf.read("manifest.json"))
            match = json.loads(zf.read(manifest["files"]["match"]))
            mp = match.get("mapName", "")
            if mp:
                maps_zips[mp].append(zp)
    except Exception as e:
        print(f"  跳过 {os.path.basename(zp)}: {e}", file=sys.stderr)

print(f"按地图分配完成", file=sys.stderr)

# ── 第 2 步：每图逐格投票 ──
for mp, mp_zips in sorted(maps_zips.items()):
    # vote[ (gx, gy, gz) ] = Counter{ callout: count }
    vote = collections.defaultdict(collections.Counter)
    total_frames = 0
    processed_zips = 0

    for zp in mp_zips:
        try:
            with zipfile.ZipFile(zp) as zf:
                manifest = json.loads(zf.read("manifest.json"))
                files = manifest["files"]
                replay_f = files.get("replay")
                if not replay_f:
                    continue
                replay = json.loads(zf.read(replay_f))
                place_dict = replay.get("placeDict") or []
                coord_scale = (replay.get("meta") or {}).get("coordScale", 1)

                for replay_round in replay.get("rounds", []):
                    for track in replay_round.get("players", []):
                        xs = decode_delta(track.get("x", []))
                        ys = decode_delta(track.get("y", []))
                        zs = decode_delta(track.get("z", []))
                        places = track.get("place", [])
                        flags = track.get("flags", [])

                        for idx, place_idx in enumerate(places):
                            if place_idx < 0 or place_idx >= len(place_dict):
                                continue
                            pl = place_dict[place_idx]
                            if not pl:
                                continue
                            flag = flags[idx] if idx < len(flags) else 0
                            if (flag & 1) == 0:  # 只检存活
                                continue
                            px = (xs[idx] if idx < len(xs) else 0) * coord_scale
                            py = (ys[idx] if idx < len(ys) else 0) * coord_scale
                            pz = (zs[idx] if idx < len(zs) else 0) * coord_scale

                            # 离散到网格
                            gx = math.floor(px / GRID) * GRID
                            gy = math.floor(py / GRID) * GRID
                            gz = math.floor(pz / GRID) * GRID

                            vote[(gx, gy, gz)][pl] += 1
                            total_frames += 1
                processed_zips += 1
        except Exception as e:
            continue

    if not vote:
        print(f"  {mp}: 无数据", file=sys.stderr)
        continue

    # ── 第 3 步：多数表决 + 构建稀疏网格 ──
    origin = [0, 0, 0]  # 最小值
    max_coord = [0, 0, 0]  # 最大值
    cells = {}  # key: packed index, value: [calloutIdx, confidence, n]

    # 收集词汇表
    all_callouts = set()
    for cell_vote in vote.values():
        all_callouts.update(cell_vote.keys())
    vocabulary = sorted(all_callouts)
    vocab_index = {c: i for i, c in enumerate(vocabulary)}

    # 多数表决
    unknown_count = 0
    total_cells = 0
    for (gx, gy, gz), counter in vote.items():
        total_samples = sum(counter.values())
        if total_samples < MIN_SAMPLES:
            continue
        total_cells += 1

        common = counter.most_common(2)
        top_callout, top_count = common[0]
        if len(common) > 1 and common[1][1] == top_count:
            unknown_count += 1
            continue
        confidence = top_count / total_samples

        if confidence <= MIN_CONFIDENCE:
            unknown_count += 1
            continue

        cells[f"{gx},{gy},{gz}"] = [vocab_index[top_callout], round(confidence, 3), total_samples]

    # 计算网格维度
    all_gx = [c[0] for c in vote]
    all_gy = [c[1] for c in vote]
    all_gz = [c[2] for c in vote]
    origin = [min(all_gx), min(all_gy), min(all_gz)]
    max_coord = [max(all_gx), max(all_gy), max(all_gz)]
    dims = [
        (max_coord[0] - origin[0]) // GRID + 1,
        (max_coord[1] - origin[1]) // GRID + 1,
        (max_coord[2] - origin[2]) // GRID + 1,
    ]

    # ── 第 4 步：输出 compact JSON ──
    output = {
        "mapName": mp,
        "gridSize": GRID,
        "origin": origin,
        "maxCoord": max_coord,
        "dims": dims,
        "vocabulary": vocabulary,
        "confidence": MIN_CONFIDENCE,
        "minSamples": MIN_SAMPLES,
        "cells": cells,
    }

    out_path = f"{ROOT}/packages/maps/callout-grid/{mp}.json"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"), ensure_ascii=False)

    # 统计
    occupied = len(cells)
    total_possible = dims[0] * dims[1] * dims[2]
    print(f"  {mp}: {processed_zips}/{len(mp_zips)} zips", file=sys.stderr)
    print(f"    帧采样: {total_frames:,}", file=sys.stderr)
    print(f"    网格: {dims[0]}×{dims[1]}×{dims[2]} = {total_possible:,} 格", file=sys.stderr)
    print(f"    有数据格: {total_cells:,} | 置信格: {occupied:,} | unknown(低置信): {unknown_count:,}", file=sys.stderr)
    print(f"    词汇表: {len(vocabulary)} 个 callout", file=sys.stderr)
    print(f"    输出: {out_path} ({os.path.getsize(out_path)/1024:.0f} KB)", file=sys.stderr)

print(f"\n全部输出: {ROOT}/packages/maps/callout-grid/", file=sys.stderr)
