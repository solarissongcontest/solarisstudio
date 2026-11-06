#!/usr/bin/env node
/**
 * Exact-source S15 release-risk review. Records evidence-backed owner decisions
 * without changing canonical S15 inventory or certifying any release.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const RISKS = new Set(["hard_blocker", "conditional_blocker", "tracked_v3_debt", "obsolete_replaced"]);
const GITHUB_EVIDENCE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:issues|pull|commit|blob)\/[A-Za-z0-9_./#-]+$/;
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const key = (lane, id) => lane + "\u0000" + id;

export function assessS15ReleaseRisk(triage, candidateSha, review = null, rawS15 = null) {
  if (!SHA.test(candidateSha)) throw new Error("An exact lowercase S15 candidate SHA is required");
  if (!triage || triage.schemaVersion !== 1 || triage.candidateSha !== candidateSha ||
      triage.certificationClaim !== false || triage.releaseCertified !== false ||
      !DIGEST.test(triage.sourceSha256 || "") ||
      !Array.isArray(triage.cutovers) || !Array.isArray(triage.structuralFindings) ||
      !Number.isInteger(triage.cutoverCount) || triage.cutoverCount !== triage.cutovers.length) {
    throw new Error("S15 owner triage must be complete, exact-SHA-bound and uncertified");
  }
  if (rawS15 !== null) {
    if (createHash("sha256").update(rawS15).digest("hex") !== triage.sourceSha256)
      throw new Error("S15 owner triage digest does not match canonical source evidence");
    let canonical;
    try { canonical = JSON.parse(rawS15.toString()); }
    catch { throw new Error("Canonical S15 source must be valid JSON"); }
    if (canonical.candidateSha !== candidateSha || !Array.isArray(canonical.findings))
      throw new Error("Canonical S15 source lacks exact SHA or complete findings");
    const reported = [...triage.cutovers.map((r) => r.sourceFinding), ...triage.structuralFindings];
    if (reported.length !== canonical.findings.length ||
        new Set(reported).size !== reported.length ||
        canonical.findings.some((finding) => !reported.includes(finding)))
      throw new Error("S15 review triage does not reproduce every canonical finding");
    if (canonical.physicalOwnership?.zeroOwnershipConflicts !== triage.physicalOwnershipConflictFree)
      throw new Error("S15 triage contradicts canonical physical ownership status");
  }
  for (const finding of triage.structuralFindings) {
    if (typeof finding !== "string" || !finding.trim() ||
        /^(?:PUBLIC|ORGANIZER)_CUTOVER_UNRESOLVED(?:\s|$)/.test(finding)) {
      throw new Error("S15 structural review cannot hide canonical cutover findings");
    }
  }
  const current = new Map();
  for (const row of triage.cutovers) {
    if (!row || !["public", "organizer"].includes(row.lane) ||
        !nonempty(row.capabilityId) || !nonempty(row.owner) || !nonempty(row.sourceFinding) ||
        row.decision !== "unreviewed" || row.dispositionEvidence !== null) {
      throw new Error("Cutovers must preserve their canonical unreviewed owner and finding");
    }
    const canonicalOwner = row.lane === "public" ? "Chat 2 / Public" : "Chat 3 / Organizer";
    const canonicalFinding = (row.lane === "public" ? "PUBLIC" : "ORGANIZER") +
      "_CUTOVER_UNRESOLVED " + row.capabilityId + ":" + row.registryStatus;
    if (row.owner !== canonicalOwner ||
        !/^[^:\s]+$/.test(row.registryStatus) || /\s/.test(row.capabilityId) ||
        row.sourceFinding !== canonicalFinding) {
      throw new Error("S15 cutover metadata contradicts canonical lane, owner or finding");
    }
    const id = key(row.lane, row.capabilityId);
    if (current.has(id)) throw new Error("Duplicate S15 cutover: " + id);
    current.set(id, row);
  }

  if (review !== null && (!review || review.schemaVersion !== 1 ||
      review.candidateSha !== candidateSha ||
      review.sourceS15Sha256 !== triage.sourceSha256 ||
      !Array.isArray(review.decisions))) {
    throw new Error("Owner review must bind to the exact candidate and S15 source digest");
  }
  const approved = new Map();
  for (const item of review?.decisions ?? []) {
    if (!item || !["public", "organizer"].includes(item.lane) || !nonempty(item.capabilityId))
      throw new Error("Review entry missing exact cutover identity");
    const id = key(item.lane, item.capabilityId);
    const original = current.get(id);
    if (!original || approved.has(id)) throw new Error("Unknown or duplicated S15 review identity: " + id);
    if (item.owner !== original.owner || item.sourceFinding !== original.sourceFinding ||
        !RISKS.has(item.releaseRisk)) throw new Error("Review contradicts canonical S15 owner/finding/risk vocabulary");
    if (!nonempty(item.reviewer) || !nonempty(item.reason) || item.reason.trim().length < 24 ||
        !Array.isArray(item.evidenceUrls) || !item.evidenceUrls.length ||
        item.evidenceUrls.some((url) => typeof url !== "string" || !GITHUB_EVIDENCE.test(url))) {
      throw new Error("Risk review requires a named reviewer, specific reason and GitHub evidence: " + id);
    }
    if (item.releaseRisk === "conditional_blocker" &&
        (!nonempty(item.releaseScope) || typeof item.requiredForRelease !== "boolean" ||
         (item.requiredForRelease === false &&
          (item.featureDisabledOrUnreachable !== true || item.cannotCorruptCanonicalState !== true ||
           !nonempty(item.exclusionEvidence))))) {
      throw new Error("Conditional risk needs release scope and evidence for exclusion: " + id);
    }
    if (item.releaseRisk === "tracked_v3_debt" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(item.reviewBy || "") ||
         !nonempty(item.launchExclusionRationale))) {
      throw new Error("Tracked debt requires review date and explicit non-launch rationale: " + id);
    }
    if (item.releaseRisk === "obsolete_replaced" && !nonempty(item.replacementOrRetirement))
      throw new Error("Obsolete status requires explicit replacement or retirement: " + id);
    approved.set(id, item);
  }

  const rows = triage.cutovers.map((source) => {
    const classified = approved.get(key(source.lane, source.capabilityId));
    return {
      lane: source.lane, owner: source.owner, capabilityId: source.capabilityId,
      registryStatus: source.registryStatus, sourceFinding: source.sourceFinding,
      releaseRisk: classified?.releaseRisk ?? "unreviewed",
      reviewer: classified?.reviewer ?? null,
      evidenceUrls: classified?.evidenceUrls ?? [],
      requiredForRelease: classified?.releaseRisk === "conditional_blocker" ? classified.requiredForRelease : null,
    };
  });
  const count = (risk) => rows.filter((row) => row.releaseRisk === risk).length;
  return {
    schemaVersion: 1, candidateSha, sourceS15Sha256: triage.sourceSha256,
    structuralFindings: [...triage.structuralFindings],
    physicalOwnershipConflictFree: triage.physicalOwnershipConflictFree === true,
    cutoverCount: rows.length,
    counts: {
      hardBlockers: count("hard_blocker"),
      conditionalBlockers: count("conditional_blocker"),
      requiredConditionalBlockers: rows.filter((r) => r.releaseRisk === "conditional_blocker" && r.requiredForRelease === true).length,
      trackedV3Debt: count("tracked_v3_debt"),
      obsoleteReplaced: count("obsolete_replaced"),
      unreviewed: count("unreviewed"),
    },
    decisionsRecorded: approved.size, rows,
    certificationClaim: false, releaseCertified: false, releaseDecision: "not_assessed",
    caveat: "Recorded owner reviews are not release approval; original S15 and final S16 gates are unchanged",
  };
}

/**
 * Owner-review handoff generated from the exact checked-out S15 triage.
 * Nothing in pendingCutovers counts as a decision or release approval.
 */
