// Operator-only catalog SQL generator/offline validator. Never connects to a DB.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MISSING_S13_TABLES, MISSING_S13_FUNCTIONS } from "./check-v3-s02-local-fixture.mjs";
const candidate = readFileSync(
  new URL(
    "../docs/v3/recovery-candidates/forward-only-s14-archive-integrated-local.sql",
    import.meta.url,
  ),
  "utf8",
);
const columnBlock = candidate.slice(
  candidate.indexOf("('public.studio2_edition_runtime', 'edition_id'"),
  candidate.indexOf(") as e(rel,col,typ,must_not_null)"),
);
export const columns = [
  ...columnBlock.matchAll(/\('([^']+)', '([^']+)', '([^']+)', (true|false)\)/g),
].map((m) => ({ relation: m[1], name: m[2], type: m[3], notNull: m[4] === "true" }));
export const tables = [
  ...MISSING_S13_TABLES,
  "private.v3_archive_runtime_transition_gates",
  "private.v3_archive_task_reconciliation_gates",
  "public.editions",
  "public.studio2_edition_runtime",
  "public.studio2_organizer_tasks",
  "public.notification_deliveries",
];
export const functions = [
  ...MISSING_S13_FUNCTIONS,
  "private.studio2_request_is_service_role()",
  "private.studio2_reconcile_all_organizer_tasks(uuid)",
  "private.studio2_prune_stale_task_notifications(uuid)",
  "public.studio2_transition_edition_v2(uuid,text,text,uuid)",
  "private.v3_edition_final_results_ready(uuid)",
  "public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)",
  "private.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)",
  "public.studio2_process_edition_domain_event(uuid,text,text)",
  "private.v3_resolve_archived_edition_workflow_tasks(uuid)",
  "private.v3_reconcile_resolved_task_notifications(uuid)",
  "private.v3_guard_archive_runtime_transition()",
  "private.v3_project_resolved_task_delivery_state()",
  "private.v3_archive_task_reconciliation_gate_active(uuid)",
];
export const indexes = [
  "private.v3_migration_parity_runs_key_time_idx",
  "private.v3_backfill_jobs_status_idx",
];
export const triggers = [
  ["public.admin_notifications", "studio2_platform_direct_write_guard"],
  ["public.notification_deliveries", "studio2_platform_direct_write_guard"],
  ["public.editions", "v3_guard_archived_legacy_edition_status"],
  ["public.notification_deliveries", "v3_project_resolved_task_delivery_state"],
  ...["delete", "insert", "transition", "update"].map((x) => [
    "public.studio2_edition_runtime",
    "v3_guard_archive_runtime_" + x,
  ]),
  ["public.studio2_edition_runtime", "v3_sync_archived_edition_legacy_status"],
  ["public.studio2_organizer_tasks", "v3_guard_archived_edition_task_resurrection"],
  ["public.studio2_organizer_tasks", "v3_project_resolved_task_delivery_state"],
];
const lit = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const values = (rows) => rows.map((row) => "(" + row.map(lit).join(",") + ")").join(",\n");
export function catalogSql() {
  assert.equal(columns.length, 31);
  assert.equal(functions.length, 20);
  assert.equal(tables.length, 11);
  assert.equal(triggers.length, 11);
  return `-- OPERATOR ONLY. Approved catalog whitelist; no application rows or function bodies.
-- Project identity must be independently confirmed in the connected tool/SQL Editor.
begin transaction read only;
set local statement_timeout='10s';
set local lock_timeout='2s';
with
wanted_tables(identity) as (values ${values(tables.map((x) => [x]))}),
wanted_columns(relation,name,expected_type,expected_not_null) as (values ${values(columns.map((x) => [x.relation, x.name, x.type, x.notNull]))}),
wanted_functions(identity) as (values ${values(functions.map((x) => [x]))}),
wanted_indexes(identity) as (values ${values(indexes.map((x) => [x]))}),
wanted_triggers(relation,name) as (values ${values(triggers)}),
t as (select w.identity,c.oid is not null as exists_now,c.relkind,pg_get_userbyid(c.relowner) as owner,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,
  (select jsonb_object_agg(r,jsonb_build_object('schema_usage',has_schema_privilege(r,n.oid,'USAGE'),'select',has_table_privilege(r,c.oid,'SELECT'),'insert',has_table_privilege(r,c.oid,'INSERT'),'update',has_table_privilege(r,c.oid,'UPDATE'),'delete',has_table_privilege(r,c.oid,'DELETE'),'truncate',has_table_privilege(r,c.oid,'TRUNCATE'))) from unnest(array['anon','authenticated','service_role']) r) as privileges
  from wanted_tables w left join pg_class c on c.oid=to_regclass(w.identity) left join pg_namespace n on n.oid=c.relnamespace),
a as (select w.*,c.oid is not null as parent_exists,a.attname is not null as exists_now,format_type(a.atttypid,a.atttypmod) as actual_type,a.attnotnull as not_null,
  case when a.attname is null then false else a.atttypid=to_regtype(w.expected_type) and a.attnotnull=w.expected_not_null::boolean end as compatible
  from wanted_columns w left join pg_class c on c.oid=to_regclass(w.relation) left join pg_attribute a on a.attrelid=c.oid and a.attname=w.name and a.attnum>0 and not a.attisdropped),
f as (select w.identity,p.oid is not null as exists_now,pg_get_userbyid(p.proowner) as owner,l.lanname as language,p.prosecdef as security_definer,p.proisstrict as strict,p.proleakproof as leakproof,p.provolatile as volatility,p.proparallel as parallel,
  md5(pg_get_functiondef(p.oid)) as definition_md5,md5(coalesce(array_to_string(p.proacl::text[],','),'')) as acl_md5,
  md5(coalesce(p.proconfig::text,'')) as settings_md5,p.proacl::text as acl,
  (select jsonb_agg(x order by x) from unnest(p.proconfig) x where x like 'search_path=%') as search_path,
  (select jsonb_object_agg(r,has_function_privilege(r,p.oid,'EXECUTE')) from unnest(array['anon','authenticated','service_role']) r) as execute
  from wanted_functions w left join pg_proc p on p.oid=to_regprocedure(w.identity) left join pg_language l on l.oid=p.prolang),
i as (select w.identity,x.indexrelid is not null as exists_now,case when x.indexrelid is not null then x.indrelid::regclass::text end as relation,x.indisvalid as valid,x.indisready as ready,md5(pg_get_indexdef(x.indexrelid)) as definition_md5
  from wanted_indexes w left join pg_index x on x.indexrelid=to_regclass(w.identity)),
g as (select w.*,c.oid is not null as parent_exists,t.oid is not null as exists_now,t.tgenabled as enabled,case when t.oid is not null then t.tgfoid::regprocedure::text end as function,md5(pg_get_triggerdef(t.oid)) as definition_md5
  from wanted_triggers w left join pg_class c on c.oid=to_regclass(w.relation) left join pg_trigger t on t.tgrelid=c.oid and t.tgname=w.name and not t.tgisinternal)
select jsonb_build_object('schema_version',1,'project_ref','dkxmnvekiopyesuzggeu','checkpoint',jsonb_build_object('observed_at',statement_timestamp(),'server_version_num',current_setting('server_version_num'),'transaction_read_only',current_setting('transaction_read_only'),'statement_timeout',current_setting('statement_timeout'),'lock_timeout',current_setting('lock_timeout')),
 'tables',(select jsonb_agg(to_jsonb(t) order by identity) from t),
 'columns',(select jsonb_agg(to_jsonb(a) order by relation,name) from a),
 'functions',(select jsonb_agg(to_jsonb(f) order by identity) from f),
 'indexes',(select jsonb_agg(to_jsonb(i) order by identity) from i),
 'triggers',(select jsonb_agg(to_jsonb(g) order by relation,name) from g)) as catalog_export;
rollback;
`;
}
export function validateCatalog(report) {
  assert.equal(report.schema_version, 1);
  assert.equal(report.project_ref, "dkxmnvekiopyesuzggeu");
  assert.equal(report.checkpoint.transaction_read_only, "on");
  assert.equal(report.checkpoint.statement_timeout, "10s");
  assert.equal(report.checkpoint.lock_timeout, "2s");
  assert.match(report.checkpoint.server_version_num, /^1700\d\d$/);
  assert.ok(Number.isFinite(Date.parse(report.checkpoint.observed_at)));
  const groups = {
    tables: tables,
    columns: columns.map((x) => x.relation + "/" + x.name),
    functions,
    indexes,
    triggers: triggers.map((x) => x.join("/")),
  };
  for (const [key, expected] of Object.entries(groups)) {
    assert.ok(Array.isArray(report[key]));
    const ids = report[key].map((x) =>
      key === "columns" || key === "triggers" ? x.relation + "/" + x.name : x.identity,
    );
    assert.deepEqual([...ids].sort(), [...expected].sort(), "Incomplete/extra/duplicate " + key);
    for (const row of report[key]) {
      assert.equal(typeof row.exists_now, "boolean");
      if (key === "functions" && row.exists_now) {
        assert.match(row.definition_md5, /^[a-f0-9]{32}$/);
        assert.equal(typeof row.security_definer, "boolean");
        assert.ok(row.owner);
        for (const role of ["anon", "authenticated", "service_role"])
          assert.equal(typeof row.execute[role], "boolean");
      }
      if (key === "triggers") {
        assert.equal(typeof row.parent_exists, "boolean");
        if (row.exists_now) {
          assert.ok(row.parent_exists);
          assert.match(row.definition_md5, /^[a-f0-9]{32}$/);
          assert.ok(row.function);
          assert.match(row.enabled, /^[OADR]$/);
        }
      }
    }
  }
  return {
    scopeValid: true,
    hostedEquivalenceCertified: false,
    productionDeploymentAuthorized: false,
    objects: Object.fromEntries(
      Object.keys(groups).map((key) => [
        key,
        report[key].map((row) => ({
          ...row,
          classification: !row.exists_now
            ? "absent"
            : key === "columns"
              ? row.compatible
                ? "compatible"
                : "divergent"
              : "present-requires-definition-review",
        })),
      ]),
    ),
  };
}
export function compareCatalog(actual, expected) {
  validateCatalog(actual);
  validateCatalog(expected);
  for (const key of ["tables", "columns", "functions", "indexes", "triggers"])
    assert.deepEqual(actual[key], expected[key], "Observed baseline drift: " + key);
  return {
    scopedPropertiesMatched: true,
    rowsCompared: 75,
    hostedEquivalenceCertified: false,
    productionDeploymentAuthorized: false,
  };
}
export function verifyRecovered(before, after) {
  validateCatalog(before);
  validateCatalog(after);
  assert.ok(
    after.columns.every((x) => x.compatible),
    "Required column drift",
  );
  assert.ok(
    after.tables.every(
      (x) =>
        x.exists_now &&
        x.owner === "postgres" &&
        (!x.identity.startsWith("public.") || x.rls === true),
    ),
    "Missing/RLS/owner table postcondition",
  );
  for (const row of after.tables.filter((x) => x.identity.startsWith("private.")))
    for (const role of ["anon", "authenticated"])
      for (const action of ["select", "insert", "update", "delete", "truncate"])
        assert.equal(
          row.privileges[role][action],
          false,
          "Private recovery table exposed: " + row.identity,
        );
  assert.ok(
    after.functions.every((x) => x.exists_now),
    "Missing recovery function",
  );
  assert.ok(
    after.indexes.every((x) => x.exists_now && x.valid && x.ready),
    "Invalid S13 indexes",
  );
  // Canonical forward stage 20261021110000 retires the three separate runtime
  // guards in favor of ONE BEFORE INSERT/UPDATE/DELETE guard. The delivery-table
  // trigger name is not created by this candidate; projection belongs to Tasks.
  const retired = new Set([
    "v3_guard_archive_runtime_insert",
    "v3_guard_archive_runtime_update",
    "v3_guard_archive_runtime_delete",
  ]);
  for (const row of after.triggers) {
    const canonical =
      !retired.has(row.name) &&
      !(
        row.relation === "public.notification_deliveries" &&
        row.name === "v3_project_resolved_task_delivery_state"
      );
    assert.equal(
      row.exists_now,
      canonical,
      "Canonical trigger cutover: " + row.relation + "/" + row.name,
    );
    if (canonical) assert.equal(row.enabled, "O", "Disabled canonical trigger");
  }
  for (const row of before.tables.filter((x) => x.exists_now))
    assert.deepEqual(
      after.tables.find((x) => x.identity === row.identity),
      row,
      "Preexisting table security changed",
    );
  for (const row of before.triggers.filter((x) => x.exists_now))
    assert.deepEqual(
      after.triggers.find((x) => x.relation === row.relation && x.name === row.name),
      row,
      "Hosted guard changed",
    );
  for (const identity of ["private.studio2_request_is_service_role()"])
    assert.deepEqual(
      after.functions.find((x) => x.identity === identity),
      before.functions.find((x) => x.identity === identity),
      "Authority/legacy transition changed",
    );
  const legacyBefore = before.functions.find(
    (x) => x.identity === "public.studio2_transition_edition_v2(uuid,text,text,uuid)",
  );
  const legacyAfter = after.functions.find((x) => x.identity === legacyBefore.identity);
  for (const key of Object.keys(legacyBefore).filter(
    (x) => !["acl", "acl_md5", "execute"].includes(x),
  ))
    assert.deepEqual(
      legacyAfter[key],
      legacyBefore[key],
      "Legacy transition definition/security drift",
    );
  assert.deepEqual(
    legacyAfter.execute,
    { anon: false, authenticated: false, service_role: true },
    "V2 must be retired from browser authority after V3 cutover",
  );
  for (const identity of MISSING_S13_FUNCTIONS.filter(
    (x) => !x.startsWith("public.v3_schema_compatibility("),
  ))
    assert.deepEqual(
      after.functions.find((x) => x.identity === identity).execute,
      { anon: false, authenticated: false, service_role: true },
      "S13 mutation RPC grants",
    );
  return {
    scopedRecoveryPostconditionsPassed: true,
    existingSecurityPreserved: true,
    hostedEquivalenceCertified: false,
    productionDeploymentAuthorized: false,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === "--sql" && process.argv.length === 4)
      writeFileSync(process.argv[3], catalogSql(), { flag: "wx" });
    else if (process.argv[2] === "--validate" && process.argv.length === 4)
      console.log(
        JSON.stringify(validateCatalog(JSON.parse(readFileSync(process.argv[3], "utf8"))), null, 2),
      );
    else if (["--compare", "--recovered"].includes(process.argv[2]) && process.argv.length === 5) {
      const reports = process.argv.slice(3).map((p) => JSON.parse(readFileSync(p, "utf8")));
      console.log(
        JSON.stringify(
          (process.argv[2] === "--compare" ? compareCatalog : verifyRecovered)(...reports),
          null,
          2,
        ),
      );
    } else
      throw Error(
        "Usage: --sql output.sql OR --validate catalog.json OR --compare actual.json expected.json OR --recovered before.json after.json",
      );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
