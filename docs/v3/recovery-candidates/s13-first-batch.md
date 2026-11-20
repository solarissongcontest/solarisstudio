# First installation batch: S13-FOUNDATION-DARK-1

Scope: **one additive S13 control-plane transaction**, derived from the existing
`forward-only-s13-foundation.sql`. No Archive, Confirmation, Jury, Televote,
Results, feature activation or historical migration replay is included.

## Exact changes and dependency boundary

| Objects | Change | Existing hosted evidence |
| --- | --- | --- |
| Five private S13 tables | Create canonical registries, compatibility state/history, backfill leases, parity records | All five absent in Nov20 catalog |
| Seven public S13 RPCs | Install unchanged canonical bodies; strict registration is final | All seven absent in Nov20 catalog |
| Two secondary indexes | Create canonical backfill-status/parity-order indexes | Both absent in Nov20 catalog |
| Two owned identity sequences and automatic PK/unique indexes/types | Created by those tables; namespace collision checks refuse reuse | Additional generated-name preflight required |
| Three seed rows | Baseline compatibility row plus two semantic S13 contracts | New metadata only; not Supabase history |
| Six mutation RPCs | **No API-role EXECUTE**, including service_role | Remain dark until a later separately reviewed activation |
| Compatibility read RPC | Canonical anon/authenticated/service_role read grant | Read-only baseline metadata |

All nonowner explicit grants on the new tables/sequences/writer RPCs are removed.
Effective table/column/sequence privileges, including TRUNCATE, are checked.
No global/default privileges are changed. Existing source's service-role default
ACL gap is reproduced in a real PG17.11 regression and corrected only on new
objects. Function bodies/owners/search paths are postchecked; original source and
historical SQL stay unchanged.

The direct closure is PostgreSQL17.11 built-ins, `public`/`private` schemas, the
observed postgres owner and three API-role profiles, and the exact existing
`private.studio2_request_is_service_role()` definition/ACL. Its currently observed
scalar helper is preserved; the newer shared helper migration is **not** imported.
No Auth tables, JWT signing keys, Vault records/roots, Storage service, S14,
scoring engine or application write workflow is an intrinsic SQL dependency.

Existing evidence is reconciled offline by the packager: fourteen absent objects
from Nov20 and the Nov19 helper/owner/ACL checkpoint. These are dated observations;
they do not replace the fresh exact-target preflight at approved installation.
A fresh bounded 20-Nov read-only observation identified exactly one relevant
enabled DDL handler: Supabase's `extensions.pgrst_ddl_watch()`, owned by
`supabase_admin`, which issues a PostgREST schema-reload `NOTIFY` after
supported non-temporary DDL. The batch permits ONLY its pinned function and
event-trigger fingerprint (`afaad7193dcf8f81e728d2bedb85e43e` MD5),
without modifying or disabling the handler. A new/changed handler is still an
explicit hard stop. This is catalog qualification, not production installation.

## Reproducible exact-source artifacts

From a clean, reviewed checkout (Node, Python3, Docker available):

```sh
node --test scripts/package-v3-s13-first-batch.test.mjs
SOLARIS_RUN_LOCAL_DB_REHEARSAL=YES PYTHONDONTWRITEBYTECODE=1 \
  python3 scripts/rehearse-v3-s13-first-batch.test.py
node scripts/package-v3-s13-first-batch.mjs /NEW/private/s13-first-batch
```

The new directory contains `manifest.json`, `preflight.sql`, `install.sql`, and
`postcheck.sql`. The manifest binds the exact Git SHA and committed input hashes
to every SQL SHA-256 and byte count, object-by-object observed effects, order,
actor, database, canonical target **dkxmnvekiopyesuzggeu**, and stop/recovery rules.
The packager refuses dirty inputs. The runner additionally re-renders the SQL:
editing both a file and its manifest hash does not make tampering acceptable.
CI uploads only source/SQL/manifest artifacts; private backups/proofs never enter CI.

The generated fixture tests use the established observed S13 dependency subset
and synthetic preserved Results/votes/ledger/RLS/trigger records. **They do not
claim the private archive was restored here or that a66-country contest ran.**
They verify a clone install as non-superuser postgres, all API writers denied,
owner registration/replay, interruption before COMMIT, unchanged-source retry,
concurrent installation rejection, duplicate refusal, conflicting helper/partial
state/DDL handlers, default grants, and source data/catalog preservation.

## One protected Cloud Shell procedure

The private November15 archive/key stay in the existing operator-controlled
`$HOME/solaris-recovery` layout. Do not upload them, private logs, or credentials.
From the exact reviewed Git checkout, in a shell without remote DB variables:

```sh
SOLARIS_REVIEWED_SOURCE_SHA=EXACT_40_CHARACTER_REVIEWED_SHA \
  bash scripts/ops/solaris-s13-first-batch-operator.sh
```

