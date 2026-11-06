# TG10 institutional vote Task Engine recipient predicate

**Status:** Source-only prerequisite, stacked on WORLD-05 TG8 #2275. Not a Task Engine cutover, not merged/deployed/certified. Owner claim: WORLD-AUTO-55476250-dfa4-472e-8ec3-12186c3556bc.

## Why this exists

The existing canonical `studio2_organizer_tasks` / `private.studio2_task_recipient_eligible` / `private.studio2_sync_task_notifications` use edition-scoped capability assignment. Terra Solaris votes must instead authorize an individual **country/seat, frozen electorate, currently valid representative or approved proxy**, and the current vote deadline. Feeding World vote tasks into the existing notification fanout unmodified can leak tasks to wrongly capable operators or omit lawful proxies.

## Producer → consumer contract

`private.world_vote_task_recipient_eligible_v1(p_vote_id uuid, p_country_id uuid, p_user_id uuid) → boolean`

- Internal **read-only** predicate, callable only from trusted database code; it is not an authenticated/public RPC. No application may treat client-side checks as authoritative.
- Returns true only with both TG8 feature flags enabled, platform permission for `world.vote.cast`, live open vote within the UTC server-time window, active institution/organ, a frozen eligible country seat, TG8's exact current representative/proxy authorization, and **no existing private ballot** for that vote/country.
- A previously valid recipient must be rechecked on **every read, task claim, notification fanout, pre-send, and delivery retry**. Closing/certifying the vote, expiry, revoking a proxy, removing representation/membership, disabling voting, platform read-only mode, or casting the ballot must deny immediately.
- World public discovery rollout is **not** the private ballot authority. The predicate mirrors the two TG8 voting flags. WORLD-00 may govern separate public exposure.

## Explicit downstream work not done here

WORLD-01 / canonical V5 Task Engine owner must add institution/organ/country/subject scope to **existing** `studio2_organizer_tasks`, preserve one source_key per country and vote, and route all World-recipient filtering through this predicate, not the legacy `studio2_user_has_capability(user, capability, edition)`. WORLD-06 notification owner must suppress, prune and reconcile stale World deliveries through the same authorization before any institutional vote task is emitted. WORLD-05 retains ownership of vote/electorate/ballots and must preserve the current private predicate signature or coordinate migration.

No World tasks or notifications are inserted by this migration. Do **not** simply wire it to the legacy fanout without scoped recipient enumeration. This deliberately avoids a second Task Engine and premature disclosure.

## Verification required before integration

1. WORLD-01 migration reservation review (proposed ID: `20261107150500`).
2. WORLD-05 review against exact TG8 #2275 head and its future amendments.
3. Focused Vitest source-contract suite and disposable/local PostgreSQL scenarios: representative, approved proxy, revoked/expired proxy, changed membership/representation revision, previously cast country ballot, closed/expired vote, disabled voting flags, platform maintenance, null actor and RLS/EXECUTE privilege denial.
4. WORLD-00 parent-first integration approval, exact-head Quality/S13/S15/S16/Browser/bundle checks as applicable. Never automated production Supabase access.

This contract is **not** an authorization to publish tasks, enable flags or deploy a migration.
