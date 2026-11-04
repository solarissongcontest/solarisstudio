/**
 * Public-only TG4 legal-document display contract.
 *
 * Server authority, version selection and RLS belong to TG4 #1890. This
 * deliberately strips member/private, draft and manager metadata even if an
 * authenticated viewer could obtain them through the same RPC.
 */
export type WorldDocumentSummary = {
  id: string;
  organizationSlug: string;
  slug: string;
  title: string;
  documentType: string;
  status: string;
  versionNumber: number;
  publishedAt: string | null;
  effectiveFrom: string | null;
};

export type WorldDocumentProvision = {
  semanticKey: string;
  parentSemanticKey: string | null;
  displayLabel: string | null;
  heading: string | null;
  text: string;
  sortOrder: number;
  status: "active" | "repealed" | "omitted";
};

export type WorldDocumentVersion = {
  number: number;
  title: string;
  publicationState: "published" | "superseded";
  plainText: string;
  publishedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  contentHash: string | null;
  provisions: WorldDocumentProvision[];
};

export type WorldDocumentReader = {
  title: string;
  slug: string;
  organization: { slug: string; name: string; shortName: string };
  version: WorldDocumentVersion;
  history: { number: number; title: string; state: "published" | "superseded"; publishedAt: string | null }[];
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMANTIC_KEY = /^[a-z0-9]+(?:[.:-][a-z0-9]+)*$/;
const VERSION_STATES = new Set(["published", "superseded"]);
const PROVISION_STATES = new Set(["active", "repealed", "omitted"]);

export function isWorldDocumentSlug(value: string): boolean {
  return value.length > 0 && value.length <= 100 && SLUG.test(value);
}

function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid public legal-document projection");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid legal-document text");
  return value.trim();
}

function optional(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error("Invalid legal-document field");
  return value.trim() || null;
}

function versionNumber(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error("Invalid legal-document version");
  }
  return value as number;
}

function entries(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid legal-document collection");
  return value;
}

export function parseWorldDocumentIndex(input: unknown, organizationSlug: string): WorldDocumentSummary[] {
  if (!isWorldDocumentSlug(organizationSlug)) throw new Error("Invalid institution route");
  const source = row(input);
  const seen = new Set<string>();
  return entries(source.documents).flatMap((raw) => {
    const item = row(raw);
    if (text(item.organizationSlug) !== organizationSlug) {
      throw new Error("Cross-organization legal-document projection");
    }
    // Do not show unapproved, non-public or member-only legal work on Public.
    if (item.visibility !== "public" || !item.currentVersion) return [];
    const slug = text(item.slug);
    if (!isWorldDocumentSlug(slug)) throw new Error("Invalid legal-document slug");
    if (seen.has(slug)) throw new Error("Duplicate public legal document");
    seen.add(slug);
    const current = row(item.currentVersion);
    const entry: WorldDocumentSummary = {
      id: text(item.documentId),
      organizationSlug,
      slug,
      title: text(item.title),
      documentType: text(item.documentType),
      status: text(item.status),
      versionNumber: versionNumber(current.versionNumber),
      publishedAt: optional(current.publishedAt),
      effectiveFrom: optional(current.effectiveFrom),
    };
    return [entry];
  });
}

export function parseWorldDocumentReader(
  input: unknown,
  organizationSlug: string,
  documentSlug: string,
  expectedVersion?: number,
): WorldDocumentReader | null {
  if (!isWorldDocumentSlug(organizationSlug) || !isWorldDocumentSlug(documentSlug)) {
    throw new Error("Invalid document route");
  }
  if (input == null) return null;
  const source = row(input);
  const organization = row(source.organization);
  if (text(organization.slug) !== organizationSlug || text(source.slug) !== documentSlug) {
    throw new Error("Cross-institution document read");
  }
  // A manager may receive a draft via the TG4 RPC; this public reader must not show it.
  if (source.visibility !== "public" || source.version == null) return null;
  const current = row(source.version);
  if (!VERSION_STATES.has(current.publicationState as string)) return null;
  const number = versionNumber(current.versionNumber);
  const hash = optional(current.contentHash);
  if (hash && !/^[0-9a-f]{64}$/.test(hash)) throw new Error("Invalid published document hash");
  if (expectedVersion !== undefined && number !== expectedVersion) {
    throw new Error("Legal-document version scope mismatch");
  }
  const usedKeys = new Set<string>();
  const provisions = entries(current.provisions).map((raw): WorldDocumentProvision => {
    const item = row(raw);
    const semanticKey = text(item.semanticKey);
    if (!SEMANTIC_KEY.test(semanticKey) || usedKeys.has(semanticKey)) {
      throw new Error("Invalid or duplicate provision identity");
    }
    usedKeys.add(semanticKey);
    const state = text(item.status);
    if (!PROVISION_STATES.has(state)) throw new Error("Invalid legal provision status");
    const order = item.sortOrder;
    if (!Number.isSafeInteger(order) || (order as number) < 0) throw new Error("Invalid provision order");
    const parentSemanticKey = optional(item.parentSemanticKey);
    if (parentSemanticKey && !SEMANTIC_KEY.test(parentSemanticKey)) throw new Error("Invalid parent provision");
    if (typeof item.bodyPlainText !== "string") throw new Error("Invalid legal provision body");
    return {
      semanticKey,
      parentSemanticKey,
      displayLabel: optional(item.displayLabel),
      heading: optional(item.heading),
      text: item.bodyPlainText,
      sortOrder: order as number,
      status: state as WorldDocumentProvision["status"],
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.semanticKey.localeCompare(b.semanticKey));
  const history = entries(source.history).flatMap((raw) => {
    const item = row(raw);
    if (!VERSION_STATES.has(item.publicationState as string)) return [];
    return [{
      number: versionNumber(item.versionNumber),
      title: text(item.title),
      state: item.publicationState as "published" | "superseded",
      publishedAt: optional(item.publishedAt),
    }];
  }).sort((a, b) => b.number - a.number);
  return {
    title: text(source.title),
    slug: documentSlug,
    organization: {
      slug: organizationSlug,
      name: text(organization.officialName),
      shortName: text(organization.shortName),
    },
    version: {
      number,
      title: text(current.title),
      publicationState: current.publicationState as "published" | "superseded",
      plainText: optional(current.plainText) ?? "",
      publishedAt: optional(current.publishedAt),
      effectiveFrom: optional(current.effectiveFrom),
      effectiveTo: optional(current.effectiveTo),
      contentHash: hash,
      provisions,
    },
    history,
  };
}

export function matchingWorldProvisions(provisions: readonly WorldDocumentProvision[], search: string): WorldDocumentProvision[] {
  const query = search.trim().toLocaleLowerCase().slice(0, 120);
  if (!query) return [...provisions];
  return provisions.filter((item) =>
    [item.semanticKey, item.displayLabel, item.heading, item.text]
      .some((value) => value?.toLocaleLowerCase().includes(query))
  );
}
