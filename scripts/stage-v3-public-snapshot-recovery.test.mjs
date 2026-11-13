import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import {
  stagePublicSnapshot,
  OBSERVATION,
  CAPTURE_SOURCE,
  SNAPSHOT_SOURCE,
  QUALIFIER_SOURCE,
  QUALIFIER_EVIDENCE,
  CURRENT_QUALIFIER_EVIDENCE,
  CURRENT_TRIGGER_EVIDENCE,
  PARTICIPATION_KEY_SOURCE,
  RELEASE_READINESS_SOURCE,
  MATERIALIZE_SOURCE,
  stagedQualificationHelpers,
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
  assert.match(sql, /Snapshot recovery requires the exact S14 forward archive guard/);
  assert.match(sql, /guard\.tgtype=31/);
  assert.match(
    sql,
    /guard\.tgfoid=to_regprocedure\('private\.v3_guard_archived_edition_workflow_write\(\)'\)/,
  );
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

test("local-only qualification fixture restores the two observed full source functions without broadening access", () => {
  const sql = stagedQualificationHelpers();
  for (const [name, signature, path] of [
    ["private.studio2_participation_subject_key", "(uuid,uuid)", PARTICIPATION_KEY_SOURCE],
    ["private.studio2_result_release_ready", "(uuid)", RELEASE_READINESS_SOURCE],
    ["public.materialize_show_results_if_missing", "(uuid)", MATERIALIZE_SOURCE],
    ["public.refresh_edition_qualifications", "(uuid)", QUALIFIER_SOURCE],
    ["public.refresh_show_qualifiers", "(uuid)", QUALIFIER_SOURCE],
  ]) {
    assert.equal(extractDefinition(sql, name), extractDefinition(readFileSync(path, "utf8"), name));
    assert.ok(
      sql.includes(
        "Hosted qualification helper fingerprint or authorization drift: " + name + signature,
      ),
    );
  }
  assert.match(sql, /not has_function_privilege\('anon'/);
  assert.match(sql, /not has_function_privilege\('authenticated'/);
  assert.match(sql, /has_function_privilege\('service_role'/);

  assert.match(sql, /begin;[\s\S]*commit;\s*$/);
  assert.doesNotMatch(
    stagePublicSnapshot(),
    /create or replace function public\.refresh_edition_qualifications/,
  );
});

test("local snapshot CI reconstructs the two stronger hosted-observed table ACLs without changing recovery DDL", () => {
  const workflow = readFileSync(
    ".github/workflows/v3-s14-archive-forward-effects-local.yml",
    "utf8",
  );
  assert.match(
    workflow,
    /GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public\.studio2_result_operations TO service_role/,
  );
  assert.match(
    workflow,
    /GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public\.studio2_show_publication_controls TO service_role/,
  );
  assert.ok(
    workflow.indexOf("Hosted-observed snapshot table ACL reconstruction drift") <
      workflow.indexOf("snapshot_before=true -f - < .github/tests/v3-public-snapshot-recovery.sql"),
  );
  assert.doesNotMatch(stagePublicSnapshot(), /GRANT TRUNCATE|GRANT MAINTAIN/i);
});

test("current helper observations bind owner ACL and search path as well as frozen definitions", () => {
  const sql = stagedQualificationHelpers();
  for (const file of [CURRENT_QUALIFIER_EVIDENCE, CURRENT_TRIGGER_EVIDENCE]) {
    const observed = JSON.parse(readFileSync(file, "utf8"));
    for (const row of observed.routines) {
      assert.ok(sql.includes("p.proacl::text='" + row.acl + "'"));
      assert.ok(sql.includes("md5(pg_get_functiondef(p.oid))='" + row.definition_md5 + "'"));
      assert.ok(
        sql.includes(
          "p.proconfig=array[" + row.config.map((x) => "'" + x + "'").join(",") + "]::text[]",
        ),
      );
    }
  }
});
test("unbound project, missing scope, modified owner ACL or fingerprint cannot stage helper reconstruction", () => {
  const root = mkdtempSync(join(tmpdir(), "v3-current-helper-"));
  try {
    symlinkSync(resolve("supabase"), join(root, "supabase"), "dir");
    const files = [QUALIFIER_EVIDENCE, CURRENT_QUALIFIER_EVIDENCE, CURRENT_TRIGGER_EVIDENCE];
    for (const file of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), readFileSync(file));
    }
    const original = JSON.parse(readFileSync(CURRENT_QUALIFIER_EVIDENCE, "utf8"));
    for (const mutate of [
      (x) => {
        x.projectRef = "oxtbskojiexkaspputvo";
      },
      (x) => {
        x.routines.pop();
      },
      (x) => {
        x.routines[0].owner = "authenticated";
      },
      (x) => {
        x.routines[0].acl = "{postgres=X/postgres,authenticated=X/postgres}";
      },
      (x) => {
        x.routines[0].definition_sha256 = "0".repeat(64);
      },
      (x) => {
        x.routines.push(x.routines[0]);
      },
    ]) {
      const changed = structuredClone(original);
      mutate(changed);
      writeFileSync(join(root, CURRENT_QUALIFIER_EVIDENCE), JSON.stringify(changed));
      assert.throws(() => stagedQualificationHelpers(root));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
