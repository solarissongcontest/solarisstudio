# Missing strict-dual runtime dependency — operator inspection request

**NOT standing authorization to query production. The one-time owner approval on 13 November 2026 has been consumed. Never run from CI or automated QA.**

The isolated hosted-observed fixture reaches
`private.studio2_require_strict_dual(text,uuid,text)` through the existing
`private.studio2_guard_edition_runtime_strict_dual()` trigger during an edition
seed. The missing function aborts the statement; no edition/runtime row remains.
Four independently matched authorization/normalization routines do not close
this edge.

The existing [source-beta contract](s02-source-defined-beta-contract.md) records
that approved hosted observations did **not** match either immutable source body.
Do not copy a source variant, invent a permissive stub, disable the trigger or
assume a function fingerprint supplies an executable definition.

The System owner needs separate explicit authorization for this **one-signature,
one-row, schema-only** inspection on the verified canonical project. Keep it
separate from tests and application queries. Proposed bounded specification:

```sql
begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '2s';
select current_setting('server_version_num') as server_version_num,
       p.oid::regprocedure::text as identity,
       pg_get_userbyid(p.proowner) as owner,
       l.lanname as language,
       p.prosecdef, p.proisstrict, p.provolatile, p.proparallel,
       p.proconfig, p.proacl,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_language l on l.oid=p.prolang
where p.oid=to_regprocedure('private.studio2_require_strict_dual(text,uuid,text)');
rollback;
```

This reads no application rows and invokes no business function. An absent row
is unknown until independently reviewed; it is not permission to replay a source
migration. Review the definition for embedded secrets before sharing or committing
anything. Preserve full provenance outside public artifacts if redaction is
required; a redacted body cannot establish exact executable equivalence.

Then review direct/nested calls, overloads, search-path resolution, dynamic SQL,
role membership and RLS implications. Reconstruct only evidenced dependencies on
isolated PG17.11 and rerun the real guarded edition-scope cases plus S13→S14
recovery. The generated manifest lists other conservative unknown/different
identities; lexical references must be resolved from source before requesting
further metadata. No hosted-equivalence or production-adoption claim is currently
supported.

## Single approved inspection completed, 13 November 2026

The owner explicitly approved continuation of the narrow one-signature catalog
inspection in chat. The operator independently verified the connected project
name **Solaris Studio**, Postgres **17.11.0.002**, and the canonical production
project identity before executing the documented read-only BEGIN / SELECT /
ROLLBACK transaction **once**. No application tables, function invocation,
external network testing, production writes, migration, or deploy were involved.
No second query is authorized by this event.

Sanitized exact-function attestation:

| Property | Observed result |
| --- | --- |
| Function identity | `private.studio2_require_strict_dual(text,uuid,text)` |
| `pg_get_functiondef` MD5 | `9ad1db55bc8ddbab8fa0ecf484d280fb` |
| `pg_get_functiondef` SHA-256 | `fd29f6aa3d37caf0c4052305ef6fbf45c99b6aefc9e87ec6a84fb848822d1b11` |
| `prosrc` MD5 | `294d562ce20e3de09ea864b3359b97d6` |
| Owner / return / language | `postgres` / `void` / `plpgsql` |
| Privileged flags | SECURITY DEFINER; VOLATILE; PARALLEL UNSAFE; non-STRICT; non-LEAKPROOF |
| Search path | `pg_catalog, public, private` |
| Direct API EXECUTE | `anon=false`, `authenticated=false`, `service_role=false` |
| Catalog ACL | only `postgres` EXECUTE |

All three checksums and the security attributes matched the frozen
2026-11-09/11-10 evidence independently. The raw hosted definition is
intentionally **not** included in this repository or GitHub Actions artifacts.

The authorized function body has the same executable tokens and control-flow
as the **later** immutable source definition
`20260914174742_permission_engine_v2_core_rls_cutover.sql`. Their different
bytes come from whitespace / line layout. A deterministic formatter extracts
that exact **source** body, verifies its original MD5
`96000d67d401cd29345528a5adb4d5a9`, compacts formatting and verifies the
resulting source-derived `prosrc` MD5 matches the approved hosted fingerprint.
On disposable PG17.11 the existing installer must still verify all frozen
function definition, SHA-256, owner, ACL, settings, security properties and
effective privilege postconditions. It refuses pre-existing unknown bodies,
mismatched settings and non-atomic installs. This is **not** a production migration.

This closes the **definition provenance** of this one function, but does not
close its nested authorization chain. An authenticated actor may call
`private.studio2_permission_engine_authoritative()` or the legacy shadow
capability checker; those depend on further hosted-observed helpers and real
rollout state. Do not infer those bodies from this approval. Local owner-created
edition seed success is not proof of a fully authorized operator workflow.

**Release boundary remains unchanged:** no hosted-equivalence certificate,
production recovery, public writes, maintenance activation or deployment
authorized. The approved query must not be retried, automated or broadened.
