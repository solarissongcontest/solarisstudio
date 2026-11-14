// LOCAL cluster reconstruction. Never a production migration or credential tool.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export const OWNER_OBSERVATION =
  "docs/v3/recovery-candidates/evidence/recovery-owner-role-closure-observed-2026-11-14.json";
export const PLATFORM_OBSERVATION =
  "docs/v3/recovery-candidates/evidence/platform-owner-role-observed-2026-11-14.json";
const ident = (x) => {
  if (!/^[a-z_][a-z_0-9]*$/.test(x)) throw Error("Unreviewed SQL identifier");
  return '"' + x + '"';
};
const lit = (x) => "'" + x.replaceAll("'", "''") + "'";
export function stageRecoveryOwner(root = process.cwd()) {
  const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
  const observed = read(OWNER_OBSERVATION),
    platform = read(PLATFORM_OBSERVATION);
  for (const data of [observed, platform])
    if (
      data.projectRef !== "dkxmnvekiopyesuzggeu" ||
      data.read_only !== "on" ||
      data.server_version_num !== "170011" ||
      data.applicationRowsRead !== false
    )
      throw Error("Unreviewed owner role observation");
  const rows = [...observed.roles, platform.role].sort((a, b) => a.name.localeCompare(b.name));
  const names = rows.map((x) => x.name);
  const pg = rows.find((x) => x.name === "postgres");
  if (
    new Set(names).size !== 16 ||
    pg.superuser ||
    !pg.bypassrls ||
    !pg.login ||
    !pg.createdb ||
    !pg.createrole ||
    !pg.replication ||
    platform.role.name !== "supabase_admin" ||
    !platform.role.superuser ||
    platform.memberships.length ||
    observed.database.name !== "postgres" ||
    observed.database.owner !== "postgres"
  )
    throw Error("Owner role closure drift");
  if (observed.memberships.some((x) => !names.includes(x.member) || !names.includes(x.role)))
    throw Error("Incomplete owner membership closure");
  if (
    observed.memberships.some((x) => ["anon", "authenticated", "service_role"].includes(x.member))
  )
    throw Error("Unexpected API role parent");
  if (
    observed.schemas.length !== 5 ||
    new Set(observed.schemas.map((x) => x.name)).size !== 5 ||
    !["auth", "extensions", "private", "public", "televoting"].every((x) =>
      observed.schemas.some((s) => s.name === x),
    )
  )
    throw Error("Incomplete observed schema closure");
  if (observed.schemas.some((x) => !names.includes(x.owner) && x.owner !== "pg_database_owner"))
    throw Error("Unknown schema owner");
  let sql = `begin;
do $local$ begin
 if current_user<>'postgres' or current_database()<>'recovery_operator_baseline' or not exists(select 1 from pg_roles where rolname=current_user and rolsuper) or current_setting('server_version_num')<>'170011' then raise exception 'LOCAL owner reconstruction requires named disposable DB and initial superuser; NEVER hosted' using errcode='55000'; end if;
 if not exists(select 1 from pg_roles where rolname='solaris_recovery_bootstrap' and oid=10 and rolsuper) or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where r.rolname='solaris_recovery_bootstrap' and u.rolname='postgres') then raise exception 'Requires separate isolated cluster bootstrap, never a hosted role'; end if;
end $local$;
`;
  const options = (r) =>
    [
      r.login ? "login" : "nologin",
      r.superuser ? "superuser" : "nosuperuser",
      r.bypassrls ? "bypassrls" : "nobypassrls",
      r.inherit ? "inherit" : "noinherit",
      r.createdb ? "createdb" : "nocreatedb",
      r.createrole ? "createrole" : "nocreaterole",
      r.replication ? "replication" : "noreplication",
    ].join(" ");
  for (const row of rows.filter((r) => !r.name.startsWith("pg_") && r.name !== "postgres")) {
    sql += `do $role$ begin if not exists(select 1 from pg_roles where rolname=${lit(row.name)}) then execute 'create role ${ident(row.name)}'; end if; end $role$;\nalter role ${ident(row.name)} ${options(row)};\n`;
  }
  for (const edge of observed.memberships)
    sql += `grant ${ident(edge.role)} to ${ident(edge.member)} with admin ${edge.admin_option}, inherit ${edge.inherit_option}, set ${edge.set_option};\n`;
  for (const schema of observed.schemas) {
    const entries = schema.acl
      .slice(1, -1)
      .split(",")
      .map((x) => {
        const m = /^([a-z_0-9]*)=([UC]*)\/([a-z_0-9]+)$/.exec(x);
        if (!m) throw Error("Unsupported observed schema ACL");
        return { role: m[1], bits: m[2] };
      });
    sql += `alter schema ${ident(schema.name)} owner to ${ident(schema.owner)};\n`;
    // Clear only this disposable schema's explicit grants, then restore the full
    // observed ACL in its original order/grantor-owner context.
    sql += `do $acl$ declare grantee text; begin for grantee in select distinct case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname=${lit(schema.name)} loop execute format('revoke all on schema %I from %s',${lit(schema.name)},case when grantee='PUBLIC' then 'PUBLIC' else quote_ident(grantee) end); end loop; end $acl$;\n`;
    for (const e of entries) {
      const permissions = [
        e.bits.includes("U") ? "usage" : null,
        e.bits.includes("C") ? "create" : null,
      ]
        .filter(Boolean)
        .join(",");
      if (permissions)
        sql += `grant ${permissions} on schema ${ident(schema.name)} to ${e.role ? ident(e.role) : "public"};\n`;
    }
  }
  // Last privilege mutation: remaining statements must succeed as the actual
  // NONSUPERUSER postgres, not an alias or renamed application writer.
  sql += `alter role postgres ${options(pg)};\n`;
  sql += `do $verify$ declare actual jsonb; expected jsonb:=${lit(JSON.stringify(rows))}::jsonb; begin
 select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypassrls',rolbypassrls,'inherit',rolinherit,'createrole',rolcreaterole,'createdb',rolcreatedb,'replication',rolreplication,'login',rolcanlogin) order by rolname) into actual from pg_roles where rolname in (${names.map(lit).join(",")});
 if actual<>expected then raise exception 'Observed recovery-owner role attributes not reproduced'; end if;
 if pg_has_role('postgres','supabase_admin','MEMBER') or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where r.rolname='solaris_recovery_bootstrap' and u.rolname='postgres') then raise exception 'Recovery operator inherited an unobserved superuser'; end if;
 if exists(select 1 from pg_auth_members where member in (select oid from pg_roles where rolname in ('anon','authenticated','service_role'))) then raise exception 'Unexpected API role membership'; end if;
end $verify$;
`;
  for (const schema of observed.schemas)
    sql += `do $schema$ begin if not exists(select 1 from pg_namespace where nspname=${lit(schema.name)} and pg_get_userbyid(nspowner)=${lit(schema.owner)} and nspacl::text=${lit(schema.acl)}) then raise exception 'Observed schema owner/ACL mismatch: ${schema.name}'; end if; end $schema$;\n`;
  sql += "commit;\n";
  return sql;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.stdout.write(stageRecoveryOwner());
