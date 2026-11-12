import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const read = (path) => readFileSync(path, "utf8");
const candidate = read("docs/v3/recovery-candidates/forward-only-s14-archive-integrated-local.sql");
const rehearsal = read("scripts/rehearse-v3-s14-archive-forward-effects-local.sh");
const s13 = read("docs/v3/recovery-candidates/forward-only-s13-foundation.sql");
const workflow = read(".github/workflows/v3-s14-archive-forward-effects-local.yml");
const ordered = [
  "20261019112100_v3_s14_archive_consequence_reconciliation.sql",
  "20261019112200_v3_s14_final_results_readiness_hardening.sql",
  "20261019112300_v3_s14_transition_http409.sql",
  "20261019112400_v3_s14_archive_task_registry_alignment.sql",
  "20261019112500_v3_s14_resolved_task_notification_invariant.sql",
  "20261019202636_v3_s14_resolved_task_delivery_reconciliation.sql",
  "20261020130000_v3_s14_archive_invariant_forward_fixes.sql",
  "20261020140000_v3_s14_archive_runtime_update_guard.sql",
  "20261021110000_v3_s14_archive_guard_authority_forward_fix.sql",
  "20261021161000_v3_s14_task_reconciliation_service_boundary.sql",
  "20261021163000_v3_s14_failed_task_delivery_evidence.sql",
  "20261021202000_v3_s14_archive_reconciliation_convergence.sql",
];
const registration = /insert into private\.v3_migration_contracts\s*\([\s\S]*?\)\s*values\s*\([\s\S]*?\)\s*on conflict\s*\(migration_key\)\s*do\s+(?:nothing|update\s*set[\s\S]*?)\s*;/gi;

