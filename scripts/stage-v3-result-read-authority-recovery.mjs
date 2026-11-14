// LOCAL forward-only Results API boundary candidate. No network or production execution.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
export const OBSERVATION =
  "docs/v3/recovery-candidates/evidence/result-read-authority-observed-2026-11-14.json";
export const ACCESS_OBSERVATION =
  "docs/v3/recovery-candidates/evidence/result-access-prerequisites-observed-2026-11-14.json";
export const VIEW_OBSERVATION =
  "docs/v3/recovery-candidates/evidence/result-dependent-views-observed-2026-11-14.json";
export const SOURCE =
  "supabase/migrations/20261104135245_v3_results_active_snapshot_and_qualification.sql";
const literal = (x) => "'" + JSON.stringify(x).replaceAll("'", "''") + "'::jsonb";
export function stageResultReadAuthority(root = process.cwd()) {
  const read = (p) => readFileSync(resolve(root, p), "utf8");
  const data = JSON.parse(read(OBSERVATION));
  const views = JSON.parse(read(VIEW_OBSERVATION));
  const access = JSON.parse(read(ACCESS_OBSERVATION));
  for (const d of [data, views, access])
    if (
      d.projectRef !== "dkxmnvekiopyesuzggeu" ||
      d.read_only !== "on" ||
      d.applicationRowsRead !== false
    )
      throw Error("Unreviewed Results read scope");
  if (
    data.server_version_num !== "170011" ||
    data.rawFunctionBodiesExported !== false ||
    data.helper.exists ||
    data.table.identity !== "public.results" ||
    !data.table.rls ||
    data.table.force_rls ||
    data.table.owner !== "postgres" ||
    data.table.policies.length !== 5 ||
    access.routines.length !== 3 ||
    access.rawFunctionBodiesExported !== false ||
    views.views.length
  )
    throw Error("Unqualified Results RLS/view prerequisite");
  const expectedAccess = [
    "private.studio2_request_is_service_role()",
    "public.show_publication_enabled(uuid,text)",
    "public.studio2_access_allowed(text,uuid,boolean)",
  ].sort();
  if (
    JSON.stringify(access.routines.map((x) => x.identity).sort()) !==
      JSON.stringify(expectedAccess) ||
    access.routines.some(
      (x) => !x.exists || x.owner !== "postgres" || !/^[a-f0-9]{64}$/.test(x.definition_sha256),
    )
  )
    throw Error("Incomplete Results access authority evidence");
  const source = read(SOURCE);
  const start = source.indexOf('alter policy "solaris consolidated anon read"');
  const end = source.indexOf("-- Preserve the existing internal mutation boundaries", start);
  if (start < 0 || end < start) throw Error("Missing source Results policies");
  const policies = source.slice(start, end).trim();
  return `begin;
set local lock_timeout='5s';set local statement_timeout='30s';
do $pre$ declare actual jsonb; expected jsonb; routine_row record; identity text; begin
 if current_user<>'postgres' then raise exception 'Results API recovery requires reviewed owner' using errcode='42501';end if;
 if to_regprocedure('private.v3_public_result_row_visible(uuid,uuid,jsonb)') is not null then raise exception 'Results API guard already or partially installed';end if;
 if to_regprocedure('private.studio2_expected_result_ranks(uuid)') is null or to_regprocedure('public.v3_public_published_result_snapshot(uuid)') is null or not exists(select 1 from private.v3_migration_contracts where migration_key='v3.recovery.result-rank-qualification') then raise exception 'Results API recovery requires complete ordered rank/snapshot prerequisites';end if;
 for expected in select value from jsonb_array_elements(${literal(access.routines)}) loop
 identity:=expected->>'identity';
 select r.*,l.lanname into routine_row from pg_proc r join pg_language l on l.oid=r.prolang where r.oid=to_regprocedure(identity);
 actual:=jsonb_build_object('identity',identity,'exists',routine_row.oid is not null,'owner',pg_get_userbyid(routine_row.proowner),'security_definer',routine_row.prosecdef,'language',routine_row.lanname,'config',routine_row.proconfig,'acl',routine_row.proacl::text,'definition_md5',md5(pg_get_functiondef(routine_row.oid)),'definition_sha256',encode(sha256(convert_to(pg_get_functiondef(routine_row.oid),'UTF8')),'hex'));
 if actual is distinct from expected then raise exception 'Results API access helper drift: %',identity using errcode='55000';end if;
 end loop;
 select jsonb_build_object('identity','public.results' ,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl::text,'policies',(select jsonb_agg(jsonb_build_object('name',p.polname,'permissive',p.polpermissive,'command',p.polcmd,'roles',array(select pg_get_userbyid(x) from unnest(p.polroles) x),'qual',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname) from pg_policy p where p.polrelid=c.oid)) into actual from pg_class c where c.oid=to_regclass('public.results');
 if actual is distinct from ${literal(data.table)} then raise exception 'Results API table grant/RLS drift' using errcode='55000';end if;
 if exists(select 1 from pg_depend d join pg_rewrite r on r.oid=d.objid join pg_class c on c.oid=r.ev_class where d.classid='pg_rewrite'::regclass and d.refclassid='pg_class'::regclass and d.refobjid='public.results'::regclass and c.relkind in ('v','m')) then raise exception 'Unqualified Results dependent view';end if;
end $pre$;
select public.v3_register_migration_contract('v3.recovery.results-read-authority',1,'forward_fix_only',false,null,'Frozen public row visibility and owner-only Results writes; retain API SELECT and canonical SECURITY DEFINER commands');
${extractDefinition(source, "private.v3_public_result_row_visible")}
revoke all on function private.v3_public_result_row_visible(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.v3_public_result_row_visible(uuid,uuid,jsonb) to anon,authenticated;
${policies}
-- The recovered canonical Results writer is SECURITY DEFINER and
-- postgres-owned. API table DML is not its authority; preserve SELECT only.
-- Never revoke authenticated DML on televoting.round_results/influence evidence:
-- their atomic calculator is SECURITY INVOKER under its existing capability RLS.
revoke insert,update,delete,truncate,references,trigger,maintain on table public.results from public,anon,authenticated,service_role;
do $post$ declare actor text;begin
 foreach actor in array array['anon','authenticated','service_role'] loop
  if not has_table_privilege(actor,'public.results','SELECT') or has_table_privilege(actor,'public.results','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') then raise exception 'Results direct API authority remains: %',actor;end if;
 end loop;
 if not exists(select 1 from pg_proc where oid='public.sync_show_results_from_votes(uuid)'::regprocedure and prosecdef and pg_get_userbyid(proowner)='postgres') then raise exception 'Canonical Results writer authority changed';end if;
end $post$;
commit;
`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.stdout.write(stageResultReadAuthority());
