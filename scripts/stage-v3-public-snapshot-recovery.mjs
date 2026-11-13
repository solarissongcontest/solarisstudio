// LOCAL candidate only. Catalog evidence is bounded; full Results recovery is not certified.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
import { transactionBody } from "./stage-v3-s07-televote-source-truth.mjs";
export const OBSERVATION =
  "docs/v3/recovery-candidates/evidence/public-snapshot-prerequisites-observed-2026-11-13.json";
export const CAPTURE_SOURCE =
  "supabase/migrations/20261104135245_v3_results_active_snapshot_and_qualification.sql";
export const SNAPSHOT_SOURCE =
  "supabase/migrations/20261024170500_v3_public_published_result_snapshot.sql";
export function stagePublicSnapshot(root = process.cwd()) {
  const read = (p) => readFileSync(resolve(root, p), "utf8");
  const evidence = JSON.parse(read(OBSERVATION));
  if (
    evidence.projectRef !== "dkxmnvekiopyesuzggeu" ||
    evidence.read_only !== "on" ||
    evidence.server_version_num !== "170011" ||
    evidence.routines.length !== 4 ||
    evidence.tables.length !== 3
  )
    throw Error("Unreviewed snapshot observation identity/scope");
  const literal = (x) => "'" + JSON.stringify(x).replaceAll("'", "''") + "'::jsonb";
  const capture = extractDefinition(read(CAPTURE_SOURCE), "private.v3_capture_result_version");
  const snapshot = transactionBody(read(SNAPSHOT_SOURCE));
  return `\\set ON_ERROR_STOP on
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $snapshot_preflight$
declare expected jsonb; actual jsonb; identity text; p pg_proc%rowtype; c pg_class%rowtype;
begin
 if current_user<>'postgres' then raise exception 'Snapshot recovery requires reviewed owner role' using errcode='42501'; end if;
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null then raise exception 'Snapshot recovery requires S13 foundation' using errcode='55000'; end if;
 for expected in select value from jsonb_array_elements(${literal(evidence.routines)}) loop
  identity:=expected->>'identity';
  select * into p from pg_proc where oid=to_regprocedure(identity);
  actual:=jsonb_build_object('identity',identity,'exists',p.oid is not null,'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text,'definition_md5',md5(pg_get_functiondef(p.oid)),'definition_sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'));
  if actual is distinct from expected then raise exception 'Snapshot recovery routine drift or partial installation: %',identity using errcode='55000'; end if;
 end loop;
 for expected in select value from jsonb_array_elements(${literal(evidence.tables)}) loop
  identity:=expected->>'identity';
  select * into c from pg_class where oid=to_regclass(identity);
  actual:=jsonb_build_object('identity',identity,'exists',c.oid is not null,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl::text,'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition_md5',md5(pg_get_triggerdef(t.oid))) order by t.tgname),'[]'::jsonb) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal));
  if actual is distinct from expected then raise exception 'Snapshot recovery table security/trigger drift: %',identity using errcode='55000'; end if;
 end loop;
end $snapshot_preflight$;
-- Install unchanged canonical active capture before exposing the public read model.
-- Do not register the full active-qualification contract: that stage is NOT installed here.
select public.v3_register_migration_contract('v3.recovery.active-result-capture',1,'forward_fix_only',false,null,'Source-exact active capture; qualification and canonical ranking are separate dependencies');
${capture}
${snapshot}
commit;
`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.stdout.write(stagePublicSnapshot());
