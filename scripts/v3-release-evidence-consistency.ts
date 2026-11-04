/**
 * Cross-check release evidence against the complete success contract.
 *
 * These checks do not reproduce the expensive underlying local-Supabase
 * rehearsals. They reject contradictory, partial or malformed artifacts before
 * a release certifier can count a success flag as a successful release gate.
 */
type Evidence = Record<string, unknown>;

function record(value: unknown): Evidence | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Evidence
    : null;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function exactStrings(value: unknown, required: readonly string[]): boolean {
  return Array.isArray(value) && value.length === required.length &&
    required.every((expected, index) => value[index] === expected);
}

function includesAllUnique(value: unknown, required: readonly string[]): boolean {
  if (!Array.isArray(value) || !value.every(nonempty)) return false;
  const observed = new Set(value);
  return observed.size === value.length && required.every((item) => observed.has(item));
}

const S14_STAGES = [
  "stage-1-setup", "stage-2-delegation-onboarding", "stage-3-confirmations",
  "stage-4-entries", "stage-5-running-orders", "stage-6-jury",
  "stage-7-public-voting", "stage-8-results", "stage-9-publication",
  "stage-10-archive",
] as const;

const S14_EXTENSIONS = [
  "grand-final-qualifier-bridge", "grand-final-voting",
  "grand-final-results", "grand-final-publication",
] as const;

const S14_INVARIANTS = [
  "confirmation-no-effective-duplicates", "entry-valid-revision", "media-accepted-revision",
  "jury-single-final-ballot", "televote-canonical-ballot", "result-reproducible",
  "publication-final-version", "tasks-canonical", "notifications-reconcilable",
] as const;

const S14_FAILURES = [
  "network-after-commit", "db-timeout-before-commit", "duplicate-request",
  "worker-crash", "realtime-disconnect", "stale-client", "two-organizers",
  "supabase-outage",
] as const;

const S16_CATEGORIES = [
  ["canonical-ci", "s16-canonical-ci.json"],
  ["migration-rehearsal", "s16-migration-rehearsal.json"],
  ["authorization-security", "s16-authorization-security.json"],
  ["production-isolation", "s16-production-isolation.json"],
  ["system-hardening", "s16-system-hardening.json"],
  ["public-acceptance", "s16-public-acceptance.json"],
  ["organizer-acceptance", "s16-organizer-acceptance.json"],
  ["navigation-acceptance", "s16-navigation-acceptance.json"],
  ["accessibility", "s16-accessibility.json"],
  ["responsive-behavior", "s16-responsive-behavior.json"],
  ["full-contest-rehearsal", "s14-full-contest.json"],
  ["registry-zero-gap", "s15-zero-orphan.json"],
] as const;

