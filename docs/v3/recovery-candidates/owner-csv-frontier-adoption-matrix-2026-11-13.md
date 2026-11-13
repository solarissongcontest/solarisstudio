# Provisional owner CSV reconciliation and S13/S14 recovery adoption

**Comparison date:** 13 November 2026 UTC. **Main baseline:** 8ece96834445e953b1ad060acc8f1043461885f2, 495 canonical SQL files. The owner-supplied SQL Editor CSV has 497 rows, all unique, strictly ascending, and no malformed version/name records; head 20261101181812 (v3_s13_adopt_rules_v4_1_roleplay_registry). Raw CSV SHA-256: 07d8b659c4d8fe88e52c1db6977cf763d983ab7bb9dab3446906f8cca421f5e3.

**PROVENANCE UNVERIFIED:** The CSV has no project-ref or capture-time evidence. Canonical production ref to confirm: dkxmnvekiopyesuzggeu. Distinct Supabase Preview: oxtbskojiexkaspputvo. Raw export stays outside the repository, public issues and CI; do not assume the rows came from production simply because they match earlier aggregate observations.

## Exact version evidence

[Sanitized machine-readable 352+281+36+33 inventory](./evidence/owner-csv-frontier-delta-provisional-2026-11-13.json) records all version identities and the 36/33 source file names, without copying raw migration-history rows or the 352 hosted bootstrap names. It also records each gap's dated observed effect, dependency and possible recovery candidate, and per-file provisional scope of every newer source migration. **There is no defensible one-to-one bootstrap alias mapping**; do not manufacture it.

| Metric | Result |
| --- | ---: |
| CSV / unique | 497 / 497 |
| Source migration SQL | 495 |
| Matching exact versions, matching names | 145, 145 |
| Hosted-only pre-cutover version identities | 352 |
| Source-only at/before cutover | 281 |
| Post-cutover source-only through recorded hosted head | 36 |
| Source-only newer than recorded hosted head | 33 |
| Hosted-only post-cutover, name mismatches | 0, 0 |
| Total source-only / hosted-only | 350 / 352 |
| Immutable cutover | 20261014020000 |
| CSV head | 20261101181812 |

Merged #2476 semantics for this **supplied history** are historyReconciled=false (36 post-cutover holes) and previewHistoryCompatible=false (352 remote-only and 317 local-only identities at/before its recorded tip). This does **not** establish the actual separate Preview project's compatibility. The names of 145 matching-version source files also match. Migration-history absence does not prove SQL-effect absence. Neither strict gate is eligible to PASS, and no permission to insert or rewrite version records exists.

## Operator-only offline conversion and comparator

From a clean, exact-commit checkout, run the new adapter and existing auditor using private paths outside the Git tree:

    node scripts/convert-v3-migration-csv-offline.mjs --input /private/production-history.csv --output /private/production-history.json --expected-rows 497 --expected-tip 20261101181812

    bun run scripts/check-v3-production-migration-frontier.ts --remote-history /private/production-history.json --expected-sha "$(git rev-parse HEAD)" --require-reconciled --json

    bun run scripts/check-v3-production-migration-frontier.ts --remote-history /private/production-history.json --expected-sha "$(git rev-parse HEAD)" --require-preview-compatible --json

**Run the two failing gates separately**, capturing exit statuses locally. The adapter preserves version/name bytes as decoded values, requires exact ascending and unique 14-digit strings and optionally an exact 0-based index, rejects unexpected columns and quotes/count/tip, refuses overwrites or repository-local evidence output, and never contacts Supabase. It does not add an unverified projectRef. If separately proven provenance becomes available, use a bound project-ref evidence envelope only after #2478 is integrated and reviewed; never confuse a human-supplied label with cryptographic export authentication.

## Actual five-stage adoption matrix

