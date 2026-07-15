# Cologne Major 2026 CT/T role research freeze v1

## Status

This research configuration is frozen for future external validation. External-event acquisition is deferred by the user. No production role algorithm, public contract, or UI is changed by this freeze.

- Freeze ID: `cologne-major-2026-role-research-v1`
- Source commit: `9602d8276259864e1a55f0b4f380cf92c17cfc4c`
- Corpus: 202 map ZIPs, 160 event profiles, 32 teams
- Individual reference eligibility: 159 players
- Default confidence threshold: `0.60`
- Primary validation: leave one complete team out

The machine-readable source of truth is `cologne-role-research-freeze-v1.json`, including SHA-256 hashes for the frozen inputs.

## Identity provenance correction

The prior research record treated every non-identical display name as an ordinary alias. The frozen version separates four cases:

| Status | Count | Evaluation policy |
|---|---:|---|
| Direct identity | 155 | Included |
| Deterministic name variant | 3 | Included |
| Source-text correction | 1 | Included |
| Roster substitution proxy | 1 | Excluded from individual agreement |

`susp` is a direct player identity after correcting an intermediate text-recognition mistake. Its demo facts, Steam ID, and Anchor/Lurker reference labels already belonged to `susp`; no ZIP or fact re-extraction was required.

`s1ren → FL4MUS` is not an alias. The HLTV reference names `s1ren`, while the event demo profile is `FL4MUS`. That row is retained as a roster-slot sensitivity case but is excluded from the frozen individual-agreement population.

## Roster-proxy sensitivity

At the predeclared `0.60` threshold, excluding the FL4MUS roster-slot proxy changed the main result only slightly:

| Side | Included proxy core macro-F1 | Excluded proxy core macro-F1 | Delta |
|---|---:|---:|---:|
| CT | 0.7681 | 0.7734 | +0.0054 |
| T | 0.8212 | 0.8157 | -0.0056 |

The 80 repeated complete-team group splits were also stable:

| Side | Included median | Excluded median |
|---|---:|---:|
| CT | 0.7656 | 0.7675 |
| T | 0.8013 | 0.8013 |

This supports the original directional conclusion while correcting the reference population from “160 individual matches” to “160 event profiles, 159 individual reference matches, one roster-slot proxy.”

## Frozen feature set

The ordered `parsimonious_v1` feature set is:

1. `dominant_group_stability`
2. `team_relative_group_share`
3. `opening_isolated_share`
4. `isolation_share`
5. `delayed_convergence_share`
6. `movement_sync`
7. `position_top_share`
8. `opening_largest_share`
9. `full_largest_share`
10. `mean_team_centroid_distance`
11. `opening_path_displacement`
12. `opening_path_transitions`
13. `opening_position_entropy`
14. `full_position_entropy`
15. `rejoins_per_minute`

No feature selection may be repeated on the external-validation event.

## Frozen preprocessing and model

- Missing numeric values: median imputation fitted inside each training fold.
- Scaling: `StandardScaler` fitted inside each training fold.
- Model: balanced logistic regression.
- `C=0.25`, `max_iter=2000`, `random_state=20260715`.
- Fit population: identity-eligible, non-primary-AWPer players in the two core classes.
- CT core classes: Anchor / Rotator.
- T core classes: Pack / Lurker.
- Mixed/Flex: abstention and low-confidence semantics, not a symmetric learned third class.

## Frozen default result

After excluding the roster-slot proxy:

| Side | Core macro-F1 | Core coverage | Covered agreement | Mixed/Flex abstention recall |
|---|---:|---:|---:|---:|
| CT | 0.7734 | 82.4% | 86.9% | 28.0% |
| T | 0.8157 | 92.5% | 84.8% | 20.0% |

These values measure agreement with the same-event HLTV editorial reference. They are not real-world accuracy and do not authorize production deployment.

## External-validation protocol

When a suitable event is eventually available:

1. Use the exact frozen features, preprocessing, model parameters, identity policy, and `0.60` default threshold.
2. Do not change features, weights, or thresholds after inspecting the new labels or player disagreements.
3. Report the predeclared `0.50–0.90` threshold grid as risk–coverage diagnostics without changing the default.
4. Validate by complete team and report class, team, map, stage, collapse, coverage, and abstention behavior.
5. Treat failure as evidence about generalization; do not silently refit and continue calling it external validation.

## Remaining boundaries

- T Pack/Lurker has stronger responsibility-adjacent evidence and is the first production candidate after external validation.
- CT Anchor/Rotator remains semantically incomplete because the current facts do not directly observe contact-triggered response and cross-zone rotation.
- Utility remains a separate behavior-style percentile candidate.
- Opening and first-contact exposure require sample-size and uncertainty disclosure.
- Clutching requires multi-event shrinkage; trading remains only a proxy.
