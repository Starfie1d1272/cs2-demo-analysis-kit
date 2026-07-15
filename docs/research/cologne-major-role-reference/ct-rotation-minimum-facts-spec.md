# CT rotation minimum facts — research specification

## Purpose

Add the smallest observational fact set that can explain why a CT player behaves like an Anchor or Rotator. These facts must describe events and movement; they must not directly emit a role label.

This is a research specification only. It does not change the public contract, facts version, cache, Studio, or presentation layer.

## Required grain

One row per `match × map × round × CT team × player` with explicit availability and censoring.

## Minimum fields

### Initial responsibility

- `initialPositionGroupId`: dominant map-owned position group during the frozen opening responsibility window.
- `initialPositionGroupShare`: dwell share in that group during the window.
- `initialResponsibilityResolved`: whether callout/default-position semantics were sufficient to resolve the area.
- `initialWindowEligibleSeconds`: observed seconds before contact, death, or the window cutoff.

The position-group semantics remain owned by `@cs2dak/maps`. The role layer must not invent new map areas.

### Contact context

- `firstOwnAreaContactAt`: first observable hostile contact associated with the player's initial responsibility area.
- `firstOtherAreaContactAt`: first observable hostile contact associated with another defended area.
- `firstTeamContactAt`: earliest resolved hostile contact for the CT team.
- `contactAvailability`: whether the required combat/spatial sources were present.

The contact definition must be frozen before role comparison. It should use observable combat evidence, not inferred tactical intent.

### Leaving and response

- `leftInitialAreaAt`: first sustained exit from the initial area after the responsibility window.
- `leaveDelayAfterFirstOtherAreaContact`: nullable duration from other-area contact to sustained exit.
- `responseTargetPositionGroupId`: first stable destination after leaving.
- `crossedResponsibilityArea`: whether the destination belongs to a different defended area rather than an adjacent local adjustment.
- `returnedToInitialArea`: whether the player later re-established meaningful dwell in the initial area.
- `responsePathEligibleSeconds`: observed movement time used for the response path.

A sustained exit requires both a minimum duration and meaningful displacement. Short jiggles, grenade lineups, and unresolved gaps must not count as rotation.

### Relative team order

- `rotationStartOrder`: order among alive CT players who begin a resolved cross-area response.
- `firstResponder`: whether the player is first among eligible teammates.
- `teammatesAlreadyRotating`: count of alive teammates whose response began earlier.
- `initialAreaStillCovered`: whether another alive teammate retained responsibility when the player left.

These are relative observational facts. They do not assert that the rotation was correct.

### Censoring and availability

- `deathAt`: nullable player death time.
- `censoredByDeath`: whether death prevented observation of a possible leave or response.
- `roundEndedAt`: observation endpoint.
- `replayAvailable`, `navAvailable`, `calloutsAvailable`, `combatTimelineAvailable`.
- `factVersion` and source provenance.

Death-censored rounds must remain unknown for unobserved downstream fields; they must not be coerced to “did not rotate.”

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

## Validation gates before implementation

1. Manually inspect a small set of contact-triggered response timelines across several maps.
2. Verify that stable connector players and stable site players produce different response facts for understandable reasons.
3. Confirm death censoring and unresolved map areas do not create false “stayed” evidence.
4. Compare feature direction by complete team, map, and event before adding any classifier.
5. Version the compact facts separately from derived role evidence and invalidate stale derived caches if production work is later authorized.
