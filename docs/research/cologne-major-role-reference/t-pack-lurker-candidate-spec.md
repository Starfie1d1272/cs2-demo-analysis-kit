# T Pack/Lurker candidate — frozen research specification

## Purpose

Define the research candidate that may later replace the current strict unique-core rule. This specification freezes the evidence semantics but does not authorize a production-code or UI change.

## Core principle

Pack is stable participation in a coordinated action unit, not membership in a unique three-player absolute-majority component.

Lurker is sustained spatial and temporal separation from those action units, not merely one delayed convergence or one isolated opening frame.

## Evidence families

### Pack-directed evidence

- `opening_largest_share`
- `full_largest_share`
- pair-plus action-unit participation
- lower team-centroid distance
- lower persistent isolation
- repeated participation across eligible rounds rather than a single execution

Largest-component participation may credit tied planned groups such as `2+2+1`. It must not rename either tied group as a unique core.

### Lurker-directed evidence

- higher opening and full-round isolation;
- higher team-centroid distance;
- lower action-unit participation;
- persistent extremity after the main action unit makes contact;
- delayed convergence supported by round share and duration rather than “ever happened.”

Birth position, short utility detours, deaths, unresolved frames, and late-round economy cleanup must not create Lurker evidence by themselves.

## Frozen diagnostic model

The current research candidate remains `parsimonious_v1` from `cologne-role-research-freeze-v1.json`:

- balanced logistic regression;
- 15 ordered continuous features;
- median imputation and standard scaling inside the training fold;
- complete-team leave-one-group-out validation;
- `0.60` default confidence threshold;
- Flex as abstention, not a fitted third class.

The logistic model is still a feature-sufficiency diagnostic. A future production implementation may use a simpler evidence score, but it may not claim external validation unless it preserves the frozen method or declares a new development cycle.

## Risk–coverage contract

The frozen default remains `0.60`. Future validation must also report thresholds `0.50–0.90` in `0.05` increments:

- core coverage;
- covered agreement;
- core macro-F1;
- Pack and Lurker precision/recall;
- abstention recall for Flex;
- largest predicted-class share as a collapse alarm.

The threshold grid is descriptive. The external event must not be used to select a new default and still be called external validation.

## Production gates

1. A genuinely new event with comparable CT/T reference labels.
2. No Pack/Lurker category collapse on unseen complete teams.
3. Stable effect direction across teams and maps.
4. Evidence explanations traceable to action-unit participation and sustained separation.
5. Explicit low-confidence/Flex behavior.
6. Separate weapon duty and behavior-style axes.

Until those gates are met, this remains a research artifact and should not replace the formal UI output.
