import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { releaseEvidenceConsistencyFailure } from "../../scripts/v3-release-evidence-consistency";

export const V3_QA_RELEASE_PHASES = ["S10", "S11", "S12", "S13", "S14", "S15", "S16"] as const;
export type V3QaReleasePhaseId = (typeof V3_QA_RELEASE_PHASES)[number];

export type V3QaReleasePhaseTruth = {
  id: V3QaReleasePhaseId;
  state: "missing" | "invalid" | "passed";
  source: string;
  issues: string[];
};

export type V3QaReleaseTruth = {
  schemaVersion: 1;
  candidateSha: string;
  evidenceDir: string;
  phases: V3QaReleasePhaseTruth[];
  readyForS16: boolean;
  certified: boolean;
  invalidEvidence: string[];
  missingEvidence: V3QaReleasePhaseId[];
};

type JsonRecord = Record<string, unknown>;

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const HARDENING_FILE = "s16-system-hardening.json";
const S14_FILE = "s14-full-contest.json";
const S15_FILE = "s15-zero-orphan.json";
const S16_FILE = "s16-certification.json";

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function normalizeSha(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Bind release evidence to the actual checked-out source, never to a supplied
 * environment SHA alone. A stale workflow input cannot certify another commit.
 */
export function assertV3QaEvidenceCheckoutIdentity(
  gitHead: string,
  env: { candidateSha?: string; githubSha?: string },
): string {
  const actual = normalizeSha(gitHead);
  if (!SHA_PATTERN.test(actual)) {
    throw new Error("Checked-out Git HEAD must be one exact 40-character commit SHA");
  }
  for (const [label, raw] of [
    ["V3_CANDIDATE_SHA", env.candidateSha],
    ["GITHUB_SHA", env.githubSha],
  ] as const) {
    if (raw === undefined || raw === "") continue;
    const declared = normalizeSha(raw);
    if (!SHA_PATTERN.test(declared)) {
      throw new Error(`${label} must contain one exact 40-character commit SHA`);
    }
    if (declared !== actual) {
      throw new Error(`${label} ${declared} does not match checked-out Git HEAD ${actual}`);
    }
  }
  return actual;
}

function exactShaIssue(value: unknown, expectedSha: string, label: string) {
  const sha = normalizeSha(value);
  if (!SHA_PATTERN.test(sha)) return `${label} must contain one exact 40-character candidate SHA`;
  if (sha !== expectedSha) return `${label} certifies ${sha}, not exact candidate ${expectedSha}`;
  return null;
}

function readJson(evidenceDir: string, filename: string): { present: boolean; value: unknown; issues: string[] } {
  const path = join(evidenceDir, filename);
  if (!existsSync(path)) return { present: false, value: null, issues: [] };
  try {
    return { present: true, value: JSON.parse(readFileSync(path, "utf8")), issues: [] };
  } catch {
    return { present: true, value: null, issues: [`${filename} is not valid JSON`] };
  }
}

/**
 * A release evidence declaration cannot attest to bytes that have not been
 * supplied. Resolve source paths under the collected evidence directory,
 * reject symlink escapes and verify the actual content digest.
 */
function sourceArtifactIssue(evidenceDir: string, artifact: string, digest: string, label: string): string | null {
  if (!artifact || isAbsolute(artifact) || artifact.includes(String.fromCharCode(0)) || artifact.includes(String.fromCharCode(92))) {
    return label + " artifact must be a local relative file";
  }
  try {
    const root = realpathSync(evidenceDir);
    const target = realpathSync(resolve(root, artifact));
    const rel = relative(root, target);
    if (!rel || rel === ".." || rel.startsWith(".." + "/") || isAbsolute(rel)) {
      return label + " artifact must remain inside the evidence directory";
    }
    const stat = statSync(target);
    if (!stat.isFile() || stat.size > 32 * 1024 * 1024) {
      return label + " artifact must be a bounded regular file";
    }
    const observed = createHash("sha256").update(readFileSync(target)).digest("hex");
    if (observed !== digest) return label + " source artifact SHA-256 digest mismatch";
    return null;
  } catch {
    return label + " source artifact is missing or unreadable";
  }
}

function hardeningPhaseTruth(
  phaseId: Extract<V3QaReleasePhaseId, "S10" | "S11" | "S12" | "S13">,
  evidence: ReturnType<typeof readJson>,
  expectedSha: string,
  evidenceDir: string,
): V3QaReleasePhaseTruth {
  if (!evidence.present) return { id: phaseId, state: "missing", source: HARDENING_FILE, issues: [] };
  if (evidence.issues.length) return { id: phaseId, state: "invalid", source: HARDENING_FILE, issues: [...evidence.issues] };

  const root = record(evidence.value);
  const issues: string[] = [];
  if (!root) return { id: phaseId, state: "invalid", source: HARDENING_FILE, issues: [`${HARDENING_FILE} must be a JSON object`] };
  if (root.schemaVersion !== 1) issues.push(`${HARDENING_FILE} schemaVersion must be 1`);
  if (root.certificationClaim !== false) issues.push(`${HARDENING_FILE} component evidence must set certificationClaim=false`);
  const unresolved = stringArray(root.unresolvedBlockers);
  if (!unresolved) issues.push(`${HARDENING_FILE} unresolvedBlockers must be a string array`);
  else if (unresolved.length) issues.push(`${HARDENING_FILE} still has unresolved blockers`);

  if (!Array.isArray(root.phases)) {
    issues.push(`${HARDENING_FILE} phases must be an array`);
    return { id: phaseId, state: "invalid", source: HARDENING_FILE, issues };
  }

  const matches = root.phases.filter((value) => record(value)?.id === phaseId);
  if (matches.length !== 1) {
    issues.push(`${HARDENING_FILE} must contain exactly one ${phaseId} phase; found ${matches.length}`);
    return { id: phaseId, state: "invalid", source: HARDENING_FILE, issues };
  }

  const phase = record(matches[0]);
  if (!phase) {
    issues.push(`${HARDENING_FILE} ${phaseId} phase must be an object`);
    return { id: phaseId, state: "invalid", source: HARDENING_FILE, issues };
  }
  if (phase.passed !== true) issues.push(`${phaseId} does not prove passed=true`);
  const shaIssue = exactShaIssue(phase.candidateSha, expectedSha, `${phaseId} candidateSha`);
  if (shaIssue) issues.push(shaIssue);
  const blockers = stringArray(phase.blockers);
  if (!blockers) issues.push(`${phaseId} blockers must be a string array`);
  else if (blockers.length) issues.push(`${phaseId} still has blockers`);

  if (!Array.isArray(phase.sources) || phase.sources.length === 0) {
    issues.push(`${phaseId} must retain at least one source artifact`);
  } else {
    for (const [index, value] of phase.sources.entries()) {
      const source = record(value);
      const label = `${phaseId} source ${index + 1}`;
      if (!source) {
        issues.push(`${label} must be an object`);
        continue;
      }
      if (typeof source.artifact !== "string" || !source.artifact.trim()) issues.push(`${label} artifact is missing`);
      const digest = typeof source.sha256 === "string" ? source.sha256.trim().toLowerCase() : "";
      if (!DIGEST_PATTERN.test(digest)) issues.push(`${label} sha256 must be 64 lowercase hex characters`);
      else if (typeof source.artifact === "string" && source.artifact.trim()) {
        const proofIssue = sourceArtifactIssue(evidenceDir, source.artifact, digest, label);
        if (proofIssue) issues.push(proofIssue);
      }
      if (typeof source.workflow !== "string" || !source.workflow.trim()) issues.push(`${label} workflow is missing`);
      if (!Number.isInteger(source.runId) || Number(source.runId) <= 0) issues.push(`${label} runId must be a positive integer`);
      if (!Number.isInteger(source.runAttempt) || Number(source.runAttempt) <= 0) issues.push(`${label} runAttempt must be a positive integer`);
      if (source.conclusion !== "success") issues.push(`${label} conclusion must be success`);
      const headIssue = exactShaIssue(source.headSha, expectedSha, `${label} headSha`);
      if (headIssue) issues.push(headIssue);
    }
  }

  return { id: phaseId, state: issues.length ? "invalid" : "passed", source: HARDENING_FILE, issues };
}

function s14Truth(evidence: ReturnType<typeof readJson>, expectedSha: string): V3QaReleasePhaseTruth {
  if (!evidence.present) return { id: "S14", state: "missing", source: S14_FILE, issues: [] };
  if (evidence.issues.length) return { id: "S14", state: "invalid", source: S14_FILE, issues: [...evidence.issues] };
  const value = record(evidence.value);
  const issues: string[] = [];
  if (!value) return { id: "S14", state: "invalid", source: S14_FILE, issues: [`${S14_FILE} must be a JSON object`] };
  const shaIssue = exactShaIssue(value.candidateSha, expectedSha, "S14 candidateSha");
  if (shaIssue) issues.push(shaIssue);
  if (value.passed !== true) issues.push("S14 does not prove passed=true");
  if (value.partial !== false) issues.push("S14 final evidence must prove partial=false");
  if (value.runtimeFailure !== false) issues.push("S14 final evidence must prove runtimeFailure=false");
  for (const key of ["pendingStages", "pendingContestExtensions", "blockedContestExtensions"] as const) {
    if (!Array.isArray(value[key])) issues.push(`S14 ${key} must be an array`);
    else if ((value[key] as unknown[]).length) issues.push(`S14 ${key} must be empty`);
  }
  if (record(value.lifecycle)?.finalState !== "archived") issues.push("S14 must prove lifecycle.finalState=archived");
  const consistencyIssue = releaseEvidenceConsistencyFailure(S14_FILE, value);
  if (consistencyIssue) issues.push(consistencyIssue);
  return { id: "S14", state: issues.length ? "invalid" : "passed", source: S14_FILE, issues };
}

function s15Truth(evidence: ReturnType<typeof readJson>, expectedSha: string): V3QaReleasePhaseTruth {
  if (!evidence.present) return { id: "S15", state: "missing", source: S15_FILE, issues: [] };
  if (evidence.issues.length) return { id: "S15", state: "invalid", source: S15_FILE, issues: [...evidence.issues] };
  const value = record(evidence.value);
  const issues: string[] = [];
  if (!value) return { id: "S15", state: "invalid", source: S15_FILE, issues: [`${S15_FILE} must be a JSON object`] };
  const shaIssue = exactShaIssue(value.candidateSha, expectedSha, "S15 candidateSha");
  if (shaIssue) issues.push(shaIssue);
  if (value.zeroOrphans !== true) issues.push("S15 does not prove zeroOrphans=true");
  if (!Array.isArray(value.findings)) issues.push("S15 findings must be an array");
  else if ((value.findings as unknown[]).length) issues.push("S15 still contains orphan findings");
  if (typeof value.schemaVersion !== "number" || value.schemaVersion < 4) {
    issues.push("S15 schemaVersion must be >= 4 for physical-ownership proof");
  }
  if (record(value.physicalOwnership)?.zeroOwnershipConflicts !== true) {
    issues.push("S15 physical ownership is not conflict-free");
  }
  const consistencyIssue = releaseEvidenceConsistencyFailure(S15_FILE, value);
  if (consistencyIssue) issues.push(consistencyIssue);
  return { id: "S15", state: issues.length ? "invalid" : "passed", source: S15_FILE, issues };
}

/**
 * Certification category rows are an index of evidence, never the evidence
 * itself. Missing, stale, failed or untraceable producer files fail closed.
 */
function s16CategoryEvidenceIssues(evidenceDir: string, categories: unknown, expectedSha: string): string[] {
  const issues: string[] = [];
  if (!Array.isArray(categories)) return ["S16 category evidence must be an array"];
  for (const raw of categories) {
    const category = record(raw);
    if (!category || typeof category.evidenceFilename !== "string" || typeof category.id !== "string") {
      issues.push("S16 category entry must identify a source file and gate");
      continue;
    }
    const filename = category.evidenceFilename;
    // The separate canonical consistency validator already checks the exact
    // 12 expected filenames. This additional check prevents path traversal.
    if (!/^(?:s16-[a-z0-9-]+|s14-full-contest|s15-zero-orphan)[.]json$/.test(filename)) {
      issues.push("S16 " + category.id + " has an unsafe source filename");
      continue;
    }
    const file = readJson(evidenceDir, filename);
    if (!file.present || file.issues.length) {
      issues.push("S16 " + category.id + " source artifact is missing or invalid: " + filename);
      continue;
    }
    const data = record(file.value);
    if (!data) {
      issues.push("S16 " + category.id + " source artifact is not a JSON object");
      continue;
    }
    const sourceShaIssue = exactShaIssue(data.candidateSha ?? data.candidate_sha, expectedSha, "S16 " + category.id + " source");
    if (sourceShaIssue) issues.push(sourceShaIssue);

    if (filename === S14_FILE) {
      issues.push(...s14Truth(file, expectedSha).issues.map((issue) => "S16 full-contest: " + issue));
    } else if (filename === S15_FILE) {
      issues.push(...s15Truth(file, expectedSha).issues.map((issue) => "S16 registry: " + issue));
    } else if (filename === HARDENING_FILE) {
      for (const phase of ["S10", "S11", "S12", "S13"] as const) {
        issues.push(...hardeningPhaseTruth(phase, file, expectedSha, evidenceDir).issues.map((issue) => "S16 hardening " + phase + ": " + issue));
      }
    } else {
      if (data.schemaVersion !== 1 && data.schema_version !== 1) {
        issues.push("S16 " + category.id + " source schema version is not 1");
      }
      if (data.passed !== true && data.result !== "pass") {
        issues.push("S16 " + category.id + " source did not pass");
      }
      const gate = data.gateId ?? data.gate_id;
      if (gate !== category.id) issues.push("S16 " + category.id + " source gate identity mismatch");
      const runId = data.runId ?? data.workflow_run_id;
      if (!Number.isSafeInteger(Number(runId)) || Number(runId) <= 0) {
        issues.push("S16 " + category.id + " source lacks a valid workflow run ID");
      }
      const jobName = data.jobName ?? data.job_name;
      if (typeof jobName !== "string" || !jobName.trim()) {
        issues.push("S16 " + category.id + " source lacks a job name");
      }
      const producedAt = data.producedAt ?? data.produced_at;
      if (typeof producedAt !== "string" || !Number.isFinite(Date.parse(producedAt))) {
        issues.push("S16 " + category.id + " source lacks a valid production timestamp");
      }
    }
  }
  return issues;
}

function s16Truth(evidence: ReturnType<typeof readJson>, expectedSha: string, evidenceDir: string): V3QaReleasePhaseTruth {
  if (!evidence.present) return { id: "S16", state: "missing", source: S16_FILE, issues: [] };
  if (evidence.issues.length) return { id: "S16", state: "invalid", source: S16_FILE, issues: [...evidence.issues] };
  const value = record(evidence.value);
  const issues: string[] = [];
  if (!value) return { id: "S16", state: "invalid", source: S16_FILE, issues: [`${S16_FILE} must be a JSON object`] };
  const shaIssue = exactShaIssue(value.candidateSha, expectedSha, "S16 candidateSha");
  if (shaIssue) issues.push(shaIssue);
  if (value.certified !== true) issues.push("S16 does not prove certified=true");
  // The canonical cross-release semantic validator already checks all 12
  // category identities, filenames, same-SHA attestations and duplicates.
  // Reuse it instead of maintaining a second S16 release contract here.
  const consistencyIssue = releaseEvidenceConsistencyFailure(S16_FILE, value);
  if (consistencyIssue) issues.push(consistencyIssue);
  else issues.push(...s16CategoryEvidenceIssues(evidenceDir, value.categories, expectedSha));
  return { id: "S16", state: issues.length ? "invalid" : "passed", source: S16_FILE, issues };
}

export function assessV3QaReleaseTruth(candidateSha: string, evidenceDir: string): V3QaReleaseTruth {
  const expectedSha = candidateSha.trim().toLowerCase();
  if (!SHA_PATTERN.test(expectedSha)) throw new Error(`candidate SHA must be exactly 40 hexadecimal characters: ${candidateSha}`);

  const hardening = readJson(evidenceDir, HARDENING_FILE);
  const phases: V3QaReleasePhaseTruth[] = [
    hardeningPhaseTruth("S10", hardening, expectedSha, evidenceDir),
    hardeningPhaseTruth("S11", hardening, expectedSha, evidenceDir),
    hardeningPhaseTruth("S12", hardening, expectedSha, evidenceDir),
    hardeningPhaseTruth("S13", hardening, expectedSha, evidenceDir),
    s14Truth(readJson(evidenceDir, S14_FILE), expectedSha),
    s15Truth(readJson(evidenceDir, S15_FILE), expectedSha),
    s16Truth(readJson(evidenceDir, S16_FILE), expectedSha, evidenceDir),
  ];

  const byId = new Map(phases.map((phase) => [phase.id, phase]));
  const readyForS16 = (["S10", "S11", "S12", "S13", "S14", "S15"] as const).every(
    (id) => byId.get(id)?.state === "passed",
  );
  const certified = readyForS16 && byId.get("S16")?.state === "passed";

  return {
    schemaVersion: 1,
    candidateSha: expectedSha,
    evidenceDir,
    phases,
    readyForS16,
    certified,
    invalidEvidence: phases.filter((phase) => phase.state === "invalid").flatMap((phase) => phase.issues.map((issue) => `${phase.id}: ${issue}`)),
    missingEvidence: phases.filter((phase) => phase.state === "missing").map((phase) => phase.id),
  };
}
