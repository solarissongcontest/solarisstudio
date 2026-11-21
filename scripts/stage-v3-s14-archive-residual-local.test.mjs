import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import {
  buildResidualArchive, gitBlobSha, INTEGRATED, FINAL, TASK, EXPECTED_BLOBS, OMIT, RECOVERY_KEY
} from "./stage-v3-s14-archive-residual-local.mjs";

test("reviewed historical sources match exact immutable Git blobs", () => {
  const files = [[INTEGRATED, EXPECTED_BLOBS.integrated], [FINAL, EXPECTED_BLOBS.final], [TASK, EXPECTED_BLOBS.task]];
  for (const [name, expected] of files) {
    assert.equal(gitBlobSha(readFileSync(resolve(name), "utf8")), expected, name);
  }
});

test("generate exactly ten residual Archive source stages, without downgrading preinstalled final helper", () => {
  const sql = buildResidualArchive();
  const expected = [
    "20261019112100_v3_s14_archive_consequence_reconciliation.sql",
    "20261019112300_v3_s14_transition_http409.sql",
    "20261019112400_v3_s14_archive_task_registry_alignment.sql",
    "20261019112500_v3_s14_resolved_task_notification_invariant.sql",
    "20261019202636_v3_s14_resolved_task_delivery_reconciliation.sql",
    "20261020130000_v3_s14_archive_invariant_forward_fixes.sql",
    "20261020140000_v3_s14_archive_runtime_update_guard.sql",
    "20261021110000_v3_s14_archive_guard_authority_forward_fix.sql",
    "20261021163000_v3_s14_failed_task_delivery_evidence.sql",
    "20261021202000_v3_s14_archive_reconciliation_convergence.sql",
  ];
  const actual = [...sql.matchAll(/^-- Canonical source effects: ([^\n]+) \(history INSERT omitted\)$/gm)].map(m => m[1]);
  assert.deepEqual(actual, expected);
  for (const file of OMIT) assert.ok(!actual.includes(file));
  assert.ok(sql.startsWith("-- SOLARIS V3 S14 / ARCHIVE FORWARD-EFFECT CANDIDATE."));
  assert.ok(sql.trimEnd().endsWith("commit;"));
  assert.match(sql, /set local lock_timeout = '5s'/);
  assert.match(sql, /set local statement_timeout = '120s'/);
  assert.ok(sql.includes(RECOVERY_KEY));
  assert.ok(!sql.includes("supabase_migrations.schema_migrations"));
  assert.ok(!sql.includes("create or replace function private.v3_edition_final_results_ready("));
  assert.equal((sql.match(/create or replace function private.studio2_reconcile_all_organizer_tasks\(/g) || []).length, 3);
  assert.match(sql, /S14 residual BLOCKED: final-results readiness effect mismatch/);
  assert.match(sql, /S14 residual BLOCKED: existing task service boundary mismatch/);
  assert.match(sql, /v3\.s14\.final-results-readiness-hardening/);
  assert.match(sql, /v3\.s14\.task-reconciliation-service-boundary/);
  assert.match(sql, /v3_archive_runtime_transition_gates/);
  assert.match(sql, /v3_archive_task_reconciliation_gates/);
  assert.match(sql, /v3_guard_archived_televote_write/);
  assert.match(sql, /v3\.s14\.archive-forward-effect-recovery-residual/);
});

test("generation is deterministic and fails closed on changed source bytes", () => {
  const first = buildResidualArchive();
  assert.equal(buildResidualArchive(), first);
  const dir = mkdtempSync(join(tmpdir(), "solaris-s14-residual-source-only-"));
  try {
    for (const file of [INTEGRATED, FINAL, TASK]) {
      const dst = join(dir, file);
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, readFileSync(resolve(file), "utf8"));
    }
    assert.equal(buildResidualArchive(dir), first);
    const target = join(dir, FINAL);
    writeFileSync(target, readFileSync(target, "utf8") + "\n-- S14 drift\n");
    assert.throws(() => buildResidualArchive(dir), /Unreviewed historical recovery source/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
