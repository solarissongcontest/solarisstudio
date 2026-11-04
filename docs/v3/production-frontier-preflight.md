# V3 hosted Supabase migration frontier: production preflight

**Status:** BLOCKED pending explicit reconciliation. This is an operator procedure,
not permission to deploy or an assertion that a production upgrade has run.

## Verified read-only baseline, 2026-11-04

At repository source SHA `17afd07b0993af10cf31d576a1db23032741a944`:

- Hosted Solaris Studio project: `dkxmnvekiopyesuzggeu`.
- Hosted migration history: 497 entries; latest `20261101181812_v3_s13_adopt_rules_v4_1_roleplay_registry`.
- Repository migration files: 473; latest `20261104185330_v3_publication_control_initialization_retry.sql`.
- The immutable October bootstrap compatibility boundary is `20261014020000`.
- **36** repository migrations newer than the bootstrap boundary but older than the hosted head are absent from the hosted history.
- **3** hosted migrations newer than the bootstrap boundary are missing from the repository:
  - `20261101172649_v3_confirmation_pending_nf_winner`
  - `20261101173758_v3_pending_nf_winner_transition_guard`
  - `20261101174945_v3_pending_nf_winner_public_lookup_redaction`
- **14** repository migrations are newer than the hosted head, including the integrated S14/Results work.
- Read-only database metadata confirmed RLS enabled for all 149 tables in the `public` schema. This is **not** a complete policy, grant, RPC, or schema-drift certification.

These figures are **not permanent**. Regenerate them against the exact deployment candidate and the live, read-only hosted history. In particular, the 36 migrations are NOT historical bootstrap aliases: their timestamps are strictly later than the original cutover. Neither the 36 nor the hosted-only 3 may be silently skipped, stubbed, or marked applied without verifying their effects and dependencies.

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
2. Adopt or incorporate the three hosted National Final winner hotfixes into version control in a way that preserves their existing production effects. Rehearse the adoption path before accepting it. Do not backdate a new migration as a fake match and do not blindly replay a hotfix onto live data.
3. For the 36 missing post-cutover repository migrations, determine a legitimate **forward-only** upgrade path that respects the existing hosted modifications, rather than fabricating historical no-op coverage. Review data requirements, indexes, locks, security-definer privileges, transactional behavior, versioned Results and publication contracts.
4. Rehearse the proposed exact ordered upgrade on a **disposable local Supabase** with representative legacy state and negative authorization cases. Verify clean replay, hosted-head-equivalent upgrade, Results/Publication/Archive and S15 dependencies, RLS/grants, function signatures, and rollback/recovery plans. Passing S14 on clean local state does not prove hosted-data compatibility.
5. Re-run the offline frontier auditor on the candidate, obtain exact-head Quality and applicable migration/release evidence, and record the reviewed migration manifest and outcomes in the deployment ledger.
6. Only then update the pinned `EXPECTED_REMOTE_HEAD`, `EXPECTED_REPO_HEAD`, `EXPECTED_PENDING_COUNT` and `EXPECTED_PENDING_VERSIONS` in `scripts/v3-production-supabase-push.sh`. The operator's immutable `BOOTSTRAP_HISTORY_CUTOVER` **must never be moved forward**.
7. Seek **separate explicit user authorization** for a hosted migration and production deployment. The operator script must first dry-run and independently require both deployment approval and its commit gate; a green audit does not provide authorization.

The operator script now rejects post-bootstrap local-only versions at or behind the expected remote head and post-bootstrap hosted-only versions. Its historical temporary compatibility mechanism applies **only** to the original October cutover and restores local files on exit. It never repairs hosted migration history.

## Remaining gates

- Reconciled named migration history and exact candidate SHA.
- Compatibility evidence for real hosted schema and data, including Results, Publication, Archive and S15.
- Production RLS, grants, security-definer RPC signatures and application configuration prerequisites.
- Reviewed migration sequence plus independent recovery and restoration procedure.
- Exact-SHA CI and required V3 final certification.
- Explicit, separate human deployment approval and post-deploy bounded verification.

Until those gates are met: **NO-GO for hosted V3 migrations and production release.**
