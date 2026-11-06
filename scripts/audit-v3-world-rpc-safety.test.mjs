import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditWorldMigrationDirectory, auditWorldSqlSource, splitTopLevelSql } from "./audit-v3-world-rpc-safety.mjs";

const codes = (sql) => auditWorldSqlSource(sql).findings.map((f) => f.code);
const definer = (options) => `create or replace function private.world_approve_v1(p_actor uuid)
returns void language plpgsql ${options} as $body$
begin
  perform 1;
end;
$body$;`;

test("World SQL: safe pinned definer, reader grant and service-role writes", () => {
  assert.deepEqual(codes(`${definer("security definer set search_path = pg_catalog")}
grant select on table public.world_organizations to anon, authenticated;
grant all on table public.world_organizations to service_role;`), []);
});
test("World SQL: missing SECURITY DEFINER search_path is reported", () => {
  assert.deepEqual(codes(definer("security definer")), ["WORLD_DEFINER_MISSING_SEARCH_PATH"]);
});
test("World SQL: untrusted and mixed search paths are reported", () => {
  assert.deepEqual(codes(definer("security definer set search_path = public")), ["WORLD_DEFINER_UNSAFE_SEARCH_PATH"]);
  assert.deepEqual(codes(definer("security definer set search_path = pg_catalog, public")), ["WORLD_DEFINER_UNSAFE_SEARCH_PATH"]);
});
test("World SQL: SECURITY DEFINER text in body cannot masquerade as options", () => {
  assert.deepEqual(codes(`create function public.world_read_v1() returns text language sql as $$ select 'security definer; grant all on table public.world_memberships to anon;'::text $$;`), []);
});
test("World SQL: post-body pinned SECURITY DEFINER is accepted", () => {
  assert.deepEqual(codes(`create function public.world_read_v1() returns int as $$select 1$$ language sql security definer set search_path = pg_catalog;`), []);
});
test("World SQL: browser direct DML and ALL grants are reported", () => {
  assert.deepEqual(codes(`grant insert, update on table public.world_office_terms to authenticated;
grant all privileges on table public.world_organizations to public;`), ["WORLD_BROWSER_DIRECT_DML_GRANT", "WORLD_BROWSER_DIRECT_DML_GRANT"]);
});
test("World SQL: column-grants and schema-wide grants are covered", () => {
  assert.deepEqual(codes("grant update (status) on table public.world_memberships to authenticated;"), ["WORLD_BROWSER_DIRECT_DML_GRANT"]);
  assert.deepEqual(codes("grant all on all tables in schema public to anon;"), ["WORLD_BROWSER_SCHEMA_WIDE_DML_GRANT"]);
  assert.deepEqual(codes("grant select on all tables in schema public to anon;"), []);
});
test("World SQL: multi-table grant reports only browser roles", () => {
  const f = auditWorldSqlSource("grant delete, select on table public.world_organizations, public.world_memberships to authenticated, service_role;").findings;
  assert.equal(f.length, 1);
  assert.match(f[0].detail, /world_memberships/);
  assert.match(f[0].detail, /world_organizations/);
  assert.match(f[0].detail, /authenticated/);
  assert.doesNotMatch(f[0].detail, /service_role/);
});
test("World SQL: function EXECUTE privilege is not table DML", () => {
  assert.deepEqual(codes("grant execute on function public.world_approve_v1(uuid) to authenticated;"), []);
});
test("World SQL: comments and DO/dollar function bodies are not statements", () => {
  assert.deepEqual(codes(`-- grant all on table public.world_organizations to anon;
/* grant insert on table public.world_memberships to authenticated; */
do $d$ begin execute 'grant all on table public.world_organizations to anon;'; end; $d$;`), []);
});
test("World SQL: nested comments and semicolons retain statement boundaries", () => {
  const sql = `/* outer /* nested; */ still comment; */
${definer("security definer set search_path = pg_catalog")}
grant select on table public.world_organizations to anon;`;
  assert.equal(splitTopLevelSql(sql).length, 2);
  assert.deepEqual(codes(sql), []);
});
test("World SQL: unrelated domain definer stays outside World audit", () => {
  assert.deepEqual(codes("create function private.other_domain_v1() returns int language sql security definer as $$select 1$$;"), []);
});
test("World SQL: offline directory and CLI modes are deterministic", () => {
  const root = mkdtempSync(join(tmpdir(), "world-sql-audit-"));
  const dir = join(root, "supabase", "migrations");
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "b.sql"), "-- heading\ngrant update on table public.world_offices to authenticated;\n");
    writeFileSync(join(dir, "a.sql"), definer("security definer"));
    writeFileSync(join(dir, "ignore.txt"), "grant all on table public.world_offices to public;");
    const report = auditWorldMigrationDirectory(dir);
    assert.equal(report.filesInspected, 2);
    assert.equal(report.worldFunctionsInspected, 1);
    assert.deepEqual(report.findings.map(f => [f.file, f.line, f.code]), [
      ["a.sql", 1, "WORLD_DEFINER_MISSING_SEARCH_PATH"],
      ["b.sql", 2, "WORLD_BROWSER_DIRECT_DML_GRANT"],
    ]);
    const script = fileURLToPath(new URL("./audit-v3-world-rpc-safety.mjs", import.meta.url));
    const ok = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
    assert.equal(ok.status, 0);
    const strict = spawnSync(process.execPath, [script, "--root", root, "--require-zero"], { encoding: "utf8" });
    assert.equal(strict.status, 1);
    assert.equal(JSON.parse(strict.stdout).findings.length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("World SQL: unknown args return failure without database access", () => {
  const script = fileURLToPath(new URL("./audit-v3-world-rpc-safety.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--bogus"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown or incomplete argument/);
});
