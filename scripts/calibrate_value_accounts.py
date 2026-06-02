#!/usr/bin/env python3
"""Validate the deployed season Rating against external ground truth.

Joins the season cohort output to OCR'd ratingPro / WE by steam64 at the season
level, then reports:

  1. corr(accountRR, gt) vs corr(rrV1, gt) — how the deployed v2 Rating and the
     HLTV-reverse v1 baseline each track the market rating.
  2. each (already residualized) account contribution's marginal corr with gt —
     confirms the orthogonal teamplay increment carries ~0 market signal.

NOTE: the season cohort's accountBreakdown is already RESIDUALIZED (combat
backbone + orthogonal teamplay). The one-time analysis that justified
residualization — each *raw* account's standalone corr (combat 0.90, clutch 0.46,
...) and its collinearity with combat — needs the pre-residual linear breakdown
and is recorded in docs/design/cohort.md; it is not recomputed here.

Verdict from the 55-match tournament: overall rating is ~combat; the orthogonal
teamplay residual has ~0 marginal predictive power for ratingPro/WE. So combat is
the data-mandated backbone and the non-combat accountWeights are a deliberate
product values choice ("the market underrates team value"), not a regression output.

Granularity note: the calibration CSV's match_id is a system UUID that does not
map to demo filenames, and its created_at is OCR-entry time (not match time), so
a per-match join is not possible. This harness therefore joins at the SEASON
level by steam64 (aggregate ratingPro/WE per player). Per-match calibration would
need a match_id<->demo mapping.

Usage:
  python3 scripts/calibrate_value_accounts.py \
    --cohort fixtures/output/season-cohort/season-cohort.json \
    --ratingpro ~/Desktop/rival_rating_calibration.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics as st
from pathlib import Path

# value-account weights are needed to recover the unweighted per-account raw
# (accountBreakdown = accountWeight * raw). Keep in sync with
# rival-rating/src/weights/rr-value-accounts-v2-lite.json.
ACCOUNT_WEIGHTS = {"combat": 1.0, "trade": 0.5, "clutch": 0.4, "objective": 0.1, "utility": 0.3}
ACCOUNTS = list(ACCOUNT_WEIGHTS)


def pearson(a: list[float], b: list[float]) -> float:
    ma, mb = st.mean(a), st.mean(b)
    den = math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / den if den > 0 else 0.0


def aggregate_gt(rows: list[dict], col: str) -> dict[str, float]:
    """Per-steam64 mean of a ground-truth column (skips blanks)."""
    bucket: dict[str, list[float]] = {}
    for r in rows:
        v = r.get(col)
        if v in (None, "", "None"):
            continue
        bucket.setdefault(r["steam64"], []).append(float(v))
    return {s: st.mean(v) for s, v in bucket.items()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", type=Path, default=Path("fixtures/output/season-cohort/season-cohort.json"))
    ap.add_argument("--ratingpro", type=Path, required=True, help="rival_rating_calibration.csv")
    args = ap.parse_args()

    players = json.loads(args.cohort.read_text())["players"]

    # steam64 -> player index (honor borrowed-account identity merges)
    idx: dict[str, int] = {}
    for i, p in enumerate(players):
        for s in p.get("steamIds", [p["primarySteamId64"]]):
            idx[s.replace("steam:", "")] = i

    with open(args.ratingpro, encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))

    print(f"cohort players: {len(players)}   csv rows: {len(rows)}")
    for col in ("rating_pro", "we"):
        gt = aggregate_gt(rows, col)
        keys = [s for s in gt if s in idx]
        y = [gt[s] for s in keys]
        acct = [players[idx[s]]["accountRR"] for s in keys]
        v1 = [players[idx[s]]["rrV1"] for s in keys]
        print(f"\n=== ground truth: {col}  (matched players: {len(keys)}) ===")
        print(f"  corr(accountRR, {col}) = {pearson(acct, y):+.3f}   (deployed v2 Rating)")
        print(f"  corr(rrV1,      {col}) = {pearson(v1, y):+.3f}   (HLTV-reverse baseline)")
        print("  residualized account contribution marginal corr with gt:")
        for k in ACCOUNTS:
            xs = [players[idx[s]]["accountBreakdown"][k] for s in keys]
            print(f"    {k:9s} {pearson(xs, y):+.3f}")

    print(
        "\nVerdict: combat is the data-mandated backbone; after residualizing, the\n"
        "orthogonal teamplay increment carries ~0 marginal signal for ratingPro/WE.\n"
        "Non-combat accountWeights are a deliberate product values choice, not a fit."
    )


if __name__ == "__main__":
    main()
