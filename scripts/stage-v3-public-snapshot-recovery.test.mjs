import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  stagePublicSnapshot,
  OBSERVATION,
  CAPTURE_SOURCE,
  SNAPSHOT_SOURCE,
} from "./stage-v3-public-snapshot-recovery.mjs";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
test("candidate preserves canonical capture/read model and does not install partial ranking authority", () => {
  const sql = stagePublicSnapshot();
  for (const [file, name] of [
    [CAPTURE_SOURCE, "private.v3_capture_result_version"],
    [SNAPSHOT_SOURCE, "public.v3_public_published_result_snapshot"],
  ])
    assert.equal(extractDefinition(sql, name), extractDefinition(readFileSync(file, "utf8"), name));
  assert.doesNotMatch(
    sql,
    /create or replace function public\.(sync_show_results_from_votes|refresh_edition_qualifications)/,
  );
  assert.doesNotMatch(sql, /['"]v3.results.active-snapshot-and-qualification['"]/);
  assert.match(sql, /Snapshot recovery routine drift or partial installation/);
  assert.match(sql, /Snapshot recovery table security\/trigger drift/);
  assert.match(sql, /set local lock_timeout='5s'/);
  assert.match(sql, /begin;[\s\S]*commit;\s*$/);
});
test("new observation is catalog-only and preserves immutable/version and publication guards", () => {
  const data = JSON.parse(readFileSync(OBSERVATION, "utf8"));
  assert.equal(data.projectRef, "dkxmnvekiopyesuzggeu");
  assert.equal(data.read_only, "on");
  assert.equal(data.applicationRowsRead, false);
  assert.equal(data.rawFunctionBodiesExported, false);
  assert.equal(data.routines.filter((x) => x.exists).length, 3);
  assert.equal(
    data.routines.find((x) => !x.exists).identity,
    "public.v3_public_published_result_snapshot(uuid)",
  );
  for (const x of data.routines.filter((x) => x.exists)) {
    assert.equal(x.owner, "postgres");
    assert.equal(x.acl, "{postgres=X/postgres}");
    assert.match(x.definition_sha256, /^[a-f0-9]{64}$/);
  }
  assert.ok(data.tables.flatMap((x) => x.triggers).every((x) => x.enabled === "O"));
  assert.ok(
    data.tables
      .find((x) => x.identity === "private.v3_result_versions")
      .triggers.some((x) => x.name === "v3_reject_result_version_mutation"),
  );
  const sql = stagePublicSnapshot();
  assert.ok(
    sql.indexOf("private.v3_capture_result_version()\nreturns trigger") <
      sql.indexOf("create or replace function public.v3_public_published_result_snapshot"),
  );
});
