// LOCAL fixture only: production postgres is not superuser, so refuses before DDL.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export const ROLE_OBSERVATION =
  "docs/v3/recovery-candidates/evidence/api-role-authority-observed-2026-11-14.json";
export function stageHostedApiRoles(root = process.cwd()) {
  const data = JSON.parse(readFileSync(resolve(root, ROLE_OBSERVATION), "utf8"));
  const names = ["anon", "authenticated", "service_role"];
  if (
    data.projectRef !== "dkxmnvekiopyesuzggeu" ||
    data.server_version_num !== "170011" ||
    data.read_only !== "on" ||
    data.applicationRowsRead !== false ||
    data.memberships.length !== 0
  )
    throw Error("Unqualified API role scope or memberships");
  const rows = data.roles.filter((x) => names.includes(x.name));
  if (
    rows.length !== 3 ||
    new Set(rows.map((x) => x.name)).size !== 3 ||
    rows.some(
      (x) =>
        x.superuser ||
        x.login ||
        x.createdb ||
        x.createrole ||
        x.replication ||
        !x.inherit ||
        x.bypassrls !== (x.name === "service_role"),
    )
  )
    throw Error("Unexpected hosted API privilege profile");
  return `begin;
do $pre$ begin
 if current_user<>'postgres' or not exists(select 1 from pg_roles where rolname=current_user and rolsuper) or current_setting('server_version_num')<>'170011' then raise exception 'LOCAL role reconstruction requires isolated bootstrap superuser; NEVER hosted' using errcode='55000'; end if;
 if (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role'))<>3 or exists(select 1 from pg_auth_members where member in (select oid from pg_roles where rolname in ('anon','authenticated','service_role'))) then raise exception 'Unknown existing API role membership'; end if;
end $pre$;
${rows.map((x) => `alter role ${x.name} nologin nosuperuser nocreatedb nocreaterole noreplication inherit ${x.bypassrls ? "bypassrls" : "nobypassrls"};`).join("\n")}
do $post$ declare actual jsonb; begin
 select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypassrls',rolbypassrls,'inherit',rolinherit,'createrole',rolcreaterole,'createdb',rolcreatedb,'replication',rolreplication,'login',rolcanlogin) order by rolname) into actual from pg_roles where rolname in ('anon','authenticated','service_role');
 if actual is distinct from '${JSON.stringify(rows)}'::jsonb then raise exception 'Hosted-observed API role attributes mismatch'; end if;
end $post$;
commit;
`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.stdout.write(stageHostedApiRoles());
