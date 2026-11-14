import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  stageAuthUidAuthority,
  UID_OBSERVATION,
  stageRoundInvalidationAuthority,
  ROUND_FLAG_OBSERVATION,
} from "./stage-v3-auth-uid-authority-local.mjs";
test("restore only observed auth.uid ownership and ACL without replacing auth behavior", () => {
  const sql = stageAuthUidAuthority();
  const row = JSON.parse(readFileSync(UID_OBSERVATION, "utf8"));
  assert.ok(sql.includes(row.acl));
  assert.ok(sql.includes(row.definition_sha256));
  assert.match(sql, /p\.proacl is null/);
  assert.match(sql, /pg_get_userbyid\(p.proowner\)='postgres'/);
  assert.ok(sql.indexOf("NEVER hosted") < sql.indexOf("create role dashboard_user"));
  assert.doesNotMatch(
    sql,
    /create or replace function|security definer|alter role|bypassrls|create policy|application data/i,
  );
  assert.match(sql, /p\.proconfig is null/);
});

test("atomic fixture grant reconstruction is bound to exactly the three observed full ACL digests", () => {
  const source = readFileSync(".github/tests/v3-atomic-observed-grants-local.sql", "utf8");
  const frozen = JSON.parse(
    readFileSync(
      "docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json",
      "utf8",
    ),
  );
  for (const name of ["rounds", "round_entries", "round_results"]) {
    const row = frozen.relations.find(
      (x) => x.schema_name === "televoting" && x.object_name === name,
    );
    assert.equal(row.acl_md5, "f150210c09473a4f8750ac0387061f65");
    assert.ok(source.includes(row.acl_md5));
  }
  assert.ok(source.indexOf("NEVER hosted") < source.indexOf("grant truncate,references,trigger"));
  assert.doesNotMatch(source, /to authenticated|to anon|disable row level|bypassrls|alter role/i);
});

test("round invalidation retains body and matches observed trigger-only execution ACL", () => {
  const sql = stageRoundInvalidationAuthority();
  const row = JSON.parse(readFileSync(ROUND_FLAG_OBSERVATION, "utf8"));
  assert.ok(sql.includes(row.acl));
  assert.ok(sql.includes(row.definition_sha256));
  assert.match(sql, /p\.proacl is null/);
  assert.doesNotMatch(sql, /create or replace function|alter role|bypassrls/i);
  assert.ok(sql.indexOf("NEVER hosted") < sql.indexOf("revoke all on function"));
});
