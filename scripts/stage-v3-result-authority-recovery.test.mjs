import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
import {
  stageResultAuthority,
  FUNCTIONS,
  OBSERVATION,
} from "./stage-v3-result-authority-recovery.mjs";
test("restores one unchanged canonical rank/writer/reconciliation authority without history backfill", () => {
  const sql = stageResultAuthority();
  for (const [name, args, file] of FUNCTIONS) {
    assert.equal(extractDefinition(sql, name), extractDefinition(readFileSync(file, "utf8"), name));
    assert.ok(
      sql.includes(`revoke all on function ${name}(${args}) from public,anon,authenticated`),
    );
  }
  assert.match(sql, /Result authority drift or partial installation/);
  assert.match(sql, /ordered S13\/Archive\/Televote\/atomic\/snapshot/);
  assert.doesNotMatch(sql, /insert into supabase_migrations|alter table|create policy/);
  assert.match(sql, /begin;[\s\S]*commit;\s*$/);
});
test("fresh observed missing interfaces are explicit; older compatible writers are fingerprinted", () => {
  const d = JSON.parse(readFileSync(OBSERVATION, "utf8"));
  assert.equal(d.projectRef, "dkxmnvekiopyesuzggeu");
  assert.equal(d.read_only, "on");
  assert.equal(d.applicationRowsRead, false);
  assert.equal(d.rawFunctionBodiesExported, false);
  assert.equal(d.routines.filter((x) => !x.exists).length, 3);
  assert.equal(
    d.routines.find((x) => x.identity === "public.sync_show_results_from_votes(uuid)")
      .definition_sha256,
    "4deff875c74e40bb6ba7642cb449cdaa91c45ae157f55a430ae7f53f31e5c541",
  );
});
