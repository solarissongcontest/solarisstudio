import assert from "node:assert/strict";
import { test } from "node:test";
import { enforceS15Evidence, summarizeS15Evidence } from "./v3-s15-cutover-risk-gate.mjs";

const sha = "a".repeat(40);
const pending = [
  "PUBLIC_CUTOVER_UNRESOLVED rules:parity",
  "PUBLIC_CUTOVER_UNRESOLVED taste-dna:discovered",
  "ORGANIZER_CUTOVER_UNRESOLVED voting-jury:building",
];
function evidence(findings = pending) {
  return {
    candidateSha: sha,
    schemaVersion: 4,
    zeroOrphans: findings.length === 0,
    inventory: { publicCapabilities: 45, organizerCapabilities: 81 },
    physicalOwnership: { schemaVersion: 1, zeroOwnershipConflicts: true },
    findings,
  };
}

test("PR structural gate retains all unresolved cutovers without falsely certifying release", () => {
  const report = enforceS15Evidence(evidence(), sha);
  assert.equal(report.zeroOrphans, false);
  assert.equal(report.unresolvedTotal, 3);
  assert.deepEqual(report.pendingCutovers, pending);
  assert.deepEqual(report.structuralFindings, []);
});

test("full-release gate refuses the same pending inventory", () => {
  assert.throws(() => enforceS15Evidence(evidence(), sha, { fullRelease: true }),
    /Full V3 release S15 zero-orphan gate failed/);
});

test("full-release gate accepts only a genuinely empty consistent inventory", () => {
  const result = enforceS15Evidence(evidence([]), sha, { fullRelease: true });
  assert.equal(result.zeroOrphans, true);
  assert.equal(result.unresolvedTotal, 0);
});

test("both modes fail closed on actual ownership or unrecognized S15 findings", () => {
  for (const finding of [
    "PHYSICAL_OWNERSHIP_CONFLICT results written by two domains",
    "SYSTEM_COMMAND_MULTIPLE_OWNERS result.publish",
    "RUNTIME_API_ROUTE_ORPHAN /api/results",
    "PUBLIC_CUTOVER_UNRESOLVED rules:cutover",
    "PUBLIC_CUTOVER_UNRESOLVED rules:inconsistent-state",
    "PUBLIC_CUTOVER_UNRESOLVED ../private:building",
  ]) {
    assert.throws(() => enforceS15Evidence(evidence([finding]), sha), /structural ownership verification failed/);
  }
  const changed = evidence([]);
  changed.physicalOwnership.zeroOwnershipConflicts = false;
  changed.zeroOrphans = false;
  assert.throws(() => enforceS15Evidence(changed, sha), /structural ownership verification failed/);
});

test("invalid, contradictory, missing or stale evidence is never accepted", () => {
  assert.throws(() => summarizeS15Evidence(evidence(), "b".repeat(40)), /exact candidate SHA/);
  const fakeZero = evidence();
  fakeZero.zeroOrphans = true;
  assert.throws(() => enforceS15Evidence(fakeZero, sha), /zeroOrphans contradicts/);
  const invalidSchema = evidence();
  invalidSchema.schemaVersion = 2;
  assert.throws(() => enforceS15Evidence(invalidSchema, sha), /versioned physical-ownership/);
  const missing = evidence();
  delete missing.physicalOwnership;
  assert.throws(() => enforceS15Evidence(missing, sha), /missing a valid physical ownership/);
  const tampered = evidence();
  tampered.findings = [null];
  assert.throws(() => enforceS15Evidence(tampered, sha), /missing a valid physical ownership/);
});
