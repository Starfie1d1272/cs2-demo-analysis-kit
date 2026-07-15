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

- `leftInitialAreaTick`: first observed exit from the initial position group that leads to a stable different position group after the responsibility window.
- `leaveDelayAfterFirstOtherAreaContact`: nullable duration from other-area contact to sustained exit.
- `responseTargetPositionGroupId`: first stable destination after leaving.
- `crossedResponsibilityArea`: whether the destination belongs to a different defended area rather than an adjacent local adjustment.
- `returnedToInitialArea`: whether the player later re-established meaningful dwell in the initial area.
- `responsePathEligibleSeconds`: observed movement time used for the response path.

A response target must remain in the same resolved position group for at least two seconds. Unresolved transit may occur between the departure and target; short jiggles and unresolved-only movement do not count. Version 1 intentionally does not add a distance threshold: cross-area movement is owned by the map's `a` / `b` / `mid` semantics.

### Relative team order

- `rotationStartOrder`: order among alive CT players who begin a resolved cross-area response.
- `firstResponder`: whether the player is first among eligible teammates.
- `teammatesAlreadyRotating`: count of alive teammates whose response began earlier.
- `initialAreaStillCovered`: whether another alive teammate retained responsibility when the player left.

These are relative observational facts. They do not assert that the rotation was correct.

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
