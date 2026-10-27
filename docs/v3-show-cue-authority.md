# V3 show lifecycle and show cue mutation authority

Status: implementation contract for the Chat 4 show/cue authority cutover.

This document is deliberately narrow. It does not replace the canonical V3 product/System/Organizer specifications, the Voting/Televote authority, publication authority, lineup authority, or the frozen Results / PR #1400 boundary.

## Canonical state partition

| Concern | Canonical state | Notes |
|---|---|---|
| Show identity / configuration | `public.shows` (`id`, `edition_id`, `name`, `kind`, `sort_order`) | Definition mutations use governed show commands. |
| Show lifecycle | `public.shows.status` | Canonical V3 states: `scheduled`, `preparing`, `delayed`, `live`, `paused`, `ended`, `cancelled`. |
| Show companion / reveal metadata | `public.shows.broadcast_config.showMode` | Revisioned companion metadata. `results_in_progress` is a `live` subphase, not a second lifecycle truth. |
| Cue/rundown configuration and execution | `public.shows.broadcast_config.studio2Rundown` | Revisioned segments, lock state and segment execution state. |
| Public presentation | projection from canonical show/lifecycle/publication/voting state | Never authoritative. |
| Running order | participant/lineup domain | Show runtime reads it; show lifecycle commands do not rewrite it. |
| Publication | publication domain | Separate governed publication functions may update their own show-row projection columns. |
| Voting configuration / Televote | Voting/Televote domain | This cutover deliberately does not create a new Voting writer. |
| Results | Results domain / frozen PR #1400 | Untouched by this cutover. |

## Canonical show commands

| Semantic operation | Command | Concurrency / recovery |
|---|---|---|
| Create show | `public.v3_create_show` | stable operation identity + idempotency receipt |
| Edit show definition | `public.v3_update_show_definition` | expected name/kind/order CAS + receipt |
| Delete setup-only show | `public.v3_delete_show` | expected definition CAS + history guards + delete-after-commit replay |
| Schedule/reschedule / metadata | `public.v3_apply_show_runtime_change` | lifecycle status CAS + runtime revision CAS |
| Prepare / delay | `public.v3_apply_show_runtime_change` | lifecycle state machine |
| Start / pause / resume | `public.v3_apply_show_runtime_change` | lifecycle state machine + revision CAS + idempotency |
| Enter result segment | `public.v3_apply_show_runtime_change` | lifecycle remains `live`; `showMode.phase=results_in_progress` |
| End / cancel | `public.v3_apply_show_runtime_change` | terminal lifecycle transition |

All critical show commands derive the actor from authenticated database context, validate show/edition scope server-side, use durable operation identity, and persist `show.changed` in the same transaction as canonical state.

### Legal lifecycle transitions

```text
scheduled -> preparing | delayed | live | cancelled
preparing -> scheduled | delayed | live | cancelled
delayed   -> scheduled | preparing | live | cancelled
live      -> paused | results_in_progress | ended | cancelled
paused    -> live | ended | cancelled
results_in_progress -> ended | cancelled
ended     -> terminal
cancelled -> terminal
```

`results_in_progress` is represented as:

```text
shows.status = live
broadcast_config.showMode.phase = results_in_progress
```

so the database keeps one lifecycle truth while retaining the broadcast/reveal subphase needed by the Live experience.

## Canonical cue commands

| Semantic operation | Command |
|---|---|
| Create/update/reorder cue configuration | `public.v3_save_show_rundown` |
| Lock/unlock rundown | `public.v3_set_show_rundown_lock` |
| Advance a cue through legal execution state | `public.v3_transition_show_cue` |

The legacy RPCs:

- `studio2_save_broadcast_rundown`
- `studio2_set_broadcast_rundown_lock`
- `studio2_transition_broadcast_segment`

remain only as hardened owner-callable internal implementation helpers. API roles, including `service_role`, lose direct `EXECUTE` on them.

### Cue revision / CAS

`studio2Rundown.revision` is the concurrency version.

Every production cue mutation takes `expected_revision` and locks the show row. A stale revision fails with `STATE_CHANGED` / serialization failure instead of silently overwriting newer cue state.

A retry of the same operation identity returns the durable receipt result and does not advance the cue twice.

### Cue transition graph

```text
planned -> ready | skipped
ready   -> live | skipped
live    -> completed | skipped
completed -> terminal
skipped   -> terminal
```

Only one segment may be `live` at a time.

There is intentionally no production `rewind` mutation in the current canonical model. Reopening a completed/skipped cue would require a separate explicit governed operation and transition rule; callers cannot manufacture rewind by raw JSON update.

### Lock model

The rundown lock is a **team operational lock**, not a personal lease.

- structural rundown edits are rejected while locked;
- production transition to a live segment requires the rundown to be locked;
- `lockedBy`/`lockedAt` are audit/context metadata;
- any actor who currently has the canonical broadcast-management authority may unlock;
- a departed browser/user therefore cannot create an immortal lock;
- there is no TTL because ownership is capability-scoped rather than session-scoped.

An unauthorized actor cannot lock/unlock or execute cues.

## Database writer enforcement

After the cutover:

```text
anon          raw INSERT/UPDATE/DELETE/TRUNCATE on public.shows: denied
authenticated raw INSERT/DELETE/TRUNCATE on public.shows: denied
service_role  raw INSERT/UPDATE/DELETE/TRUNCATE on public.shows: denied
```

Authenticated direct `UPDATE` is temporarily retained only for these neighbouring-domain compatibility columns:

