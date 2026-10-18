import {
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_PUBLIC_CAPABILITIES,
} from "./v3-capability-registry";

export type V3S16SurfaceCategory =
  | "public-acceptance"
  | "organizer-acceptance"
  | "navigation-acceptance"
  | "accessibility"
  | "responsive-behavior";

export type V3S16SurfaceEvidenceCase = {
  id: string;
  passed: boolean;
  evidence: readonly string[];
};

export type V3S16SurfaceEvidence = {
  schemaVersion: 1;
  candidateSha: string;
  category: V3S16SurfaceCategory;
  passed: boolean;
  cases: readonly V3S16SurfaceEvidenceCase[];
  provenance: {
    kind: "github-actions" | "manual-device" | "hybrid";
    source: string;
  };
};

const SHA_RE = /^[0-9a-f]{40}$/;

export const V3_S16_NAVIGATION_REQUIRED_CASES = [
  "standard-phone",
  "tiny-phone",
  "large-text",
  "reduced-motion",
  "reduced-transparency",
  "standalone-pwa",
  "browser-mode",
  "orientation-change",
  "keyboard-open",
  "scroll-compact-state",
  "drag-interaction",
  "edge-drag",
  "focused-task-shell",
] as const;

export const V3_S16_ACCESSIBILITY_REQUIRED_CASES = [
  "keyboard",
  "large-text",
  "reduced-motion",
  "reduced-transparency",
] as const;

export const V3_S16_RESPONSIVE_REQUIRED_CASES = [
  "standard-phone",
  "tiny-phone",
  "orientation-change",
  "keyboard-open",
  "standalone-pwa",
  "browser-mode",
] as const;

export function requiredV3S16PublicAcceptanceCases() {
  return [
    ...new Set(
      V3_PUBLIC_CAPABILITIES.filter((item) => item.specificationStatus !== "retired").map(
        (item) => item.acceptanceScenarioId,
      ),
    ),
  ].sort();
}

export function requiredV3S16OrganizerAcceptanceCases() {
  return V3_ORGANIZER_CAPABILITY_REGISTRY.filter((item) => item.migrationStatus !== "retired")
    .map((item) => item.legacyId)
    .sort();
}

export function requiredV3S16SurfaceCases(category: V3S16SurfaceCategory): readonly string[] {
  if (category === "public-acceptance") return requiredV3S16PublicAcceptanceCases();
  if (category === "organizer-acceptance") return requiredV3S16OrganizerAcceptanceCases();
  if (category === "navigation-acceptance") return V3_S16_NAVIGATION_REQUIRED_CASES;
  if (category === "accessibility") return V3_S16_ACCESSIBILITY_REQUIRED_CASES;
  return V3_S16_RESPONSIVE_REQUIRED_CASES;
}

export function validateV3S16SurfaceEvidence(
  value: unknown,
  category: V3S16SurfaceCategory,
  expectedCandidateSha: string,
): string[] {
  const issues: string[] = [];
  const expectedSha = expectedCandidateSha.trim().toLowerCase();

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [`${category}: evidence must be a JSON object`];
  }

  const evidence = value as Record<string, unknown>;
  if (evidence.schemaVersion !== 1) issues.push(`${category}: schemaVersion must be 1`);
  if (evidence.category !== category) {
    issues.push(`${category}: category field is ${String(evidence.category)}, expected ${category}`);
  }

  const candidateSha =
    typeof evidence.candidateSha === "string" ? evidence.candidateSha.trim().toLowerCase() : "";
  if (!SHA_RE.test(candidateSha)) issues.push(`${category}: candidateSha must be 40 lowercase hex characters`);
  else if (candidateSha !== expectedSha) {
    issues.push(`${category}: evidence certifies ${candidateSha}, not exact candidate ${expectedSha}`);
  }

  if (evidence.passed !== true) issues.push(`${category}: evidence does not prove passed=true`);
  if (!Array.isArray(evidence.cases)) {
    issues.push(`${category}: cases must be an array`);
    return issues;
  }

  const cases = evidence.cases as Array<Record<string, unknown>>;
  const ids = cases.map((item) => (typeof item?.id === "string" ? item.id : ""));
  const duplicateIds = [...new Set(ids.filter((id, index) => id && ids.indexOf(id) !== index))];
  for (const id of duplicateIds) issues.push(`${category}: duplicate acceptance case ${id}`);

  const required = requiredV3S16SurfaceCases(category);
  for (const id of required) {
    const matches = cases.filter((item) => item?.id === id);
    if (matches.length !== 1) {
      issues.push(`${category}: required acceptance case ${id} appears ${matches.length} times`);
      continue;
    }
    const item = matches[0];
    if (item.passed !== true) issues.push(`${category}: required acceptance case ${id} did not pass`);
    if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
      issues.push(`${category}: required acceptance case ${id} has no evidence references`);
    } else if (item.evidence.some((reference) => typeof reference !== "string" || !reference.trim())) {
      issues.push(`${category}: required acceptance case ${id} has an empty evidence reference`);
    }
  }

  if (!evidence.provenance || typeof evidence.provenance !== "object" || Array.isArray(evidence.provenance)) {
    issues.push(`${category}: provenance is required`);
  } else {
    const provenance = evidence.provenance as Record<string, unknown>;
    if (!["github-actions", "manual-device", "hybrid"].includes(String(provenance.kind))) {
      issues.push(`${category}: provenance.kind is unsupported`);
    }
    if (typeof provenance.source !== "string" || !provenance.source.trim()) {
      issues.push(`${category}: provenance.source is required`);
    }
  }

  if (category === "public-acceptance") {
    const unfinished = V3_PUBLIC_CAPABILITIES.filter(
      (item) => !["cutover", "retired"].includes(item.specificationStatus),
    );
    if (unfinished.length) {
      issues.push(`${category}: ${unfinished.length} Public capabilities are not cutover/retired`);
    }
  }

  if (category === "organizer-acceptance") {
    const unfinished = V3_ORGANIZER_CAPABILITY_REGISTRY.filter(
      (item) => !["cutover", "retired"].includes(item.migrationStatus),
    );
    if (unfinished.length) {
      issues.push(`${category}: ${unfinished.length} Organizer capabilities are not cutover/retired`);
    }
  }

  return issues;
}
