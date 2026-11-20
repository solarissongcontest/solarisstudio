# V3 owner-supplied CSV: provisional frontier and forward-only recovery qualification

**Engineering status (13 November 2026): source comparison COMPLETE; production SQL-effect qualification NOT COMPLETE; release NO-GO.**

## Evidence custody and exact version result

- Reviewed source main: `8ece96834445e953b1ad060acc8f1043461885f2` (unchanged 495 SQL migration filenames).
- Owner upload: `Supabase Snippet Untitled query 2(1).csv`; raw SHA-256 `07d8b659c4d8fe88e52c1db6977cf763d983ab7bb9dab3446906f8cca421f5e3`.
- Uploaded raw header: `version,name` (the document viewer inserts a display index); 497 rows, 497 unique 14-digit versions, strictly ascending, zero empty names/duplicates/malformed records.
- Exported history tip: `20261101181812_v3_s13_adopt_rules_v4_1_roleplay_registry`. Immutable cutover: `20261014020000`. Export capture UTC: **unknown**.
- Expected canonical production ref: `dkxmnvekiopyesuzggeu`. **Project provenance NOT VERIFIED by the CSV**; the owner must confirm that export's SQL Editor project before it can be called authoritative production evidence.
- Separate Preview project: `oxtbskojiexkaspputvo`; **no Preview migration metadata was obtained**.
- Independently reproduced exact source-to-upload comparison: 145 matching versions, 352 remote-only bootstrap IDs, 281 source-only bootstrap IDs, 36 post-cutover local history gaps through the tip, 33 newer repository SQLs, zero post-cutover remote-only versions and zero matching version/name conflicts.
- **Both gates are expected to fail** against the CSV: raw-preview-style identity compatibility fails on the bootstrap divergence; `historyReconciled` fails on the 36 post-cutover gaps. Preview *project* compatibility remains **unverified**. Neither result measures SQL effects.
- The full sanitized, machine-readable per-version identity and classification report is [owner-csv-frontier-provisional-2026-11-13.json](owner-csv-frontier-provisional-2026-11-13.json). It includes only version IDs for bootstrap-only history, **not** all 497 raw exported version/name pairs. Its 36 dated observations refer to selected effects only, not to full installed migration semantics.

## Scoped SQL-effect evidence: 36 historical gaps

The source SQL files were inspected at the reviewed main commit. The linked JSON lists each exact filename, intended recovery direction, named dependency, dated catalog classification, candidate, and release role. Dated [S01 catalog reconciliation](evidence/s01-hosted-source-delta-2026-11-09.json) (selected observations 7-9 November 2026) reports **19 absent, 3 partial, 14 unknown/not re-inspected**. No whole SQL migration is certified currently present from this CSV.

Critical dependency groups (36 items in total, each accounted for in the JSON):

1. **Televote source and guard (3):** establish `private.v3_televote_result_projection_sources`, canonical `private.v3_apply_published_televote_projection`, guard trigger on `public.televote_votes` and drift-safe replay. The 9 Nov bounded check found the source table/guard absent. The [source guard donor](s07-televote-managed-source-guard.sql) is **not** authorization to install it or to create a second writer; coordinate with draft voting authority #2404.
2. **Entry, Confirmation, voting, rollout (9):** acknowledgement outbox, entry-review and deterministic HTTP409, confirmation requirement verifier, entry lifecycle events, service-role grants, expected-edition voting invalidation, published-entry event EXECUTE, and disabled-by-default public-live flag. They alter SECURITY DEFINER functions, privileges, triggers and event semantics, not merely metadata.
3. **S9/S10 (2):** observability snapshot and indexes, then SLI snapshot. Existing local candidates: [S9](forward-only-s9-observability-local.sql), [S10](forward-only-s10-sli-local.sql). Historical effect observations are absent; cannot push before S13/ACL parity.
4. **S13 and notification registration window (7):** five private registry/backfill tables and seven public RPCs, then strict registration; three S6 notification reconciliation/reactivation/failure-verification changes and bounded Confirmation repair require their own semantic qualification. The [S13 forward-only candidate](forward-only-s13-foundation.sql) intentionally installs **two semantic registration keys**, not three historical keys, and **does not** install transient S6 filename aliases. It must never be presented as historical version replay.
5. **S14 Archive/Tasks (12):** transition authority, immutable archive/legacy status, task resurrection blocks, notification delivery terminality, service-only reconciler EXECUTE, failed-delivery evidence and one-shot transition gate. The [integrated Archive candidate](forward-only-s14-archive-integrated-local.sql) has bounded PG17.11 hosted-observed fixture tests, not complete current-hosted equivalence. Earlier bounded evidence identified an aggregate task reconciler routine with service-role EXECUTE **missing**.
6. **Running-order and Results (3):** statement-level participant order sync, its S13 semantic adoption, and `public.v3_public_published_result_snapshot`. The last is publication-bound and must not expose unapproved versions.