| Owner domain | Columns | Reason | Sunset |
|---|---|---|---|
| design / broadcast presentation | `theme_id`, `broadcast_config` | existing presentation editor | presentation-owned governed command; runtime/cue subtrees are already DB-guarded |
| lineup | `lineup_stage` | existing lineup configuration | lineup-owned governed command |
| Voting / Televote | `voting_config`, `qualifier_count` | existing Voting configuration | Voting/Televote-owned governed command |

Two independent guards reject unauthorized changes inside the retained `broadcast_config` compatibility column:

```text
broadcast_config.showMode
broadcast_config.studio2Rundown
```

so presentation compatibility is not a peer authority over lifecycle/runtime/cues.

Existing publication and host functions remain governed cross-domain writers for their own show-row projections. They are not lifecycle authorities.

## Writer movement

Starting source inventory at integration SHA `1cb13dfb8b00d2bec97b34291442f34b306c275c` had four direct application writer files touching `public.shows`:

1. `src/routes/_authenticated/admin/shows/$slug.tsx`
2. `src/routes/_authenticated/admin/design.$slug.tsx`
3. `src/components/admin/ShowLineupWorkspace.tsx`
4. `src/routes/_authenticated/admin/voting-system/$slug.tsx`

After this cutover:

- hard peer show-lifecycle/cue application writers: **4 -> 0**;
- migrated to governed show/cue commands: **1 file** (`admin/shows/$slug.tsx`);
- explicitly bounded neighbouring-domain compatibility writers: **0 -> 3**;
- obsolete cue peer RPCs executable by API roles: **3 -> 0**;
- retained cue core helpers: **3**, owner-callable internal implementation only.

The three compatibility writers remain visible in the S16 report with owner, exact columns, reason and sunset condition. They are debt, not silently allowlisted lifecycle authorities.

## `show.changed`

Canonical emission points:

- show create;
- show definition update;
- setup-only delete;
- lifecycle/runtime transition or companion metadata change.

Properties:

- persisted atomically with the canonical mutation;
- stable `operation_id` links event and durable receipt;
- lifecycle events use runtime revision as aggregate version;
- canonical correctness does **not** depend on an asynchronous consumer;
- missed realtime/notification delivery cannot corrupt show truth;
- clients recover by re-reading `shows.status` plus guarded runtime metadata;
- event classification: persisted observational/audit fact.

There is no executable `task:show.blocker` worker in the current repository. The generic consequence registry previously inferred one from declarative live-show metadata; this cutover removes that invented requirement rather than creating a fake worker merely to satisfy an audit row.

## `show.cue_changed`

Canonical emission points:

- rundown configuration change;
- real lock/unlock change;
- legal cue execution transition.

Properties:

- persisted atomically with canonical cue state;
- cue revision is included in the event payload/version;
- stable `operation_id` makes retry idempotent;
- an already-satisfied lock request is a semantic no-op and does not emit a second cue-change event;
- no correctness-critical async consumer is required;
- missed realtime delivery recovers by reading the current rundown/revision;
- event classification: persisted observational/audit fact.

## Event authority movement

The starting release-burn-down had exactly two show-family hard event findings:

```text
show.changed     DOMAIN_CONSEQUENCE_DECLARED
show.cue_changed DOMAIN_CONSEQUENCE_DECLARED
```

Both inherited the nonexistent `task:show.blocker` consequence from generic domain metadata.

The branch source contract resolves those **2 -> 0** by proving canonical governed mutation + atomic event persistence + canonical readback/recovery and by declaring zero required async consequences.

This is source-contract movement, not an exact-head release certification claim. The exact candidate still requires local/disposable S16/catalog generation and the show/cue rehearsal before integration/merge certification.

## Recovery / realtime

Realtime is an invalidation/delivery optimization, not authority.

```text
canonical command commits
-> receipt + DomainEvent committed
-> optional realtime delivery
-> client may refresh
```

If the response is lost after commit, the client retries with the same operation identity and receives the existing result. If realtime is missed, reload/readback reconstructs lifecycle and cue truth from canonical state/revisions.

The Public Live projection reconciles `showMode` against `shows.status`, so stale companion metadata cannot promote a scheduled/paused/ended/cancelled show into a different lifecycle state.

## Verification

Focused static contracts cover:

- Organizer direct-write cutover;
- lifecycle vocabulary / transition matrix;
- lifecycle + runtime CAS;
- cue revision CAS and legal transitions;
- raw runtime/cue subtree guards;
- legacy cue RPC revocation;
- durable operation/event relationship;
- lost-response replay ordering;
- show event observational semantics;
- S16 compatibility classification and exact column grants.

Stateful local-only rehearsal:

```text
.github/scripts/v3-show-cue-authority-rehearsal.sh
.github/tests/v3-show-cue-authority.sql
```

The rehearsal refuses non-loopback Supabase endpoints and rolls all fixtures/state back. It covers raw-writer rejection, foreign actor denial, stale revisions, duplicate start/cue operations, pause/resume, result subphase, terminal transition rejection, cross-show cue IDs and delete-after-commit replay.

No hosted production Supabase state is used for automated verification.

## Remaining external dependencies

These are outside canonical show/cue authority and should be completed by their domain owners:

1. Presentation owner migrates its direct `theme_id`/presentation `broadcast_config` update to a governed command.
2. Lineup owner migrates `lineup_stage` to a governed lineup command.
3. Voting/Televote owner migrates `voting_config`/`qualifier_count` to its canonical Voting command.
4. Organizer product work may expose the complete backend lifecycle transition set (`preparing`, `delayed`, `paused`, `cancelled`) as first-class controls; absence of those buttons does not create an alternate mutation authority.
5. Exact-head S16 catalog generation and the local stateful rehearsal must run on the integrated candidate SHA before release certification.
