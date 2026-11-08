import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const SHA = /^[a-f0-9]{40}$/;
const CLASSES = new Set(["hard", "conditional", "debt", "superseded"]);
const STATES = new Set(["blocked", "in_progress", "unverified", "awaiting_authorization", "closed", "superseded"]);
const REQUIRED = ["id", "capability", "classification", "status", "sourceOfAuthority", "technicalRootCause", "owner", "nextAction", "targetDate", "verificationSha"];

const APPROVAL_ACTIONS = ["hostedMigration", "productionDeployment", "publicWriteReopening"];
const CERTIFICATION_GATES = ["S13", "S14", "S15", "S16", "security", "productionIsolation"];
const nonempty = value => typeof value === "string" && value.trim().length > 0;

// This verifies the shape and exact-SHA references of a HUMAN-supplied release
// approval packet. It cannot authenticate a signature or grant production
// permission. Operations must independently verify each reference with its owner.
export function evaluateExplicitReleaseApproval(packet, candidateSha) {
  const errors = [];
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    return ["certification: external --approval-file with explicit owner decisions is required"];
  }
  if (packet.schemaVersion !== 1 || packet.scope !== "full_solaris_studio_v3" ||
      packet.decision !== "GO_FULL_V3") {
    errors.push("certification: packet must explicitly authorize full V3 GO");
  }
  if (!SHA.test(candidateSha) || packet.candidateSha !== candidateSha) {
    errors.push("certification: approval packet must bind the exact candidate SHA");
  }
  if (!nonempty(packet.releaseManager?.name) || !nonempty(packet.releaseManager?.decisionRef)) {
    errors.push("certification: identifiable release-manager decision reference required");
  }
  const scope = packet.scopeReview;
  if (scope?.decision !== "full_scope_accepted" ||
      !nonempty(scope.reviewedBy) || !nonempty(scope.evidenceRef) ||
      !Array.isArray(scope.excludedCapabilities) || scope.excludedCapabilities.length !== 0) {
    errors.push("certification: full-scope review and zero silent exclusions required");
  }
  const refs = new Set();
  for (const action of APPROVAL_ACTIONS) {
    const decision = packet.authorizations?.[action];
    if (decision?.approved !== true || !nonempty(decision.approvedBy) ||
        !nonempty(decision.evidenceRef)) {
      errors.push("certification: explicit independent " + action + " authorization missing");
    } else if (refs.has(decision.evidenceRef)) {
      errors.push("certification: separate production actions need distinct authorization references");
    } else refs.add(decision.evidenceRef);
  }
  const evidence = packet.gates;
  if (!Array.isArray(evidence)) {
    errors.push("certification: exact-SHA release gate evidence array required");
  } else {
    for (const gate of CERTIFICATION_GATES) {
      const rows = evidence.filter(row => row && row.id === gate);
      if (rows.length !== 1 || rows[0].passed !== true ||
          rows[0].candidateSha !== candidateSha || !nonempty(rows[0].evidenceRef)) {
        errors.push("certification: missing/stale/duplicate " + gate + " evidence");
      }
    }
    if (evidence.length !== CERTIFICATION_GATES.length) {
      errors.push("certification: unexpected release gate evidence rows");
    }
  }
  return errors;
}

