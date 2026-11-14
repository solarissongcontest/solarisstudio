// Fixture repair ONLY. Refuses the actual hosted owner before any DDL.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
export const UID_OBSERVATION =
  "docs/v3/recovery-candidates/evidence/auth-uid-authority-observed-2026-11-13.json";
export function stageAuthUidAuthority(root = process.cwd()) {
  const row = JSON.parse(readFileSync(resolve(root, UID_OBSERVATION), "utf8"));
  const frozen = JSON.parse(
    readFileSync(
      resolve(
        root,
        "docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json",
      ),
      "utf8",
    ),
  ).routines.find((x) => x.signature === "auth.uid()");
  if (
    row.projectRef !== "dkxmnvekiopyesuzggeu" ||
    row.server_version_num !== "170011" ||
    row.read_only !== "on" ||
    row.applicationRowsRead !== false ||
    row.identity !== "auth.uid()" ||
    row.owner !== "supabase_auth_admin" ||
    row.security_definer !== false ||
    row.config !== null ||
    row.definition_md5 !== frozen.definition_md5 ||
    row.owner !== frozen.owner_name ||
    createHash("md5").update(row.acl).digest("hex") !== frozen.acl_md5 ||
    !/^[a-f0-9]{64}$/.test(row.definition_sha256)
  )
    throw Error("Unqualified auth.uid authority observation");
  return `begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $pre$ begin
 if current_user<>'postgres' or current_setting('server_version_num')<>'170011' or not exists(select 1 from pg_proc p where p.oid=to_regprocedure('auth.uid()') and pg_get_userbyid(p.proowner)='postgres' and p.proacl is null and not p.prosecdef and md5(pg_get_functiondef(p.oid))='${row.definition_md5}') then
  raise exception 'Local auth.uid authority fixture requires exact imported body and initial local owner/ACL; NEVER hosted' using errcode='55000';
 end if;
end $pre$;
-- dashboard_user identity is observed in the ACL. Its other role attributes are
-- deliberately NOT certified by this minimal NOLOGIN local reconstruction.
do $role$ begin if not exists(select 1 from pg_roles where rolname='dashboard_user') then create role dashboard_user nologin; end if; end $role$;
alter function auth.uid() owner to supabase_auth_admin;
-- PostgreSQL records this superuser grant as the actual function owner.
grant execute on function auth.uid() to dashboard_user;
do $post$ begin
 if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('auth.uid()') and pg_get_userbyid(p.proowner)='${row.owner}' and p.proacl::text='${row.acl}' and p.proconfig is null and not p.prosecdef and md5(pg_get_functiondef(p.oid))='${row.definition_md5}' and encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='${row.definition_sha256}') then
  raise exception 'Local auth.uid observed owner/ACL/definition mismatch' using errcode='55000';
 end if;
end $post$;
commit;
`;
}
export const ROUND_FLAG_OBSERVATION =
  "docs/v3/recovery-candidates/evidence/round-invalidation-authority-observed-2026-11-14.json";
export function stageRoundInvalidationAuthority(root = process.cwd()) {
  const row = JSON.parse(readFileSync(resolve(root, ROUND_FLAG_OBSERVATION), "utf8"));
  const frozen = JSON.parse(
    readFileSync(
      resolve(
        root,
        "docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json",
      ),
      "utf8",
    ),
  ).routines.find((x) => x.signature === "televoting.flag_round_results_outdated()");
  if (
    row.projectRef !== "dkxmnvekiopyesuzggeu" ||
    row.server_version_num !== "170011" ||
    row.read_only !== "on" ||
    row.identity !== "televoting.flag_round_results_outdated()" ||
    row.owner !== "postgres" ||
    row.security_definer !== false ||
    row.definition_md5 !== frozen.definition_md5 ||
    createHash("md5").update(row.acl).digest("hex") !== frozen.acl_md5
  )
    throw Error("Unqualified round invalidation observation");
  return `begin;
do $pre$ begin
 if current_user<>'postgres' or not exists(select 1 from pg_proc p where p.oid=to_regprocedure('televoting.flag_round_results_outdated()') and pg_get_userbyid(p.proowner)='postgres' and p.proacl is null and not p.prosecdef and md5(pg_get_functiondef(p.oid))='${row.definition_md5}') then raise exception 'Local invalidation ACL requires exact imported default ACL; NEVER hosted' using errcode='55000'; end if;
end $pre$;
revoke all on function televoting.flag_round_results_outdated() from public,anon,authenticated,service_role;
grant execute on function televoting.flag_round_results_outdated() to anon,authenticated,service_role;
do $post$ begin
 if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('televoting.flag_round_results_outdated()') and p.proacl::text='${row.acl}' and md5(pg_get_functiondef(p.oid))='${row.definition_md5}' and encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='${row.definition_sha256}' and not p.prosecdef and p.proconfig=array[${row.config.map((x) => "'" + x + "'").join(",")}]::text[]) then raise exception 'Local round invalidation function does not match observed authority'; end if;
end $post$;
commit;
`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.stdout.write(
    process.argv.includes("--round-invalidation")
      ? stageRoundInvalidationAuthority()
      : stageAuthUidAuthority(),
  );
