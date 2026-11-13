# V3 hosted Supabase migration frontier: production preflight

> **Merge-process note (owner update, 14 November 2026):** [The current evidence-based merge policy](merge-review-policy.md) replaces routine independent-AI/integrator merge approval. The currently authorized implementation session may integrate its own verified PR. This historical release/evidence document does not authorize production changes or waive safety gates.

**Status:** BLOCKED pending explicit reconciliation. This is an operator procedure,
not permission to deploy or an assertion that a production upgrade has run.

## Verified read-only baseline, 2026-11-07

At independently inspected repository source SHA `e570fa68943845aa7ccca834581d7a45518772f1` and authorized **read-only**
Supabase `list_migrations` metadata for project `dkxmnvekiopyesuzggeu`:

- Hosted migration records: **497**, hosted tip `20261101181812_v3_s13_adopt_rules_v4_1_roleplay_registry`.
- Repository SQL migration files: **494**, source tip `20261105140500_v3_televote_influence_role_runtime_access.sql`.
- The **immutable** compatibility boundary remains `20261014020000`. Do not slide this cutoff.
- **36** repository SQL versions strictly after the cutoff, at or before the hosted tip, are absent from hosted migration history.
- **32** repository SQL versions newer than the hosted tip remain **pending**, not authorized for deployment.
- **0** hosted-only migrations after the cutoff; **0** duplicate versions; **0** post-cutover name mismatches.
- The three previously reported National Final winner migrations (`20261101172649`, `20261101173758`,
  `20261101174945`) are already present in source, following merged [#1880](https://github.com/solarissongcontest/solarisstudio/pull/1880).
  **Do not reapply them or open a second historical adoption.**
- The earlier 2026-11-04 read-only observations about `public` RLS coverage, `v3_register_migration_contract`,
  and selected privileged RPCs **were not independently rechecked in this refresh**. They are prior-context
  investigation leads, NOT current production grants/identity/schema-compatibility evidence.

These are **migration-history metadata facts**, not proof of current hosted schema equivalence, applied SQL
effects, safe replay on hosted data, deployment authorization, or release certification. Re-fetch all
metadata against the final exact release candidate before acting.

## Dependency-ordered System-owner triage: the 36 post-cutover gaps

The following six groups partition **all 36 missing-history SQL files exactly once**. Grouping is for
effect/dependency classification and human review, **not a runnable deployment sequence**. SQL timestamps
from different groups interleave. A correctly ordered System-owner migration plan must follow actual
cross-group dependencies and the hosted-head-equivalent baseline, never blindly execute these old scripts
against production or manufacture no-op history entries.

### A. Televote projection authority, source truth and replay (3)

- `20261017001000_v3_s14_televote_result_truth.sql`
- `20261017001010_v3_s14_televote_projection_guard_hardening.sql`
- `20261017001020_v3_s14_televote_projection_replay_hardening.sql`

### B. Participant, Entry, Confirmation, voting and rollout consequences (9)

- `20261017123000_v3_s5_acknowledgement_consequences.sql`
- `20261018024500_v3_entry_review_conflict_http409.sql`
- `20261018031000_v3_http409_deterministic_conflicts.sql`
- `20261018053000_v3_s6_confirmation_requirement_reconciliation.sql`
- `20261018081500_v3_s5_entry_lifecycle_consequences.sql`
- `20261018111500_v3_confirmation_sync_service_role_privileges.sql`
- `20261018122500_v3_voting_declaration_expected_edition_scope.sql`
- `20261019000500_v3_confirmation_sync_publication_event_service_role.sql`
- `20261019013000_v3_public_live_rollout_flag.sql`

### C. S9/S10 observability projection prerequisites (2)

- `20261019110000_v3_s9_safe_metrics.sql`
- `20261019112000_v3_s10_sli_snapshot.sql`

### D. S13 registration framework, bounded S6 repair window and cleanup (7)

- `20261019111000_v3_s13_migration_hardening.sql`
- `20261019112900_v3_s13_migration_registration_context.sql`
- `20261019113000_v3_s6_notification_reconciliation.sql`
- `20261019113100_v3_s6_notification_reactivation.sql`
- `20261019113200_v3_s6_notification_failure_visibility.sql`
- `20261019113300_v3_s13_strict_registration_restore.sql`
- `20261024200300_v3_s6_confirmation_requirement_bounded_repair.sql`

### E. S14 Archive, Task and notification invariants (12)

- `20261019112100_v3_s14_archive_consequence_reconciliation.sql`
- `20261019112200_v3_s14_final_results_readiness_hardening.sql`
- `20261019112300_v3_s14_transition_http409.sql`
- `20261019112400_v3_s14_archive_task_registry_alignment.sql`
- `20261019112500_v3_s14_resolved_task_notification_invariant.sql`
- `20261019202636_v3_s14_resolved_task_delivery_reconciliation.sql`
- `20261020130000_v3_s14_archive_invariant_forward_fixes.sql`
- `20261020140000_v3_s14_archive_runtime_update_guard.sql`
- `20261021110000_v3_s14_archive_guard_authority_forward_fix.sql`
- `20261021161000_v3_s14_task_reconciliation_service_boundary.sql`
- `20261021163000_v3_s14_failed_task_delivery_evidence.sql`
- `20261021202000_v3_s14_archive_reconciliation_convergence.sql`

### F. Running-order/Results source adoption and Public snapshot (3)

- `20261022151607_batch_running_order_result_sync.sql`
- `20261023205400_v3_s13_adopt_batch_running_order_result_sync.sql`
- `20261024170500_v3_public_published_result_snapshot.sql`

### Forward-only adoption gates, not permissions to deploy

1. **Freeze evidence and model the real baseline:** System owner classifies the 36 versions as already-effect-present,
   partly present, or absent using a **reviewed, sanitized hosted-head-equivalent local baseline** and explicit
   signatures, grants, RLS, triggers, table columns, indexes, and relevant legacy data shapes. Hosted version
   history alone proves none of those effects.
2. **Resolve dependency chains before writing forward SQL:** S14 Televote source truth must precede its
   projection guards and drifted-replay hardening. The S13 migration-contract foundation must precede
   registration-context and its bounded S6 notification window; the three S6 notification changes must precede
   strict registration restoration. S14 Archive guard/Task reconciliation must keep the terminal freeze,
   unforgeable authority boundary, resolved notification invariant, and failed-delivery evidence intact.
   Running-order sync precedes the later S13 adoption contract. Results snapshot consumers must bind exact
   published versions; Confirmation bounded repair must not directly rewrite canonical requirement state.
3. **Specify a new forward-only System-owned series:** for each still-missing effect define exact new ordered
   migration(s), expected preconditions, idempotent backfill, guarded privilege changes, rollback/recovery, lock/
   performance budget, and postcondition checks. Keep all original historic filenames and immutable cutoff
   unchanged. A historical migration version must **not** be marked applied merely to silence the comparator.
4. **Run two different disposable-local proofs:** replay the full repository migration chain from clean baseline
   (currently 494/494 on pinned CLI 2.113.0) **and separately** rehearse the forward-only series against the
   sanitized hosted-head-equivalent local state, including RLS negative cases, Results/Publication/Archive
   lifecycle, and duplicate/reordered upgrade attempts. Neither proof can query hosted application rows in CI.
5. **Reject until reconciled:** the authoritative offline frontier must report no post-cutover holes, unknown
   hosted migrations or name mismatches, and the candidate must pass exact-SHA S13/S14/S15/S16 and
   post-merge CI requirements. Only the System owner may then revise production migration push pins,
   followed by a **separate explicit owner approval** before any hosted schema modification.

## Offline executable history audit

From a clean checkout of the *exact* candidate SHA:

1. In an authorized operator session, obtain **read-only** migration metadata from the Solaris Studio Supabase project's `list_migrations` action, not from application tables. Save the returned `{"migrations":[{"version":"...","name":"..."},...]}` JSON to a temporary local file outside the repository. Do not put secrets or production application data in this file.
2. Run the offline comparator:

   ```bash
   bun run scripts/check-v3-production-migration-frontier.ts \
     --remote-history /tmp/solaris-production-migrations.json \
     --expected-sha "$(git rev-parse HEAD)" \
     --require-reconciled --json
   ```

3. The audit fails closed for malformed/duplicate versions, post-cutover migration holes at or below the hosted head, hosted-only post-cutover versions, missing hosted names, mismatched names, or an incorrect source SHA. It reports newer repository migrations separately as *pending*, not as evidence of deployment permission. It never contacts Supabase itself.

The offline auditor accepts only migration metadata. **Never** wire this into ordinary CI with hosted Supabase URLs, credentials, or automated production queries. Synthetic fixtures and isolated local Supabase may be used for CI.

## Reconciliation is required before any upgrade authorization

1. System/migration owner: classify every post-cutover migration hole against the actual hosted schema/RPC/function signatures, grants, RLS and dependencies. Do not assume the effect exists because the table or function name happens to exist.
2. Preserve the already merged National Final winner hotfix SQL versions from #1880, verify their exact intended effects against the sanitized hosted-head-equivalent local baseline, and **do not reapply them** or create replacement historic migrations.
3. For the 36 missing post-cutover repository migrations, determine a legitimate **forward-only** upgrade path that respects the existing hosted modifications, rather than fabricating historical no-op coverage. Review data requirements, indexes, locks, security-definer privileges, transactional behavior, versioned Results and publication contracts.
4. Rehearse the proposed exact ordered upgrade on a **disposable local Supabase** with representative legacy state and negative authorization cases. Verify clean replay, hosted-head-equivalent upgrade, Results/Publication/Archive and S15 dependencies, RLS/grants, function signatures, and rollback/recovery plans. Passing S14 on clean local state does not prove hosted-data compatibility.
5. Re-run the offline frontier auditor on the candidate, obtain exact-head Quality and applicable migration/release evidence, and record the reviewed migration manifest and outcomes in the deployment ledger.
6. Only then update the pinned `EXPECTED_REMOTE_HEAD`, `EXPECTED_REPO_HEAD`, `EXPECTED_PENDING_COUNT` and `EXPECTED_PENDING_VERSIONS` in `scripts/v3-production-supabase-push.sh`. The operator's immutable `BOOTSTRAP_HISTORY_CUTOVER` **must never be moved forward**.
7. Seek **separate explicit user authorization** for a hosted migration and production deployment. Set `SOLARIS_PRODUCTION_CANDIDATE_SHA` to the **exact 40-character lowercase reviewed commit SHA**. The script refuses a mismatched checkout, even if the migration filenames have not changed. It also requires explicit project-ref and deployment-approval inputs, performs its dry-run first, and independently requires `SOLARIS_PRODUCTION_COMMIT=YES` for the real push. A green audit and a supplied environment variable do not replace user authorization.

The operator script now rejects post-bootstrap local-only versions at or behind the expected remote head and post-bootstrap hosted-only versions. Its historical temporary compatibility mechanism applies **only** to the original October cutover and restores local files on exit. It never repairs hosted migration history. For a commit-authorized push, it additionally **re-reads hosted migration history immediately after dry-run** and requires the same exact frontier and pending manifest before invoking the write command. After the push it requires no remaining local-only or hosted-only versions, not merely an equal maximum timestamp. The disposable fake-Supabase CI scenario verifies a concurrent remote migration aborts before the write path.

## Remaining gates

- Reconciled named migration history and exact candidate SHA.
- Compatibility evidence for real hosted schema and data, including Results, Publication, Archive and S15.
- Production RLS, grants, security-definer RPC signatures and application configuration prerequisites.
- Reviewed migration sequence plus independent recovery and restoration procedure.
- Exact-SHA CI and required V3 final certification.
- Explicit, separate human deployment approval and post-deploy bounded verification.

Until those gates are met: **NO-GO for hosted V3 migrations and production release.**

## Preview identity compatibility is a separate prerequisite (13 November)

The offline auditor now exposes `remoteVersionsMissingLocally` across **all**
versions, including the immutable bootstrap interval. It also reports
`previewHistoryCompatible` separately from `historyReconciled`. The approved
bootstrap comparison exception can make the latter true while a raw Supabase
Preview/push still refuses an unmatched remote migration identity. Neither result
proves SQL-effect parity. Name mismatches, invalid inventories and local holes (including pre-cutover
local-only identities before the hosted head) also keep the conservative Preview
preflight blocked. `previewLocalVersionsMissingRemotely` lists these identities
without changing the immutable bootstrap exception used by `historyReconciled`.

Use `--require-preview-compatible --expected-sha <full SHA>` to fail on that
identity mismatch independently of `--require-reconciled`. The auditor remains
completely offline. It fingerprints the supplied history bytes and current SQL
file contents, refuses changed/untracked migration sources, and compares the
**executed auditor script and imported implementation** byte-for-byte against
committed blobs. Staged, ignored-status and skip-worktree changes to those auditor
sources cannot borrow an exact-HEAD result. The output separately records
`auditorSourcesClean` and `auditorSourceSha256` so operators can distinguish
code drift from migration SQL drift. This is checkout integrity evidence, not
a cryptographic guarantee against a maliciously altered executable environment.
The report always records `sqlEffectsVerified: false` and
`productionDeploymentAuthorized: false`.
A diagnostic of older evidence is not a new hosted observation.

To avoid accidentally comparing **Preview's** migration history against the
separately identified **production** project, an authorized operator can also
bind the offline audit to an expected Supabase project ref. Keep this optional
for existing legacy array-only diagnostics; an evidence bundle used for a
project-specific qualification should contain the independently verified ref:

```json
{
  "projectRef": "approved-project-ref-from-operator",
  "migrations": [{"version": "20261101181812", "name": "example"}]
}
```

Pass `--expected-project-ref <verified-ref>` alongside `--expected-sha`.
When bound, a missing, malformed or mismatched `projectRef` fails closed,
without ever contacting Supabase. This identifies *which project the evidence
claims to describe*, but a user-editable JSON label is **not independent
authentication**: retain the authorized export's project ref, capture time,
operator provenance, raw SHA-256 and access-controlled custody separately.
Never substitute Preview project evidence for production, and do not copy
credentials into this JSON or into CI.

The existing offline-preflight workflow reproduces the actual pinned CLI
2.113.0 refusal on PostgreSQL 17.11 with **network=none**, no ports/mounts and
synthetic history. One migration has an already-present SQL effect while another
has an absent effect; both lack history. The real CLI dry-run must reject the
unmatched bootstrap version without changing history or those effects. This is a
synthetic refusal regression, **not a hosted-equivalent recovery baseline**.
It neither creates aliases nor repairs history. All synthetic rows live only in
the disposable container, which is removed on exit.

The checked-in November 9 evidence supplies aggregate history counts and named
SQL-effect classifications, not a complete current raw migration-history export.
Do not manufacture that missing export from those counts. Exact current unmatched
identities still require a separately authorized, bounded migration-metadata
observation. Existing S13 foundation → Archive recovery and Televote source truth
→ projection guard/replay → Results publication ordering remains mandatory;
these diagnostics do not authorize any of those candidates for hosted adoption.
