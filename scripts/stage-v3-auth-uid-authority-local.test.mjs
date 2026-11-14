import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stageAuthUidAuthority, UID_OBSERVATION } from "./stage-v3-auth-uid-authority-local.mjs";
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
