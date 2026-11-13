import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  catalogSql,
  validateCatalog,
  compareCatalog,
  compareDownstream,
  columns,
  tables,
  functions,
  triggers,
} from "./v3-s13-s14-catalog-export.mjs";
const observed = JSON.parse(
  readFileSync(
    new URL(
      "../docs/v3/recovery-candidates/evidence/s13-s14-catalog-observed-2026-11-13.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const copy = () => structuredClone(observed);
test("one deterministic bounded result preserves all approved categories and missing rows", () => {
  const sql = catalogSql();
  assert.equal(sql, catalogSql());
  assert.equal(
    sql,
    readFileSync(
      new URL(
        "../docs/v3/recovery-candidates/s13-s14-catalog-export-readonly.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(tables.length, 11);
  assert.equal(columns.length, 31);
  assert.equal(functions.length, 20);
  assert.equal(triggers.length, 11);
  assert.match(sql, /begin transaction read only;/);
  assert.match(sql, /statement_timeout='10s'/);
  assert.match(sql, /lock_timeout='2s'/);
  assert.match(sql, /rollback;\s*$/);
  assert.equal((sql.match(/as catalog_export;/g) || []).length, 1);
  assert.doesNotMatch(
    sql,
    /\b(?:insert into|delete from|update public|create table|alter table|copy |pg_read_file|execute |schema_migrations)\b/i,
  );
  assert.doesNotMatch(
    sql,
    /select\s+pg_get_functiondef|select\s+\*\s+from\s+(?:public|private)\./i,
  );
  assert.match(sql, /md5\(pg_get_functiondef/);
});
test("current authorized export has five S13 tables/seven RPCs absent and 31 compatible prerequisites", () => {
  const r = validateCatalog(observed);
  assert.equal(r.scopeValid, true);
  assert.equal(r.hostedEquivalenceCertified, false);
  assert.equal(observed.columns.filter((x) => x.compatible).length, 31);
  assert.equal(observed.tables.filter((x) => !x.exists_now).length, 7);
  assert.equal(observed.functions.filter((x) => !x.exists_now).length, 16);
  assert.equal(observed.triggers.filter((x) => !x.exists_now).length, 9);
});
test("incomplete, duplicated and extra rows cannot qualify scope", () => {
  for (const key of ["tables", "columns", "functions", "indexes", "triggers"]) {
    let r = copy();
    r[key].pop();
    assert.throws(() => validateCatalog(r));
    r = copy();
    r[key][0] = r[key][1];
    assert.throws(() => validateCatalog(r));
    r = copy();
    r[key].push(r[key][0]);
    assert.throws(() => validateCatalog(r));
  }
});
test("read-only/timeout/project/version provenance is mandatory", () => {
  for (const key of [
    "transaction_read_only",
    "statement_timeout",
    "lock_timeout",
    "server_version_num",
    "observed_at",
  ]) {
    const r = copy();
    r.checkpoint[key] = "wrong";
    assert.throws(() => validateCatalog(r));
  }
  const r = copy();
  r.project_ref = "preview";
  assert.throws(() => validateCatalog(r));
});
test("actual property drift refuses a same-identity reconstructed baseline", () => {
  const mutations = [
    (r) => (r.tables.find((x) => x.exists_now).rls = false),
    (r) => (r.tables.find((x) => x.exists_now).privileges.anon.truncate = false),
    (r) => (r.functions.find((x) => x.exists_now).owner = "authenticated"),
    (r) => (r.functions.find((x) => x.exists_now).execute.anon = true),
    (r) => (r.triggers.find((x) => x.exists_now).enabled = "D"),
    (r) => (r.functions.find((x) => x.exists_now).definition_md5 = "f".repeat(32)),
  ];
  for (const mutate of mutations) {
    const r = copy();
    mutate(r);
    assert.throws(() => compareCatalog(r, observed));
  }
  const r = copy();
  r.checkpoint.observed_at = "2026-11-14T01:00:00Z";
  assert.equal(compareCatalog(r, observed).scopedPropertiesMatched, true);
});
test("guard pretty/default hashes must not be compared as identical algorithms", () => {
  const rows = observed.triggers.filter((x) => x.exists_now);
  assert.deepEqual(
    rows.map((x) => x.definition_md5),
    ["2ae8e682d3bd6c9c6ba5738014681357", "9a98e162443857e540419ba2659d85f5"],
  );
  assert.ok(
    rows.every(
      (x) => x.enabled === "O" && x.function === "private.studio2_guard_direct_client_write()",
    ),
  );
});
test("recovery retains canonical consolidation rather than reinstalling retired guards", () => {
  const source = readFileSync(
    new URL(
      "../docs/v3/recovery-candidates/forward-only-s14-archive-integrated-local.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    source,
    /create trigger v3_guard_archive_runtime_transition\s+before insert or update or delete on public\.studio2_edition_runtime/,
  );
  for (const name of ["insert", "update", "delete"])
    assert.match(
      source,
      new RegExp(
        "drop trigger if exists v3_guard_archive_runtime_" +
          name +
          " on public\\.studio2_edition_runtime",
      ),
    );
  assert.match(
    source,
    /create trigger v3_project_resolved_task_delivery_state[\s\S]{0,180}on public\.studio2_organizer_tasks/,
  );
});

test("bounded downstream evidence preserves missing canonical interfaces without certifying them", () => {
  const observed = JSON.parse(
    readFileSync(
      new URL(
        "../docs/v3/recovery-candidates/evidence/s13-s14-voting-dependencies-observed-2026-11-13.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(observed.tables.length, 6);
  assert.equal(observed.functions.length, 9);
  assert.equal(observed.functions.filter((x) => !x.exists_now).length, 7);
  assert.equal(compareDownstream(observed).hostedEquivalenceCertified, false);
  const bad = structuredClone(observed);
  bad.functions.find((x) => x.exists_now).definition_md5 = "f".repeat(32);
  assert.throws(() => compareDownstream(bad));
  const sql = readFileSync(
    new URL(
      "../docs/v3/recovery-candidates/s13-s14-voting-dependency-inspection-readonly.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /begin transaction read only/);
  assert.doesNotMatch(
    sql,
    /\b(?:insert into|delete from|update public|create table|alter table|schema_migrations)\b/i,
  );
});
