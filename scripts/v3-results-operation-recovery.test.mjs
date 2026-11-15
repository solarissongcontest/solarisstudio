import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
const engineScript = path.resolve("scripts/stage-v3-results-operation-authority-recovery.mjs");
const engine = execFileSync("node", [engineScript], { encoding: "utf8" });
const cas = execFileSync("node", ["scripts/stage-v3-results-reviewed-cas-recovery.mjs"], {
  encoding: "utf8",
});
test("qualifies exact observed functions and table authority before engine changes", () => {
  assert.ok(
    engine.indexOf("Results operation table drift") <
      engine.indexOf("rename to studio2_result_preconditions_v3_base"),
  );
  assert.match(engine, /proowner/);
  assert.match(engine, /proacl/);
  assert.match(engine, /columns_md5/);
  for (const [file, name] of [
    [
      "20261103004600_v3_canonical_result_recalculation.sql",
      "public.recalculate_show_results_internal",
    ],
    [
      "20261103004700_v3_result_reconciliation_hardening.sql",
      "public.studio2_execute_result_operation",
    ],
  ]) {
    assert.ok(
      engine.includes(
        extractDefinition(fs.readFileSync("supabase/migrations/" + file, "utf8"), name),
      ),
    );
  }
  assert.doesNotMatch(engine, /insert into supabase_migrations|migration repair|disable trigger/i);
});
test("unbound or incomplete hosted evidence refuses artifact generation", () => {
  for (const mutate of [
    (d) => (d.projectRef = "oxtbskojiexkaspputvo"),
    (d) => (d.read_only = "off"),
    (d) => d.routines.pop(),
  ]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solaris-results-evidence-"));
    try {
      const file =
        "docs/v3/recovery-candidates/evidence/results-operation-prerequisites-observed-2026-11-14.json";
      const d = JSON.parse(fs.readFileSync(file, "utf8"));
      mutate(d);
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      for (const frozen of [
        "s06-hosted-catalog-digests-2026-11-10.json",
        "s02-hosted-727-routine-fingerprints-2026-11-09.json",
      ]) {
        const relative = "docs/v3/recovery-candidates/evidence/" + frozen;
        fs.copyFileSync(relative, path.join(dir, relative));
      }
      fs.writeFileSync(path.join(dir, file), JSON.stringify(d));
      const r = spawnSync("node", [engineScript], { cwd: dir, encoding: "utf8" });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /Unqualified Results operation observation/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
test("CAS wraps the existing implementation and refuses partial installation", () => {
  const source = fs
    .readFileSync("supabase/migrations/20261104170500_v3_results_reviewed_input_cas.sql", "utf8")
    .replace(/^begin;\s*/i, "")
    .replace(/commit;\s*$/i, "");
  assert.ok(cas.includes(source));
  assert.match(cas, /Reviewed CAS source prerequisite drift/);
  assert.match(cas, /already or partially installed/);
  assert.match(cas, /auth.jwt\(\)/);
  assert.match(cas, /v3.recovery.results-operation-engine/);
  const preflight = cas.slice(0, cas.indexOf("select public.v3_register_migration_contract"));
  for (const name of [
    ...source.matchAll(/create or replace function\s+(?:private|public)\.([a-z0-9_]+)/g),
  ].map((m) => m[1]))
    assert.ok(preflight.includes(name), "Missing partial-function refusal: " + name);
  for (const name of [...source.matchAll(/create trigger\s+([a-z0-9_]+)/g)].map((m) => m[1]))
    assert.ok(preflight.includes(name), "Missing partial-trigger refusal: " + name);
  assert.match(preflight, /studio2_result_operations_review_basis_version_check/);
  const expected = JSON.parse(
    fs.readFileSync(
      "docs/v3/recovery-candidates/evidence/results-operation-engine-source-postconditions.json",
      "utf8",
    ),
  );
  for (const name of [
    "private.studio2_result_preconditions_v3_base(uuid)",
    "public.studio2_execute_result_operation_v3_base(uuid,text,text,uuid,bigint)",
  ]) {
    const row = expected.find((x) => x.identity === name);
    assert.ok(row?.acl);
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
  }
  assert.match(preflight, /acldefault/);
  assert.match(preflight, /coalesce\(to_jsonb\(p.proconfig\),'null'::jsonb\)/);
});
test("operation table cutover closes column, table and RLS-independent privileges", () => {
  const sql = fs.readFileSync(
    "supabase/migrations/20261114194701_v3_results_operation_tables_owner_only.sql",
    "utf8",
  );
  assert.match(sql, /from public,anon,authenticated,service_role/);
  assert.match(sql, /insert,update,delete,truncate,references,trigger,maintain/);
  assert.match(sql, /has_any_column_privilege/);
  assert.match(sql, /prosecdef/);
  assert.doesNotMatch(
    sql,
    /disable row level security|drop policy|grant .* to (anon|authenticated)/i,
  );
  const runtime = fs.readFileSync(".github/tests/v3-results-operation-role-denial.sql", "utf8");
  assert.match(runtime, /exception when insufficient_privilege/);
  assert.match(runtime, /truncate public.studio2_result_operations/);
  assert.match(runtime, /rollback;/);
});
