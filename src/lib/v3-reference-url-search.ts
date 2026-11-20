/** URL state for the public Reference index. This is navigation metadata only:
 * it does not authorize access or replace the published search RPC.
 */
export const MAX_REFERENCE_QUERY_LENGTH = 120;

export const REFERENCE_TOPICS = [
  "all", "edition", "country", "entry", "show", "story", "rule",
] as const;

export type ReferenceTopic = (typeof REFERENCE_TOPICS)[number];

export type ReferenceUrlSearch = {
  q?: string;
  kind?: ReferenceTopic;
  /** Historical /encyclopedia?artist= links remain supported. */
  artist?: string;
};

function cleanTerm(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const term = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_REFERENCE_QUERY_LENGTH);
  return term || undefined;
}

export function parseReferenceUrlSearch(value: Record<string, unknown>): ReferenceUrlSearch {
  const rawKind = value.kind;
  return {
    q: cleanTerm(value.q),
    kind: typeof rawKind === "string" &&
      (REFERENCE_TOPICS as readonly string[]).includes(rawKind)
      ? rawKind as ReferenceTopic : undefined,
    artist: cleanTerm(value.artist),
  };
}

export function referenceQueryFromUrl(value: ReferenceUrlSearch): string {
  return value.q ?? value.artist ?? "";
}