export function evaluateFinalWeekBlockers(matrix, { release = false, certified = false, candidateSha = "", approvalPacket = null } = {}) {
  const errors = [];
  const requireField = (row, key, where) => {
    if (typeof row[key] !== "string" || !row[key].trim()) errors.push(where + ": missing " + key);
  };
  if (!matrix || typeof matrix !== "object" || Array.isArray(matrix)) return { errors: ["matrix must be an object"], counts: {} };
  if (matrix.schemaVersion !== 1) errors.push("matrix: unsupported schemaVersion");
  if (matrix.scope !== "full_solaris_studio_v3") errors.push("matrix: scope must remain full Solaris Studio V3");
  if (!SHA.test(matrix.baselineMainSha ?? "")) errors.push("matrix: baselineMainSha must be a full lowercase SHA");
  if (matrix.releaseAt !== "2026-11-15T20:00:00+02:00") errors.push("matrix: release target must remain the canonical time");
  if (!/^2026-11-\d{2}$/.test(matrix.snapshotDate ?? "")) errors.push("matrix: missing or invalid snapshotDate");
  if (!Array.isArray(matrix.items) || !matrix.items.length) errors.push("matrix: nonempty items array required");

  const ids = new Set();
  const counts = { hard: 0, conditional: 0, debt: 0, superseded: 0, unresolvedHard: 0, unresolvedConditional: 0 };
  for (const [index, row] of (Array.isArray(matrix.items) ? matrix.items : []).entries()) {
    const where = "items[" + index + "]";
    if (!row || typeof row !== "object" || Array.isArray(row)) { errors.push(where + ": expected object"); continue; }
    for (const field of REQUIRED) requireField(row, field, where);
    if (typeof row.id === "string") {
      if (ids.has(row.id)) errors.push(where + ": duplicate id " + row.id);
      ids.add(row.id);
    }
    if (!CLASSES.has(row.classification)) errors.push(where + ": invalid classification");
    else counts[row.classification]++;
    if (!STATES.has(row.status)) errors.push(where + ": invalid status");
    if (!SHA.test(row.verificationSha ?? "")) errors.push(where + ": verificationSha must be a full lowercase SHA");
    if (!/^2026-11-\d{2}$/.test(row.targetDate ?? "") || (row.targetDate ?? "") > "2026-11-15") errors.push(where + ": invalid sprint targetDate");
    for (const name of ["dependencies", "relatedPRs", "requiredEvidence", "evidence"]) {
      if (!Array.isArray(row[name])) errors.push(where + ": " + name + " must be an array");
    }
    if (!Array.isArray(row.requiredEvidence) || !row.requiredEvidence.length) errors.push(where + ": requiredEvidence cannot be empty");
    if (!Array.isArray(row.evidence) || !row.evidence.length) errors.push(where + ": initial observed evidence must be recorded");
    if (row.classification === "superseded" && row.status !== "superseded") errors.push(where + ": superseded classification requires superseded status");
    if (row.status === "superseded" && (row.classification !== "superseded" || !row.replacementEvidence)) errors.push(where + ": supersession requires explicit replacement evidence");
    if (row.status === "closed") {
      if (!Array.isArray(row.closureEvidence) || !row.closureEvidence.length) errors.push(where + ": closure requires explicit test/acceptance evidence");
      else if (!row.closureEvidence.every(e => e && SHA.test(e.verifiedSha ?? "") && typeof e.test === "string" && e.test.trim())) {
        errors.push(where + ": every closure evidence record needs a verified historical source SHA and test");
      }
    }
    if (row.classification === "hard" && row.status !== "closed") counts.unresolvedHard++;
    if (row.classification === "conditional" && row.status !== "closed") counts.unresolvedConditional++;
  }
  // Release readiness must be a dependency DAG. A cycle makes every action
  // appear blocked by another "later" gate, so no owner can close the root cause.
  const dependencies = new Map();
  for (const row of (Array.isArray(matrix.items) ? matrix.items : [])) {
    if (!row || !Array.isArray(row.dependencies)) continue;
    if (typeof row.id === "string" && !dependencies.has(row.id)) dependencies.set(row.id, []);
    for (const dependency of row.dependencies) {
      if (typeof dependency !== "string" || !ids.has(dependency)) {
        errors.push(row.id + ": unknown dependency " + String(dependency));
      } else if (typeof row.id === "string") {
        dependencies.get(row.id)?.push(dependency);
      }
    }
  }
  const active = new Set();
  const complete = new Set();
  const reportedCycles = new Set();
  function validateDAG(id, lineage) {
    if (complete.has(id)) return;
    if (active.has(id)) {
      const start = lineage.indexOf(id);
      const cycle = [...lineage.slice(Math.max(start, 0)), id].join(" -> ");
      if (!reportedCycles.has(cycle)) {
        errors.push("release dependency cycle: " + cycle);
        reportedCycles.add(cycle);
      }
      return;
    }
    active.add(id);
    for (const required of dependencies.get(id) ?? []) validateDAG(required, [...lineage, id]);
    active.delete(id);
    complete.add(id);
  }
  for (const id of dependencies.keys()) validateDAG(id, []);
  if (release || certified) {
    if (!SHA.test(candidateSha)) errors.push("release: exact --candidate-sha is required");
    if (matrix.coverage !== "complete") errors.push("release: matrix coverage is incomplete or unaudited");
    if (certified) {
      if (matrix.releaseCertified !== true) errors.push("certification: owner approval evidence is absent");
      errors.push(...evaluateExplicitReleaseApproval(approvalPacket, candidateSha));
    }
    if (counts.unresolvedHard) errors.push("release: " + counts.unresolvedHard + " hard blockers remain");
    if (counts.unresolvedConditional) errors.push("release: " + counts.unresolvedConditional + " conditional blockers remain");
    // Repository-tracked files cannot contain their own final Git commit SHA.
    // verificationSha and closureEvidence.verifiedSha identify inspected source
    // revisions. The exact release-candidate SHA is checked at runtime below;
    // full S14/S15/S16/security exact-SHA evidence is enforced separately by
    // the canonical release-integrity gate, never fabricated in this matrix.
  }
  return { errors, counts };
}

function run() {
  const args = process.argv.slice(2);
  const certified = args.includes("--certified");
  const release = args.includes("--release") || certified;
  const candidateIndex = args.indexOf("--candidate-sha");
  const candidateSha = candidateIndex < 0 ? "" : args[candidateIndex + 1] ?? "";
  const fileIndex = args.indexOf("--file");
  const file = fileIndex < 0 ? "docs/v3/final-week-release-blocker-matrix.json" : args[fileIndex + 1];
  if (release) {
    // Bind this execution to the checked-out commit, without a self-referential
    // SHA field in repository-tracked source. The existing preflight verifies
    // candidate identity independently and checks external runtime evidence.
    let checkoutSha = "";
    try { checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); }
    catch { /* No Git checkout is not a valid release candidate. */ }
    if (checkoutSha !== candidateSha) {
      console.error("Refusing final-week release preflight: candidate SHA does not match the current checkout");
      process.exitCode = 1;
      return;
    }
  }
  let approvalPacket = null;
  if (certified) {
    const approvalIndex = args.indexOf("--approval-file");
    const approvalFile = approvalIndex < 0 ? "" : args[approvalIndex + 1] ?? "";
    if (approvalFile) {
      try { approvalPacket = JSON.parse(readFileSync(approvalFile, "utf8")); }
      catch (error) {
        console.error("V3 release approval packet unavailable or invalid: " + error.message);
        process.exitCode = 1;
        return;
      }
    }
  }
  let report;
  try { report = evaluateFinalWeekBlockers(JSON.parse(readFileSync(file, "utf8")), { release, certified, candidateSha, approvalPacket }); }
  catch (error) { console.error("V3 final-week blocker matrix unavailable or invalid: " + error.message); process.exitCode = 1; return; }
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("V3 blocker matrix: hard " + report.counts.hard + ", conditional " + report.counts.conditional + "; unresolved hard " + report.counts.unresolvedHard + ", conditional " + report.counts.unresolvedConditional);
    for (const error of report.errors) console.error("BLOCKED: " + error);
  }
  if (report.errors.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) run();