export function s15OwnerReviewTemplate(report) {
  return {
    schemaVersion: 1,
    candidateSha: report.candidateSha,
    sourceS15Sha256: report.sourceS15Sha256,
    decisions: [],
    pendingCutovers: report.rows.map((row) => ({
      lane: row.lane, capabilityId: row.capabilityId, owner: row.owner,
      sourceFinding: row.sourceFinding, releaseRisk: null, reviewer: null,
      reason: null, evidenceUrls: [],
    })),
    instructions: "Move a pending row to decisions only after adding real risk, named reviewer, specific reason and relevant GitHub evidence. Unreviewed risks remain unknown. This is never release certification.",
    certificationClaim: false,
  };
}

const safe = (value) => String(value).replaceAll("|", "/").replaceAll("\r", " ").replaceAll("\n", " ");
export function s15ReleaseRiskMarkdown(report) {
  const lines = [
    "# S15 risk-review inventory (NOT release certification)", "",
    "Exact source SHA: " + report.candidateSha,
    "S15 source digest: " + report.sourceS15Sha256, "",
    "- Hard blockers: " + report.counts.hardBlockers,
    "- Conditional blockers: " + report.counts.conditionalBlockers,
    "- Conditional blockers required for this release: " + report.counts.requiredConditionalBlockers,
    "- Tracked V3 debt: " + report.counts.trackedV3Debt,
    "- Obsolete/replaced: " + report.counts.obsoleteReplaced,
    "- Unreviewed (UNKNOWN risk): " + report.counts.unreviewed,
    "- Structural findings: " + report.structuralFindings.length, "",
    "Unknown is not non-blocking. This diagnostic never changes S15 source or certifies V3.", "",
    "| Owner | Capability | Registry state | Risk classification | Reviewer |",
    "| --- | --- | --- | --- | --- |"
  ];
  for (const row of report.rows) {
    lines.push("| " + [row.owner, row.capabilityId, row.registryStatus, row.releaseRisk, row.reviewer || "none"].map(safe).join(" | ") + " |");
  }
  if (!report.rows.length) lines.push("| none | none | none | none | none |");
  return lines.join("\n") + "\n";
}

