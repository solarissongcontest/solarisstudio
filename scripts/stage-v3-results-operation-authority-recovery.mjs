// The replaced recalculation delegate accepts exactly two qualified prior
// bodies: fresh hosted-observed and immutable historical source. The local
// reference uses the latter; it is NOT claimed to equal the hosted body. Neither
// prior body is executed by this recovery; both become the same canonical writer.
// Guarded forward-only candidate. No hosted execution or history repair.
import fs from "node:fs";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
const evidence = JSON.parse(
  fs.readFileSync(
    "docs/v3/recovery-candidates/evidence/results-operation-prerequisites-observed-2026-11-14.json",
    "utf8",
  ),
);
if (
  evidence.projectRef !== "dkxmnvekiopyesuzggeu" ||
  evidence.read_only !== "on" ||
  evidence.server_version_num !== "170011" ||
  evidence.applicationRowsRead !== false ||
  evidence.rawFunctionBodiesExported !== false ||
  evidence.routines.length !== 11
)
  throw Error("Unqualified Results operation observation");
const objects = evidence.routines.filter((x) => !x.identity.startsWith("televoting."));
console.log(`begin;set local lock_timeout='5s';set local statement_timeout='30s';
do $pre$declare item jsonb;actual jsonb;p record;begin
 if current_user<>'postgres' or not exists(select 1 from private.v3_migration_contracts where migration_key='v3.recovery.results-read-authority') then raise exception 'Results engine recovery requires ordered owner/read-authority prerequisites' using errcode='55000';end if;
 for item in select value from jsonb_array_elements('${JSON.stringify(evidence.tables).replaceAll("'", "''")}'::jsonb)loop
  select jsonb_build_object('identity',item->>'identity','exists',c.oid is not null,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl::text,'columns_md5',(select md5(string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text,',' order by a.attnum))from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped))into actual from pg_class c where c.oid=to_regclass(item->>'identity');
  if actual is distinct from item then raise exception 'Results operation table drift: %',item->>'identity' using errcode='55000';end if;
 end loop;
 for item in select value from jsonb_array_elements('${JSON.stringify(objects).replaceAll("'", "''")}'::jsonb)loop
  select * into p from pg_proc where oid=to_regprocedure(item->>'identity');
  if (p.oid is not null) is distinct from (item->>'exists')::boolean or (p.oid is not null and (pg_get_userbyid(p.proowner) is distinct from item->>'owner' or p.prosecdef is distinct from (item->>'security_definer')::boolean or to_jsonb(p.proconfig) is distinct from item->'config' or p.proacl::text is distinct from item->>'acl' or (encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') is distinct from item->>'definition_sha256' and not (item->>'identity'='public.recalculate_show_results_internal(uuid)' and encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='3589a6c8d073f486b4fa4f5695ccc6c2b3ef5fc3228c1d71aa5b8a5a69976bf0')))) then raise exception 'Results operation prerequisite drift: %',item->>'identity' using errcode='55000';end if;
 end loop;
 if exists(select 1 from private.v3_migration_contracts where migration_key='v3.recovery.results-operation-engine') then raise exception 'Results engine recovery already installed' using errcode='55000';end if;
end $pre$;
select public.v3_register_migration_contract('v3.recovery.results-operation-engine',1,'forward_fix_only',false,null,'Restore canonical recalculation delegation and reconciliation wrappers; no voting or Results data backfill');`);
console.log(
  extractDefinition(
    fs.readFileSync(
      "supabase/migrations/20261103004600_v3_canonical_result_recalculation.sql",
      "utf8",
    ),
    "public.recalculate_show_results_internal",
  ),
);
console.log(
  "alter function private.studio2_result_preconditions(uuid) rename to studio2_result_preconditions_v3_base;",
);
console.log(
  extractDefinition(
    fs.readFileSync(
      "supabase/migrations/20261103004700_v3_result_reconciliation_hardening.sql",
      "utf8",
    ),
    "private.studio2_result_preconditions",
  ),
);
console.log(
  "alter function public.studio2_execute_result_operation(uuid,text,text,uuid,bigint) rename to studio2_execute_result_operation_v3_base;",
);
console.log(
  extractDefinition(
    fs.readFileSync(
      "supabase/migrations/20261103004700_v3_result_reconciliation_hardening.sql",
      "utf8",
    ),
    "public.studio2_execute_result_operation",
  ),
);
console.log(`revoke all on function public.studio2_execute_result_operation_v3_base(uuid,text,text,uuid,bigint) from public,anon,authenticated,service_role;
revoke all on function private.studio2_result_preconditions_v3_base(uuid),private.studio2_result_preconditions(uuid),public.recalculate_show_results_internal(uuid) from public,anon,authenticated;
grant execute on function private.studio2_result_preconditions(uuid),public.recalculate_show_results_internal(uuid) to service_role;
revoke all on function public.studio2_execute_result_operation(uuid,text,text,uuid,bigint) from public,anon;
grant execute on function public.studio2_execute_result_operation(uuid,text,text,uuid,bigint) to authenticated,service_role;
commit;`);
