export const V3_JURY_SHARE_CERTIFICATION_CATEGORIES = [
  "focused_integration",
  "authorization_security",
  "historical_identity",
  "result_correction",
  "visual_golden",
  "mobile_pwa",
  "production_isolation",
  "exact_sha",
] as const;

export type V3JuryShareCertificationCategory =
  (typeof V3_JURY_SHARE_CERTIFICATION_CATEGORIES)[number];

export const V3_JURY_SHARE_REQUIRED_ASSERTIONS = {
  focused_integration: [
    "cross_side_integration",
    "canonical_projection",
    "results_share_entry",
    "me_history_share_entry",
    "public_country_share_policy",
    "render_output",
  ],
  authorization_security: [
    "public_published_allowed",
    "hidden_rejected",
    "unpublished_rejected",
    "wrong_delegation_rejected",
    "cross_edition_rejected",
    "revoked_capability_rejected",
  ],
  historical_identity: [
    "historical_ballot",
    "historical_name",
    "historical_flag",
    "archived_default_theme",
    "archived_edition_theme_when_available",
    "archived_liquid_glass",
    "unprovable_history_unavailable",
  ],
  result_correction: [
    "published_version_change_invalidates_render",
    "corrected_version_produces_new_render",
  ],
  visual_golden: [
    "default_ordinary_country_names",
    "default_long_country",
    "default_dark_flag",
    "default_bright_flag",
    "edition_valid",
    "edition_missing_handled",
    "edition_invalid_handled",
    "edition_top_fade_artwork",
    "edition_full_background_artwork",
    "edition_extreme_artwork_brightness",
    "edition_custom_scoreboard",
    "liquid_glass_light_artwork_contamination",
    "liquid_glass_dark_background",
    "liquid_glass_complex_flags",
    "typography_hanvor",
    "typography_aekalin",
    "typography_long_multi_word_country",
    "typography_mixed_accented_characters",
    "safe_area",
  ],
  mobile_pwa: [
    "iphone_open_share_sheet",
    "iphone_switch_theme",
    "iphone_generate",
    "native_share_supported",
    "file_share_fallback",
    "iphone_save_png",
    "desktop_generate",
    "desktop_save_png",
    "desktop_save_jpeg",
    "desktop_no_native_share_dependency",
    "reduced_motion",
    "large_text",
  ],
  production_isolation: [
    "local_or_isolated_only",
    "hosted_supabase_refused",
    "bounded_deterministic_seed",
    "no_bulk_historical_production_scan",
  ],
  exact_sha: ["all_evidence_same_candidate", "candidate_head_verified"],
} as const satisfies Record<V3JuryShareCertificationCategory, readonly string[]>;

export type V3JuryShareCertificationEvidence = {
  schemaVersion: 1;
  category: V3JuryShareCertificationCategory;
  candidateSha: string;
  passed: boolean;
  assertions: readonly string[];
  issues: readonly string[];
  source: {
    workflow: string;
    runId: number;
    runAttempt: number;
    headSha: string;
    artifactSha256: string;
  };
  certificationClaim: false;
};

export type V3JuryShareCertificationReadiness = {
  schemaVersion: 1;
  component: "results.jury_share_card";
  candidateSha: string | null;
  passed: boolean;
  requiredCategories: readonly V3JuryShareCertificationCategory[];
  observedCategories: readonly V3JuryShareCertificationCategory[];
  missingCategories: readonly V3JuryShareCertificationCategory[];
  issues: readonly string[];
  certificationClaim: false;
};

type UnknownRecord = Record<string, unknown>;

const SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const CATEGORY_SET = new Set<string>(V3_JURY_SHARE_CERTIFICATION_CATEGORIES);

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function exactSha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return SHA_RE.test(normalized) ? normalized : null;
}

function exactSha256(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return SHA256_RE.test(normalized) ? normalized : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return value.map((item) => item.trim()).filter(Boolean);
}

function category(value: unknown): V3JuryShareCertificationCategory | null {
  return typeof value === "string" && CATEGORY_SET.has(value)
    ? (value as V3JuryShareCertificationCategory)
    : null;
}

/**
 * QA-owned component readiness gate for Jury Share Cards.
 *
 * This intentionally cannot certify Solaris V3. It only proves whether all
 * canonical JSC-12 evidence categories exist, pass, belong to the same exact
 * candidate SHA, retain CI artifact provenance, and cover the assertions the
 * Jury Share specification requires. S16 remains the only final release
 * certification boundary.
 */
