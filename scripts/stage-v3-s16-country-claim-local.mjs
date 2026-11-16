#!/usr/bin/env node
// S16 local-only donor: recover the exact existing country-claim SQL in the
// disposable, networkless PostgreSQL 17.11 S02 fixture. NEVER a hosted migration.
// The actual country-account DML cutover still validates every effective owner.
import { readFileSync } from "node:fs";

const sourcePath =
  "supabase/migrations/20260916043443_permission_engine_v2_country_ownership_rpc_cutover.sql";
const source = readFileSync(sourcePath, "utf8");
const authoritativePath =
  "supabase/migrations/20260918205750_permission_engine_v2_authoritative_cutover.sql";
const authoritativeSource = readFileSync(authoritativePath, "utf8");

function uniqueSection(text, start, end) {
  const at = text.indexOf(start);
  const after = text.indexOf(end, at + start.length);
  if (at < 0 || after < 0 || text.indexOf(start, at + 1) !== -1) {
    throw new Error("S16 country source definition missing, ambiguous, or reordered: " + start);
  }
  return text.slice(at, after).trim();
}
// The claim RPC body comes from the original migration. Its private staff
// predicate MUST be the later final authoritative cutover, which intentionally
// removed public.has_role; restoring the transitional version would invent a
// dependency on a deliberately retired function.
const helperSection = uniqueSection(
  source,
  "create or replace function private.studio2_country_claim_blocked(",
  "create or replace function public.claim_country_account(",
);
const claimDefinition = uniqueSection(
  source,
  "create or replace function public.claim_country_account(",
  "create or replace function public.owns_country(",
);
const finalHelperDefinition = uniqueSection(
  authoritativeSource,
  "create or replace function private.studio2_country_claim_blocked(",
  "create or replace function private.studio2_user_access_allowed(",
);
const helperAclAt = helperSection.indexOf(
  "revoke all on function private.studio2_country_claim_blocked(uuid)",
);
if (helperAclAt < 0) throw new Error("S16 source helper ACL missing");
const helperDefinition = finalHelperDefinition.trim();
const helperAcl = helperSection.slice(helperAclAt).trim();
if (
  !helperDefinition.includes("security definer") ||
  !helperDefinition.includes("set search_path = 'pg_catalog', 'public', 'private'") ||
  !helperDefinition.includes("private.studio2_user_has_capability(p_user_id, 'delegation.manage', null)") ||
  helperDefinition.includes("public.has_role(") ||
  !helperAcl.includes(
    "revoke all on function private.studio2_country_claim_blocked(uuid) from public, anon, authenticated;",
  ) ||
  !helperAcl.includes(
    "grant execute on function private.studio2_country_claim_blocked(uuid) to service_role;",
  ) ||
  !claimDefinition.includes("security definer") ||
  !claimDefinition.includes("set search_path = public, private") ||
  !claimDefinition.includes("private.studio2_country_claim_blocked(v_user_id)") ||
  !claimDefinition.includes("insert into public.country_accounts (user_id, country_id)")
) {
  throw new Error("S16 recovered country writer body or authorization contract drift");
}
const claimAcl = [
  "revoke all on function public.claim_country_account(uuid) from public, anon;",
  "grant execute on function public.claim_country_account(uuid) to authenticated, service_role;",
];
if (!claimAcl.every((statement) => source.includes(statement))) {
  throw new Error("S16 country claim EXECUTE grants drift");
}
function bodyOf(ddl) {
  const match = ddl.match(/as (\$\$|\$function\$)([\s\S]*?)\1;\s*$/);
  if (!match) throw new Error("S16 donor SQL body delimiter drift");
  return match[2];
}
const helperBody = bodyOf(helperDefinition);
const claimBody = bodyOf(claimDefinition);
// Dollar-quoted literals retain the original function text byte-for-byte.
for (const marker of ["$s16_claim_expected$", "$s16_helper_sql$"]) {
  if (helperBody.includes(marker) || claimBody.includes(marker)) {
    throw new Error("S16 donor quote marker conflict");
  }
}

process.stdout.write(`begin;
-- GENERATED ONLY FROM ${sourcePath} and ${authoritativePath}
-- This source-only fixture donor is NOT a database migration or hosted proof.
do $s16_country_donor_preflight$
declare
  v_helper oid := to_regprocedure('private.studio2_country_claim_blocked(uuid)');
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer / 10000 <> 17
     or to_regprocedure('public.claim_country_account(uuid)') is not null
     or to_regclass('public.country_accounts') is null
     or to_regclass('public.countries') is null
  then
    raise exception 'S16 country local source donor already installed or prerequisite drift'
      using errcode='55000';
  end if;
  if v_helper is not null and not exists(
    select 1 from pg_proc p
    where p.oid=v_helper and p.prosecdef
      and pg_get_userbyid(p.proowner)='postgres'
      and p.proconfig=array['search_path=pg_catalog, public, private']::text[]
      and md5(p.prosrc)=md5($s16_claim_expected$${helperBody}$s16_claim_expected$)
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')
      and has_function_privilege('service_role',p.oid,'EXECUTE')
  ) then
    raise exception 'S16 existing country helper is not exact source authority'
      using errcode='55000';
  end if;
end $s16_country_donor_preflight$;

-- Do not replace an existing helper, even on a disposable fixture.
-- A pre-existing helper must have the exact authoritative final body.
do $s16_country_helper_install$
begin
  if to_regprocedure('private.studio2_country_claim_blocked(uuid)') is null then
    execute $s16_helper_sql$${helperDefinition}$s16_helper_sql$;
    execute 'revoke all on function private.studio2_country_claim_blocked(uuid) from public, anon, authenticated';
    execute 'grant execute on function private.studio2_country_claim_blocked(uuid) to service_role';
  end if;
end $s16_country_helper_install$;

${claimDefinition}
${claimAcl.join("\n")}

do $s16_country_donor_postcheck$
declare
  v_claim oid := to_regprocedure('public.claim_country_account(uuid)');
begin
  if not exists(
    select 1 from pg_proc p
    where p.oid=v_claim and p.prosecdef
      and pg_get_userbyid(p.proowner)='postgres'
      and p.proconfig=array['search_path=public, private']::text[]
      and md5(p.prosrc)=md5($s16_claim_expected$${claimBody}$s16_claim_expected$)
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
      and has_function_privilege('service_role',p.oid,'EXECUTE')
  ) then
    raise exception 'S16 country source donor owner, function body or caller ACL drift'
      using errcode='55000';
  end if;
end $s16_country_donor_postcheck$;
commit;
`);
