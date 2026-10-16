import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SHA = /^[0-9a-f]{40}$/;
const allowedLevels = new Set(["INFO", "WARN", "ERROR"]);
const allowedStatuses = new Set(["intentional-and-proven", "remediated", "release-blocking"]);

type Finding = {
  id: string;
  level: "INFO" | "WARN" | "ERROR";
  title: string;
  object?: string;
  detail?: string;
};

type Snapshot = { schemaVersion: 1; projectRef: string; findings: Finding[] };
type Disposition = {
  id: string;
  status: "intentional-and-proven" | "remediated" | "release-blocking";
  evidenceRef: string;
  reason: string;
};
type Dispositions = { schemaVersion: 1; projectRef: string; dispositions: Disposition[] };

function fail(message: string): never {
  throw new Error(`[v3-security-evidence] ${message}`);
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    fail(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function checkoutSha(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
}

const snapshotPath = process.env.V3_SECURITY_ADVISOR_SNAPSHOT;
const dispositionsPath = process.env.V3_SECURITY_ADVISOR_DISPOSITIONS;
const outputPath = process.env.V3_SECURITY_ADVISOR_OUTPUT ?? "v3-release-evidence/security-advisor-classification.json";
if (!snapshotPath) fail("V3_SECURITY_ADVISOR_SNAPSHOT is required");
if (!dispositionsPath) fail("V3_SECURITY_ADVISOR_DISPOSITIONS is required");

const head = checkoutSha();
const candidateSha = (process.env.V3_CANDIDATE_SHA ?? head).trim().toLowerCase();
if (!SHA.test(candidateSha)) fail("V3_CANDIDATE_SHA must be a full 40-character lowercase commit SHA");
if (candidateSha !== head) fail(`candidate ${candidateSha} does not match checked-out HEAD ${head}`);

const snapshot = readJson<Snapshot>(snapshotPath);
const dispositions = readJson<Dispositions>(dispositionsPath);
if (snapshot.schemaVersion !== 1 || dispositions.schemaVersion !== 1) fail("unsupported input schema version");
if (!snapshot.projectRef || snapshot.projectRef !== dispositions.projectRef) fail("snapshot/disposition projectRef mismatch");
if (!Array.isArray(snapshot.findings) || !Array.isArray(dispositions.dispositions)) fail("invalid findings/dispositions arrays");

const findingIds = new Set<string>();
for (const finding of snapshot.findings) {
  if (!finding.id?.trim()) fail("every advisor finding requires a stable id");
  if (findingIds.has(finding.id)) fail(`duplicate advisor finding id ${finding.id}`);
  findingIds.add(finding.id);
  if (!allowedLevels.has(finding.level)) fail(`invalid level for ${finding.id}: ${finding.level}`);
  if (!finding.title?.trim()) fail(`advisor finding ${finding.id} requires a title`);
}

const dispositionById = new Map<string, Disposition>();
for (const disposition of dispositions.dispositions) {
  if (!findingIds.has(disposition.id)) fail(`disposition references absent finding ${disposition.id}`);
  if (dispositionById.has(disposition.id)) fail(`duplicate disposition for ${disposition.id}`);
  if (!allowedStatuses.has(disposition.status)) fail(`invalid disposition status for ${disposition.id}`);
  if (!disposition.evidenceRef?.trim()) fail(`disposition ${disposition.id} requires durable evidenceRef`);
  if (!disposition.reason?.trim()) fail(`disposition ${disposition.id} requires a reason`);
  dispositionById.set(disposition.id, disposition);
}

const unclassified = snapshot.findings.filter((finding) => !dispositionById.has(finding.id));
if (unclassified.length) fail(`unclassified advisor findings: ${unclassified.map((item) => item.id).join(", ")}`);

const classified = snapshot.findings.map((finding) => ({ ...finding, disposition: dispositionById.get(finding.id)! }));
const releaseBlocking = classified.filter((item) => item.disposition.status === "release-blocking");
const releaseReady = releaseBlocking.length === 0;
const report = {
  schemaVersion: 1,
  candidateSha,
  projectRef: snapshot.projectRef,
  releaseReady,
  counts: {
    findings: classified.length,
    info: classified.filter((item) => item.level === "INFO").length,
    warn: classified.filter((item) => item.level === "WARN").length,
    error: classified.filter((item) => item.level === "ERROR").length,
    intentionalAndProven: classified.filter((item) => item.disposition.status === "intentional-and-proven").length,
    remediated: classified.filter((item) => item.disposition.status === "remediated").length,
    releaseBlocking: releaseBlocking.length,
  },
  findings: classified,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`V3 security advisor classification: ${releaseReady ? "RELEASE-READY" : "BLOCKED"} (${classified.length} findings, ${releaseBlocking.length} blockers)\n`);
if (process.argv.includes("--require-release-ready") && !releaseReady) process.exit(1);
