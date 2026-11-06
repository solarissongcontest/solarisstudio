/**
 * Compatibility adapter for the current canonical Entry correction command.
 * The backend stores one reviewed reason string, NOT typed issue objects.
 * Do not interpret this formatting as structured server-side correction state.
 */
export const ORGANIZER_ENTRY_CORRECTION_CATEGORIES = [
  { id: "song_file", label: "Song file" },
  { id: "duration", label: "Duration" },
  { id: "title", label: "Title" },
  { id: "artist", label: "Artist" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "credits", label: "Credits" },
  { id: "metadata", label: "Metadata" },
  { id: "eligibility", label: "Eligibility" },
  { id: "other", label: "Other" },
] as const;

export type OrganizerEntryCorrectionCategory =
  (typeof ORGANIZER_ENTRY_CORRECTION_CATEGORIES)[number]["id"];

export type OrganizerEntryCorrectionIssue = {
  category: OrganizerEntryCorrectionCategory;
  explanation: string;
};

const labels = new Map<string, string>(
  ORGANIZER_ENTRY_CORRECTION_CATEGORIES.map((item) => [item.id, item.label]),
);

function singleLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Null means the operator has not supplied actionable categories/explanations.
 * Deterministic output is passed unchanged to BOTH the local operation intent
 * and the canonical RPC's p_reason. Never silently submit an incomplete issue.
 */
export function buildOrganizerEntryCorrectionReason(
  issues: readonly OrganizerEntryCorrectionIssue[],
  additionalContext = "",
): string | null {
  if (!issues.length || issues.length > ORGANIZER_ENTRY_CORRECTION_CATEGORIES.length) return null;
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const issue of issues) {
    const label = labels.get(issue.category);
    const explanation = singleLine(issue.explanation);
    if (!label || !explanation || seen.has(issue.category)) return null;
    seen.add(issue.category);
    lines.push(`- ${label}: ${explanation}`);
  }
  const extra = additionalContext.trim();
  return [
    "Changes requested for this Entry:",
    ...lines,
    ...(extra ? ["", "Additional context:", extra] : []),
  ].join("\n");
}