Two previously observed hosted-only anti-direct-write protection triggers on `public.admin_notifications` and `public.notification_deliveries` **MUST REMAIN** even if clean source replay does not contain identical definitions. Exact effective ACL, function body/owner/search path, trigger ordering, RLS, dependent RPCs, table constraints and legacy data-shape parity remain unverified.

## Review of 33 source SQLs newer than the exported tip

Every version is enumerated separately in the linked machine-readable report. Source SQLs have been inspected; **all hosted SQL effects remain unknown**.

- **World TG1/TG2/TG3/TG8 chain:** country controller and institution tables, office/repr functions, privacy RLS, effective-authority helpers, exact legislative tally and world rollout flag. **Defer** the independently bounded World rollout for the 14 November contest soft launch. Do not silently bypass its RLS or activate its flag to settle Preview.
- **Cross-cutting authority:** `20261102205000_v3_service_role_claim_compatibility.sql` changes a private service-identity helper. It is a **conditional prerequisite**, not safe merely because the exact S13 local fixture supports a second reviewed variant. Establish current helper body, owner, search_path and ACL before any replacement. Public reference search and edition metadata are deferred; the NF-winner guard is conditional if that worker is active.
- **Televote/Results chain (Nov 3):** atomic official-round calculation, result recomputation, result reconciliation/preconditions, round bindings privileges, countback parity, jury-review invalidation, service-role sync ACL, auditable sync RPC, atomic televote recovery, qualification-null-rank reset. **Launch-critical but blocked** until canonical voting authority, historical source truth, existing grants/RLS and the first three missing projection migrations are recovered/reconciled.
- **Televote/Results follow-up (Nov 4/5/8):** result reconciliation authority, active snapshot and qualification, publication-control retry, influence-result ACL, and signed combined projection must run only against a proven canonical Results/Televote state. The signed projection explicitly depends on `private.v3_televote_result_projection_sources`, which the earlier catalog did not find. Do not skip the missing source foundation.
- A missing migration-history row alone **never** establishes that the same effect is missing. Do not batch push all 33 or rename old files.

## Staged recovery adoption matrix: dependencies and negative acceptance

