// Forward-only LOCAL candidate; production execution needs separate approval.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
export const OBSERVATION =
  "docs/v3/recovery-candidates/evidence/result-authority-prerequisites-observed-2026-11-14.json";
export const RANK_SOURCE =
  "supabase/migrations/20261104132500_v3_s14_results_reconciliation_authority.sql";
export const ACTIVE_SOURCE =
  "supabase/migrations/20261104135245_v3_results_active_snapshot_and_qualification.sql";
export const FUNCTIONS = [
  ["private.studio2_expected_result_ranks", "uuid", RANK_SOURCE],
  ["public.refresh_edition_qualifications", "uuid", ACTIVE_SOURCE],
  ["public.sync_show_results_from_votes", "uuid", ACTIVE_SOURCE],
  ["private.studio2_result_reconciliation", "uuid", RANK_SOURCE],
  ["public.v3_record_televote_sync_event", "text,text,uuid,jsonb,text,text,text", RANK_SOURCE],
];
const literal = (x) => "'" + JSON.stringify(x).replaceAll("'", "''") + "'::jsonb";
export function stageResultAuthority(root = process.cwd()) {
  const read = (p) => readFileSync(resolve(root, p), "utf8");
  const data = JSON.parse(read(OBSERVATION));
  if (
    data.projectRef !== "dkxmnvekiopyesuzggeu" ||
    data.server_version_num !== "170011" ||
    data.read_only !== "on" ||
    data.applicationRowsRead !== false ||
    data.rawFunctionBodiesExported !== false ||
    data.routines.length !== 5
  )
    throw Error("Unreviewed Results authority observation");
  for (const [name, args] of FUNCTIONS) {
    const item = data.routines.find((x) => x.identity === name + "(" + args + ")");
    if (
      !item ||
      (item.exists &&
        (item.owner !== "postgres" ||
          !item.security_definer ||
          item.acl !== "{postgres=X/postgres,service_role=X/postgres}" ||
          !/^[a-f0-9]{64}$/.test(item.definition_sha256)))
    )
      throw Error("Unqualified Results authority prerequisite: " + name);
  }
  let sql = `begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $pre$ declare expected jsonb; actual jsonb; p record; identity text; begin
 if current_user<>'postgres' then raise exception 'Result recovery requires reviewed postgres operator' using errcode='42501'; end if;
 if to_regclass('private.v3_televote_result_projection_sources') is null
    or to_regprocedure('public.v3_public_published_result_snapshot(uuid)') is null
    or to_regprocedure('public.refresh_show_qualifiers(uuid)') is null
    or not exists(select 1 from private.v3_migration_contracts where migration_key='v3.recovery.active-result-capture') then
   raise exception 'Result recovery requires ordered S13/Archive/Televote/atomic/snapshot prerequisites' using errcode='55000';
 end if;
 for expected in select value from jsonb_array_elements(${literal(data.routines)}) loop
  identity:=expected->>'identity';
  select r.*,l.lanname into p from pg_proc r join pg_language l on l.oid=r.prolang where r.oid=to_regprocedure(identity);
  actual:=jsonb_build_object('identity',identity,'exists',p.oid is not null,'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'language',p.lanname,'config',p.proconfig,'acl',p.proacl::text,'definition_md5',case when p.oid is not null then md5(pg_get_functiondef(p.oid)) end,'definition_sha256',case when p.oid is not null then encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') end);
  if actual is distinct from expected then raise exception 'Result authority drift or partial installation: %',identity using errcode='55000'; end if;
 end loop;
end $pre$;
select public.v3_register_migration_contract('v3.recovery.result-rank-qualification',1,'forward_fix_only',false,null,'Source-exact rank, active qualification, reconciliation and sync audit; no historical backfill or publication activation');
`;
  for (const [name, args, file] of FUNCTIONS) {
    sql += extractDefinition(read(file), name) + "\n";
    sql += `revoke all on function ${name}(${args}) from public,anon,authenticated;\ngrant execute on function ${name}(${args}) to service_role;\n`;
  }
  sql += `do $post$ declare identity text; begin
 foreach identity in array array[${FUNCTIONS.map(([n, a]) => "'" + n + "(" + a + ")'").join(",")}] loop
  if not exists(select 1 from pg_proc where oid=to_regprocedure(identity) and pg_get_userbyid(proowner)='postgres' and prosecdef and proconfig is not null)
   or has_function_privilege('anon',identity,'EXECUTE') or has_function_privilege('authenticated',identity,'EXECUTE') or not has_function_privilege('service_role',identity,'EXECUTE') then
    raise exception 'Unsafe Results authority ownership/ACL: %',identity;
  end if;
 end loop;
end $post$;
commit;
`;
  return sql;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.stdout.write(stageResultAuthority());
