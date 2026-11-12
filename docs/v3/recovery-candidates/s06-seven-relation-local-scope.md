# S06 connector-derived seven-relation reconstruction: local scope only

**STATUS: DRAFT / NOT HOSTED-EQUIVALENT / NO PRODUCTION RELEASE AUTHORITY.** No real users, vote rows, secrets, production SQL writes, migrations, deployments or history changes were used.

## Provenance and bounds

- Current main basis on 10 November 2026: `52c095c44f44ed1d58a87f13692ef2d53277f26f`.
- Only bounded **read-only `pg_catalog` SELECTs** against the linked *Solaris Studio* PostgreSQL 17.11 project collected seven named missing relations' types, nullability, default expressions, table ACLs, RLS flags, constraints and index definitions.
- These seven are among the **159 previously unmodeled** table identities in `s06-hosted-relation-coverage-gap-20261110.json`. They have **zero foreign-key constraints, policies and noninternal triggers**. The fixture creates no app rows or public writers and cannot itself execute in CI against hosted production.
- No SECURITY DEFINER function bodies, private role membership, sensitive literal configurations, auth identities, or application row contents were collected for this batch.
- Exact seven object identities: `private.country_auth_rate_limits`, `private.studio2_platform_exit_write_probe`, `public.ssc_rule_registry`, `public.studio2_televote_global_versions`, `public.studio2_televote_round_versions`, `televoting.legacy_friend_voting_relationships`, `televoting.legacy_import_metadata`.

## Reproducible isolated verification

The `.github/workflows/v3-s06-seven-relation-networkless.yml` workflow fetches a pinned `postgres:17.11` image, checks its **exact image ID**, and launches a DB with `--network none`, no published ports, no inherited hosted database variables and no application data. It installs only the local fixture into that disposable DB and re-runs the pre-existing `scripts/v3-s06-hosted-catalog-digests-local.sql` over the local `pg_catalog`. The new `scripts/verify-v3-s06-seven-relation-parity.mjs` checks every documented field for all seven identities against the frozen 215-relation hosted digest, with negative tests for missing/extra tables, columns, constraints, indexes, ACL, RLS, triggers and corrupt evidence. It writes `SEVEN_RELATION_METADATA_PARITY_NOT_CERTIFIED` only on strict equality, never `DONE`.

The historical S02 **56-relation** fixture is separate. This additional **7-relation** fixture does not create a complete, dependency-closed 63-table database, and its isolated check must not be passed off as an S13/S14 recovery replay. The 152 remaining unmodeled physical relation identities, 727 routine identity/definition/security closure, role memberships/default ACLs, extensions, user/data distributions, cross-domain migration effects, and other application/runtime constraints remain unresolved.

**Next owner/integrator work:** Review actual CI report at the exact PR head, reconcile any catalog mismatch without weakening the comparator, then evaluate how to safely integrate verified tables into progressively larger **networkless** reconstruction fixtures. Independently verify function bodies, role/security/extension semantics and the full historical migration frontier before any S06 certification or production release. Production changes always require separate owner approval.