| Stage | Preconditions and intended effects | Existing evidence/rehearsal | Failure, security and human gate |
|---|---|---|---|
| **A. Hosted-observed foundation** | Verify canonical project identity, exact current migration metadata provenance, 56/215+ hosted catalog scope; validate private service identity helper, trigger/RLS posture, actual grants and 727-routine dependency closure. Preserve both hosted-only direct-write guards. | S02 hosted catalog and S06 partial PG17.11 fixtures; #2469/#2473 authority reconstruction. | Abort on unknown definition, owner, role or grant. No production mutation; request separately bounded read-only catalog observation and full representative synthetic data fixture. |
| **B. S13** | Exactly five private tables + seven RPCs absent in dated 7 Nov check, trusted private helper/USAGE, migration registry ACL, strict non-forgeable semantic registration, deny direct registry DML to browser and service roles. | `scripts/rehearse-v3-s13-forward-recovery-local.sh` and [readme](s13-forward-recovery-readme.md), merged #2467/#2469/#2473. | Existing object collision, permission/fingerprint drift and duplicate registration must **abort**. Local interrupted transaction rolls back atomically and fresh same-DB retry succeeds only after a clean aborted start. Need exact contemporary hosted metadata and separate deployment approval. |
| **C. S14 Archive / S6 notification** | After S13: canonical task registry and notification/delivery projector, service-only reconciliation, one-shot transition gate, archive terminal freeze, prevent task resurrection and retaining failed-delivery evidence. Distinguish partial existing task reconciler from missing Archive guards. | `scripts/rehearse-v3-s14-archive-forward-effects-local.sh`, `forward-only-s14-archive-integrated-local.sql`, S02 56-table/21-RPC bounded catalog. | Failed transition, stale task or mismatched service grant must abort without direct SQL bypass. Verify interrupted transaction rollback + same-database retry, RLS negative tests, all dependent schema and publication state. New hosted read permission required before planning writes. |
| **D. Televote → Results** | Single canonical voting producer; source table then projection guard then replay snapshot; signed/atomic aggregation, round-binding ACL, vote countback, Jury invalidation, publication-control / immutable active Results snapshot. Do not allow competing writers. | `scripts/rehearse-v3-s14-televote-source-truth-local.sh`, `scripts/rehearse-v3-s14-signed-combined-projection.sh`, `scripts/rehearse-v3-public-result-snapshot.sh`; #2404 voting owner draft is unmerged. | Refuse unknown legacy ballots/rank semantics, stale approvals, post-publication mutation, direct vote/result writes, partial role grants or failure of vote replay. Need whole hosted-shaped rehearsal and voting owner's signoff before forward-only candidate can exist. |
| **E. Remaining newer SQL** | Only after A-D parity, stage launch-critical Results/Televote fragments in dependency order; defer World rollout and optional search/metadata functions with flags safely off. | 33 source files, local clean replay and independent exact-SHA S13/S14/S15/S16 checks. | Each step needs owner-approved semantic delta, PostgreSQL 17.11 clean + hosted-shaped upgrade tests, transactional rollback/retry and no RLS/ACL regressions. **Do not use `supabase db push`** against production without separately reviewed ledger, manifest and express deployment approval. |

### Operator-only offline evidence flow

No source migration files, migration-history records, production data or credentials are modified by the following *offline* commands:

```bash
node scripts/convert-v3-migration-history-csv.mjs \
  --csv /absolute/outside/repo/Supabase-history.csv \
  --output /absolute/outside/repo/sanitized-history.json \
  --expected-count 497

# Compare separately. Both strict flags are expected to exit 1 for this evidence.
bun run scripts/check-v3-production-migration-frontier.ts \
  --remote-history /absolute/outside/repo/sanitized-history.json \
  --expected-sha 8ece96834445e953b1ad060acc8f1043461885f2 \
  --require-reconciled --json
bun run scripts/check-v3-production-migration-frontier.ts \
  --remote-history /absolute/outside/repo/sanitized-history.json \
  --expected-sha 8ece96834445e953b1ad060acc8f1043461885f2 \
  --require-preview-compatible --json
```

The owner upload was converted and independently compared using local Node, Python and the GitHub source inventory. **The exact Bun CLI itself was not run against the 497-row export in this workspace**, which lacks a Bun executable and a complete Git checkout; do not record the expected failures as witnessed Bun execution. Repository CI uses *synthetic* offline fixtures and proves other properties. No PostgreSQL 17.11 database was started here; previous PG17.11 rehearsal results are separate dated CI evidence.

### Single next critical dependency

**Confirm the SQL Editor export came from canonical production project `dkxmnvekiopyesuzggeu`; then obtain separate explicit approval for the smallest current read-only hosted SQL-effect catalog delta across the 36 specific effects and their real dependencies.** The CSV proves history IDs, not the actual SQL catalog, grants, triggers, data-shape compatibility or full hosted equivalence. The separate Preview project requires separate metadata permission if its CI failure is to be diagnosed. Without these, S13/S14 production migration and 14 November public soft launch remain **NO-GO**.