| Stage | Preconditions and intended effects | Existing local recovery and verification | Failure / security / approval |
| --- | --- | --- | --- |
| **A: real hosted dependency substrate** | Verify exact 16 S14 parent relations, 31 critical columns, permission/strict-dual helpers, function signatures, schema/table ACLs, archive and notification RLS, direct-write guards and historical publication versions before any new DDL. Determine whether unknown partial objects already exist. | Existing S02 hosted-observed, bounded 56-table/672-grant local catalog reconstruction; scripts/v3-s13-s14-authorization-dependencies.mjs. | Abort on any definition, owner, ACL, trigger or data-shape mismatch. Preserve hosted-only studio2_platform_direct_write_guard triggers on public.admin_notifications and public.notification_deliveries. S02 models only 56 of 215 hosted tables; not complete hosted equivalence. |
| **B: S13 registration foundation** | First 5 private framework tables, 7 public RPCs, exact helper signature/SECURITY DEFINER grants and 2 index identities. Then semantic registry and strict registration. Recover S6 notification dependencies separately; never replay the temporary S6 historical filename-alias window. | docs/v3/recovery-candidates/forward-only-s13-foundation.sql; scripts/rehearse-v3-s13-forward-recovery-local.sh and merged #2467/#2469/#2473 use isolated PG17.11, frozen source vs hosted-observed helper, interrupted transaction, ACL and negative retry tests. | Preflight refuses pre-existing/unknown S13 objects or drifted helper; transaction abort must leave zero partial objects. Second execution intentionally rejects rather than silently replacing security-definer logic. Independent adoption/deploy approvals required. |
| **C: S14 Archive, Task, notifications** | After S13, install only required reviewed Archive transition, terminal Task gate, reconciler and delivery invariants. Fix exact service_role execution only when evidence matches; maintain one-shot unforgeable Archive authority and immutable failed delivery evidence. | docs/v3/recovery-candidates/forward-only-s14-archive-integrated-local.sql; scripts/rehearse-v3-s14-archive-forward-effects-local.sh; local 31-column check, 56-table schema and ACL comparison, failure/retry and negative cross-edition checks. | Abort on conflicting triggers, role grants or unknown runtime helper. No direct service/browser writes, no task resurrection, no published Results regression. 159 hosted tables remain unmodelled; do not claim hosted equivalence. |
| **D: Televote → Results → Publication** | Canonical Televote votes/round provenance first; source-managed result projection, guard, replay and signed Combined authority second; canonical result calculation/countback, immutable published version snapshot, Final Results readiness, publication and Archive convergence afterward. | docs/v3/recovery-candidates/s07-televote-managed-source-guard.sql and s08-televote-single-writer-local.sql; scripts/rehearse-v3-s14-televote-source-truth-local.sh and scripts/rehearse-v3-s14-signed-combined-projection.sh. Draft Televote owner PR #2404 must be reconciled before integration. | Enforce one authoritative writer, round/edition/show isolation, role ACLs, stale-result denial, signed deduction validity, spoiler safety, transactional projection rollback. Never activate live voting or blindly apply Results SQL. |
| **E: later 33 source migrations** | Only after A–D verify each exact source dependency, policy/grant, legacy row assumption and feature gate; no implicit 33-file launch dependency. | Sanitized JSON classifies 17 World/Search/metadata items as potentially deferred for narrowly scoped contest launch, 2 prerequisites and 14 contest-critical currently blocked by earlier recovery/effect proof. | Those provisional labels need owner release-scope confirmation; deferred is never permission to bypass mandatory behavior. Do not run a direct db push, --include-all or replace historical SQL. |

The 36 historical gaps contain different affected domains. The 9 November *selected-effect* inventory classifies **19 absent, 3 partial and 14 unknown**, rather than 36 absent full migrations. Selected prior observations include the S13 five tables/seven RPCs absent; selected S14 Archive guards absent; aggregate task reconciliation function present but lacking service_role EXECUTE; publication-event service-role grant present but full effect partial; 28 conflict functions observed with SQLSTATE 40001 rather than desired PT409 transport; no selected immutable published-Results snapshot. Two hosted-only notification/admin direct-write guards were present. **All were dated 7–9 November and do not authenticate the current exported CSV project or current SQL effects.**

### Rollback, evidence and release invariants

Forward-only migrations require a reviewed, unique future version, clean exact-SHA checkout, preflight catalog/ACL assertions, lock/statement budgets, transactional abort on mismatch, interrupted-session retry proof and local versioned output hashes. A failed stage stops dependent stages; do not roll back history records, change bootstrap cutover, use placeholders that allow unauthorized actors, or erase signed voting/result evidence. Database backups, restoration, PITR validation and the independent production operator are separate prerequisites. There is **no** production write approval here.

**Minimal new owner approval required after project confirmation:** one tightly bounded, schema-only read-only pg_catalog confirmation of currently unresolved 5 S13 tables + 7 RPCs and their grants/owners, exact S14 Archive transition/terminal Task/notification trigger contracts, Televote source/projection guard, publication version snapshot, and the service-role task reconcile overload. No application rows, SQL execution, dynamic calls or tests against production. The earlier single strict-dual function inspection permission is consumed. Additional nested dependency reads, if justified, need separate approval.

Existing workflow CI can run safe local PostgreSQL 17.11 rehearsals, but **this PR's new CSV parser test is synthetic only**. The owner CSV has not been run through a full local git checkout of the merged Bun CLI in this session; exact identity outputs were independently reproduced from the current GitHub migration directory and the uploaded CSV. Preserve that distinction until an operator performs the strict exact-SHA local invocation.

**Release: NO-GO** for 14 November public V3 soft launch. **Single next dependency:** establish the CSV's actual project provenance, then obtain the minimal separately authorized current production SQL-effect/ACL comparison needed to select a safe S13 → S14 → Televote/Results forward-only repair.
