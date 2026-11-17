#!/usr/bin/env node
// Disposable, networkless PG17 recovery only. Source-exact donor for existing
// country moderation and HoD preference RPCs omitted by the scoped S02 fixture.
// Not a production migration, grant expansion or alternative mutation authority.
import { readFileSync } from "node:fs";

const adminPath =
  "supabase/migrations/20260916033414_permission_engine_v2_country_admin_rpc_cutover.sql";
const hodPath =
  "supabase/migrations/20260821234500_country_hod_self_history.sql";
const hodHardeningPath =
  "supabase/migrations/20260822001000_finalize_hod_release_hardening.sql";
const adminSql = readFileSync(adminPath, "utf8");
const hodSql = readFileSync(hodPath, "utf8");
const hodHardening = readFileSync(hodHardeningPath, "utf8");

function definition(text, first, next) {
  const a = text.indexOf(first);
  const b = text.indexOf(next, a + first.length);
  if (a < 0 || b < 0 || text.indexOf(first, a + 1) !== -1) {
    throw new Error("S16 duplicate/missing original country RPC definition: " + first);
  }
  const section = text.slice(a, b);
  const terminator = section.indexOf("$$;");
  if (terminator < 0 || section.includes("$$;", terminator + 3)) {
    throw new Error("S16 country original body terminator drift");
  }
  return section.slice(0, terminator + 3).trim();
}
const adminDdl = definition(
  adminSql,
  "create or replace function public.admin_set_country_account_status(",
  "create or replace function public.admin_update_country_identity(",
);
const hodDdl = definition(
  hodSql,
  "create or replace function public.set_owned_hod_auto_assign(",
  "create or replace function public.auto_assign_country_hod_for_participation(",
);
const adminRevoke =
  "revoke all on function public.admin_set_country_account_status(uuid, text, text) from public, anon;";
const adminGrant =
  "grant execute on function public.admin_set_country_account_status(uuid, text, text) to authenticated, service_role;";
const hodRevoke =
  "revoke all on function public.set_owned_hod_auto_assign(boolean) from public, anon;";
const hodGrant =
  "grant execute on function public.set_owned_hod_auto_assign(boolean) to authenticated;";
if (
  !adminSql.includes(adminRevoke) || !adminSql.includes(adminGrant) ||
  !hodHardening.includes(hodRevoke) || !hodHardening.includes(hodGrant) ||
  !adminDdl.includes("security definer") ||
  !adminDdl.includes("set search_path = public") ||
  !adminDdl.includes("public.studio2_access_allowed('delegation.manage', null, true)") ||
  !adminDdl.includes("update public.country_accounts") ||
  !hodDdl.includes("security definer") ||
  !hodDdl.includes("set search_path to 'public','pg_temp'") ||
  !hodDdl.includes("update public.country_accounts") ||
  !hodDdl.includes("where user_id = auth.uid() and status='active'")
) throw new Error("S16 country RPC source, grants, or role checks drift");

function procBody(ddl) {
  const match = ddl.match(/as \$\$([\s\S]*?)\$\$;\s*$/);
  if (!match) throw new Error("S16 source RPC delimiter drift");
  return match[1];
}
const adminBody = procBody(adminDdl);
const hodBody = procBody(hodDdl);
for (const tag of ["$s16_source_body$", "$s16_admin_ddl$", "$s16_hod_ddl$"]) {
  if (adminDdl.includes(tag) || hodDdl.includes(tag)) {
    throw new Error("S16 source SQL quote delimiter collision");
  }
}
process.stdout.write(`begin;
-- Source-exact local repair from ${adminPath} and ${hodPath}
-- No hosted database, schema_history, permissions or canonical bodies are changed.
do $s16_country_extra_preflight$
begin
  if current_user <> 'postgres'
    or current_setting('server_version_num')::integer / 10000 <> 17
    or to_regprocedure('public.claim_country_account(uuid)') is null
    or (to_regprocedure('public.admin_set_country_account_status(uuid,text,text)') is not null
      and to_regprocedure('public.set_owned_hod_auto_assign(boolean)') is not null)
  then
    raise exception 'S16 country local extra donor already installed or prerequisite drift'
      using errcode='55000';
  end if;
end $s16_country_extra_preflight$;

do $s16_country_extra_install$
begin
  if to_regprocedure('public.admin_set_country_account_status(uuid,text,text)') is null then
    execute $s16_admin_ddl$${adminDdl}$s16_admin_ddl$;
    execute '${adminRevoke.slice(0,-1)}';
    execute '${adminGrant.slice(0,-1)}';
  end if;
  if to_regprocedure('public.set_owned_hod_auto_assign(boolean)') is null then
    execute $s16_hod_ddl$${hodDdl}$s16_hod_ddl$;
    execute '${hodRevoke.slice(0,-1)}';
    execute '${hodGrant.slice(0,-1)}';
  end if;
end $s16_country_extra_install$;

do $s16_country_extra_postcheck$
declare
  v_admin oid := to_regprocedure('public.admin_set_country_account_status(uuid,text,text)');
  v_hod oid := to_regprocedure('public.set_owned_hod_auto_assign(boolean)');
begin
  if not exists(
    select 1 from pg_proc p where p.oid=v_admin and p.prosecdef
      and pg_get_userbyid(p.proowner)='postgres'
      and p.proconfig=array['search_path=public']::text[]
      and md5(p.prosrc)=md5($s16_source_body$${adminBody}$s16_source_body$)
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
      and has_function_privilege('service_role',p.oid,'EXECUTE')
  ) or not exists(
    select 1 from pg_proc p where p.oid=v_hod and p.prosecdef
      and pg_get_userbyid(p.proowner)='postgres'
      and p.proconfig=array['search_path=public, pg_temp']::text[]
      and md5(p.prosrc)=md5($s16_source_body$${hodBody}$s16_source_body$)
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) then
    raise exception 'S16 country local extra donor owner, body or ACL drift'
      using errcode='55000';
  end if;
end $s16_country_extra_postcheck$;
commit;
`);