export function releaseEvidenceConsistencyFailure(
  filename: string,
  evidence: Evidence,
): string | null {
  if (filename === "s14-full-contest.json" && evidence.passed === true) {
    if (evidence.partial !== false || evidence.runtimeFailure !== false) {
      return "s14-full-contest.json claims success with partial or runtime-failure state";
    }
    if (!exactStrings(evidence.completedStages, S14_STAGES) ||
        !exactStrings(evidence.pendingStages, [])) {
      return "s14-full-contest.json claims success without every ordered lifecycle stage";
    }
    if (!exactStrings(evidence.completedContestExtensions, S14_EXTENSIONS) ||
        !exactStrings(evidence.pendingContestExtensions, []) ||
        !exactStrings(evidence.blockedContestExtensions, [])) {
      return "s14-full-contest.json claims success without complete Grand Final extensions";
    }
    if (!includesAllUnique(evidence.implementedInvariants, S14_INVARIANTS) ||
        !includesAllUnique(evidence.implementedFailureInjections, S14_FAILURES)) {
      return "s14-full-contest.json omits required integrity or recovery rehearsal coverage";
    }
    const seed = record(evidence.seed);
    if (!seed || seed.editionCount !== 1 || seed.delegationCount !== 66 ||
        !nonnegativeInteger(seed.showCount) || seed.showCount < 3) {
      return "s14-full-contest.json lacks the bounded 66-delegation multi-show seed";
    }
    const identity = record(evidence.runIdentity);
    if (!identity || !nonempty(evidence.candidateSha) ||
        identity.candidateSha !== evidence.candidateSha ||
        !nonempty(identity.editionId) || !nonempty(identity.databaseFingerprint)) {
      return "s14-full-contest.json lacks exact-candidate and persistent-contest identity";
    }
    if (record(evidence.lifecycle)?.finalState !== "archived") {
      return "s14-full-contest.json does not prove the canonical Archive state";
    }
  }

  if (filename === "s15-zero-orphan.json" && evidence.zeroOrphans === true) {
    if (!nonnegativeInteger(evidence.schemaVersion) || evidence.schemaVersion < 4 ||
        !record(evidence.inventory)) {
      return "s15-zero-orphan.json claims zeroOrphans=true without the S15 inventory contract";
    }
    if (!Array.isArray(evidence.findings) || evidence.findings.length !== 0) {
      return "s15-zero-orphan.json claims zeroOrphans=true without an empty findings array";
    }
    const physical = record(evidence.physicalOwnership);
    if (!physical || physical.zeroOwnershipConflicts !== true) {
      return "s15-zero-orphan.json claims zeroOrphans=true without clean physical ownership";
    }
  }

  if (filename === "s16-certification.json" && evidence.certified === true) {
    if (evidence.schemaVersion !== 1 || !nonempty(evidence.candidateSha) ||
        !/^[0-9a-f]{40}$/.test(evidence.candidateSha) ||
        !Array.isArray(evidence.categories) ||
        evidence.categories.length !== S16_CATEGORIES.length) {
      return "s16-certification.json claims certification without the complete S16 category contract";
    }
    const rows = evidence.categories.map(record);
    if (rows.some((row) => !row)) {
      return "s16-certification.json contains malformed category evidence";
    }
    const seen = new Set<string>();
    for (const [id, evidenceFilename] of S16_CATEGORIES) {
      const matches = rows.filter((row) => row?.id === id);
      if (matches.length !== 1 || seen.has(id)) {
        return `s16-certification.json must contain exactly one ${id} release gate`;
      }
      seen.add(id);
      const row = matches[0];
      if (!row || row.evidenceFilename !== evidenceFilename ||
          row.passed !== true || row.evidenceCandidateSha !== evidence.candidateSha) {
        return `s16-certification.json has incomplete or stale ${id} gate evidence`;
      }
    }
  }

  if (filename === "security-advisor-classification.json" && evidence.releaseReady === true) {
    const counts = record(evidence.counts);
    const names = [
      "findings", "info", "warn", "error", "intentionalAndProven",
      "remediated", "releaseBlocking",
    ] as const;
    if (evidence.schemaVersion !== 1 || !nonempty(evidence.projectRef) ||
        !counts || !names.every((key) => nonnegativeInteger(counts[key])) ||
        counts.releaseBlocking !== 0) {
      return "security-advisor-classification.json claims releaseReady=true with an invalid classification contract";
    }
    if (!Array.isArray(evidence.findings) || evidence.findings.length !== counts.findings ||
        (counts.info as number) + (counts.warn as number) + (counts.error as number) !== counts.findings ||
        (counts.intentionalAndProven as number) + (counts.remediated as number) +
          (counts.releaseBlocking as number) !== counts.findings) {
      return "security-advisor-classification.json has inconsistent finding and disposition counts";
    }
    const ids = new Set<string>();
    const levels = { INFO: 0, WARN: 0, ERROR: 0 };
    const dispositions = { "intentional-and-proven": 0, remediated: 0 };
    for (const rawFinding of evidence.findings) {
      const finding = record(rawFinding);
      const disposition = record(finding?.disposition);
      if (!finding || !nonempty(finding.id) || ids.has(finding.id) ||
          !nonempty(finding.title) ||
          (finding.level !== "INFO" && finding.level !== "WARN" && finding.level !== "ERROR") ||
          !disposition || disposition.id !== finding.id ||
          (disposition.status !== "remediated" && disposition.status !== "intentional-and-proven") ||
          !nonempty(disposition.evidenceRef) || !nonempty(disposition.reason)) {
        return "security-advisor-classification.json claims releaseReady=true with an unproven, duplicated or unclassified finding";
      }
      ids.add(finding.id);
      levels[finding.level] += 1;
      dispositions[disposition.status] += 1;
    }
    if (levels.INFO !== counts.info || levels.WARN !== counts.warn || levels.ERROR !== counts.error ||
        dispositions["intentional-and-proven"] !== counts.intentionalAndProven ||
        dispositions.remediated !== counts.remediated) {
      return "security-advisor-classification.json reports counts that do not match the classified findings";
    }
  }

  return null;
}
