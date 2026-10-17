# Public V3 P21 — Taste DNA feature implementation contract

## Decision

**REDESIGN / retain as a separate capability.**

Taste DNA is the signed-in fan's private preference model built from rankings they deliberately create for published shows. It compares that ranking with published jury, televote and overall result patterns. It is not Prediction League, not a recommendation engine, and not Country Voting DNA.

Canonical route: `/taste-dna`.

## Current capability audit

### Purpose

Taste DNA lets a visitor rank the entries in a published show and immediately understand how that personal preference compares with the official jury, televote, overall result and individual jury ballots. Authenticated users may persist their ranking privately and use older saved rankings as longitudinal taste history.

### Current data

- `fan_taste_ballots`: private caller-owned rankings by show.
- `fan_profiles`: caller identity row used by the existing fan engagement model.
- editions and shows: published field selection.
- participants / contest entities / countries: the eligible ranking universe and display identity.
- published results: jury, televote, total points and official rank.
- published jury votes / show voters: comparison with individual jury patterns.

### Current user actions

- choose a published edition/show whose required results are public;
- reorder the published field into a personal ranking;
- compare that ranking with jury, televote and overall results;
- inspect closest and most different jury taste;
- see recurring favourites derived from the user's saved ranking history;
- save the current ranking privately when signed in;
- delete a previously saved ranking;
- copy a text summary of the calculated fingerprint.

### Audience

- anonymous visitor: can build an in-memory ranking and inspect the published comparison, but has no persisted private history;
- authenticated fan/member/HOD/historical participant: can do the same analysis and read/write only their own saved Taste DNA ballots.

Organizer privilege must not expose another user's Taste DNA ballot through the public app.

### Dependencies

- personal preference / identity: private saved ballots and caller ownership;
- publication / results: only published result data is valid comparison input;
- jury: published jury ballot data for similarity analysis;
- edition/show/participant identity: ranking universe and labels.

### Historical use

The retained implementation has existed as `/taste-dna`, with private `fan_taste_ballots`, a pure `taste-dna.ts` scoring model and server-side ballot validation. It is linked from Results and the public tools/navigation surfaces as personal analytics.

## Authority findings

Read-only production verification on 2026-10-17 confirms:

- `fan_taste_ballots` exists in hosted Supabase;
- SELECT, INSERT, UPDATE and DELETE policies restrict rows to `profile_id = auth.uid()`;
- `fan_profiles` is likewise caller-owned;
- `validate_fan_taste_ballot()` rejects a caller/profile mismatch;
- the trigger rejects unavailable shows, non-array rankings, fewer than three entries, duplicate entries and entries that do not belong to the selected show;
- there is no Taste DNA aggregate RPC that turns private rankings into public data.

Therefore the existing database is the authoritative persistence boundary. V3 must not add localStorage/sessionStorage persistence, a second browser-owned profile store or a public copy of private ballots.

The browser may own an unsaved working ranking because reordering is reversible draft interaction. Successful persistence is represented only after the server mutation succeeds and the caller-scoped query is reconciled.

## Relationship with Voting DNA

The canonical Public V3 plan requires these capabilities to be separated when current behavior supports the distinction. Current Solaris does.

### Taste DNA

**Subject:** a person/user.

**Question answered:** "How does my own ranking compare with published voting/results, and what patterns recur across rankings I saved?"

**Private input:** caller-owned `fan_taste_ballots`.

**Published comparison input:** show results and jury voting data already eligible for public display.

**Output:** personal similarity/profile metrics and recurring favourites. These are derived analytics, not official contest truth.

### Country Voting DNA

**Subject:** a contest country/delegation as a public historical voting entity.

**Question answered:** "What public voting/result patterns characterize this country?"

**Authority:** the separate `public_country_voting_dna(uuid)` public aggregate.

**Output:** descriptive country voting/result patterns. It does not read or expose a fan's private Taste DNA ballots.

### Boundary

Taste DNA and Voting DNA must remain separate capabilities, routes and data contracts. Shared visual language is allowed; shared private/public authority is not.

## Relationship with Predictions

Taste DNA is a preference ranking after/against publishable contest data. Predictions represent forecasts and competitive prediction scoring. A Taste DNA ranking must never be submitted as a prediction, and prediction scores must never silently become Taste DNA history.

## V3 product model

The V3 surface should answer the useful personal question before exposing the full workbench:

1. **Choose a published show** — only a field whose required public result channels are available.
2. **Your ranking** — reversible draft ordering with accessible move controls; drag may be additive, never the only control.
3. **Your fingerprint** — first useful answer: jury/televote/overall similarity plus a plain-language explanation.
4. **Closest / opposite juries** — derived comparison, clearly labelled as analysis rather than official ranking.
5. **Across your saved rankings** — recurring favourites only when authenticated private history exists.
6. **Private save state** — explicit signed-out, saving, saved, error and delete states.
7. **Methodology** — disclose that the profile is computed from user rankings and published contest data; do not imply psychological or objective quality measurement.

## State and privacy rules

- signed-out use may remain ephemeral in component state but must not be persisted as hidden browser truth;
- private saved history is loaded only through caller-scoped RLS-protected data;
- missing engagement schema is an unavailable/degraded state, not an invitation to substitute local persistence;
- unpublished/future result channels must not influence the profile;
- no Organizer permission may widen access to private fan ballots on the public side;
- empty history is valid and must not manufacture recurring favourites;
- stale saved rankings must be reconciled against the current published show universe before rendering;
- derived labels such as `Jury-leaning` or `Consensus magnet` are explanatory analytics, not official classifications or recommendations;
- the surface must not claim to predict future results from Taste DNA.

## Accessibility and interaction

- ranking must be fully operable without drag gestures;
- every move control has an accessible name;
- current position is visible numerically;
- metric meaning is available in text, not only through bar length;
- copied/shareable summaries contain no private identifiers;
- mobile layouts expose the fingerprint before dense supporting analytics where practical.

## Rollout

- preserve `/taste-dna` during V3 rollout;
- installed-app V3 may render the redesigned presentation behind the canonical rollout probe;
- public/non-installed web and rollout errors retain the existing route until V3 acceptance is proven;
- no System migration is required for the initial V3 redesign because hosted RLS and validation already provide the necessary private ballot authority;
- any future recommendation model, social sharing of ballots or cross-user aggregate requires a new explicit privacy/System contract and is outside P21.

## Acceptance scenarios

1. Anonymous visitor can build a temporary ranking and see analysis without a fake persisted account history.
2. Signed-in user can save, reload and delete only their own Taste DNA ballot.
3. Attempting to persist a different profile id is rejected by server authority.
4. Invalid, duplicate or out-of-show entries are rejected by server validation.
5. A show without the required published result channels is not presented as an analyzable Taste DNA field.
6. Taste DNA uses personal ranking history; Country Voting DNA remains backed by its separate public country aggregate and never reads fan ballots.
7. Prediction data and prediction scoring are not used as substitutes for Taste DNA rankings.
8. V3 exposes loading, unavailable, empty, ready, saving and error states without local-storage fallback authority.
9. Keyboard/non-drag controls can produce the same ranking as pointer interaction.
10. Derived profile labels are accompanied by methodology/explanation and are not presented as objective judgments of taste.

## Status after audit

P21 can move from **discovered** to **mapped** with classification **REDESIGN**. Existing persistence/validation authority is sufficient for presentation work. Parity is not claimed until the redesigned surface, state handling, rollout wiring and exact-head acceptance evidence land.
