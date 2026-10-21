export type V3S16CertificationCategoryId =
  | "canonical-ci"
  | "migration-rehearsal"
  | "authorization-security"
  | "production-isolation"
  | "system-hardening"
  | "public-acceptance"
  | "organizer-acceptance"
  | "navigation-acceptance"
  | "accessibility"
  | "responsive-behavior"
  | "full-contest-rehearsal"
  | "registry-zero-gap";

export type V3S16CertificationCategory = {
  id: V3S16CertificationCategoryId;
  evidenceFilename: string;
  passField: string;
};

/**
 * Canonical Session-5 S16 release-certification categories.
 *
 * The session plan defines a minimum evidence set, while the canonical System
 * plan additionally requires S10-S13 to complete before final certification.
 * `system-hardening` is the QA envelope for those exact-SHA phase proofs. A
 * category may only be removed or renamed by changing the canonical release
 * specification. Keeping the set executable prevents a hand-written
 * `certified: true` artifact from silently omitting a release prerequisite.
 */
export const V3_S16_CERTIFICATION_CATEGORIES = [
  { id: "canonical-ci", evidenceFilename: "s16-canonical-ci.json", passField: "passed" },
  {
    id: "migration-rehearsal",
    evidenceFilename: "s16-migration-rehearsal.json",
    passField: "passed",
  },
  {
    id: "authorization-security",
    evidenceFilename: "s16-authorization-security.json",
    passField: "passed",
  },
  {
    id: "production-isolation",
    evidenceFilename: "s16-production-isolation.json",
    passField: "passed",
  },
  {
    id: "system-hardening",
    evidenceFilename: "s16-system-hardening.json",
    passField: "passed",
  },
  { id: "public-acceptance", evidenceFilename: "s16-public-acceptance.json", passField: "passed" },
  {
    id: "organizer-acceptance",
    evidenceFilename: "s16-organizer-acceptance.json",
    passField: "passed",
  },
  {
    id: "navigation-acceptance",
    evidenceFilename: "s16-navigation-acceptance.json",
    passField: "passed",
  },
  { id: "accessibility", evidenceFilename: "s16-accessibility.json", passField: "passed" },
  {
    id: "responsive-behavior",
    evidenceFilename: "s16-responsive-behavior.json",
    passField: "passed",
  },
  {
    id: "full-contest-rehearsal",
    evidenceFilename: "s14-full-contest.json",
    passField: "passed",
  },
  {
    id: "registry-zero-gap",
    evidenceFilename: "s15-zero-orphan.json",
    passField: "zeroOrphans",
  },
] as const satisfies readonly V3S16CertificationCategory[];

export type V3S16CertificationCategoryEvidence = {
  id: V3S16CertificationCategoryId;
  evidenceFilename: string;
  evidenceCandidateSha: string;
  passed: boolean;
};

export type V3S16CertificationEvidence = {
  schemaVersion: 1;
  candidateSha: string;
  certified: boolean;
  categories: V3S16CertificationCategoryEvidence[];
};

const SHA_PATTERN = /^[0-9a-f]{40}$/;

export function validateV3S16CertificationEvidence(
  value: unknown,
  expectedCandidateSha: string,
): string[] {
  const issues: string[] = [];
  const expectedSha = expectedCandidateSha.trim().toLowerCase();

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["S16 certification evidence must be a JSON object"];
  }

  const evidence = value as Record<string, unknown>;
  if (evidence.schemaVersion !== 1) issues.push("S16 certification schemaVersion must be 1");

  const candidateSha =
    typeof evidence.candidateSha === "string" ? evidence.candidateSha.trim().toLowerCase() : "";
  if (!SHA_PATTERN.test(candidateSha)) issues.push("S16 certification candidateSha must be 40 lowercase hex characters");
  else if (candidateSha !== expectedSha) {
    issues.push(`S16 certification candidateSha ${candidateSha} does not match exact candidate ${expectedSha}`);
  }

  if (evidence.certified !== true) issues.push("S16 certification does not prove certified=true");

  if (!Array.isArray(evidence.categories)) {
    issues.push("S16 certification categories must be an array");
    return issues;
  }

  const categories = evidence.categories as Array<Record<string, unknown>>;

  for (const expected of V3_S16_CERTIFICATION_CATEGORIES) {
    const matches = categories.filter((item) => item?.id === expected.id);
    if (matches.length !== 1) {
      issues.push(`S16 certification must contain exactly one ${expected.id} category; found ${matches.length}`);
      continue;
    }

    const item = matches[0];
    if (!item) {
      issues.push(`S16 certification could not resolve ${expected.id} category after uniqueness check`);
      continue;
    }
    if (item.evidenceFilename !== expected.evidenceFilename) {
      issues.push(
        `S16 ${expected.id} evidence filename must be ${expected.evidenceFilename}, got ${String(item.evidenceFilename)}`,
      );
    }
    if (item.passed !== true) issues.push(`S16 ${expected.id} category does not prove passed=true`);

    const evidenceSha =
      typeof item.evidenceCandidateSha === "string"
        ? item.evidenceCandidateSha.trim().toLowerCase()
        : "";
    if (!SHA_PATTERN.test(evidenceSha)) {
      issues.push(`S16 ${expected.id} evidenceCandidateSha is not a valid 40-character SHA`);
    } else if (evidenceSha !== expectedSha) {
      issues.push(`S16 ${expected.id} certifies ${evidenceSha}, not exact candidate ${expectedSha}`);
    }
  }

  for (const item of categories) {
    const id = typeof item?.id === "string" ? item.id : "";
    if (!V3_S16_CERTIFICATION_CATEGORIES.some((expected) => expected.id === id)) {
      issues.push(`S16 certification contains unknown category: ${id || "<missing>"}`);
    }
  }

  if (categories.length !== V3_S16_CERTIFICATION_CATEGORIES.length) {
    issues.push(
      `S16 certification must contain exactly ${V3_S16_CERTIFICATION_CATEGORIES.length} canonical categories; found ${categories.length}`,
    );
  }

  return issues;
}
