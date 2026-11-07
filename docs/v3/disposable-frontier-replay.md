# Disposable local migration-frontier replay (diagnostic S13 gate)

This workflow is deliberately separate from the **hosted** migration-frontier reconciliation.

- GitHub Actions workflow: `.github/workflows/v3-s13-disposable-frontier-replay.yml`.
- It checks out the **exact** PR head, rejects non-local connection inputs, runs the repository production-isolation guard, starts a disposable local Supabase instance, and runs `supabase db reset --local --no-seed`.
- It then compares the full `supabase_migrations.schema_migrations` version inventory from local PostgreSQL to every reviewed `supabase/migrations/*.sql` file, rejecting missing, extra, malformed or duplicate versions.
- It emits an exact-SHA JSON report that expressly sets `hostedHistoryReconciled`, `hostedDataCompatibilityCertified`, `releaseCertified` and `productionDeploymentAuthorized` to **false**.
- The workflow pins the **verified existing S14 full-contest local toolchain**, `supabase/setup-cli@v1` and CLI `2.113.0`, with a runtime version assertion. An attempted rolling `v2.stable` resolution installed `2.122.1`; local migration `20261103194500_v3_s14_televote_sync_service_role_acl.sql` then rejected an unexpected anonymous table UPDATE privilege. This is a separate **local CLI/stack compatibility risk**, not evidence that the exact historical production schema has that ACL. Upgrades need an independently reviewed local compatibility trial; never relax the SQL authorization assertion to make CI pass.
- No CI secrets, hosted API endpoints, hosted migration metadata, application rows, hosted migrations, production deployment, remote `db push`, `--remote`, or hosted test traffic are needed or permitted.
- It is run on changes to this workflow/document and can be manually triggered. It is not a substitute for the full S14 contest rehearsal.

## Offline frontier strictness integrated from #2340

The same QA candidate carries the reviewed source of PR #2340 at exact head `8c3bed4cc8902d6c73a573158e709748ad1cb8c9` in three offline-only files. The comparator now rejects a directory with zero SQL migrations, and its `--require-reconciled` mode requires an explicit, exact lowercase `--expected-sha` matching Git HEAD. Diagnostic output with no expected SHA cannot claim matching source identity. The original donor must not be merged separately without verifying integration parity. This is necessary evidence integrity, not hosted schema repair.

## Important limitation

A successfully replayed **clean local schema** does not prove compatibility with the existing hosted schema, data, permissions or divergent history. The documented 36 post-cutover holes must still be classified, reconciled and tested against a **locally recreated hosted-head-equivalent baseline**. The three National Final hosted hotfixes are now present in the repository, but their compatibility does not authorize skipping the other gaps.

Before any real migration rollout, the System migration owner must supply a reviewed, sanitized local baseline and forward-only adoption plan, review RLS/grants/RPC authority and Results/Publication/Archive dependencies, repeat the exact-head S13/S14/S15/S16 gates, and obtain separate explicit owner approval. The production bootstrap cutoff is immutable. Never invent history entries or point this rehearsal at production.

If the disposable local stack fails to start or to apply any migration, the workflow **fails closed**. No production fallback exists.
