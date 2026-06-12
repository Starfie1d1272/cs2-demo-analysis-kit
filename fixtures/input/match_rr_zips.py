"""Map rival-rating v2 zips to source .dem files and generate export script."""
import os, glob

BASE = "/Users/starfie1d/GitHub/cs2-demo-analysis-kit"

# Build .dem index
pro_dems = {}
for d in glob.glob(f"{BASE}/fixtures/demos/pro/*.dem"):
    name = os.path.basename(d).replace(".dem", "").lower()
    pro_dems[name] = d

rr_dir = "/Users/starfie1d/GitHub/rival-rating/fixtures/pro-20260611/zips"
rr_zips = sorted(glob.glob(f"{rr_dir}/*.zip"))

matched = 0
unmatched = 0

for z in rr_zips:
    fn = os.path.basename(z)
    fn_lower = fn.lower().replace(".zip", "")

    if "-vs-" not in fn_lower:
        print(f"SKIP (no -vs-): {fn}")
        unmatched += 1
        continue

    before_vs, after_vs = fn_lower.split("-vs-", 1)
    before_parts = before_vs.split("_")

    map_name = None
    for pi in range(len(before_parts)-1, -1, -1):
        if before_parts[pi] == "de":
            map_name = f"de_{before_parts[pi+1]}" if pi+1 < len(before_parts) else "de"
            before_vs_team = "_".join(before_parts[pi+2:])
            break

    if not map_name:
        print(f"SKIP (no map): {fn}")
        unmatched += 1
        continue

    team_a = before_vs_team

    after_parts = after_vs.split("_")
    team_b_parts = []
    for i in range(len(after_parts)-1, -1, -1):
        ap = after_parts[i]
        if "-" in ap and not any(c.isalpha() for c in ap):
            team_b_parts = after_parts[:i]
            break
    team_b = "_".join(team_b_parts) if team_b_parts else after_vs

    map_short = map_name.replace("de_", "")
    candidates = []
    for dname, dpath in pro_dems.items():
        if map_short not in dname:
            continue
        ta_parts = team_a.split("_")
        tb_parts = team_b.split("_")
        score_val = sum(1 for p in ta_parts + tb_parts if p in dname and len(p) > 2)
        if score_val >= 1:
            candidates.append((score_val, dname, dpath))

    if candidates:
        best = max(candidates, key=lambda c: c[0])
        matched += 1
        out = f"{rr_dir}/{fn}"
        print(f"uv run cs2df export '{best[2]}' -o '{out}' -q")
    else:
        print(f"# SKIP (no dem): {fn}")
        unmatched += 1

print(f"\n# Summary: matched={matched}, unmatched={unmatched}")
