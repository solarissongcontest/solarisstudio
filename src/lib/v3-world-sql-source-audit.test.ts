import { test, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const auditScript = resolve(process.cwd(), "scripts/audit-v3-world-rpc-safety.mjs");
type Finding = { file: string; line: number; code: string; detail: string };
type Report = { filesInspected: number; worldFunctionsInspected: number; findings: Finding[] };
const definer = (options: string) => `create or replace function private.world_approve_v1(p_actor uuid)
returns void language plpgsql ${options} as $body$
begin
  perform 1;
end;
$body$;`;

/** Execute the exact committed CLI on disposable SQL fixtures, never on a database. */
function fixtureRun(sql: string, requireZero = false) {
  const root = mkdtempSync(join(tmpdir(), "v3-world-source-check-"));
  const migrationDir = join(root, "supabase", "migrations");
  try {
    mkdirSync(migrationDir, { recursive: true });
    writeFileSync(join(migrationDir, "20261107000000_fixture.sql"), sql, "utf8");
    const args = [auditScript, "--root", root];
    if (requireZero) args.push("--require-zero");
    const result = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 5000 });
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout) as Report;
    expect(report.filesInspected).toBe(1);
    return { report, status: result.status };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("TG19 World SQL: pinned pg_catalog definer and scoped reader/service grants pass", () => {
  const sql = `${definer("security definer set search_path = pg_catalog")}
grant select on table public.world_organizations to anon, authenticated;
grant all on table public.world_organizations to service_role;`;
  const { report, status } = fixtureRun(sql, true);
  expect(status).toBe(0);
  expect(report.worldFunctionsInspected).toBe(1);
  expect(report.findings).toEqual([]);
});

test.each([
  ["missing path", "security definer", "WORLD_DEFINER_MISSING_SEARCH_PATH"],
  ["untrusted path", "security definer set search_path = public", "WORLD_DEFINER_UNSAFE_SEARCH_PATH"],
  ["mixed path", "security definer set search_path = pg_catalog, public", "WORLD_DEFINER_UNSAFE_SEARCH_PATH"],
])("TG19 World SQL: %s is flagged", (_label, options, expected) => {
  const { report, status } = fixtureRun(definer(options), true);
  expect(status).toBe(1);
  expect(report.findings.map((x) => x.code)).toEqual([expected]);
  expect(report.findings[0].line).toBe(1);
});

test("TG19 World SQL: SECURITY DEFINER text inside body does not become function options", () => {
  const source = `create or replace function public.world_read_v1() returns text language sql
as $$ select 'security definer; grant all on table public.world_memberships to anon;'::text $$;`;
  expect(fixtureRun(source, true).report.findings).toEqual([]);
});

test("TG19 World SQL: post-body pinned definer is accepted", () => {
  const sql = "create function public.world_read_v1() returns int as $$select 1$$ language sql security definer set search_path = pg_catalog;";
  expect(fixtureRun(sql, true).status).toBe(0);
});

test("TG19 World SQL: direct INSERT, UPDATE and ALL privileges expose an unsafe browser writer", () => {
  const sql = `grant insert, update on table public.world_office_terms to authenticated;
grant all privileges on table public.world_organizations to public;`;
  const { report, status } = fixtureRun(sql, true);
  expect(status).toBe(1);
  expect(report.findings.map((f) => f.code)).toEqual([
    "WORLD_BROWSER_DIRECT_DML_GRANT", "WORLD_BROWSER_DIRECT_DML_GRANT",
  ]);
});

test("TG19 World SQL: column-scoped update and ALL TABLES in public schema cannot evade detection", () => {
  const sql = `grant update (status) on table public.world_memberships to authenticated;
grant all on all tables in schema public to anon;`;
  const { report } = fixtureRun(sql);
  expect(report.findings.map((f) => f.code)).toEqual([
    "WORLD_BROWSER_DIRECT_DML_GRANT", "WORLD_BROWSER_SCHEMA_WIDE_DML_GRANT",
  ]);
});

test("TG19 World SQL: SELECT and EXECUTE grants are not direct DML", () => {
  const sql = `grant select on all tables in schema public to anon;
grant select on table public.world_memberships to authenticated;
grant execute on function public.world_approve_v1(uuid) to authenticated;`;
  expect(fixtureRun(sql, true).report.findings).toEqual([]);
});

