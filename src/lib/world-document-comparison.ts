/**
 * Public TG4 document-version comparison. This module is read-only and never
 * interprets draft/private legal data as a published historical record.
 * The TG4 server commands and visibility policy remain authoritative.
 */
export type PublicWorldVersion = {
  number: number;
  title: string;
  publicationState: "published" | "superseded" | "historical_source";
  publishedAt: string | null;
  effectiveFrom: string | null;
  contentHash: string | null;
};

export type PublicWorldArchive = {
  documentId: string;
  organizationSlug: string;
  documentSlug: string;
  versions: PublicWorldVersion[];
};

export type PublicWorldProvision = {
  key: string;
  label: string;
  title: string;
  text: string;
  status: string;
  parentKey: string | null;
  sortOrder: number;
};

export type PublicWorldDocumentVersion = {
  documentId: string;
  organizationSlug: string;
  documentSlug: string;
  title: string;
  version: PublicWorldVersion;
  provisions: PublicWorldProvision[];
};

export type WorldProvisionDifference = {
  key: string;
  kind: "added" | "removed" | "modified" | "unchanged";
  before: PublicWorldProvision | null;
  after: PublicWorldProvision | null;
};

const PUBLIC_STATES = new Set(["published", "superseded", "historical_source"]);

/**
 * Suggest an actual two-version public comparison from a published document
 * reader. Never offer a draft/manager-only version or compare a version to
 * itself. The history RPC still revalidates identity and publication on click.
 */
export function suggestedPublicWorldComparisonPair(
  currentVersion: number,
  history: readonly { versionNumber: number; publicationState: string }[],
): { from: number; to: number; otherVersion: number } | null {
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1) return null;
  const available = history
    .filter((item) =>
      Number.isSafeInteger(item.versionNumber) && item.versionNumber >= 1 &&
      item.versionNumber !== currentVersion && PUBLIC_STATES.has(item.publicationState))
    .sort((a, b) => b.versionNumber - a.versionNumber);
  const otherVersion = available[0]?.versionNumber;
  if (otherVersion == null) return null;
  return {
    from: Math.min(currentVersion, otherVersion),
    to: Math.max(currentVersion, otherVersion),
    otherVersion,
  };
}


function row(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid public document " + label);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid public document " + label);
  return value;
}

function optionalString(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error("Invalid public document " + label);
  return value;
}

function int(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid public document " + label);
  }
  return value;
}

function version(raw: unknown): PublicWorldVersion {
  const v = row(raw, "version");
  if (!PUBLIC_STATES.has(v.publicationState as string)) {
    throw new Error("Unpublished document version cannot be compared publicly");
  }
  return {
    number: (() => {
      const number = int(v.versionNumber, "version number");
      if (number < 1) throw new Error("Invalid published version number");
      return number;
    })(),
    title: string(v.title, "version title"),
    publicationState: v.publicationState as PublicWorldVersion["publicationState"],
    publishedAt: optionalString(v.publishedAt, "publication time"),
    effectiveFrom: optionalString(v.effectiveFrom, "effective start"),
    contentHash: optionalString(v.contentHash, "content hash"),
  };
}