test("twelve canonical Archive effect bodies are unchanged and ordered", () => {
  let previous = -1;
  for (const name of ordered) {
    let source = read("supabase/migrations/" + name);
    assert.match(source, /^begin;\s*/i);
    assert.match(source, /\bcommit;\s*$/i);
    source = source.replace(/^begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
    assert.equal([...source.matchAll(registration)].length, 1, name);
    source = source.replace(registration,
      "-- Historical contract registration omitted in forward-only recovery;\n-- see new v3.s14.archive-forward-effect-recovery registration.");
    const pos = candidate.indexOf(source);
    assert.ok(pos > previous, "missing or unordered canonical Archive source: " + name);
    previous = pos;
  }
});

test("candidate cannot overwrite partial Archive implementations", () => {
  assert.match(candidate, /^-- SOLARIS V3 S14 \/ ARCHIVE FORWARD-EFFECT CANDIDATE/);
  assert.match(candidate, /\bbegin;[\s\S]*\bcommit;\s*$/);
  assert.match(candidate, /set local lock_timeout = '5s'/);
  assert.match(candidate, /set local statement_timeout = '120s'/);
  assert.match(candidate, /S14 Archive recovery BLOCKED: S13 governance foundation absent/);
  assert.match(candidate, /S14 Archive recovery BLOCKED: function already exists/);
  assert.match(candidate, /S14 Archive recovery BLOCKED: partial private gate installation detected/);
  assert.match(candidate, /S14 Archive recovery BLOCKED: preexisting Archive trigger collision/);
  assert.match(candidate, /S14 Archive recovery BLOCKED: semantic history \/ recovery key already recorded/);
  assert.match(candidate, /v3\.s14\.archive-forward-effect-recovery/);
  assert.doesNotMatch(candidate, /supabase_migrations\.schema_migrations/);
  assert.doesNotMatch(candidate, /\b(?:truncate table|delete from public\.studio2_organizer_tasks)\b/i);
});

test("only one new semantic recovery declaration is inserted, never legacy history", () => {
  const declarations = [...candidate.matchAll(registration)];
  assert.equal(declarations.length, 1);
  assert.match(declarations[0][0], /v3\.s14\.archive-forward-effect-recovery/);
  for (const key of [
    "v3.s14.archive-consequence-reconciliation",
    "v3.s14.transition-http409",
    "v3.s14.archive-task-registry-alignment",
    "v3.s14.resolved-task-notification-invariant",
    "v3.s14.archive-invariant-forward-fixes",
    "v3.s14.archive-guard-authority-forward-fix",
    "v3.s14.failed-task-delivery-evidence",
    "v3.s14.final-results-readiness-hardening",
    "v3.s14.resolved-task-delivery-reconciliation",
    "v3.s14.archive-runtime-update-guard",
    "v3.s14.task-reconciliation-service-boundary",
    "v3.s14.archive-reconciliation-convergence",
  ]) assert.ok(candidate.includes("'" + key + "'"), "unprotected history identity: " + key);
});

test("local rehearsal refuses hosted configuration and checks canonical catalog parity", () => {
  assert.match(rehearsal, /SOLARIS_RUN_LOCAL_DB_REHEARSAL/);
  assert.match(rehearsal, /SOLARIS_VERIFICATION_TARGET/);
  assert.match(rehearsal, /Refusing hosted API URL/);
  assert.match(rehearsal, /Refusing noncanonical hosted DB URL/);
  assert.match(rehearsal, /postgres:postgres@127\.0\.0\.1/);
  assert.match(rehearsal, /pg_get_functiondef\(p\.oid\)/);
  assert.match(rehearsal, /pg_get_triggerdef\(t\.oid\)/);
  assert.match(rehearsal, /Archive recovery catalog parity failed/);
  assert.doesNotMatch(rehearsal, /supabase_migrations\.schema_migrations/);
  assert.doesNotMatch(rehearsal, /\bcascade\s*;/i);
});

test("requires runtime dependencies instead of merely allowing PL/pgSQL to compile", () => {
  assert.match(candidate, /S14 Archive recovery BLOCKED: required upstream RPC missing/);
  assert.match(candidate, /S14 Archive recovery BLOCKED: canonical current-workflow storage missing/);
  for (const identity of [
    "private.studio2_claim_operation(uuid,text,uuid,text,text,jsonb,jsonb)",
    "private.v3_emit_domain_event(text,text,text,bigint,uuid,uuid,uuid,jsonb,integer,text[])",
    "private.v3_publication_result_version_release_ready(uuid,bigint)",
    "private.studio2_task_recipient_eligible(uuid,uuid)",
    "public.studio2_complete_domain_event_delivery(uuid,text,text,jsonb)",
  ]) assert.ok(candidate.includes("'" + identity + "'"), "unchecked upstream RPC: " + identity);
  for (const name of [
    "private.v3_result_versions",
    "public.studio2_show_publication_controls",
    "televoting.vote_entries",
    "televoting.combined_televote_results",
    "public.studio2_organizer_tasks",
  ]) assert.ok(candidate.includes("'" + name + "'"), "unchecked relation: " + name);
  assert.doesNotMatch(candidate.slice(0, candidate.indexOf("-- These are the source-owned NEW Archive identities")),
    /'public\\.televotes'|'public\\.televoting_windows'/);
});

test("pins 31 bounded hosted critical column shapes and tests drift rejection", () => {
  const start = candidate.indexOf("-- Catalog-only evidence collected by bounded");
  const end = candidate.indexOf("-- Mandatory runtime dependencies", start);
  assert.ok(start >= 0 && end > start, "hosted catalog preflight section missing");
  const preflight = candidate.slice(start, end);
  const contracts = [...preflight.matchAll(/\('(?:public|private)\.[a-z0-9_]+', '[a-z0-9_]+', '(?:uuid|text|bigint|jsonb|boolean|timestamptz)', (?:true|false)\)/g)];
  assert.equal(contracts.length, 31, "unexpected hosted catalog column contract count");
  for (const contract of [
    "('public.studio2_edition_runtime', 'version', 'bigint', true)",
    "('public.studio2_edition_runtime', 'subsystems', 'jsonb', true)",
    "('public.studio2_edition_runtime', 'updated_at', 'timestamptz', true)",
    "('public.studio2_organizer_tasks', 'edition_id', 'uuid', false)",
    "('public.admin_notifications', 'source_key', 'text', false)",
    "('public.notification_deliveries', 'subject_id', 'text', true)",
    "('private.v3_result_versions', 'result_rows', 'jsonb', true)",
    "('private.v3_domain_events', 'aggregate_version', 'bigint', true)",
    "('private.v3_domain_event_outbox', 'event_id', 'uuid', true)",
  ]) assert.ok(preflight.includes(contract), "missing hosted catalog contract: " + contract);
  assert.match(preflight, /a\.atttypid is distinct from to_regtype\(e\.typ\)/);
  assert.match(preflight, /a\.attnotnull is distinct from e\.must_not_null/);
  assert.match(preflight, /S14 Archive recovery BLOCKED: hosted critical column drift/);
  assert.match(rehearsal, /alter table public\.studio2_edition_runtime alter column updated_at drop not null/);
  assert.match(rehearsal, /hosted critical column drift public\.studio2_edition_runtime\.updated_at/);
  assert.match(rehearsal, /alter table public\.studio2_edition_runtime alter column updated_at set not null/);
  assert.match(rehearsal, /Rejected critical-column drift left behind partial Archive DDL/);
});

test("integrated recovery uses the exact reviewed S13 donor and enforces S13 → S14", () => {
  // Original donor #2393 plus the preflight-only helper-contract correction
  // in #2467. Historical S13 effect bodies are independently checked by
  // v3-s13-forward-recovery-candidate.contract.test.ts. Keep a deliberate pin.
  const blob = createHash("sha1")
    .update("blob " + Buffer.byteLength(s13))
    .update(Buffer.from([0]))
    .update(s13).digest("hex");
  assert.equal(blob, "083aa84bd6455005e9728b81a7427e0cba7b221c");
  assert.match(s13, /S13 recovery blocked: private schema or service-role authority helper absent/);
  assert.match(s13, /S13 recovery blocked: target already exists/);
  assert.match(s13, /authority helper differs from reviewed catalog/);
  for (const digest of ["84d3f05e5f537908732a3875ba0178e6", "e286234abe6f6ed2ec1560aab124057e", "341a58cafc38a872c684592babc76f83"])
    assert.ok(s13.includes(digest));
  const prerequisite = read("docs/v3/recovery-candidates/evidence/s02-hosted-s13-prerequisite-local.sql");
  assert.match(prerequisite, /REVOKE ALL ON FUNCTION private\.studio2_request_is_service_role\(\)\s+FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(rehearsal, /SOLARIS_INCLUDE_S13_FORWARD_RECOVERY/);
  assert.match(rehearsal, /S14 candidate accepted missing S13 governance/);
  assert.match(rehearsal, /S14 Archive recovery BLOCKED: S13 governance foundation absent/);
  assert.match(rehearsal, /S13 forward-recovery catalog parity failed in integrated rehearsal/);
  assert.match(rehearsal, /S13 restored before S14/);
  const executableLines = rehearsal.split("\n").filter(line =>
    !/^\s*(?:#|--)/.test(line)).join("\n");
  assert.doesNotMatch(executableLines, /^\s*drop\s+(?:function|table|schema|trigger)[^\n]*\bcascade\b/im);
});


test("preflight rejects a missing hosted-observed upstream RPC before any Archive mutation", () => {
  const guard = candidate.indexOf("S14 Archive recovery BLOCKED: required upstream RPC missing");
  const firstArchiveDDL = candidate.indexOf("create or replace function private.v3_resolve_archived_edition_workflow_tasks(");
  assert.ok(guard > 0 && firstArchiveDDL > guard, "required RPC guard must precede new Archive DDL");
  assert.match(rehearsal, /alter function private\.studio2_task_recipient_eligible\(uuid,uuid\) rename to studio2_task_recipient_eligible_s06_missing/);
  assert.match(rehearsal, /required upstream RPC missing private\.studio2_task_recipient_eligible\(uuid,uuid\)/);
  assert.match(rehearsal, /Missing upstream dependency left partial Archive DDL/);
  assert.match(rehearsal, /rename to studio2_task_recipient_eligible"/);
});

test("injected post-DDL failure rolls back transaction and permits same-database restart", () => {
  assert.match(rehearsal, /gap_before="\$\(fingerprint\)"/);
  assert.match(rehearsal, /S06 injected post-DDL failure/);
  assert.match(rehearsal, /Interrupted Archive recovery left partial DDL or changed upstream catalog/);
  assert.match(rehearsal, /Interrupted Archive recovery left its first function or gate installed/);
  const failure = rehearsal.indexOf("S06 injected post-DDL failure");
  const normalApply = rehearsal.lastIndexOf('sql -f "$candidate" >/dev/null');
  assert.ok(failure >= 0 && normalApply > failure, "normal recovery must follow rollback injection");
  assert.doesNotMatch(rehearsal, /(?:^|\n)\s*supabase db push\b/im);
});


test("exact-head CI repeats clean local replay and reuses S02 networkless hosted-observed Archive fixture", () => {
  assert.match(workflow, /Second independent clean replay and interrupted-restart proof/);
  assert.match(workflow, /supabase db reset --local --no-seed/);
  assert.match(workflow, /hosted-observed-archive-scope:/);
  assert.match(workflow, /--network none/);
  assert.match(workflow, /--pull=never/);
  assert.match(workflow, /postgres:17\.11/);
  assert.match(workflow, /s02-hosted-s14-archive-54-table-schema-fixture\.sql/);
  assert.match(workflow, /s02-hosted-s14-archive-extra-2-dependencies-local\.sql/);
  assert.match(workflow, /verify-v3-s02-s14-archive-catalog\.mjs/);
  assert.match(workflow, /verify-v3-s02-parent-catalog\.mjs/);
  assert.match(workflow, /verify-v3-s02-56-acl\.mjs/);
  assert.match(workflow, /forward-only-s13-foundation\.sql/);
  assert.match(workflow, /forward-only-s14-archive-integrated-local\.sql/);
  assert.match(workflow, /LIMITATION: 215\/215 table names/);
  assert.doesNotMatch(workflow, /supabase db (push|dump --db-url)/);
});

test("networkless hosted-observed fixture rolls back after real Archive DDL and resumes on the same database", () => {
  const afterS13 = workflow.indexOf("sql -f - < docs/v3/recovery-candidates/forward-only-s13-foundation.sql", workflow.indexOf("hosted-observed-archive-scope:"));
  const digest = workflow.indexOf('schema_before="$(archive_schema_digest)"', afterS13);
  const injection = workflow.indexOf("S06 hosted-fixture injected post-DDL failure", digest);
  const rollback = workflow.indexOf("Post-DDL interruption changed hosted-observed fixture schema/ACL", injection);
  const restart = workflow.indexOf("PASS: hosted-observed fixture post-DDL rollback and same-DB S14 restart", rollback);
  const duplicate = workflow.indexOf("Archive forward candidate allowed duplicate application", restart);
  assert.ok(afterS13 > 0 && digest > afterS13 && injection > digest && rollback > injection &&
    restart > rollback && duplicate > restart, "S06 hosted-fixture interruption, rollback, restart, duplicate stages are out of order");
  assert.match(workflow, /pg_dump -U postgres -d postgres --schema-only --no-comments --restrict-key=S06LocalOnlyStable/);
  assert.match(workflow, /source\.index\(trigger\) < source\.index\(next_function\)/);
  assert.match(workflow, /create trigger v3_guard_archive_runtime_transition/);
  assert.match(workflow, /create or replace function private\.v3_edition_final_results_ready/);
  assert.match(workflow, /python3 - <<'PY'/);
  assert.match(workflow, /S06 hosted-fixture injected post-DDL failure/);
  assert.match(workflow, /Post-DDL interruption changed semantic registry records/);
  assert.match(workflow, /Post-DDL interruption left a partial Archive function\/gate/);
  assert.match(workflow, /same-DB S14 restart/);
  assert.match(workflow, /--network none/);
  assert.match(workflow, /'\$schema_before'|\$schema_before/);
  assert.doesNotMatch(workflow, /supabase db push/);
  assert.ok(candidate.indexOf("create trigger v3_guard_archive_runtime_transition") <
    candidate.indexOf("create or replace function private.v3_edition_final_results_ready("));
});


test("resolved-Task notification recovery includes original generic synchronizer and immediate trigger", () => {
  const sourceName = "20261019112500_v3_s14_resolved_task_notification_invariant.sql";
  const before = candidate.indexOf(sourceName);
  const firstSync = candidate.indexOf("create or replace function private.studio2_sync_task_notifications(", before);
  const projection = candidate.indexOf("create or replace function private.v3_project_resolved_task_delivery_state()", firstSync);
  const trigger = candidate.indexOf("create trigger v3_project_resolved_task_delivery_state", projection);
  const nextStage = candidate.indexOf("20261019202636_v3_s14_resolved_task_delivery_reconciliation.sql", trigger);
  assert.ok(before > 0 && firstSync > before && projection > firstSync && trigger > projection && nextStage > trigger,
    "missing or misordered Task-resolution projection effect");
  assert.match(candidate.slice(firstSync, nextStage), /requires_action = task.state <> 'resolved'/);
  assert.match(candidate.slice(projection, nextStage), /delivery.status in \('pending', 'processing'\)/);
  assert.doesNotMatch(candidate.slice(projection, nextStage), /delivery.status in \('pending', 'processing', 'failed'\)/);
  const preflight = candidate.slice(0, candidate.indexOf("end\n$s14_forward_archive_preflight$;"));
  assert.match(preflight, /'private\.v3_project_resolved_task_delivery_state\(\)'/);
  assert.match(preflight, /'v3_project_resolved_task_delivery_state'/);
  assert.match(preflight, /'v3\.s14\.resolved-task-notification-invariant'/);
  assert.match(rehearsal, /v3_project_resolved_task_delivery_state/);
  assert.match(workflow, /20261019112500_v3_s14_resolved_task_notification_invariant\.sql/);
});


test("S06 integrates 215 distinct hosted-observed table identities in one networkless S13-S14 replay", () => {
  assert.match(workflow, /s06-hosted-seven-no-fk-relations-local\.sql/);
  assert.match(workflow, /s06-five-version-ledgers-local\.sql/);
  assert.match(workflow, /s06-hosted-eight-fk-closed-relations-local\.sql/);
  assert.match(workflow, /verify-v3-s06-seven-relation-parity\.mjs/);
  assert.match(workflow, /verify-v3-s06-five-ledger-parity\.mjs/);
  assert.match(workflow, /verify-v3-s06-eight-relation-parity\.mjs/);
  assert.match(workflow, /verify-v3-s06-eight-relation-parity\.test\.mjs/);
  assert.match(workflow, /verify-v3-s06-seven-secure-relation-parity\.test\.mjs/);
  assert.match(workflow, /s06-hosted-seven-jury-integrity-account-local\.sql/);
  assert.match(workflow, /s06-hosted-seventeen-next-relations-local\.sql/);
  assert.match(workflow, /verify-v3-s06-seventeen-relation-parity\.mjs/);
  assert.match(workflow, /verify-v3-s06-seventeen-relation-parity\.test\.mjs/);
  assert.match(workflow, /seventeenActual\.length !== 17/);
  assert.match(workflow, /fortyFour\.length !== 44/);
  assert.match(workflow, /combined44\.size !== 44/);
  assert.match(workflow, /s06-hosted-fifty-next-relations-local\.sql/);
  assert.match(workflow, /verify-v3-s06-fifty-relation-parity\.mjs/);
  assert.match(workflow, /verify-v3-s06-fifty-relation-parity\.test\.mjs/);
  assert.match(workflow, /fiftyActual\.length !== 50/);
  assert.match(workflow, /ninetyFourActual\.length !== 94/);
  assert.match(workflow, /ninetyFour\.size !== 94/);
  assert.match(workflow, /s06-fifty-150-proof\.json/);
  assert.match(workflow, /s06-hosted-second-fifty-relations-local\.sql/);
  assert.match(workflow, /verify-v3-s06-second-fifty-relation-parity\.mjs/);
  assert.match(workflow, /verify-v3-s06-second-fifty-relation-parity\.test\.mjs/);
  assert.match(workflow, /secondFiftyActual\.length !== 50/);
  assert.match(workflow, /oneFortyFourActual\.length !== 144/);
  assert.match(workflow, /oneFortyFour\.size !== 144/);
  assert.match(workflow, /s06-second-fifty-200-proof\.json/);
  assert.match(workflow, /s06-hosted-final-fifteen-relations-local\.sql/);
  assert.match(workflow, /verify-v3-s06-final-fifteen-relation-parity\.mjs/);
  assert.match(workflow, /verify-v3-s06-final-fifteen-relation-parity\.test\.mjs/);
  assert.match(workflow, /finalFifteenActual\.length !== 15/);
  assert.match(workflow, /oneFiftyNineActual\.length !== 159/);
  assert.match(workflow, /oneFiftyNine\.size !== 159/);
  assert.match(workflow, /s06-final-fifteen-215-proof\.json/);
  assert.match(workflow, /verify-v3-s06-seven-secure-relation-parity\.mjs/);
  const a = workflow.indexOf("s02-hosted-s14-archive-54-table-schema-fixture.sql", workflow.indexOf("hosted-observed-archive-scope:"));
  const b = workflow.indexOf("s02-hosted-s14-archive-extra-2-dependencies-local.sql", a);
  const c = workflow.indexOf("sql -f - < docs/v3/recovery-candidates/evidence/s06-hosted-seven-no-fk-relations-local.sql", b);
  const d = workflow.indexOf("sql -f - < docs/v3/recovery-candidates/evidence/s06-five-version-ledgers-local.sql", c);
  const e = workflow.indexOf("sql -f - < docs/v3/recovery-candidates/evidence/s06-hosted-eight-fk-closed-relations-local.sql", d);
  const f = workflow.indexOf("node scripts/verify-v3-s06-seven-relation-parity.mjs", e);
  const g = workflow.indexOf("node scripts/verify-v3-s06-five-ledger-parity.mjs", f);
  const h = workflow.indexOf("node scripts/verify-v3-s06-eight-relation-parity.mjs", g);
  const i = workflow.indexOf("S14 Archive recovery BLOCKED: S13 governance foundation absent", h);
  assert.ok(a >= 0 && b > a && c > b && d > c && e > d && f > e && g > f && h > g && i > h,
    "56+7+5+8 tables and all three exact catalog digest checks must precede isolated S13->S14 recovery");
  assert.match(workflow, /POSTGRES_INITDB_ARGS="--locale-provider=icu --icu-locale=en-US"/);
  assert.match(workflow, /datlocprovider='i' and datlocale='en-US'/);
  assert.match(workflow, /PostgreSQL init process complete; ready for start up/);
  assert.match(workflow, /docker exec "\$cid" pg_isready/);
  assert.match(workflow, /d\.relations\.length !== 215/);
  assert.match(workflow, /secureActual\.length !== 7/);
  assert.match(workflow, /twentySeven\.length !== 27/);
  assert.match(workflow, /actual\.tables\.length !== 215/);
  assert.match(workflow, /found\.size !== 215/);
  assert.match(workflow, /added\.size !== 44/);
  assert.match(workflow, /twentySeven\.length !== 27/);
  assert.match(workflow, /S06 fail closed: 56 frozen S02 \+ 44 prior \+ 50 first \+ 50 second not exact/);
  assert.match(workflow, /verify-v3-s02-56-acl\.mjs \/tmp\/s06-acl-56-scoped\.json/);
  assert.match(workflow, /result\.observed\.relations !== 215/);
  assert.match(workflow, /result\.status !== 'S06_CATALOG_COVERAGE_BLOCKED'/);
  assert.match(workflow, /--network none/);
  assert.match(workflow, /docker inspect --format '\{\{json \.HostConfig\.PortBindings\}\}'/);
  assert.match(workflow, /full hosted equivalence REJECTED/);
  assert.match(workflow, /159 complete table fingerprints unchanged after S13->S14/);
  assert.match(workflow, /assert\.deepEqual\(actual, pre\.relations/);
  assert.match(workflow, /s06-eight-76-proof\.json/);
  assert.match(workflow, /s06-secure-83-proof\.json/);
  assert.match(workflow, /LIMITATION: 215\/215 table names/);
  assert.doesNotMatch(workflow, /supabase db push/);
});


test("S06 operator-only runbook reflects the merged twelve-stage source contract without claiming hosted equivalence", () => {
  const runbook = read("docs/v3/recovery-candidates/s06-schema-export-operator-runbook.md");
  assert.match(runbook, /all 12 canonical historical Archive\/Task\/notification effects in source order/i);
  assert.match(runbook, /`20261019112500`/);
  assert.match(runbook, /node --test scripts\/v3-s14-archive-forward-effects\.contract\.test\.mjs/);
  assert.match(runbook, /215\/215 distinct physical table identities/);
  assert.match(runbook, /199\/727/);
  assert.match(runbook, /not.*a substitute for the actual hosted-head-equivalent isolated baseline/i);
  assert.match(runbook, /separate approval for the read-only schema export/);
  assert.match(runbook, /networkless, unexposed PostgreSQL 17\.11/);
  assert.match(runbook, /keep the S06 checkbox \*\*unchecked\*\*/);
  assert.doesNotMatch(runbook, /check whether source migration 20261019112500/i);
  assert.doesNotMatch(runbook, /candidate stages eleven effects/i);
  assert.doesNotMatch(runbook, /covers only 56\/215 relation identities/i);
});


test("S06 dedicated local-only evidence executes on integrated main with the same scoped source paths", () => {
  const s14 = read(".github/workflows/v3-s14-archive-forward-effects-local.yml");
  const toc = read(".github/workflows/v3-s06-schema-export-offline.yml");
  for (const [yaml, anchor] of [[s14, "s06_archive_paths"], [toc, "s06_toc_paths"]]) {
    assert.ok(yaml.includes(["  pull_request:", "    branches: [main]", "    paths: &" + anchor].join(String.fromCharCode(10))),
      "S06 PR scope must be the shared authoritative path filter");
    assert.ok(yaml.includes(["  push:", "    branches: [main]", "    paths: *" + anchor].join(String.fromCharCode(10))),
      "S06 merged-main proof must use the identical path filter");
    assert.match(yaml, /github\.event\.pull_request\.head\.sha \|\| github\.sha/);
    assert.match(yaml, /git rev-parse HEAD/);
    assert.match(yaml, /workflow_dispatch:/);
  }
  assert.match(s14, /docs\/v3\/recovery-candidates\/s06-schema-export-operator-runbook\.md/);
  assert.match(s14, /--network none/);
  assert.match(s14, /SOLARIS_VERIFICATION_TARGET: local/);
  assert.match(toc, /Refusing database environment/);
  assert.match(toc, /No pg_dump, network connection to Supabase, production SQL or migration execution/);
});


test("S06 uses the shared isolation gate with all local project markers and no inherited libpq options", () => {
  for (const marker of ["SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_REF", "E2E_SUPABASE_PROJECT_ID", "E2E_SUPABASE_PROJECT_REF", "VITE_SUPABASE_PROJECT_ID", "VITE_SUPABASE_PROJECT_REF"]) {
    assert.ok(rehearsal.includes(marker + "=local"), marker);
  }
  assert.ok(rehearsal.includes("bun run scripts/check-v3-production-isolation.ts"));
  assert.ok(rehearsal.includes('for name in ${!PG@}; do unset "$name"; done'));
});

test("S06 rejects libpq query routing before executing any SQL", () => {
  const dir = mkdtempSync(join(tmpdir(), "s06-routing-"));
  try {
    const marker = join(dir, "psql-was-called");
    writeFileSync(join(dir, "supabase"), '#!/bin/sh\nprintf \'API_URL=http://127.0.0.1:54321\\nDB_URL=%s\\n\' "$S06_TEST_DB_URL"\n', { mode: 0o700 });
    writeFileSync(join(dir, "psql"), '#!/bin/sh\ntouch "$S06_SQL_MARKER"\nexit 99\n', { mode: 0o700 });
    for (const suffix of ["?host=hosted.invalid", "?hostaddr=203.0.113.1", "?service=production", "?options=unsafe", "#fragment"]) {
      const env = { PATH: dir + ":" + process.env.PATH, HOME: dir,
        SOLARIS_RUN_LOCAL_DB_REHEARSAL: "YES", SOLARIS_VERIFICATION_TARGET: "local",
        S06_TEST_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" + suffix,
        S06_SQL_MARKER: marker };
      const result = spawnSync("bash", ["scripts/rehearse-v3-s14-archive-forward-effects-local.sh"], { env, encoding: "utf8" });
      assert.notEqual(result.status, 0, suffix);
      assert.match(result.stderr, /Refusing database connection options/, suffix);
      assert.equal(existsSync(marker), false, "SQL executed despite unsafe routing: " + suffix);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test("S06 execution evidence fails closed on missing stages and cannot certify hosting", () => {
  const code = workflow.split('# S06 structured evidence:')[1].split("<<'NODE'\n")[1].split('\n          NODE')[0];
  const dir = mkdtempSync(join(tmpdir(), 's06-evidence-'));
  try {
    const sha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    const names = ['source_contract','clean_replay','ordered_recovery','archive_behavior','authorization','terminal_boundaries','task_convergence','second_replay'];
    const good = Object.fromEntries(names.map(name => [name, { outcome: 'success' }]));
    for (const [index, steps] of [{}, good, { ...good, authorization: { outcome: 'failure' } }].entries()) {
      const path = join(dir, index + '.json');
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: {
        PATH: process.env.PATH, REVIEWED_SHA: sha, S06_STEP_OUTCOMES: JSON.stringify(steps), S06_REPORT_PATH: path,
      } });
      assert.equal(result.status, index === 1 ? 0 : 1, result.stderr);
      const report = JSON.parse(readFileSync(path, 'utf8'));
      assert.equal(report.candidateSha, sha);
      assert.equal(report.hostedEquivalent, false);
      assert.equal(report.productionRecoveryEligible, false);
      assert.equal(report.ownerOnlyBetaApproved, false);
      assert.equal(Object.keys(report.sourceHashes).length, 2);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
