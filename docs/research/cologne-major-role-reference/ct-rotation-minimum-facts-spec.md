# CT rotation minimum facts — research specification

## Purpose

Add the smallest observational fact set that can explain why a CT player behaves like an Anchor or Rotator. These facts must describe events and movement; they must not directly emit a role label.

Version 1 is implemented as compact public facts in `@cs2dak/contract` and `@cs2dak/core`, and persisted by Studio for later research projection. It does not emit a CT role, alter presentation, or change Studio UI.

## Required grain

One row per `match × map × round × CT team × player` with explicit availability and censoring.

## Minimum fields

### Initial responsibility

- `initialPositionGroupId`: dominant map-owned position group during the frozen opening responsibility window.
- `initialPositionGroupShare`: dwell share in that group during the window.
- `initialResponsibilityResolved`: whether callout/default-position semantics were sufficient to resolve the area.
- `initialWindowEligibleSeconds`: observed alive seconds inside the frozen opening responsibility window.

The position-group semantics remain owned by `@cs2dak/maps`. The role layer must not invent new map areas.

### Contact context

- `firstOwnAreaContactTick`: first observable hostile contact associated with the player's initial responsibility area.
- `firstOtherAreaContactTick`: first observable hostile contact associated with another defended area.
- `firstTeamContactTick`: earliest resolved hostile contact for the CT team.
- `contactAvailability`: whether the required combat/spatial sources were present.

Version 1 defines contact as enemy health damage with positive raw damage, with kills as a fallback. The contact region is resolved from the T participant's replay callout, then the CT participant's callout if needed. It is observable combat evidence, not inferred tactical intent.

### Leaving and response

- `leftInitialPositionGroupTick`: first observed exit from the initial position group that leads to a stable different position group after the responsibility window.
- `leaveDelayAfterFirstOtherAreaContactSeconds`: nullable signed duration from other-area contact to sustained exit; negative means departure came first.
- `firstStableDestinationPositionGroupId`: first stable destination after leaving.
- `firstStableDestinationRegion`: map-owned region of that destination.
- `crossedResponsibilityArea`: whether the destination belongs to a different defended area rather than an adjacent local adjustment.
- `returnedToInitialPositionGroup`: whether the player later re-established meaningful dwell in the initial position group.
- `transitToStableDestinationSeconds`: observed movement time from departure to the first stable destination.

A response target must remain in the same resolved position group for at least two seconds. Unresolved transit may occur between the departure and target; short jiggles and unresolved-only movement do not count. Version 1 intentionally does not add a distance threshold: cross-area movement is owned by the map's `a` / `b` / `mid` semantics.

### Relative team order

- `crossAreaDepartureOrder`: competition rank among resolved CT players with a stable cross-area departure; simultaneous ticks share a rank.
- `firstCrossAreaDeparture`: whether no resolved teammate departed cross-area at an earlier tick; simultaneous earliest players are all true.
- `priorCrossAreaDeparturesAlive`: count of strictly earlier cross-area movers still alive at this player's departure tick.
- `initialAreaStillCovered`: whether another alive teammate retained responsibility when the player left.

These are relative observational facts. They compare only players who themselves have a resolved cross-area departure; they do not assert tactical eligibility, contact causality, or that the movement was correct.

### Censoring and availability

- `deathTick`: nullable player death time.
- `censoredByDeath`: whether death prevented observation of a possible leave or response.
- `roundEndTick`: observation endpoint.
- `availability.replay`, `availability.nav`, `availability.callouts`, `availability.shots`, `availability.combatTimeline`.
- `factVersion` and source provenance.

Death-censored rounds must remain unknown for unobserved downstream fields; they must not be coerced to “did not rotate.” A resolved player observed alive through the round with no stable cross-area response records `crossedResponsibilityArea = false` rather than `null`.

## Derived research measures

The cohort research layer may aggregate:

- cross-area response round share;
- median response delay after other-area contact;
- first-responder share;
- leave-after-own-area-contact versus leave-after-other-area-contact;
- retained-area coverage when leaving;
- return-to-initial-area share;
- uncensored eligible-round count.

These measures may support Anchor/Rotator evidence only after map and team grouped validation.

## Explicit non-goals

- No role label in the core fact extractor.
- No claim that every cross-area movement is a tactical rotation.
- No conversion of missing/censored values to zero.
- No use of Firepower, Utility, Opening, or Clutching to define CT position responsibility.
- No Studio-side replay reconstruction or persistence of raw frame graphs.

## Version 1 implementation and validation gates

1. Compact facts use `analysisVersion = 6` and an independent `factVersion = 1`; Studio facts storage is version 5, so prior rows rebuild from retained v3 ZIPs.
2. Synthetic tests lock stable cross-area response, team-relative order, retained-area coverage, and death censoring.
3. Fixture tests verify compact extraction and explicit missing replay behavior.
4. Stable connector versus site-player direction, representative timeline review, and complete-team/map comparison remain required before any Anchor/Rotator classifier.
5. A later classifier must consume aggregated facts outside core and retain an abstention path.

## 202-map closeout result

Version 1 was re-extracted over all 202 frozen Cologne map ZIPs after the signed-delay and observational-name cleanup:

- 21,810 CT player-round rows, matching `rounds × 5` exactly;
- zero extraction failures and duplicate grains;
- 21,652 resolved initial responsibilities;
- 4,917 stable cross-area departures;
- 12,222 observed no-cross-area rows;
- 4,602 death-censored rows and 4,671 unknown rows;
- no death-censored row materialized a boolean, and no resolved uncensored row remained unknown.

The added aggregates show stable class direction under complete-team leave-out, but an augmented linear diagnostic reduces Mixed abstention recall from `0.28` to `0.08` and median team-fold agreement from `0.75` to `0.50`. Therefore v1 is accepted as an explanatory fact layer only. It does not authorize a CT research projection or formal Anchor/Rotator replacement.