This reuses the already successful owner/ACL-preserving DB restore. S13-only
mode does not require or reread the independently verified Storage archive. Its only new
step is a first-batch rehearsal **on a separate database clone before disposal**:

1. Verify committed package/source hashes before decrypting the archive.
2. Restore the known encrypted archive with original owners/ACLs transactionally
   in a network-none, tmpfs-only PG17.11 container; verify225 app tables,
   202RLS tables,265 policies and27 total default ACLs as previously established.
3. Use the local bootstrap only to clone/read/destroy that clone. Map its database
   owner to observed `postgres`; execute batch SQL under native
   `SET SESSION AUTHORIZATION postgres` with `rolsuper=false`. No source role flags,
   memberships, passwords or original database ownership are modified. The initial
   minimal NOLOGIN restore placeholders need no broad role reconstruction for this
   metadata-only rehearsal. This is not full Auth-role recovery.
4. Stream complete original-table dumps into private SHA-256 values; no raw rows
   or dumps are logged/exported. Compare the existing schema/constraints/indexes,
   functions, owner/ACLs, RLS/policies/triggers, role memberships/default grants,
   and extensions before/after; confirm original restored source remains unchanged.
5. Terminate only the owned nonce-marked session after all batch effects but
   before COMMIT; verify rollback and identical retry; exercise actual API-role
   denials and owner/replay behavior. Drop only the disposable clone.
6. Retain the exact-SHA operator receipt/proof and package outside GitHub. The
   enclosing legacy broader comparison may return2; the wrapper accepts that
   **only** when the separately bound S13 proof passed. Broader four fingerprint
   mismatches remain open; they are not asserted to have disappeared.

The receipt links the encrypted archive SHA, exact source/SQL, restored scope,
unchanged original data/permissions and actual clone behavior. Review that
operator evidence for this batch. No distinct AI reviewer is required by policy.
Neither passing a synthetic test nor merely choosing a `recovered-private` CLI
label proves backup origin; the consolidated trusted restore procedure supplies
that binding. Global-role/configuration and full platform certification stay open.

## Production operation proposed, NOT executed or approved

Order: independently verify canonical project and postgres database/actor;
confirm an acceptable backup/recovery point; approve exact source and SQL hashes;
then `preflight.sql` → `install.sql` → `postcheck.sql`, using a secured operator
connection, `psql -X -v ON_ERROR_STOP=1`, with no credential in shell history/logs.
**Do not run these against hosted Supabase under the engineering authorization.**
Do not run `db push`, `migration repair`, generators/fixtures or the historical
migration directory. A missing migration record is not an absent effect.

`install.sql` is one transaction, with5s lock/120s per-statement timeouts and a
transaction advisory lock. It takes no row locks on existing contest tables;
new-table/index/catalog DDL still takes namespace/catalog locks. Coordinate a
single operator and no concurrent DDL. Keep maintenance and existing write gates.
Preflight rejects wrong actor/version/owner, unknown helper/roles, existing or
partial S13 names, implicit-name collisions, relevant unqualified event handlers
and concurrent installation. No silently adopted partial state.

Before COMMIT, any error/session loss rolls back this batch. Retry identical
bytes only after proving targets absent and preflight passing. If COMMIT outcome
is uncertain, inspect the postchecks first: complete exact objects/seeds/ACLs mean
installed; partial/mismatching state means STOP. Never blindly rerun, drop new
objects or restore over live data. After COMMIT leave owner-only metadata in place
and repair forward under separate reviewed approval; future dependants make a
DROP-based reversal unsafe. No automatic down migration is supplied.

Production postchecks inspect the new S13 metadata/definitions/ACLs, not synthetic
votes, users or application test submissions. Preserve the independently recorded
existing security-guard and migration-ledger fingerprints. The local private
rehearsal covers existing data preservation; do not turn live postflight into an
automated contest test, full data crawl or backup restoration.

## Batch-specific remaining gates

- Actual private-archive clone receipt from the consolidated Cloud Shell run.
- Fresh approved exact-target preflight, including generated-name collisions,
  exact PostgREST handler fingerprint, and rejection of all other DDL handlers.
- Acceptable operation-specific backup/RPO, reviewed source/SQL hashes and
  **separate explicit approval** for this exact hosted SQL operation.

Full S16 inventory disposition, Auth/Vault/Storage restoration, the complete
recovered66-country lifecycle, deployment and public-write activation remain
separate tasks. They are not falsely certified or silently added as SQL
dependencies of this first dark foundation batch. Auth/Vault work follows the
existing protected recovery procedure in
`recovery-permission-platform-qualification-20261120.md`; no secret/root is read
or changed by the batch. Source integration is not production approval.
