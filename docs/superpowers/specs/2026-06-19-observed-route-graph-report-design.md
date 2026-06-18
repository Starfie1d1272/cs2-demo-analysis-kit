# Observed Route Graph Review Report

## Goal

Generate one reproducible Markdown report from the local v3 ZIP corpus. The report
describes observed callout-to-callout movement and proposes reviewable T-side route
corridors for the seven active-duty maps. It is research output only: it does not
change Studio, runtime map assets, or the archived `MapRoute` contract.

## Ownership and files

- Add `packages/maps/scripts/derive-route-graph.ts` as the report generator.
- Add a colocated unit test for transition cleanup and route search.
- Write generated output to
  `docs/research/route-graph-review-2026-06-19.md`.
- Read existing `packages/maps/map-routes/de_*.json` only for comparison with the
  generated candidates. Never rewrite those assets.

`@cs2dak/maps` owns the map-level output because the report concerns callout graph
evidence and route candidates. ZIP decoding continues to use the existing core and
contract APIs.

## Input and transition semantics

The command accepts one or more directories and recursively scans `.zip` files. With
no argument it scans `fixtures/output`, matching the default-position review script.

For every replay round and player track:

1. Resolve side from the player's team key and the round's team-side assignment.
2. Start at `freezeEndTick` and stop at the round decision tick.
3. Ignore dead frames and missing callouts; either condition breaks the active
   sequence.
4. Compress consecutive frames in the same callout into visits.
5. Keep visits lasting at least two replay frames. Short interior visits between the
   same callout (`A -> B -> A`) are removed as sampling jitter.
6. Count each remaining adjacent directed pair once per player occurrence. Record
   T count, CT count, total count, and distinct round count.

Only observed replay transitions appear in this version. Callout-grid adjacency is
explicitly out of scope, so absence of an edge is not evidence of impossibility.

## Candidate route search

Search T-side directed edges from `TSpawn` to `BombsiteA` and `BombsiteB`. Routes are
simple paths with no repeated node. Defaults are:

- maximum 8 hops;
- minimum edge count 3;
- top 20 paths per target;
- edge cost decreasing with T count and increasing when CT observations dominate.

The generator exposes these thresholds as CLI flags so the report records and can
reproduce the exact run. Candidates are ranked, not treated as confirmed corridors.
Each candidate includes its bottleneck edge count and total observed support.

## Report structure

The report begins with corpus size, thresholds, method, limitations, and a short
human-review checklist. Each map then contains:

1. sample ZIP and round counts;
2. highest-volume directed edges with T/CT counts, T share, and distinct rounds;
3. ranked A and B route candidates;
4. comparison against the existing manual `map-routes` asset, showing whether every
   consecutive manual edge was observed and listing missing edges;
5. a compact JSON candidate block suitable for later manual asset work.

Unknown maps may appear in evidence sections but route search requires the standard
`TSpawn` and bombsite callouts. Maps without a valid path render an explicit empty
state instead of failing the full report.

## Verification

Unit tests cover visit compression, jitter removal, side-separated edge counts,
loop-free bounded route search, and deterministic ranking. Verification also runs the
script over the full local corpus, checks that all seven maps render, and runs the
focused Vitest file plus workspace typecheck.
