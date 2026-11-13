# Missing strict-dual runtime dependency — operator inspection request

**NOT authorization to query production. Never run from CI or automated QA.**

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