export function runCli(args = process.argv.slice(2)) {
  if (args.length % 2) throw new Error("Usage: --triage <file> --s15 <file> --sha <SHA> --output-dir <dir> [--decisions <file>]");
  const options = new Map();
  const allowed = new Set(["--triage", "--s15", "--sha", "--output-dir", "--decisions"]);
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]) || options.has(args[i]) || !args[i+1]) throw new Error("Unknown, repeated or empty S15 review option");
    options.set(args[i], args[i+1]);
  }
  for (const flag of ["--triage", "--s15", "--sha", "--output-dir"]) {
    if (!options.get(flag)) throw new Error("Missing required S15 review option " + flag);
  }
  const triage = JSON.parse(readFileSync(resolve(options.get("--triage")), "utf8"));
  const source = readFileSync(resolve(options.get("--s15")));
  const decisions = options.has("--decisions")
    ? JSON.parse(readFileSync(resolve(options.get("--decisions")), "utf8"))
    : null;
  const report = assessS15ReleaseRisk(triage, options.get("--sha"), decisions, source);
  const dir = resolve(options.get("--output-dir"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "s15-release-risk-review.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(resolve(dir, "s15-release-risk-review.md"), s15ReleaseRiskMarkdown(report));
  writeFileSync(resolve(dir, "s15-release-risk-review.template.json"), JSON.stringify(s15OwnerReviewTemplate(report), null, 2) + "\n");
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runCli();
    console.log("S15 review: " + result.decisionsRecorded + " recorded decisions; " +
      result.counts.unreviewed + " still unreviewed; NOT certification");
  } catch (error) {
    console.error("S15 release-risk review failed: " + String(error.message));
    process.exitCode = 1;
  }
}
