import type { WorldDocumentDetail, WorldDocumentProvision } from "./world-public-documents";

/**
 * Historical TG4 comparison is pure read-model logic, not a new legal authority.
 * Article numbers and headings are mutable display text. provisionId remains
 * the canonical stable identity between document Versions.
 */
export type WorldProvisionChange = "added" | "removed" | "modified" | "unchanged";
export type WorldVersionComparisonRow = {
  key: string;
  change: WorldProvisionChange;
  before: WorldDocumentProvision | null;
  after: WorldDocumentProvision | null;
};
export type WorldVersionComparison = {
  oldVersion: number;
  newVersion: number;
  rows: WorldVersionComparisonRow[];
  totals: Record<WorldProvisionChange, number>;
  structural: boolean;
  plainTextChanged: boolean;
  beforePlainText: string;
  afterPlainText: string;
};

function assertSameDocument(a: WorldDocumentDetail, b: WorldDocumentDetail) {
  if (
    a.documentId !== b.documentId ||
    a.organization.slug !== b.organization.slug ||
    a.slug !== b.slug
  ) {
    throw new Error("Cannot compare versions of different official documents");
  }
  if (
    !["published", "superseded"].includes(a.version.publicationState) ||
    !["published", "superseded"].includes(b.version.publicationState)
  ) {
    throw new Error("Only publicly published or superseded versions may be compared");
  }
  if (a.version.versionNumber === b.version.versionNumber) {
    throw new Error("Select two different historical document versions");
  }
}

function indexedProvisions(provisions: readonly WorldDocumentProvision[]): Map<string, WorldDocumentProvision> {
  const index = new Map<string, WorldDocumentProvision>();
  for (const item of provisions) {
    if (!item.provisionId || index.has(item.provisionId)) {
      throw new Error("Invalid or duplicate canonical provision identity");
    }
    index.set(item.provisionId, item);
  }
  return index;
}

function sameWords(a: WorldDocumentProvision, b: WorldDocumentProvision): boolean {
  return a.displayLabel === b.displayLabel &&
    a.heading === b.heading &&
    a.bodyPlainText === b.bodyPlainText &&
    a.parentSemanticKey === b.parentSemanticKey;
}

export function comparePublishedWorldVersions(
  left: WorldDocumentDetail,
  right: WorldDocumentDetail,
): WorldVersionComparison {
  assertSameDocument(left, right);
  // Always compare the actual historical order, not user-selected left/right.
  const before = left.version.versionNumber < right.version.versionNumber ? left : right;
  const after = left.version.versionNumber < right.version.versionNumber ? right : left;
  const oldIndex = indexedProvisions(before.version.provisions);
  const newIndex = indexedProvisions(after.version.provisions);
  const rows: WorldVersionComparisonRow[] = [];
  for (const [key, item] of oldIndex.entries()) {
    const current = newIndex.get(key) ?? null;
    rows.push({
      key,
      before: item,
      after: current,
      change: !current ? "removed" : sameWords(item, current) ? "unchanged" : "modified",
    });
  }
  for (const [key, item] of newIndex.entries()) {
    if (oldIndex.has(key)) continue;
    rows.push({ key, before: null, after: item, change: "added" });
  }
  // This projection has no sortOrder property. Preserve the canonical order
  // returned by each published Version; removed items retain prior placement.
  const totals: Record<WorldProvisionChange, number> = {
    added: 0, removed: 0, modified: 0, unchanged: 0,
  };
  for (const item of rows) totals[item.change] += 1;
  return {
    oldVersion: before.version.versionNumber,
    newVersion: after.version.versionNumber,
    rows,
    totals,
    structural: rows.length > 0,
    plainTextChanged: before.version.plainText !== after.version.plainText,
    beforePlainText: before.version.plainText,
    afterPlainText: after.version.plainText,
  };
}

export function resolvePublishedVersionOptions(history: WorldDocumentDetail["history"]) {
  const seen = new Set<number>();
  return history.filter((item) => {
    if (item.publicationState !== "published" && item.publicationState !== "superseded") return false;
    if (!Number.isSafeInteger(item.versionNumber) || item.versionNumber < 1 || seen.has(item.versionNumber)) {
      throw new Error("Malformed or duplicate public version history");
    }
    seen.add(item.versionNumber);
    return true;
  }).sort((a,b) => a.versionNumber - b.versionNumber);
}

export function isValidComparisonVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
