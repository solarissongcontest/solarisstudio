# S13 migration registration: isolated local replay evidence

**Status: candidate test-only work, not a database repair.** This branch adds a local-only integration rehearsal for the EXISTING S13 SQL files. It neither changes the historical migration files nor adds a deployable migration.

The hosted production V3 project does not currently have the five S13 private framework tables or `public.v3_register_migration_contract`. Later S14 and S6 migrations need the canonical registration API. Before drafting a genuinely forward-only recovery, we need evidence that the original three-stage registration sequence behaves as designed in an isolated database.

## Exact original SQL rehearsed

- `20261019111000_v3_s13_migration_hardening.sql`: five tables, seven RPCs, constrained backfill and parity state, role grants.
- `20261019112900_v3_s13_migration_registration_context.sql`: temporary migration-owner acceptance and **only three** narrowly authorized filename-shaped S6 notification aliases.
- `20261019113300_v3_s13_strict_registration_restore.sql`: return to canonical semantic keys, rejecting the temporary aliases.

The test does NOT replay the S6 notifications SQL itself; that domain needs its own data-compatibility and authorization proofs.

## Tests and deliberate limitations

The script `scripts/rehearse-v3-s13-foundation-local.sh` creates a disposable loopback-only PostgreSQL database, minimal synthetic `private.studio2_request_is_service_role()` helper, and local test roles; it executes the original migration SQL unchanged. It asserts all five tables, seven RPCs, service-only registry EXECUTE, three alias translations during the bounded window, strict alias rejection afterward, idempotent replay of the strict contract, negative browser-role access and successful service-context registration. It removes the test DB on exit.

The GitHub Actions workflow `.github/workflows/v3-s13-registration-local.yml` runs this using a PostgreSQL 16 container bound to `127.0.0.1:54322`, with local-only Supabase environment sentinels, no production secrets, no hosted services, and an exact-commit check. The workflow verifies cleanup.

**This proves only synthetic local PostgreSQL behavior.** The helper is an explicit stub; the real V3 permission engine and live hosted data shapes are not present. A passing run cannot establish production-equivalent compatibility, safe backfill, full migration history or end-to-end V3 readiness.

## Hard gates

- **Never run the script on production.** Never use hosted Supabase URLs, automated production database calls, or production data copied into CI.
- The 36 historical gaps and 32 newer pending migrations remain unresolved. No production deployment, migration-history repair, feature-flag changes or release approval is implied.
- Next: assemble a sanitized hosted-head-equivalent isolated baseline; compare all S13 object definitions, grants and dependencies; design a newly versioned forward-only recovery, then separately rehearse that upgrade and negative authorization cases.
