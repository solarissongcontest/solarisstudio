# Public V3 P20 — Solaris Pulse feature implementation contract

## Decision

**REDESIGN / retain.** Pulse is an existing product capability with durable server-backed data and user actions. It must not be retired or merged into an unrelated screen merely because the legacy route accumulated several concerns.

Canonical route: `/pulse`.

## Current capability audit

### Purpose

Pulse is the public/fan contextual update surface. It combines official contest changes with optional personalization so a visitor can understand what changed without reconstructing state across Entries, running orders, Results, Predictions and Records.

### Current data

- `content_events`: official/public event stream and routes.
- `fan_follows`: optional country/edition/show personalization.
- `fan_event_reads`: authenticated read state.
- `notification_preferences`: in-app categories and notification policy.
- prediction rounds, saved prediction state and `prediction_consensus_movement`: privacy-gated prediction movement.
- editions, shows, participants and results: legacy record-insight derivation.

### Current user actions

- filter the feed by content/category;
- follow or unfollow relevant entities;
- mark one or all events read;
- update notification preferences;
- open the canonical route attached to an event;
- inspect prediction movement and record insights when their source authority permits it.

### Audience

- anonymous: public published event feed;
- signed-in fan/member/HOD: the same public feed plus caller-bound follows, read state and preferences;
- historical participant: public feed plus ordinary account personalization when authenticated.

No persona may receive future/unpublished information merely because their account has Organizer privileges elsewhere in Solaris Studio.

### Dependencies

- activity/publication: `content_events`;
- personal preference: follows and notification preferences;
- identity: authenticated caller for personal reads/follows/preferences;
- prediction: privacy-gated movement only after the canonical prediction contract permits it;
- results/publication: record/result insights only from publishable canonical data.

## Authority findings

The legacy `/pulse` route currently uses browser-owned state for two convenience features:

- `localStorage` keys for last meaningful route and last Pulse visit;
- `Date.now()` / browser timers when deciding prediction-round timing.

Those mechanisms are not acceptable as V3 workflow/publication authority.

Read-only production verification on 2026-10-17 found `content_events` RLS behaves differently by persona:

- anonymous SELECT policy: `published_at <= now()`;
- authenticated SELECT policy: `publishing.manage` callers may also read rows beyond that predicate.

Therefore a V3 Pulse client cannot guarantee public-only event visibility for every authenticated persona by simply removing the browser timestamp filter and reading `content_events` directly.

## Required System contract before final parity

Provide a caller-safe **public Pulse event projection** whose publication filtering is server-authoritative and identical for all public-side personas, including accounts that also hold Organizer permissions.

Minimum contract:

- input: optional limit/cursor/category filters, never a caller-supplied user id;
- output: event id, type, entity type/id, title, summary, canonical route, importance, payload needed for public rendering, published timestamp;
- publication: only events considered public at server time;
- authorization: Organizer permissions must not widen the public projection;
- ordering: deterministic newest-first with stable cursor/tie-break;
- reconciliation: durable event identity, no browser-created substitute event ids.

This may be an RPC/view/RLS-safe projection owned by System V3. Public V3 consumes it; Public V3 must not emulate it with browser time.

## V3 product model

Pulse remains a contextual feed, not a second task center and not a notification-settings replacement.

The V3 surface should contain:

1. **Latest** — server-authoritative published events.
2. **For you** — the same event identities filtered through caller-bound follows/preferences, never a copied event store.
3. **Unread state** — caller-bound `fan_event_reads` only.
4. **Event provenance** — official update / prediction insight / archive insight plus published timestamp.
5. **Canonical actions** — follow the event's stored route; do not invent alternate object identities.
6. **Prediction movement** — only when the existing privacy gate authorizes it.
7. **Record insight** — contextual analysis, clearly distinct from official event truth.

## State rules

- loading, unavailable, empty and error are explicit states;
- signed-out users never receive fake personal read/follow state;
- missing engagement schema degrades without substituting local persistence;
- no streaks, engagement pressure or punitive unread language;
- no `localStorage`/`sessionStorage` value may decide publication, read status, personalization, eligibility or workflow state;
- browser time may format already-authorized timestamps, but may not decide whether an event/round is public or actionable.

## Rollout

- installed-app V3 may use the redesigned Pulse only behind the existing global V3 rollout probe;
- public/non-installed web and rollout errors retain the existing Pulse route until V3 parity is certified;
- the route must stay reversible during rollout.

## Acceptance scenarios

1. Anonymous visitor receives only server-authorized published Pulse events.
2. Signed-in fan sees caller-bound follows/read state without supplying another user's id to authority-bearing APIs.
3. Organizer-capable account using the public app cannot see future/unpublished Pulse events through Organizer privilege leakage.
4. V3 Pulse contains no local/session-storage workflow authority and no browser-time publication/eligibility gate.
5. Mark-read mutations reconcile to server state and invalidate caller-bound reads.
6. Follow-based filtering references canonical event/entity ids rather than duplicating events.
7. Prediction movement remains hidden until its existing server/privacy contract allows it.
8. Legacy fallback remains reachable when V3 rollout is disabled or unavailable.

## Status after this audit

The capability can move from **discovered** to **mapped**. Presentation/projection work can begin, but final V3 parity is blocked on the server-authoritative public Pulse event projection described above.