export function worldLegalSlug(value: string): boolean {
  return value.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

/**
 * The historical RPC intentionally serves member/private documents to their
 * authorized owners too. Before invoking it on a public page, prove the exact
 * document identity and public visibility from the canonical document RPC.
 * Never use the archive metadata as the public-visibility authority.
 */
export function parsePublicWorldAccessProof(
  data: unknown,
  organizationSlug: string,
  documentSlug: string,
): string | null {
  if (data == null) return null;
  const detail = row(data, "visibility proof");
  const org = row(detail.organization, "organization identity");
  if (
    org.slug !== organizationSlug ||
    detail.slug !== documentSlug ||
    detail.visibility !== "public"
  ) {
    throw new Error("Document is not publicly accessible at this address");
  }
  return string(detail.documentId, "public document identity");
}

export function parsePublicWorldArchive(
  data: unknown,
  organizationSlug: string,
  documentSlug: string,
): PublicWorldArchive | null {
  if (data == null) return null;
  const result = row(data, "archive");
  if (result.organizationSlug !== organizationSlug || result.documentSlug !== documentSlug) {
    throw new Error("Document archive identity mismatch");
  }
  if (!Array.isArray(result.versions)) throw new Error("Invalid document archive versions");
  const visible: PublicWorldVersion[] = [];
  const numbers = new Set<number>();
  for (const item of result.versions) {
    const candidate = row(item, "archive version");
    // Server also returns drafts to authorized managers. This is a public-only
    // reader; do not deserialize draft, unpublished or privileged metadata.
    if (!PUBLIC_STATES.has(candidate.publicationState as string)) continue;
    const publicVersion = version(candidate);
    if (numbers.has(publicVersion.number)) throw new Error("Duplicate historical version");
    numbers.add(publicVersion.number);
    visible.push(publicVersion);
  }
  visible.sort((a, b) => a.number - b.number);
  return {
    documentId: string(result.documentId, "archive document id"),
    organizationSlug,
    documentSlug,
    versions: visible,
  };
}

export function parsePublicWorldDocumentVersion(
  data: unknown,
  organizationSlug: string,
  documentSlug: string,
  expectedVersionNumber: number,
  expectedDocumentId: string,
): PublicWorldDocumentVersion {
  const result = row(data, "detail");
  const organization = row(result.organization, "organization");
  if (organization.slug !== organizationSlug || result.slug !== documentSlug ||
      result.documentId !== expectedDocumentId) {
    throw new Error("Document version identity mismatch");
  }
  if (result.visibility !== "public") {
    throw new Error("Non-public institutional document");
  }
  const rawVersion = row(result.version, "requested version");
  const parsedVersion = version(rawVersion);
  if (parsedVersion.number !== expectedVersionNumber) {
    throw new Error("Document version changed during comparison");
  }
  if (!Array.isArray(rawVersion.provisions)) throw new Error("Invalid public document provisions");
  const keys = new Set<string>();
  const provisions = rawVersion.provisions.map((item): PublicWorldProvision => {
    const provision = row(item, "provision");
    const key = string(provision.semanticKey, "semantic provision key");
    if (keys.has(key)) throw new Error("Duplicate semantic provision key");
    keys.add(key);
    return {
      key,
      label: optionalString(provision.displayLabel, "display label") ?? "",
      title: optionalString(provision.heading, "heading") ?? "",
      // Preserve official exact text, including whitespace and line breaks.
      text: optionalString(provision.bodyPlainText, "provision text") ?? "",
      status: string(provision.status, "provision status"),
      parentKey: optionalString(provision.parentSemanticKey, "parent key"),
      sortOrder: int(provision.sortOrder, "provision order"),
    };
  });
  // Historical documents may predate structured provision identities. When the
  // full published text is present but provisions are absent, compare the
  // original wording as one explicitly labelled block instead of reporting
  // an empty or unchanged law.
  if (provisions.length === 0) {
    const plainText = optionalString(rawVersion.plainText, "full text");
    if (plainText && plainText.trim()) {
      provisions.push({
        key: "__document_plain_text__",
        label: "Full text",
        title: "Unstructured document text",
        text: plainText,
        status: "published_text",
        parentKey: null,
        sortOrder: 0,
      });
    }
  }
  provisions.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
  return {
    documentId: expectedDocumentId,
    organizationSlug,
    documentSlug,
    title: string(result.title, "document title"),
    version: parsedVersion,
    provisions,
  };
}

export function comparePublicWorldVersions(
  before: PublicWorldDocumentVersion,
  after: PublicWorldDocumentVersion,
): WorldProvisionDifference[] {
  if (before.documentId !== after.documentId ||
      before.organizationSlug !== after.organizationSlug ||
      before.documentSlug !== after.documentSlug ||
      before.version.number >= after.version.number) {
    throw new Error("Comparison requires two chronological versions of the same document");
  }
  if (!before.provisions.length || !after.provisions.length) {
    throw new Error("Published text is missing from one version; comparison unavailable");
  }
  const old = new Map(before.provisions.map((p) => [p.key, p]));
  const next = new Map(after.provisions.map((p) => [p.key, p]));
  const allKeys = [...new Set([...old.keys(), ...next.keys()])];
  const order = (key: string) => next.get(key)?.sortOrder ?? old.get(key)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  allKeys.sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  return allKeys.map((key) => {
    const left = old.get(key) ?? null;
    const right = next.get(key) ?? null;
    let kind: WorldProvisionDifference["kind"];
    if (!left) kind = "added";
    else if (!right) kind = "removed";
    else if (left.text !== right.text || left.title !== right.title || left.label !== right.label ||
             left.status !== right.status || left.parentKey !== right.parentKey ||
             left.sortOrder !== right.sortOrder) kind = "modified";
    else kind = "unchanged";
    return { key, kind, before: left, after: right };
  });
}

export function validateComparisonPair(
  archive: PublicWorldArchive,
  older: number,
  newer: number,
): boolean {
  return Number.isSafeInteger(older) && Number.isSafeInteger(newer) && older < newer &&
    archive.versions.some((v) => v.number === older) &&
    archive.versions.some((v) => v.number === newer);
}
