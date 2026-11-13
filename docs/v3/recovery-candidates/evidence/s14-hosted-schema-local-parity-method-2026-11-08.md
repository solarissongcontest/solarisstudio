# V3 S14 production-observed schema compatibility checkpoint

**Status: read-only catalog evidence + isolated local comparator. NOT a production-schema clone. NOT a migration or deploy plan.**

## Why this is needed

The integrated S13 → S14 recovery in draft PR [#2403](https://github.com/solarissongcontest/solarisstudio/pull/2403) passed a simulated gap on a clean, fully source-migrated local Supabase database. That test does not establish that the same SQL can be upgraded against the **actual hosted production frontier**, whose migration-history effects are incomplete.

This PR checks an important intermediate question: **does the current source-clean schema have the same existing database object shapes as the hosted schema for the eight ledgers and projections used directly by Archive recovery?**

## Manual hosted snapshot (2026-11-08)

A single SELECT against `pg_catalog` returned a JSON metadata manifest for:

- `public.studio2_edition_runtime`, `public.studio2_organizer_tasks`
- `public.admin_notifications`, `public.notification_deliveries`
- `public.studio2_operation_receipts`
- `private.v3_result_versions`, `private.v3_domain_events`, `private.v3_domain_event_outbox`

The checked-in file `docs/v3/recovery-candidates/evidence/s14-hosted-eight-table-schema-metadata-2026-11-08.json` contains **114 column definitions, 69 constraints, 30 indexes, 20 non-internal triggers and four policies**. For each table it records owner, RLS/force-RLS, selected role privilege bits, column type/nullability/default-expression hash, and constraint/index/trigger/policy identity and *definition MD5*. It contains **no application rows, usernames, email addresses, votes, receipts, auth secrets, or personal data**. The snapshot is a *point-in-time observation*, not a complete database export.

The query `scripts/v3-s14-schema-metadata-readonly.sql` can be rerun manually by an authorized operator to refresh the snapshot after review. CI must **never** execute it on hosted Supabase.

## Independent local comparison

`.github/workflows/v3-s14-hosted-catalog-local-comparison.yml` uses the exact PR SHA, refuses any remote DB credentials, builds disposable loopback-only Supabase, performs `supabase db reset --local --no-seed`, then runs the **same SELECT** against local PostgreSQL and compares the JSON with the manually captured hosted manifest.

`scripts/compare-v3-s14-hosted-metadata.mjs` reports field-by-field differences as:

- **Hosted-only:** a column, named constraint, index, trigger or policy exists on hosted but is absent in the source-clean local build.
- **Local-only:** the source-clean local build has an effect absent on hosted.
- **Different:** the same named property differs, e.g. datatype, nullability, RLS, grant posture, validated constraint or hashed definition.

Differences produce an explicit **release NO-GO** and a nonzero CI result. Unit tests verify both exact matching and negative RLS/nullability/constraint scenarios. Definition hashes are diagnostic, not cryptographic evidence of safety; PostgreSQL version or SQL-expression normalization can produce benign hash differences requiring manual investigation.

## First real comparison: reproducible NO-GO

The first isolated comparison (GitHub Actions run `42466297014`) reported **34 differing leaf properties** before role normalization. The corrected exact-commit re-run (GitHub Actions run `42466799975`, attempt 2) is a **verified NO-GO with 30 genuine differing leaf fields**, comprising **10 named object identities** plus **four ACL privilege bits**. It found **zero column-type/nullability and zero named-constraint definition mismatches** within this eight-table scope. The differences included:

- **Hosted-only guards:** `studio2_platform_direct_write_guard` on `public.admin_notifications` and `public.notification_deliveries`. Those guards must remain authoritative and must not be lost through a clean-source reconstruction.
- **Source-only Archive and Task guards:** `v3_guard_archive_runtime_transition`, `v3_sync_archived_edition_legacy_status`, `v3_guard_archived_edition_task_resurrection`, `v3_project_resolved_task_delivery_state`, and the receipt trigger `v3_emit_entry_submission_event`. These are source effects absent from the observed production baseline and need a deliberate release ordering.
- **Source-only indexes:** `v3_domain_event_outbox_created_at_idx`, `v3_domain_events_occurred_at_idx`, and `studio2_operation_receipts_created_at_idx`.
- **Notification delivery grant differences:** the hosted database exposes direct table privilege bits for `anon` and `authenticated` that the source-clean local build does not. Table grants are **not** equivalent to RLS authorization; the hosted table retains RLS, and this finding is *not* proof that anonymous users can access delivery rows. Authorization requires separate role/RLS testing.
- **Four RLS policy digest differences were non-semantic:** the initial fingerprint included per-database PostgreSQL role OIDs. The corrected query and snapshot hash policy predicates and compare sorted **role names**, not OIDs. The final rerun confirms the four phantom differences are gone, with the other 30 differences unchanged.

The historical guard installation logic in [`20261003210000_organisation_os_v5_read_only_enforcement.sql`](https://github.com/solarissongcontest/solarisstudio/blob/main/supabase/migrations/20261003210000_organisation_os_v5_read_only_enforcement.sql) derives the tables receiving `studio2_platform_direct_write_guard` from `information_schema.table_privileges` **at migration execution time**. Different grant histories therefore change which tables receive the trigger. This is a plausible mechanism for the reproduced guard mismatch, **not** proof of why each hosted guard exists. A future approved forward migration must preserve existing live protection and deliberately reconcile guard attachment and grant/RLS semantics. Do not delete production triggers to make the schemas superficially match.

**Reconciliation order:** (1) Protect and account for the hosted-only platform guards, (2) settle notification-delivery ACL/RLS intent, (3) account for five source-only Archive/Task/receipt triggers, (4) review three source-only performance indexes, (5) retest on a sanitized hosted-head-equivalent schema with explicit owner/release authority. The separate S13/S14 forward candidate remains only a local rehearsal; a fully source-clean replay cannot substitute for this sequence.

This is already concrete evidence that the source-clean local migration chain is **not the same catalog** as the observed hosted system. It does not mean the existing hosted guards should be dropped or that local-only objects should be forced into production. Each discrepancy requires a migration-owner effect/authority classification.

## How to interpret results

**A failing local comparison is useful evidence, not proof the recovery SQL is bad.** It shows exactly why a clean source schema is not identical to the eight-table hosted baseline. Source-only objects may represent later migrations that still need an **explicit forward-effect reconciliation**. Hosted-only objects may represent hotfixes or historical differences that the source replay would erase or fail to respect.

Passing the comparison means only these eight tables' observed metadata matched. It does **not** certify the rest of the hosted catalog, migration versions, row distributions, RLS runtime authorization, security-definer trust boundaries, compatibility of unpublished Results, or actual S13/S14 application.

## Release blockers unchanged

The correct hosted database still lacks the S13 governance foundation and S14 Archive effects, and other migration-history gaps remain. An isolated hosted-head-equivalent upgrade must eventually be built using approved, sanitized, **schema-only** evidence, then tested with representative synthetic contest data and independent authorization checks. No blind historic replay, fabricated migration-history records, production SQL Editor execution, hosted browser/Playwright/CI tests, real vote/result mutation, or feature-flag changes.

**Do not merge this draft to release V3. No hosted DB changes were made.**
