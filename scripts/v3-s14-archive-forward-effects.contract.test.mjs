import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  "20261019202636_v3_s14_resolved_task_delivery_reconciliation.sql",
  "20261020130000_v3_s14_archive_invariant_forward_fixes.sql",
  "20261020140000_v3_s14_archive_runtime_update_guard.sql",
  "20261021110000_v3_s14_archive_guard_authority_forward_fix.sql",
  "20261021161000_v3_s14_task_reconciliation_service_boundary.sql",
  "20261021163000_v3_s14_failed_task_delivery_evidence.sql",
  "20261021202000_v3_s14_archive_reconciliation_convergence.sql",
];
const registration = /insert into private\.v3_migration_contracts\s*\([\s\S]*?\)\s*values\s*\([\s\S]*?\)\s*on conflict\s*\(migration_key\)\s*do\s+(?:nothing|update\s*set[\s\S]*?)\s*;/gi;

test("eleven canonical Archive effect bodies are unchanged and ordered", () => {
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
  // This git-object SHA is the exact S13 candidate source from draft #2393.
  // An upstream donor edit requires explicit review and a deliberate repin.
  const blob = createHash("sha1")
    .update("blob " + Buffer.byteLength(s13))
    .update(Buffer.from([0]))
    .update(s13).digest("hex");
  assert.equal(blob, "f49b8212e2983dd0cde46d80dd6b5661e49df6a5");
  assert.match(s13, /S13 recovery blocked: private schema or service-role authority helper absent/);
  assert.match(s13, /S13 recovery blocked: target already exists/);
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
  assert.match(workflow, /LIMITATION: 56\/215 tables/);
  assert.doesNotMatch(workflow, /supabase db (push|dump --db-url)/);
});
