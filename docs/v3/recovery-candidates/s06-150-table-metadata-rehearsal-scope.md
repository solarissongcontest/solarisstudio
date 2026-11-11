# S06: 150/215 table identity recovery fixture candidate (NOT CERTIFIED)

**Source baseline:** main `49ccc45625bcdc17c1ac80b472055e593f47ff6c`, 100 integrated table identities from merged PR #2438. A new S06 candidate adds **50 distinct frozen hosted-observed relation identities** in the same local PostgreSQL 17.11 recovery fixture. Intended 150/215 = 69.8%, leaving 65 relation identities.

## Exact scope

- 50 empty-table SQL reconstructions, inferred from a bounded **read-only pg_catalog query** of the connected Solaris Studio PostgreSQL 17.11 hosted instance. No application rows, PII data export, passwords, privileged credentials, or hosted writes.
- Preserve the frozen `docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json` evidence. Each new relation is pinned to its 17-field catalog fingerprint (schema/name, kind, owner, RLS, forced RLS, ACL MD5, column count/MD5, constraint count/MD5, index count/MD5, policy count/MD5, trigger count/MD5). Matching hashes is necessary, not evidence of row-data equivalence.
- The original **56 tables** retain their older **scope-limited** S02 checks, and **44 earlier tables** retain strict full-field parity checks. The new **50** undergo the same strict full-field comparator, both before and after S13-to-S14 Archive forward recovery.
- Single disposable Docker `postgres:17.11` database, `--network none`, no published ports, ICU en-US, exact checked-out PR head SHA, no Supabase-hosted CI credentials; the existing S13-absent, interrupted-transaction rollback, restart, duplicate rejection and source integrity checks remain required.
- Eight trigger symbols and two authorization-policy function signatures absent from the 56-table fixture are represented by **fail-closed, nonfunctional local-only placeholders** so the metadata fixture can reproduce catalog shapes. They raise on execution. This **does not validate their real function bodies, policy runtime decisions or production trigger behavior**. No test may claim operational parity for those functions.

## Hard boundary

**150 is a table-identity / metadata-coverage milestone only.** Unmodeled: 65 physical relations; no full 727-routine function dependency/security closure; no role membership, complete extension, original production row state, migration history equivalence or production cutover evidence. Full S06 equivalence gate must still **FAIL CLOSED**. Do not apply any SQL from this directory to production, authorize a hosted migration, deploy, turn on write workflows, certify S14/S16, or declare a production release.

**Status:** candidate pending exact-PR-head networkless CI and independent source review. Count 150 as integrated on `main` only after the PR merges and remains supported by its proof artifacts.
