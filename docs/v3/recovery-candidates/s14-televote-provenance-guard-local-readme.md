# S14 published Televote provenance guard | isolated regression only

**Status: DRAFT / LOCAL TEST ONLY. Not deployable. Not an S14 migration-history repair.**

## Actual hosted catalog, read-only, 2026-11-07

The production Solaris Studio project has `public.televote_votes`, `public.shows`, `public.editions`, and the established statement-level platform guard, entity-edition trigger and after-row result-sync trigger. The `private.v3_televote_result_projection_sources` table, S14 provenance guard function/trigger, source-apply function and snapshot function, and public Televote projection status RPC are **absent**. Existing `public.sync_results_after_vote_change()` still uses the legacy per-row result-sync implementation.

The live production `private.studio2_guard_direct_client_write()` checks `session_user` before its platform-mode check. On a privileged connection that executes `SET ROLE authenticated`, `session_user` can remain `postgres`. This is precisely why the historical 01010 hardening removed the same login-based bypass from the Televote provenance guard.

## Defect targeted

The original `20261017001010_v3_s14_televote_projection_guard_hardening.sql` checks only `NEW.show_id` on UPDATE. Once a show has a published provenance row, moving an existing `public.televote_votes` row **away from that managed show** to another show or to NULL may evade that source-managed check. A move *into* a managed show is already checked.

Our local-only **forward candidate** extends the hardened trigger to check **both `OLD.show_id` and `NEW.show_id` for UPDATE**, while leaving the original service-role and scoped-write-marker paths intact. It creates the canonical provenance table and trigger, but **does not install source-publish synchronization, version verification, results reconciliation, snapshot status or replay repair**. This is a guard-only effect slice, not a full Televote source-truth implementation.

## Local proof

`scripts/rehearse-v3-s14-televote-guard-local.sh` runs on disposable loopback PostgreSQL 17.11 with *invented* show and vote IDs and a purposely permissive authenticated RLS policy. It installs a minimal schema based on read-only hosted metadata, the observed statement-level platform guard, and a **synthetic results-sync invocation counter**. It runs the candidate in one local DB and replaces the candidate guard with the original hardened function in a separate local comparison DB.

The rehearsal should prove that:

- Six unauthorized operations are rejected on a provenance-managed vote, including insert, delete, points update, moving into a protected show, moving out to an unprotected show and removing its show scope.
- The **original historical hardened source** allows the move-away under the same synthetic conditions. That is a reproduced regression, not a hypothetical claim.
- Legacy, non-provenance-managed shows remain editable under the deliberately permissive fixture policy.
- A correctly marked service-role request can still update a managed row.
- Authenticated roles cannot directly read or forge provenance records.
- Failed writes do not reach the synthetic after-row result-sync trigger.
- Reapplying the candidate fails closed without changing its provenance data.

**Important limitations:** Real production RLS policies, hundreds of other database objects, published-round/aggregation hooks, and the true results recalculation machinery are not present in this fixture. The test is *not* a hosted-head-equivalent rehearsal and gives no release certification. The private helper definition and platform guard were reviewed from read-only catalog metadata, but the fixture cannot prove that every production caller and session GUC is trustworthy.

## CRITICAL UNRESOLVED TRUST BOUNDARY

The canonical guard intentionally honors `solaris.v3_televote_projection_write = '1'` or the `request.jwt.claim.role = 'service_role'` helper. In PostgreSQL a SQL-capable session may be able to set custom GUCs itself; raw marker presence alone is **not authenticated provenance**. This local guard regression **does not prove that untrusted users cannot reach a marker-setting path**. Before any production release, the System owner must prove all paths that set these markers, PostgREST and SECURITY DEFINER access, and coupled RLS/platform guard behavior. A further authorization design change may be needed. Do not mistake this PR's green CI for a security sign-off.

## Parallel S14 Archive dependency check (read-only)

On the same hosted project and date, an additional `pg_catalog` check found **public.studio2_edition_runtime present**, but the following nine critical Archive artifacts absent:

- `private.v3_archive_runtime_transition_gates` and `private.v3_archive_task_reconciliation_gates` (tables)
- `public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)` (governed RPC)
- `private.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)` and `private.v3_arm_archive_runtime_transition_gate(uuid)` (private implementation/issuer)
- `private.v3_guard_archive_runtime_transition()`, `private.v3_guard_archived_edition_workflow_write()`, `private.v3_guard_archived_edition_task_resurrection()` (guard functions)
- `v3_guard_archive_runtime_transition` on the edition runtime (trigger)

These effects belong to multiple coupled historical migrations, notably `20261019112100_v3_s14_archive_consequence_reconciliation.sql`, `20261021110000_v3_s14_archive_guard_authority_forward_fix.sql`, `20261021163000_v3_s14_failed_task_delivery_evidence.sql`, and `20261021202000_v3_s14_archive_reconciliation_convergence.sql`. The owner-only one-shot transaction gate must be installed and tested **with** the lifecycle transition RPC and terminal Task/notification reconciliation, not in isolation. S13 contract registration is also missing on hosted production.

**Separate Archive repair is still blocked:** this Televote guard PR does not install or claim to repair Archive. No past migration record is manufactured, and no hosted edition state is modified.

## Release NO-GO

Keep the SQL under `docs/v3/recovery-candidates/`. Do not merge, run against hosted Supabase, backfill source records, rewrite published votes, mark historical migration versions applied, or modify feature flags. Full S14 published-source, replay, Archive and Results work must be rehearsed on a sanitized hosted-equivalent database, then reviewed as a newly versioned forward-only migration with explicit owner approval. CI must never contact hosted Supabase.
