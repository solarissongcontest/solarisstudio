# S13–S16 production catalog preflight (operator-only)

**Status: READ-ONLY SOURCE / NOT A PRODUCTION MIGRATION.** Target: Solaris Studio Supabase `dkxmnvekiopyesuzggeu`. Do not use with any other project or in automated production CI.

The adjacent [SQL](./s16-production-frontier-readonly.sql) contains only four bounded SELECT/CTE queries. Run manually in a verified authorized production SQL session as a **catalog inspection**, never through browser tests. Store only sanitized results.

## Live baseline independently checked on 19 November 2026

PostgreSQL **17.11**, **497** hosted migration entries, tip `20261101181812`, application mode **degraded**. Compared to updated `main` `28c994ea3aed1aee01dd5cc15cbb4a1fc8e12723`, there are **36 missing post-bootstrap migration identities before the hosted tip** and **59 newer unapplied source migrations**, including unrelated World expansion. No unmatched post-bootstrap hosted versions or migration-name mismatches were found. Four critical canonical dependencies (S13 registration, governed Confirmation, S08 source guard, Results operation v2) are absent. Effective API-role TRUNCATE is present for **32/42** checked role/relation pairs.

## Mandatory cutover boundary

- Never use the existing outdated October `scripts/v3-production-supabase-push.sh` to apply the missing migrations. Never mass replay missing history or forge `supabase_migrations.schema_migrations`.
- The networkless 29-stage reconstruction includes LOCAL-ONLY fixtures and generators; the CI evidence does not make them hosted-ready SQL.
- An independently restorable production backup/Storage/Auth/Vault and role-grant recovery record is a separate gate. User acceptance of backup evidence is not equivalent to a verified restore receipt.
- A production operator must freeze a hosted-only, correctly ordered, SHA-256-checksummed forward-only manifest; match exact live catalog fingerprints and rollback/repair plan; rehearse on isolated production-derived environment and obtain authorization for exact SQL bytes.
- Retire direct competing writers only after required canonical operations are positively verified. Post-cutover: **0/42 TRUNCATE**, **0/15 competing direct-writer pairs**, preservation of canonical RPCs/data, and operational mode/deadline decision. Stop on any failed catalog preflight.
- No database mutation, PR merge, public-write activation, or Cloudflare traffic promotion is approved by this read-only package. Owner handles final Cloudflare promotion.

This file was added independently of limited-release PR #2574 to avoid changing its source during verification.
