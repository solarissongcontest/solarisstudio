export type EncyclopediaKind =
  | "all"
  | "edition"
  | "country"
  | "entry"
  | "show"
  | "wiki";

export type EncyclopediaResultKind = Exclude<EncyclopediaKind, "all">;

export type EncyclopediaSearchResult = {
  id: string;
  kind: EncyclopediaResultKind;
  title: string;
  subtitle: string;
  href: string;
};

export type EncyclopediaCoverage = {
  countries: number;
  entries: number;
  shows: number;
  stories: number;
};

export const ENCYCLOPEDIA_KIND_OPTIONS: readonly EncyclopediaKind[] = [
  "all",
  "edition",
  "country",
  "entry",
  "show",
  "wiki",
];

export const ENCYCLOPEDIA_KIND_LABELS: Record<EncyclopediaKind, string> = {
  all: "All",
  edition: "Editions",
  country: "Countries",
  entry: "Entries",
  show: "Shows",
  wiki: "Wiki",
};

export const ENCYCLOPEDIA_RESULT_LABELS: Record<EncyclopediaResultKind, string> = {
  edition: "Edition",
  country: "Country",
  entry: "Entry",
  show: "Show",
  wiki: "Wiki",
};

const RESULT_KINDS = new Set<EncyclopediaResultKind>([
  "edition",
  "country",
  "entry",
  "show",
  "wiki",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  row: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = row[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} is missing ${key}`);
  }
  return value;
}

function requiredCount(
  row: Record<string, unknown>,
  key: keyof EncyclopediaCoverage,
): number {
  const value = row[key];
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(`Encyclopedia coverage is missing a valid ${key} count`);
  }
  return value;
}

/**
 * Parses the existing canonical public Search RPC for the Encyclopedia surface.
 * Unknown future Search groups are ignored rather than being silently promoted
 * into the reference product. Known groups remain strict and fail closed on a
 * malformed href or identity.
 */
export function parseEncyclopediaSearchRows(
  value: unknown,
): EncyclopediaSearchResult[] {
  if (!Array.isArray(value)) {
    throw new Error("Encyclopedia search response must be an array");
  }

  const results: EncyclopediaSearchResult[] = [];
  const seen = new Set<string>();

  for (const rawRow of value) {
    if (!isRecord(rawRow)) {
      throw new Error("Encyclopedia search returned a malformed row");
    }

    const rawKind = rawRow.result_type;
    if (typeof rawKind !== "string" || !RESULT_KINDS.has(rawKind as EncyclopediaResultKind)) {
      continue;
    }

    const kind = rawKind as EncyclopediaResultKind;
    const id = requiredString(rawRow, "result_id", "Encyclopedia search row");
    const title = requiredString(rawRow, "title", "Encyclopedia search row");
    const href = requiredString(rawRow, "href", "Encyclopedia search row");

    if (!href.startsWith("/") || href.startsWith("//")) {
      throw new Error("Encyclopedia search returned an unsafe href");
    }

    if (seen.has(id)) continue;
    seen.add(id);

    results.push({
      id,
      kind,
      title,
      subtitle: typeof rawRow.subtitle === "string" ? rawRow.subtitle : "",
      href,
    });
  }

  return results;
}

export function parseEncyclopediaCoverage(value: unknown): EncyclopediaCoverage {
  if (!isRecord(value)) {
    throw new Error("Encyclopedia coverage response must be an object");
  }

  return {
    countries: requiredCount(value, "countries"),
    entries: requiredCount(value, "entries"),
    shows: requiredCount(value, "shows"),
    stories: requiredCount(value, "stories"),
  };
}

export function filterEncyclopediaResults(
  rows: readonly EncyclopediaSearchResult[],
  kind: EncyclopediaKind,
): EncyclopediaSearchResult[] {
  if (kind === "all") return [...rows];
  return rows.filter((row) => row.kind === kind);
}
