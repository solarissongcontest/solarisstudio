import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyS15Finding,
  detectS14SourceDefects,
  summarizeFindings,
  unsafeEnvironmentKeys,
} from "./v3-integration-defect-sweep.mjs";

const samples = {
  deadline: 'if [[ "$(db_scalar "select (clock_timestamp() >= closes_at)::text from televoting.rounds;")" == "t" ]]; then',
  stage7: "insert into televoting.rounds (id,name,status) values (...);",
  stage8: "bun run scripts/v3-s14-materialize-televote-results.ts",
  math: 'export const CALC_ENGINE_VERSION = "rank-weighted-v1";',
  adapter: 'if (round.televote_engine_version !== CALC_ENGINE_VERSION) fail("unsupported");',
  migration: "alter table televoting.rounds alter column televote_engine_version set default 'robust-televote-v2';",
};

test("finds the concrete S14 Stage 7 PostgreSQL boolean-text mismatch", () => {
  const problems = detectS14SourceDefects(samples);
  assert.ok(problems.some((item) => item.id === "S14-STAGE7-BOOLEAN-POLL"));
  const fixed = { ...samples, deadline: samples.deadline.replace('== "t"', '== "true"') };
  assert.ok(!detectS14SourceDefects(fixed).some((item) => item.id === "S14-STAGE7-BOOLEAN-POLL"));
});

test("finds Stage 8 engine mismatch only when the fixture inherits the incompatible default", () => {
  assert.ok(detectS14SourceDefects(samples).some((item) => item.id === "S14-STAGE8-ENGINE-MISMATCH"));
  const explicitEngine = { ...samples, stage7: "update televoting.rounds set televote_engine_version='rank-weighted-v1'" };
  assert.ok(!detectS14SourceDefects(explicitEngine).some((item) => item.id === "S14-STAGE8-ENGINE-MISMATCH"));
  const compatibleAdapter = { ...samples, adapter: "switch (round.televote_engine_version) { case 'robust-televote-v2': break; }" };
  assert.ok(!detectS14SourceDefects(compatibleAdapter).some((item) => item.id === "S14-STAGE8-ENGINE-MISMATCH"));
});

test("separates local direct-write review from confirmed runtime blocker", () => {
  const adapter = samples.adapter + '\nawait tv.from("round_results").delete().eq("round_id", roundId);' +
    '\nawait tv.from("round_results").insert(rows);' +
    '\nawait db.from("televote_votes").insert(canonicalVotes);';
  const finding = detectS14SourceDefects({ ...samples, adapter })
    .find((item) => item.id === "S14-STAGE8-TEST-WRITER-REVIEW");
  assert.equal(finding?.risk, "needs-triage");
});

test("does not mistake 125 unclassified migration findings for 125 confirmed hard blockers", () => {
  assert.deepEqual(classifyS15Finding("PUBLIC_CUTOVER_UNRESOLVED participant-view:building"),
    { family: "capability-cutover", risk: "release-scope-review" });
  assert.deepEqual(classifyS15Finding("SYSTEM_COMMAND_MULTIPLE_OWNERS apply_result -> a,b"),
    { family: "canonical-ownership", risk: "potential-integrity-blocker" });
  assert.equal(classifyS15Finding("UNRECOGNIZED_FINDING some detail").risk, "needs-triage");
});

test("refuses hosted or privileged Supabase environment before any subprocess starts", () => {
  assert.deepEqual(unsafeEnvironmentKeys({
    VITE_SUPABASE_URL: "http://127.0.0.1:54321",
    CONFIRMATIONS_SUPABASE_URL: "http://localhost:54321",
    PGHOST: "127.0.0.1",
  }), []);
  assert.deepEqual(unsafeEnvironmentKeys({
    SUPABASE_URL: "https://production.supabase.co",
    PGHOST: "remote.db.example",
    SERVICE_ROLE_KEY: "dummy-secret",
    API_URL: "https://hosted.example",
  }).sort(), ["API_URL", "PGHOST", "SERVICE_ROLE_KEY", "SUPABASE_URL"].sort());
});

test("groups repeat findings by root-cause family without discarding individual records", () => {
  const groups = summarizeFindings([
    { id: "one", family: "capability-cutover", risk: "release-scope-review" },
    { id: "two", family: "capability-cutover", risk: "release-scope-review" },
    { id: "three", family: "canonical-ownership", risk: "potential-integrity-blocker" },
  ]);
  assert.equal(groups.find((g) => g.family === "capability-cutover")?.count, 2);
  assert.equal(groups.find((g) => g.family === "canonical-ownership")?.ids[0], "three");
});
