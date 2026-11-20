export type OrganizerAcceptanceEvidencePayload = {
  id: string;
  tester_name: string;
  device: string;
  browser: unknown;
  familiarity: unknown;
  answers: unknown;
  bug_reports: unknown;
  screenshot_paths: readonly string[];
  form_version: number;
};

export type OrganizerAcceptanceEvidenceRow = OrganizerAcceptanceEvidencePayload;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isOrganizerAcceptanceSubmissionId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

/**
 * A retry may accept an existing row only when the exact stable submission
 * identity points at the same reviewed semantic evidence. Telemetry such as
 * user-agent is deliberately excluded from the semantic comparison.
 */
export function organizerAcceptanceEvidenceMatches(
  stored: OrganizerAcceptanceEvidenceRow | null | undefined,
  expected: OrganizerAcceptanceEvidencePayload,
) {
  if (!stored) return false;
  return (
    stored.id === expected.id &&
    stored.tester_name === expected.tester_name &&
    stored.device === expected.device &&
    stored.form_version === expected.form_version &&
    canonicalJson(stored.browser) === canonicalJson(expected.browser) &&
    canonicalJson(stored.familiarity) === canonicalJson(expected.familiarity) &&
    canonicalJson(stored.answers) === canonicalJson(expected.answers) &&
    canonicalJson(stored.bug_reports) === canonicalJson(expected.bug_reports) &&
    canonicalJson(stored.screenshot_paths) === canonicalJson(expected.screenshot_paths)
  );
}

export function organizerAcceptanceEvidenceMatchesEdition(
  stored: Pick<OrganizerAcceptanceEvidenceRow, "id" | "answers"> | null | undefined,
  expected: { submissionId: string; editionId: string },
) {
  if (!stored || stored.id !== expected.submissionId || !stored.answers || typeof stored.answers !== "object") {
    return false;
  }
  return (stored.answers as Record<string, unknown>).organizerEditionId === expected.editionId;
}
