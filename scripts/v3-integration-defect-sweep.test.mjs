import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  classifyS15Finding,
  detectS14SourceDefects,
  hasCompleteS14DiagnosticClaim,
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

test("S14 diagnostic refuses false full-contest passes for partial, failed or stale proof", () => {
  const candidateSha = "a".repeat(40);
  const evidence = {
    candidateSha, passed: true, partial: false, runtimeFailure: false,
    lifecycle: { finalState: "archived" },
    completedStages: [
      "stage-1-setup", "stage-2-delegation-onboarding", "stage-3-confirmations",
      "stage-4-entries", "stage-5-running-orders", "stage-6-jury",
      "stage-7-public-voting", "stage-8-results", "stage-9-publication",
      "stage-10-archive",
    ],
    pendingStages: [],
    completedContestExtensions: [
      "grand-final-qualifier-bridge", "grand-final-voting",
      "grand-final-results", "grand-final-publication",
    ],
    pendingContestExtensions: [], blockedContestExtensions: [],
    implementedInvariants: [
      "confirmation-no-effective-duplicates", "entry-valid-revision", "media-accepted-revision",
      "jury-single-final-ballot", "televote-canonical-ballot", "result-reproducible",
      "publication-final-version", "tasks-canonical", "notifications-reconcilable",
    ],
    implementedFailureInjections: [
      "network-after-commit", "db-timeout-before-commit", "duplicate-request",
      "worker-crash", "realtime-disconnect", "stale-client", "two-organizers",
      "supabase-outage",
    ],
    runIdentity: { candidateSha, editionId: "disposable-edition", databaseFingerprint: "local-fixture" },
    seed: { editionCount: 1, delegationCount: 66, showCount: 3 },
  };
  assert.equal(hasCompleteS14DiagnosticClaim(evidence, candidateSha), true);
  const failedClaims = [
    { ...evidence, passed: false },
    { ...evidence, partial: true },
    { ...evidence, runtimeFailure: true },
    { ...evidence, lifecycle: { finalState: "completed" } },
    { ...evidence, pendingStages: ["stage-8-results"] },
    { ...evidence, completedStages: evidence.completedStages.slice(0, -1) },
    { ...evidence, completedStages: [...evidence.completedStages].reverse() },
    { ...evidence, completedContestExtensions: evidence.completedContestExtensions.slice(1) },
    { ...evidence, pendingContestExtensions: ["grand-final-results"] },
    { ...evidence, blockedContestExtensions: ["grand-final-publication"] },
    { ...evidence, implementedInvariants: evidence.implementedInvariants.slice(1) },
    { ...evidence, implementedFailureInjections: evidence.implementedFailureInjections.slice(0, -1) },
    { ...evidence, implementedFailureInjections: [...evidence.implementedFailureInjections, "duplicate-request"] },
    { ...evidence, runIdentity: { ...evidence.runIdentity, candidateSha: "b".repeat(40) } },
    { ...evidence, runIdentity: { ...evidence.runIdentity, databaseFingerprint: "" } },
    { ...evidence, runIdentity: { ...evidence.runIdentity, editionId: { forged: true } } },
    { ...evidence, runIdentity: { ...evidence.runIdentity, databaseFingerprint: "   " } },
    { ...evidence, seed: { ...evidence.seed, showCount: 2 } },
    { ...evidence, seed: { ...evidence.seed, delegationCount: 65 } },
  ];
  failedClaims.forEach((claim, index) =>
    assert.equal(hasCompleteS14DiagnosticClaim(claim, candidateSha), false, `rejected invalid proof #${index}`));
  assert.equal(hasCompleteS14DiagnosticClaim(evidence, "b".repeat(40)), false);
  assert.equal(hasCompleteS14DiagnosticClaim(null, candidateSha), false);
});

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

test("manual diagnostic dispatch cannot execute arbitrary input-selected code", () => {
  const workflow = readFileSync(new URL("../.github/workflows/v3-integration-defect-sweep.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes("V3_SELECTED_SHA: ${{ github.event.pull_request.head.sha || github.sha }}"));
  assert.ok(workflow.includes('[[ "$V3_CANDIDATE_SHA" == "$V3_SELECTED_SHA" ]]'));
  assert.ok(workflow.includes("candidate_sha must match the selected workflow-dispatch or pull-request commit"));
  assert.ok(workflow.includes("ref: ${{ github.event.pull_request.head.sha || github.sha }}"));
  assert.ok(!workflow.includes("ref: ${{ github.event.pull_request.head.sha || inputs.candidate_sha }}"));
  assert.ok(workflow.includes("persist-credentials: false"));
  assert.ok(!/playwright/i.test(workflow), "This is read-only source diagnostics, not a browser audit");
});

test("source diagnostic workflow retains loopback-only and non-certifying intent", () => {
  const workflow = readFileSync(new URL("../.github/workflows/v3-integration-defect-sweep.yml", import.meta.url), "utf8");
  for (const key of ["VITE_SUPABASE_URL", "SUPABASE_URL", "VITE_CONFIRMATIONS_SUPABASE_URL", "CONFIRMATIONS_SUPABASE_URL"]) {
    assert.ok(workflow.includes(`${key}: http://127.0.0.1:54321`));
  }
  assert.ok(workflow.includes("No Supabase CLI, DB reset"));
  assert.ok(workflow.includes("diagnostic and never"));
  assert.ok(!workflow.includes("secrets.SUPABASE"));
  assert.ok(!workflow.includes("supabase start"));
});
