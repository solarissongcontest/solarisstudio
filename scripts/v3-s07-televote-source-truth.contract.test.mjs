import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { stageSourceTruth, transactionBody, SOURCES } from "./stage-v3-s07-televote-source-truth.mjs";

function definitions(sql) {
  const result = new Map();
  for (const m of sql.matchAll(/create or replace function ([a-z0-9_.]+)\([\s\S]*?\bas (\$[a-zA-Z_]*\$)[\s\S]*?\2;/gi)) {
    result.set(m[1], m[0]);
  }
  return result;
}
test("recovery preserves current canonical adapters, materializer and replay behavior", () => {
  const truth = definitions(readFileSync(SOURCES[0], "utf8"));
  const replay = definitions(readFileSync(SOURCES[1], "utf8"));
  const staged = definitions(stageSourceTruth());
  for (const name of [
    "private.v3_sync_published_televote_round",
    "private.v3_sync_published_televote_aggregation",
    "private.v3_sync_published_televote_round_trigger",
    "private.v3_sync_published_televote_aggregation_trigger",
    "public.studio2_televote_projection_status",
  ]) {
    assert.ok(truth.get(name), name);
    assert.equal(staged.get(name), truth.get(name), name);
  }
  for (const [name, body] of replay) assert.equal(staged.get(name), body, name);
});
test("only the guard changes, preserving OLD and NEW source scope without trusting markers", () => {
  const staged = definitions(stageSourceTruth());
  const body = staged.get("private.v3_guard_source_managed_televote_projection");
  assert.match(body, /current_setting\('role', true\)/);
  assert.match(body, /source.show_id = v_previous_show_id/);
  assert.doesNotMatch(body, /request.jwt.claim.role|session_user|solaris.v3_televote_projection_write/);
});
test("recovery composes one transaction and refuses malformed canonical transactions", () => {
  const sql = stageSourceTruth();
  assert.equal(sql.match(/^begin;/gm)?.length, 1);
  assert.equal(sql.match(/^commit;/gm)?.length, 1);
  assert.match(sql, /S07 missing dependency:/);
  assert.match(sql, /S07 source truth already or partially installed/);
  assert.throws(() => transactionBody("select 1;"), /outer transaction/);
  assert.throws(() => transactionBody("begin;\nselect 1;"), /outer transaction/);
});
test("the arbitrary-payload writer is not granted to service or browser roles", () => {
  const sql = stageSourceTruth();
  assert.match(sql, /revoke all on function private.v3_apply_published_televote_projection[\s\S]*from public, anon, authenticated, service_role;/);
  assert.doesNotMatch(sql, /grant execute on function private.v3_apply_published_televote_projection/);
});
test("hosted and inherited connection targets refuse before Docker is invoked", () => {
  const scratch = mkdtempSync(join(tmpdir(), "s07-refusal-"));
  try {
    const marker = join(scratch, "docker-was-invoked");
    writeFileSync(join(scratch, "docker"), "#!/bin/sh\n: > \"$S07_DOCKER_MARKER\"\nexit 99\n", { mode: 0o755 });
    for (const [key, value] of [
      ["DATABASE_URL", "postgresql://hosted.invalid/db"],
      ["SUPABASE_URL", "https://hosted.invalid"],
      ["PGHOSTADDR", "192.0.2.1"],
      ["PGOPTIONS", "-c role=postgres"],
      ["DOCKER_HOST", "tcp://remote.invalid:2375"],
    ]) {
      const result = spawnSync("bash", [resolve("scripts/rehearse-v3-s14-televote-source-truth-local.sh")], {
        env: { ...process.env, PATH: scratch + ":" + process.env.PATH,
          SOLARIS_RUN_LOCAL_DB_REHEARSAL: "YES", SOLARIS_VERIFICATION_TARGET: "local",
          S07_DOCKER_MARKER: marker, [key]: value },
        encoding: "utf8",
      });
      assert.notEqual(result.status, 0, key);
      assert.match(result.stderr, /Refusing inherited connection config/, key);
      assert.throws(() => readFileSync(marker), { code: "ENOENT" });
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
test("rehearsal owns an unnamed networkless container and never deletes a caller's container", () => {
  const shell = readFileSync("scripts/rehearse-v3-s14-televote-source-truth-local.sh", "utf8");
  assert.match(shell, /cid="\$\(docker run/);
  assert.match(shell, /--network none/);
  assert.doesNotMatch(shell, /--name|V3_S14_PG_CONTAINER/);
  assert.match(shell, /docker rm -f "\$cid"/);
});
