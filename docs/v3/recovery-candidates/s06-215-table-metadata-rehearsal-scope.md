# S06 final 15-table networkless hosted-catalog identity recovery candidate (215/215)

## Scope and provenance

Base main: `105b902f540400bb3a039c3995e576c0212bbe59` after #2440, 200/215 distinct relations. This System-only candidate adds exactly **15 missing physical table identities** observed through bounded, **read-only** `pg_catalog` inspection of the existing PostgreSQL 17.11 Solaris Studio instance. No application rows, votes, passwords, function bodies or hosted DDL/DML were extracted. The existing frozen `s06-hosted-catalog-digests-2026-11-10.json` (215 physical relations, 727 routines) is not edited.

Remaining relations: `private.v3_entry_reviews`, `private.v3_entry_versions`, `public.country_profile_sections`, `public.country_themes`, `public.integrity_case_appeals`, `public.prediction_entry_versions`, `public.prediction_items`, `public.public_ux_events`, `public.studio2_incidents`, `public.studio2_jury_members`, `public.studio2_notice_receipts`, `public.studio2_notice_versions`, `public.studio2_official_notices`, `public.studio2_show_publication_executions`, and `public.submission_review_history`.

The new fixture models **204 columns, 134 constraints, 49 indexes, 20 RLS policies and 28 trigger definitions**. Trigger and RLS-function dependencies are conditionally represented by **nonfunctional, fail-closed local-only signatures**. Such placeholders raise on execution; they are not production implementations.

## Required verification

- Use the **existing** CI job, pinned `postgres:17.11` image, `--network none`, **no published ports**, en-US ICU collation. Never send test traffic to hosted Supabase.
- Reconstruct **215 distinct** hosted-observed physical table identities in **one disposable database**. Original 56 S02 relations keep older scope-limited checks. Subsequent 159 relations must each match all 17 frozen physical-catalog fields, including each new final-fifteen field and digest.
- Recheck those 159 strict fingerprints after S13-absent rejection, interrupted S14 DDL rollback, same-database S13→S14 restart, and duplicate-application refusal. Retain 21 upstream routine fingerprint checks.
- Full **215 relation / 727 routine** hosted-equivalence comparator **must still fail closed**. Complete routine definitions/security, role memberships, extension state, original 56 complete digests, data distribution, migration history, permission behavior and production environment effects have not been established.
- Exact-head Quality, Browser Audit, S13, S15, bundle and recovery checks plus independent source review are required before merging.

## Hard exclusions

**215/215 table identities is not S06 completion or a production recovery.** This candidate does not grant permission for hosted migrations, live write workflows, public release, beta certification, production deployments, S07 cutover or the import of actual user data. It does not change `supabase/migrations/**`, production secrets or CI egress safeguards. Track System ownership through coordination issue #574.
