# Jury table authority cutover

`20261115084647_v3_jury_canonical_table_authority.sql` follows the existing
`v3.jury.governed-submission-cutover` recovery step. It closes API-role table
and column writes, including RLS-independent TRUNCATE, on seven Jury tables.
The canonical SECURITY DEFINER submission, draft, receipt and reconciliation
functions retain their existing definitions and execution grants. Existing
SELECT grants and RLS settings are preserved. No ballot rows are rewritten.

## Evidence and refusal boundary

`evidence/jury-table-authority-observed-2026-11-15.json` records a bounded,
read-only production catalog observation: seven table identities and five
exact governed RPC signatures, owners, configuration, ACLs and hashes. No
application rows or raw function bodies were exported. Effective grants are
catalog evidence, not evidence of a successful hosted exploit.

The migration refuses changed RPC definitions/owners/configuration/ACLs,
changed table ownership/RLS, an exposed legacy delegate, missing prior
retirement, inherited residual mutation grants and duplicate installation.
It uses transactional DDL; a failure must roll back the entire step. After a
successful adoption, corrections are forward-only, never a restoration of
broad direct API writes.

## Local acceptance

The existing networkless PostgreSQL 17.11 driver executes as the observed
nonsuperuser `postgres`, verifies interrupted rollback, retry and duplicate
refusal, and tests four independent preflight drift cases with unchanged full
schema/data digests. Actual `authenticator` sessions assume anon,
authenticated and service_role and attempt INSERT/UPDATE/DELETE/TRUNCATE on
all seven tables (84 denials). Governed draft save/load, stale revision,
ballot submission, atomic draft cleanup, receipt readback, response-loss
replay, wrong-actor denial and unpublished-vote secrecy run afterward.

This is one ordered recovery step, not complete S16 certification or proof of
the entire hosted dependency closure. The source-only sanction helper,
recovered 66-country lifecycle, governed Confirmation adoption and actual
production backup/restoration evidence remain separate requirements. This
artifact is not permission for hosted execution, deployment or public writes.
