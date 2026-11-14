import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
import {
  stageResultReadAuthority,
  SOURCE,
  OBSERVATION,
} from "./stage-v3-result-read-authority-recovery.mjs";
test("public RLS uses source-exact frozen evidence and cuts direct API writes without disabling canonical calculation", () => {
  const sql = stageResultReadAuthority();
  const source = readFileSync(SOURCE, "utf8");
  assert.equal(
    extractDefinition(sql, "private.v3_public_result_row_visible"),
    extractDefinition(source, "private.v3_public_result_row_visible"),
  );
  for (const name of ["anon", "authenticated"]) {
    const pattern = new RegExp(
      'alter policy "solaris consolidated ' + name + ' read"[\\s\\S]*?\\);',
    );
    assert.equal(pattern.exec(sql)?.[0], pattern.exec(source)?.[0]);
  }
  assert.match(
    sql,
    /revoke insert,update,delete,truncate,references,trigger,maintain on table public\.results/,
  );
  assert.doesNotMatch(sql, /revoke .*on table televoting\./);
  assert.match(sql, /Results API table grant\/RLS drift/);
  assert.match(sql, /Unqualified Results dependent view/);
  assert.match(sql, /begin;[\s\S]*commit;\s*$/);
});
test("observed production privileges include RLS-independent operations, not only the old CRUD fixture", () => {
  const d = JSON.parse(readFileSync(OBSERVATION, "utf8"));
  assert.equal(d.helper.exists, false);
  assert.match(d.table.acl, /anon=arwdDxt\/postgres/);
  assert.equal(d.table.policies.length, 5);
});