test("TG19 World SQL: multiple table targets, browser roles only, deterministic evidence", () => {
  const sql = "grant delete, select on table public.world_organizations, public.world_memberships to authenticated, service_role;";
  const { report } = fixtureRun(sql);
  expect(report.findings).toHaveLength(1);
  expect(report.findings[0].detail).toContain("world_organizations");
  expect(report.findings[0].detail).toContain("world_memberships");
  expect(report.findings[0].detail).toContain("authenticated");
  expect(report.findings[0].detail).not.toContain("service_role");
});

test("TG19 World SQL: comments, nested comments, DO and dollar bodies do not create false grants", () => {
  const sql = `-- grant all on table public.world_organizations to anon;
/* outer /* grant insert on table public.world_memberships to authenticated; */ still comment; */
do $d$ begin execute 'grant all on table public.world_organizations to anon;'; end; $d$;
${definer("security definer set search_path = pg_catalog")}`;
  expect(fixtureRun(sql, true).report.findings).toEqual([]);
});

test("TG19 World SQL: unrelated definer is not misreported as World source", () => {
  const sql = "create function private.other_domain_v1() returns int language sql security definer as $$select 1$$;";
  expect(fixtureRun(sql, true).report.findings).toEqual([]);
});


test("TG19 World SQL: multi-column DML cannot disappear behind inner commas", () => {
  const sql = `grant select, update (status, "second,name") on table public.world_organizations to authenticated;
grant insert (region_id, status), select on table public.world_memberships to anon;`;
  const { report, status } = fixtureRun(sql, true);
  expect(status).toBe(1);
  expect(report.findings.map((f) => f.code)).toEqual([
    "WORLD_BROWSER_DIRECT_DML_GRANT",
    "WORLD_BROWSER_DIRECT_DML_GRANT",
  ]);
  expect(report.findings[0].detail).toContain("update (status, \\"second,name\\")");
  expect(report.findings[1].detail).toContain("insert (region_id, status)");
});

test("TG19 World SQL: quoted schema/table and role identifiers remain visible", () => {
  const sql = `grant update ("last,name", "a""b") on table "public"."world_office_terms" to "authenticated";
grant delete on table "private"."world_sensitive_state" to "anon";`;
  const { report } = fixtureRun(sql);
  expect(report.findings).toHaveLength(2);
  expect(report.findings[0].detail).toContain("world_office_terms");
  expect(report.findings[1].detail).toContain("world_sensitive_state");
});

test("TG19 World SQL: public within multi-schema ALL TABLES grants is flagged", () => {
  const sql = `grant all on all tables in schema private, "public" to anon;
grant all on all tables in schema private to anon;`;
  const { report, status } = fixtureRun(sql, true);
  expect(status).toBe(1);
  expect(report.findings.map((f) => f.code)).toEqual([
    "WORLD_BROWSER_SCHEMA_WIDE_DML_GRANT",
  ]);
});

test("TG19 World SQL: quoted World SECURITY DEFINER function/procedure are inspected", () => {
  const sql = `create or replace function "private"."world_check_v1"() returns integer
language sql security definer as $select 1$;
create procedure "public"."world_mutate_v1"() language plpgsql security definer
set search_path = public as $ begin null; end $;`;
  const { report, status } = fixtureRun(sql, true);
  expect(status).toBe(1);
  expect(report.worldFunctionsInspected).toBe(2);
  expect(report.findings.map((f) => f.code)).toEqual([
    "WORLD_DEFINER_MISSING_SEARCH_PATH",
    "WORLD_DEFINER_UNSAFE_SEARCH_PATH",
  ]);
});

test("TG19 World SQL: unrelated quoted SQL identities do not become World findings", () => {
  const sql = `grant update (status) on table "public"."not_world_organizations" to authenticated;
grant select on table "public"."world_memberships" to "anon";`;
  expect(fixtureRun(sql, true).report.findings).toEqual([]);
});

test("TG19 World SQL: wrong command-line parameters fail closed", () => {
  const result = spawnSync(process.execPath, [auditScript, "--bogus"], { encoding: "utf8", timeout: 5000 });
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("Unknown or incomplete argument");
});
