# Disposable local migration-frontier replay (diagnostic S13 gate)

This workflow is deliberately separate from the **hosted** migration-frontier reconciliation.

- GitHub Actions workflow: `.github/workflows/v3-s13-disposable-frontier-replay.yml`.
- It checks out the **exact** PR head, rejects non-local connection inputs, runs the repository production-isolation guard, starts a disposable local Supabase instance, and runs `supabase db reset --local --no-seed`.
- It then compares the full `supabase_migrations.schema_migrations` version inventory from local PostgreSQL to every reviewed `supabase/migrations/*.sql` file, rejecting missing, extra, malformed or duplicate versions.
- It emits an exact-SHA JSON report that expressly sets `hostedHistoryReconciled`, `hostedDataCompatibilityCertified`, `releaseCertified` and `productionDeploymentAuthorized` to **false**.
- The workflow uses `supabase/setup-cli@v3` with `version: v2.stable`, avoiding an implicit CLI v3 migration during this diagnostic. A future CLI upgrade requires its own verified contract and review.
- No CI secrets, hosted API endpoints, hosted migration metadata, application rows, hosted migrations, production deployment, remote `db push`, `--remote`, or hosted test traffic are needed or permitted.
- It is run on changes to this workflow/document and can be manually triggered. It is not a substitute for the full S14 contest rehearsal.

## Important limitation

A successfully replayed **clean local schema** does not prove compatibility with the existing hosted schema, data, permissions or divergent history. The documented 36 post-cutover holes must still be classified, reconciled and tested against a **locally recreated hosted-head-equivalent baseline**. The three National Final hosted hotfixes are now present in the repository, but their compatibility does not authorize skipping the other gaps.

Before any real migration rollout, the System migration owner must supply a reviewed, sanitized local baseline and forward-only adoption plan, review RLS/grants/RPC authority and Results/Publication/Archive dependencies, repeat the exact-head S13/S14/S15/S16 gates, and obtain separate explicit owner approval. The production bootstrap cutoff is immutable. Never invent history entries or point this rehearsal at production.

If the disposable local stack fails to start or to apply any migration, the workflow **fails closed**. No production fallback exists.