export function assessV3JuryShareCertificationReadiness(
  evidenceValues: readonly unknown[],
  expectedCandidateShaValue: unknown,
): V3JuryShareCertificationReadiness {
  const issues: string[] = [];
  const expectedCandidateSha = exactSha(expectedCandidateShaValue);
  const observed = new Map<V3JuryShareCertificationCategory, UnknownRecord>();

  if (!expectedCandidateSha) {
    issues.push("expected candidate SHA must be exactly 40 hexadecimal characters");
  }

  for (const [index, value] of evidenceValues.entries()) {
    const record = asRecord(value);
    if (!record) {
      issues.push(`evidence[${index}] must be a JSON object`);
      continue;
    }

    const evidenceCategory = category(record.category);
    if (!evidenceCategory) {
      issues.push(`evidence[${index}] has an unknown certification category`);
      continue;
    }

    if (observed.has(evidenceCategory)) {
      issues.push(`duplicate Jury Share evidence category: ${evidenceCategory}`);
      continue;
    }
    observed.set(evidenceCategory, record);

    if (record.schemaVersion !== 1) {
      issues.push(`${evidenceCategory}: schemaVersion must be 1`);
    }
    if (record.certificationClaim !== false) {
      issues.push(`${evidenceCategory}: component evidence must not claim final certification`);
    }
    if (record.passed !== true) {
      issues.push(`${evidenceCategory}: evidence must report passed=true`);
    }

    const candidateSha = exactSha(record.candidateSha);
    if (!candidateSha) {
      issues.push(`${evidenceCategory}: candidateSha must be an exact SHA`);
    } else if (expectedCandidateSha && candidateSha !== expectedCandidateSha) {
      issues.push(
        `${evidenceCategory}: evidence belongs to ${candidateSha}, not exact candidate ${expectedCandidateSha}`,
      );
    }

    const evidenceIssues = stringArray(record.issues);
    if (!evidenceIssues) {
      issues.push(`${evidenceCategory}: issues must be a string array`);
    } else if (evidenceIssues.length > 0) {
      issues.push(`${evidenceCategory}: evidence still has ${evidenceIssues.length} unresolved issue(s)`);
    }

    const assertions = stringArray(record.assertions);
    if (!assertions) {
      issues.push(`${evidenceCategory}: assertions must be a string array`);
    } else {
      const assertionSet = new Set(assertions);
      for (const required of V3_JURY_SHARE_REQUIRED_ASSERTIONS[evidenceCategory]) {
        if (!assertionSet.has(required)) {
          issues.push(`${evidenceCategory}: missing required assertion ${required}`);
        }
      }
    }

    const source = asRecord(record.source);
    if (!source) {
      issues.push(`${evidenceCategory}: source provenance must be present`);
      continue;
    }

    if (!nonEmptyString(source.workflow)) {
      issues.push(`${evidenceCategory}: source workflow must be present`);
    }
    if (!positiveInteger(source.runId)) {
      issues.push(`${evidenceCategory}: source runId must be a positive integer`);
    }
    if (!positiveInteger(source.runAttempt)) {
      issues.push(`${evidenceCategory}: source runAttempt must be a positive integer`);
    }

    const sourceHeadSha = exactSha(source.headSha);
    if (!sourceHeadSha) {
      issues.push(`${evidenceCategory}: source headSha must be an exact SHA`);
    } else if (expectedCandidateSha && sourceHeadSha !== expectedCandidateSha) {
      issues.push(
        `${evidenceCategory}: source run belongs to ${sourceHeadSha}, not exact candidate ${expectedCandidateSha}`,
      );
    }

    if (!exactSha256(source.artifactSha256)) {
      issues.push(`${evidenceCategory}: source artifactSha256 must be a 64-character SHA-256 digest`);
    }
  }

  const observedCategories = V3_JURY_SHARE_CERTIFICATION_CATEGORIES.filter((item) =>
    observed.has(item),
  );
  const missingCategories = V3_JURY_SHARE_CERTIFICATION_CATEGORIES.filter(
    (item) => !observed.has(item),
  );

  for (const missing of missingCategories) {
    issues.push(`missing Jury Share certification evidence category: ${missing}`);
  }

  return {
    schemaVersion: 1,
    component: "results.jury_share_card",
    candidateSha: expectedCandidateSha,
    passed: issues.length === 0,
    requiredCategories: V3_JURY_SHARE_CERTIFICATION_CATEGORIES,
    observedCategories,
    missingCategories,
    issues,
    certificationClaim: false,
  };
}
