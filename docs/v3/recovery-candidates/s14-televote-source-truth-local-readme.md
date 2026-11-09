# S14 Televote source-truth recovery candidate

This local-only candidate restores the canonical published-result projection
contract in disposable PostgreSQL. It installs the source projection ledger,
official round/combined adapters, bounded recipient validation, provenance
status, idempotency/stale-source rejection, and the canonical
`public.televote_votes` materialization path.

The candidate must be applied only after the owner-controlled
`v3_guard_source_managed_televote_projection` trigger exists. That guard is
owned by the separate S14 provenance work and is intentionally not duplicated
here. The candidate is not in `supabase/migrations`, does not repair hosted
migration history, and does not authorize production adoption.

Run the disposable proof with:

```sh
scripts/rehearse-v3-s14-televote-source-truth-local.sh
```

The fixture covers official round selection, source provenance, bounded and
duplicate-input rejection, replay/stale behavior, canonical projection
materialization, status readback, and direct-writer denial. It does not prove
hosted catalog equivalence, production RLS/grants, or adoption of the pending
historical migration frontier.
