# Public V3 P21 — Taste DNA feature implementation contract

## Decision

**REDESIGN / retain as a separate capability.**

Taste DNA is the current user's private preference model built from rankings they deliberately create for published shows. It compares that ranking with already-published jury, televote and overall result patterns. It is not Prediction League, not a recommendation engine, and not Country Voting DNA.

Canonical route: `/taste-dna`.

## Current capability audit

### Purpose

Taste DNA lets a visitor rank the entries in a published show and understand how that personal preference compares with the official jury, televote, overall result and individual jury ballots. Authenticated users may persist their ranking privately and use older saved rankings as longitudinal taste history.

### Existing authority

The retained implementation uses:

- `fan_taste_ballots` for private caller-owned rankings by show;
- published editions and shows for field selection;
- published participants, results and detailed jury data for comparison;
- caller-owned persistence and the existing server validation boundary.

V3 must not create localStorage/sessionStorage persistence, a second browser-owned profile store or a public copy of private ballots.

The browser may own an unsaved working ranking because reordering is reversible draft interaction. Successful persistence exists only after the server mutation succeeds and caller-scoped state reconciles.

## Relationship with Country Voting DNA

Taste DNA and Country Voting DNA are separate capabilities.

### Taste DNA

**Subject:** a person/user.

**Question answered:** “How does my own ranking compare with published voting/results, and what patterns recur across rankings I saved?”

**Private input:** caller-owned Taste DNA ballots.

**Published comparison input:** show results and jury voting data already eligible for public display.

**Output:** personal similarity/profile metrics and recurring favourites. These are derived analytics, not official contest truth.

### Country Voting DNA

**Subject:** a contest country/delegation as a public historical voting entity.

**Question answered:** “What public voting/result patterns characterize this country?”

It does not read or expose a fan's private Taste DNA ballots.

Taste DNA and Voting DNA must remain separate capabilities, routes and data contracts. Shared visual language is allowed; shared private/public authority is not.

## Relationship with Predictions

Taste DNA is preference analysis. Predictions are forecasts and competitive prediction scoring. A Taste DNA ranking must never be submitted as a prediction, and prediction scores must never silently become Taste DNA history.

## V3 product model

The V3 surface should answer the useful personal question before exposing dense supporting analytics:

1. **Choose a published show** — only a field whose required public result channels are available.
2. **Your ranking** — reversible draft ordering with accessible move controls; drag may be additive, never the only control.
3. **Your fingerprint** — jury/televote/overall similarity plus plain-language explanation.
4. **Closest / opposite juries** — derived comparison, clearly labelled as analysis rather than an official ranking.
5. **Across your saved rankings** — recurring favourites only when authenticated private history exists.
6. **Private save state** — explicit signed-out, saving, saved, unavailable and error states.
7. **Methodology** — disclose that the profile is computed from user rankings and published contest data; do not imply psychological or scientific precision.

## State and privacy rules

- an anonymous visitor can build an in-memory ranking but receives no fabricated persisted account history;
- private saved history is caller-scoped;
- missing engagement persistence is an unavailable/degraded state, not an invitation to substitute local persistence;
- unpublished/future result channels must not influence the profile;
- no Organizer permission may widen access to private fan ballots on the Public side;
- empty history is valid and must not manufacture recurring favourites;
- stale saved rankings must be reconciled against the current published show universe before rendering;
- duplicate saved IDs are collapsed deterministically;
- the active show's persisted ranking is excluded from longitudinal history while that same show is the current working ranking, avoiding double weighting;
- derived labels are explanatory analytics, not objective judgments or future-result predictions.

## Accessibility and interaction

- ranking must be fully operable without drag gestures;
- every move control has an accessible name;
- current position is visible numerically;
- metric meaning is available in text, not only through bar length;
- copied summaries contain no private identifiers;
- mobile layouts expose the fingerprint before dense supporting analytics where practical.

## Implementation direction

Do not ship a second heavyweight Taste DNA runtime merely to call it V3.

The existing route already owns the mature public-result reads, ranking UI and caller-owned persistence. V3 should extract reusable pure reconciliation/analysis logic from that route and migrate the existing controller incrementally. This avoids duplicate Results/Jury/fan-data bundles while still replacing route-local reasoning with a canonical testable model.

The reusable controller owns:

- reconciliation of saved rankings against the current published field;
- duplicate/stale ID removal;
- current-show exclusion from longitudinal private history;
- construction of the personal analysis from published result/jury inputs and caller-owned history.

The route remains responsible for presentation, published-show selection, existing persistence hooks and accessibility controls.

## Acceptance scenarios

1. Anonymous visitor can build a temporary ranking and see analysis without fake persisted account history.
2. Signed-in user can save, reload and delete only their own Taste DNA ballot through existing caller-scoped authority.
3. Stale, duplicate or no-longer-published IDs in a saved ranking do not become current ranking authority.
4. Newly published entries are appended deterministically to a reconciled ranking.
5. The current show's persisted ballot is not double-counted in longitudinal history.
6. A show without the required published result channels is not presented as an analyzable Taste DNA field.
7. Taste DNA uses personal ranking history; Country Voting DNA remains separate public country-pattern analysis and never reads private fan ballots.
8. Prediction data and scoring are not used as substitutes for Taste DNA rankings.
9. Keyboard/non-drag controls can produce the same ranking as pointer interaction.
10. Derived profile labels are accompanied by methodology/explanation and are not presented as objective judgments of taste.

## Status

The capability is **building**, not parity. The audit and reusable controller are implemented, but parity still requires exact-head feature acceptance evidence for the retained route, including anonymous analysis and authenticated save/reload/delete behavior.
