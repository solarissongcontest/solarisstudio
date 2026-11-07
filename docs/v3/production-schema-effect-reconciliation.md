# V3 production schema-effect reconciliation

The migration frontier audit compares repository filenames with read-only hosted
migration metadata. It does **not** prove that SQL effects exist, are compatible
with hosted data, or are safe to replay. The schema-effect reconciliation gate
closes that evidence gap without connecting to Supabase or authorizing a
production write.

## Operator workflow

1. From the exact reviewed checkout, save only the authorized read-only
   `list_migrations` response as `/tmp/solaris-production-migrations.json`.
2. Create a sanitized local manifest with one entry for every
   `holesBeforeHostedHead` migration. Each entry must identify:
   - `effect-present`, `effect-partial`, or `effect-missing`;
   - local catalog/signature/RLS/fixture evidence references;
   - dependency identifiers;
   - a reviewable forward plan for partial or missing effects.
3. Keep `historyAction` equal to `preserve`. Historic files must never be
   replayed or replaced with fabricated applied-history entries.
4. Validate the manifest offline:

   ```bash
   bun run scripts/check-v3-production-schema-effects.ts \
     --remote-history /tmp/solaris-production-migrations.json \
     --manifest /tmp/solaris-schema-effect-manifest.json \
     --json
   ```

The validator binds the manifest to the checked-out SHA, hosted head,
immutable bootstrap cutover, repository/hosted counts, complete hole inventory,
and pending migration list. It rejects omissions, duplicate entries,
candidate drift, unsafe production-action language, and forward plans attached
to effects already classified as present.

## Current verified classification

The committed matrix in
`src/lib/v3-production-schema-effect-matrix.ts` covers all **36** reported
post-cutover holes exactly once:

- **24 effect-missing**: the named V3 object, guard, RPC, trigger, or behavior
  was directly absent in the authorized catalog observation;
- **6 effect-uncertain**: the target prerequisite or aggregate existed, but the
  exact effect still requires a full catalog/signature comparison;
- **6 effect-partial**: a related legacy object or narrow privilege existed,
  while the migration's complete intended effect was not proven.

No entry is classified as fully equivalent or superseded. The same matrix
assigns all **32 pending** repository migrations to three dependency lanes:
world authority/privacy, Results/publication/Televote, and cross-cutting
runtime. Lane membership is a review dependency graph, not permission to run
the files.

The highest-impact missing contract is the S13 foundation. The integrated
forward-only candidate is intentionally outside `supabase/migrations/` and
rehearses against a sanitized PostgreSQL 17.11 dependency subset. It produces
the canonical five S13 tables and seven RPCs, matches the original staged
source catalog, rejects five partial/collision preconditions, denies browser
and direct-table writes, and refuses replay. It does not claim complete
hosted-schema/data equivalence or production authorization.

This is operator-ready reconciliation evidence, not deployment approval. A
successful result still requires a hosted-head-equivalent disposable local
rehearsal, S13/S14/S15/S16 exact-SHA evidence, independent recovery review, and
separate explicit owner authorization before any hosted schema change.
