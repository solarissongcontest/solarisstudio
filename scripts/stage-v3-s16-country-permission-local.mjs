#!/usr/bin/env node
// Networkless PG17 S02 fixture only. Restore exactly the FINAL source-defined
// Permission Engine RLS helper so real country claim/HoD probes can execute.
// Never use this donor for hosted/production migrations.
import { readFileSync } from "node:fs";

const origin = "supabase/migrations/20260915185524_permission_engine_v2_private_helper_cutover.sql";
const text = readFileSync(origin, "utf8");
const startMark = "create or replace function private.studio2_can_manage_permissions(";
const endMark = "create or replace function private.studio2_can_manage_storytelling(";
const start = text.indexOf(startMark);
const end = text.indexOf(endMark, start + 1);
if (start < 0 || end < 0 || text.indexOf(startMark, start + 1) !== -1) {
  throw Error("S16 country Permission Engine helper source is missing or ambiguous");
}
const definition = text.slice(start, end).trim();
if (!definition.includes("language sql") ||
    !definition.includes("stable") ||
    !definition.includes("security definer") ||
    !definition.includes("set search_path = pg_catalog, public, private") ||
    !definition.includes("private.studio2_user_access_allowed(") ||
    !definition.includes("'permissions.manage'") ||
    definition.includes("has_role") ||
    !definition.endsWith("$$;")) {
  throw Error("S16 country Permission Engine helper canonical SQL drift");
}
const placeholderFile = "docs/v3/recovery-candidates/evidence/s06-hosted-fifty-next-relations-local.sql";
const fixture = readFileSync(placeholderFile, "utf8");
const stub = fixture.slice(
  fixture.indexOf("CREATE OR REPLACE FUNCTION private.studio2_can_manage_permissions("),
  fixture.indexOf("CREATE OR REPLACE FUNCTION private.solaris_confirmation_admin_allowed(")
).trim();
if (!stub.includes("RAISE EXCEPTION 'S06 catalog-only authorization placeholder must never execute'") ||
    !stub.endsWith("END $s06_unverified_policy$;")) {
  throw Error("S16 S02 fixture catalog-only placeholder source drift");
}
process.stdout.write(`begin;
do $s16_permission_pre$
declare v oid := to_regprocedure('private.studio2_can_manage_permissions(uuid)');
begin
 if current_user <> 'postgres'
   or current_setting('server_version_num')::integer / 10000 <> 17
   or v is null
   or not exists(
     select 1 from pg_proc p join pg_language l on l.oid=p.prolang
     where p.oid=v and l.lanname='plpgsql'
       and pg_get_userbyid(p.proowner)='postgres'
       and regexp_replace(btrim(p.prosrc),'\\s+',' ','g') =
       'BEGIN RAISE EXCEPTION ''S06 catalog-only authorization placeholder must never execute''; END'
   )
 then raise exception 'S16 refuses to overwrite a non-placeholder permission authority' using errcode='55000'; end if;
end $s16_permission_pre$;
create temp table s16_permission_acl_before on commit drop as
select proowner,proacl from pg_proc
where oid=to_regprocedure('private.studio2_can_manage_permissions(uuid)');
${definition}
do $s16_permission_post$
declare v oid := to_regprocedure('private.studio2_can_manage_permissions(uuid)');
begin
 if v is null or not exists(
   select 1 from pg_proc p
   cross join pg_temp.s16_permission_acl_before before
   join pg_language l on l.oid=p.prolang
   where p.oid=v and l.lanname='sql' and p.prosecdef and p.provolatile='s'
    and p.proowner=before.proowner and p.proacl is not distinct from before.proacl
    and pg_get_userbyid(p.proowner)='postgres'
    and p.proconfig=array['search_path=pg_catalog, public, private']::text[]
    and position('private.studio2_user_access_allowed' in p.prosrc)>0
 )
 then raise exception 'S16 final Permission Engine helper owner/ACL/body drift' using errcode='55000'; end if;
end $s16_permission_post$;
commit;
`);
