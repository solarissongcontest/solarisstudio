import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  stageAtomicCalculation,
  validateAtomicReference,
  ATOMIC_REFERENCE,
  ATOMIC_SOURCES,
} from "./stage-v3-atomic-calculation-recovery.mjs";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
const reference = JSON.parse(readFileSync(ATOMIC_REFERENCE, "utf8"));
test("guarded atomic candidate retains exact original and authenticated actor function definitions", () => {
  const sql = stageAtomicCalculation();
  const original = extractDefinition(
    readFileSync(ATOMIC_SOURCES[0], "utf8"),
    "televoting.v3_commit_official_round_calculation",
  );
  const final = extractDefinition(
    readFileSync(ATOMIC_SOURCES[1], "utf8"),
    "televoting.v3_commit_official_round_calculation",
  );
  assert.ok(sql.includes(original));
  assert.ok(sql.includes(final));
  assert.equal(
    sql.match(/create or replace function televoting\.v3_commit_official_round_calculation\(/g)
      .length,
    2,
  );
  assert.ok(sql.indexOf(original) < sql.indexOf(final));
  // The final effective definition, including expected-source preflight, is
  // present byte-for-byte; do not replace it with another calculation engine.
  const actor = readFileSync(ATOMIC_SOURCES[1], "utf8")
    .replace(/^(?:--[^\n]*\n|\s)+/, "")
    .replace(/^begin;\s*/, "")
    .replace(/\scommit;\s*$/, "");
  assert.ok(sql.includes(actor));
  assert.equal(sql.match(/^begin;$/gm).length, 1);
  assert.equal(sql.match(/^commit;$/gm).length, 1);
  assert.match(sql, /Atomic recovery catalog\/authority drift/);
  assert.match(sql, /Atomic recovery already or partially installed/);
  assert.ok(
    sql.indexOf("Atomic recovery catalog/authority drift") <
      sql.indexOf("grant select, insert, update, delete"),
  );
  assert.doesNotMatch(
    sql,
    /supabase_migrations|migration repair|disable trigger|disable row level/i,
  );
});
test("unknown reference scope, ownership, ACLs and upstream sources fail closed", () => {
  for (const mutate of [
    (x) => {
      x.relations.find((y) => y.object_name === "v3_televote_projection_write_context").acl_md5 =
        "0".repeat(32);
    },
    (x) => {
      x.pg_version_num = 170006;
    },
    (x) => {
      x.hostedEquivalenceCertified = true;
    },
    (x) => {
      x.relations.pop();
    },
    (x) => {
      x.routines.push(x.routines[0]);
    },
    (x) => {
      x.relations.find((y) => y.object_name === "round_influence_results").acl_md5 = "0".repeat(32);
    },
    (x) => {
      x.routines.find((y) => y.schema_name === "auth").owner_name = "postgres";
    },
    (x) => {
      x.upstreamSourceSha256[ATOMIC_SOURCES[0]] = "0".repeat(64);
    },
    (x) => {
      x.relations.find((y) => y.object_name === "round_influence_results").policies_md5 =
        "0".repeat(32);
    },
  ]) {
    const changed = structuredClone(reference);
    mutate(changed);
    assert.throws(() => validateAtomicReference(changed));
  }
});
