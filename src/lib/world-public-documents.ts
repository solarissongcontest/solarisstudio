import { supabase } from "@/integrations/supabase/client";

/**
 * TG4's public read contract. No service key, direct canonical document table
 * access, or client-side publication decision is used here.
 *
 * The TG4 RPCs can also return member/manager material to authorized callers.
 * This Public library deliberately accepts only PUBLIC, published versions.
 * Private/member documents belong in a separate capability-aware workspace.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SEARCH = 100;
const VALID_LIMITS = [25, 50, 100] as const;
export type WorldDocumentLimit = (typeof VALID_LIMITS)[number];

export type WorldDocumentIndexRow = {
  documentId: string;
  organizationSlug: string;
  organizationName: string;
  slug: string;
  documentType: string;
  title: string;
  status: string;
  currentVersion: {
    versionNumber: number;
    publishedAt: string | null;
    effectiveFrom: string | null;
  };
};

export type WorldDocumentProvision = {
  provisionId: string;
  /** Stable across legal renumbering; not the version-specific display label. */
  semanticKey: string;
  /** URI-safe, deterministic DOM anchor derived from the canonical semantic key. */
  targetId: string;
  displayLabel: string;
  heading: string;
  bodyPlainText: string;
  anchor: string | null;
  parentSemanticKey: string | null;
};

export type WorldDocumentHistoryItem = {
  versionNumber: number;
  title: string;
  publicationState: "published" | "superseded" | "historical_source";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
};

export type WorldDocumentDetail = {
  documentId: string;
  organization: {
    slug: string;
    officialName: string;
    shortName: string;
  };
  slug: string;
  documentType: string;
  title: string;
  version: {
    versionNumber: number;
    title: string;
    publicationState: WorldDocumentHistoryItem["publicationState"];
    plainText: string;
    publishedAt: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    provisions: WorldDocumentProvision[];
  };
  history: WorldDocumentHistoryItem[];
};

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid institutional document projection");
  }
  return input as Record<string, unknown>;
}

function string(input: unknown, label: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("Invalid institutional document " + label);
  }
  return input.trim();
}

function optionalString(input: unknown): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

// Legal text is historically significant. Never normalize whitespace or
// reinterpret its markup: the UI renders this value as plain React text.
function plainText(input: unknown): string {
  return typeof input === "string" ? input : "";
}

function versionNumber(input: unknown): number {
  if (!Number.isSafeInteger(input) || (input as number) < 1) {
    throw new Error("Invalid institutional document version");
  }
  return input as number;
}

function publicVersion(input: unknown): WorldDocumentHistoryItem["publicationState"] {
  if (input !== "published" && input !== "superseded" && input !== "historical_source") {
    throw new Error("Institutional document version is not public");
  }
  return input;
}

export function isWorldSlug(input: string): boolean {
  return input.length <= 100 && SLUG.test(input);
}

export function assertWorldSlug(input: string): string {
  if (!isWorldSlug(input)) throw new Error("Invalid institutional document link");
  return input;
}

/** Official semantic provision keys are stable across amendments and renumbering. */
export function worldProvisionTargetId(semanticKey: string): string {
  const key = string(semanticKey, "semantic provision identity");
  // Match TG4's world_document_provisions_key_check. No URL percent-encoding
  // in the DOM id: a #fragment is decoded by browsers before anchor matching.
  if (key.length > 200 || !/^[a-z0-9]+(?:[.:-][a-z0-9]+)*$/.test(key)) {
    throw new Error("Invalid semantic provision identity");
  }
  return "world-provision-" + key;
}

export function parseWorldDocumentIndex(input: unknown): WorldDocumentIndexRow[] {
  const data = object(input);
  if (!Array.isArray(data.documents) || data.documents.length > 100) {
    throw new Error("Invalid institutional document index");
  }
  const seen = new Set<string>();
  const rows: WorldDocumentIndexRow[] = [];
  for (const value of data.documents) {
    const row = object(value);
    // The RPC is capability-aware. A Public surface never renders nonpublic
    // documents, or draft-only work that has no published current Version.
    if (row.visibility !== "public" || row.currentVersion == null) continue;
    const current = object(row.currentVersion);
    const organizationSlug = assertWorldSlug(string(row.organizationSlug, "organization"));
    const slug = assertWorldSlug(string(row.slug, "slug"));
    const id = string(row.documentId, "id");
    if (seen.has(id)) throw new Error("Duplicate institutional document in index");
    seen.add(id);
    rows.push({
      documentId: id,
      organizationSlug,
      organizationName: string(row.organizationName, "organization name"),
      slug,
      documentType: string(row.documentType, "type"),
      title: string(row.title, "title"),
      status: string(row.status, "status"),
      currentVersion: {
        versionNumber: versionNumber(current.versionNumber),
        publishedAt: optionalString(current.publishedAt),
        effectiveFrom: optionalString(current.effectiveFrom),
      },
    });
  }
  return rows;
}

export function parseWorldDocumentDetail(input: unknown): WorldDocumentDetail | null {
  if (input === null) return null;
  const data = object(input);
  if (data.visibility !== "public" || data.version === null) return null;
  const org = object(data.organization);
  const version = object(data.version);
  const publicationState = publicVersion(version.publicationState);
  if (!Array.isArray(version.provisions) || version.provisions.length > 1000 ||
      !Array.isArray(data.history) || data.history.length > 1000) {
    throw new Error("Invalid institutional document history");
  }
  const anchors = new Set<string>();
  const semanticKeys = new Set<string>();
  const provisions: WorldDocumentProvision[] = version.provisions.map((value) => {
    const provision = object(value);
    const semanticKey = string(provision.semanticKey, "semantic provision identity");
    const targetId = worldProvisionTargetId(semanticKey);
    if (semanticKeys.has(semanticKey)) {
      throw new Error("Duplicate semantic provision identity");
    }
    semanticKeys.add(semanticKey);
    const candidate = optionalString(provision.anchor);
    const anchor = candidate && /^[a-z0-9-]{1,100}$/.test(candidate) && !anchors.has(candidate)
      ? candidate
      : null;
    if (anchor) anchors.add(anchor);
    return {
      provisionId: string(provision.provisionId, "provision id"),
      semanticKey,
      targetId,
      displayLabel: optionalString(provision.displayLabel) ?? "",
      heading: optionalString(provision.heading) ?? "",
      bodyPlainText: plainText(provision.bodyPlainText),
      anchor,
      parentSemanticKey: optionalString(provision.parentSemanticKey),
    };
  });
  const history: WorldDocumentHistoryItem[] = data.history.flatMap((value) => {
    const item = object(value);
    // Never expose manager-only draft Version metadata in the Public reader.
    if (item.publicationState !== "published" &&
        item.publicationState !== "superseded" &&
        item.publicationState !== "historical_source") return [];
    return [{
      versionNumber: versionNumber(item.versionNumber),
      title: string(item.title, "history title"),
      publicationState: publicVersion(item.publicationState),
      effectiveFrom: optionalString(item.effectiveFrom),
      effectiveTo: optionalString(item.effectiveTo),
      publishedAt: optionalString(item.publishedAt),
    }];
  });
  return {
    documentId: string(data.documentId, "id"),
    organization: {
      slug: assertWorldSlug(string(org.slug, "organization")),
      officialName: string(org.officialName, "organization name"),
      shortName: string(org.shortName, "organization short name"),
    },
    slug: assertWorldSlug(string(data.slug, "slug")),
    documentType: string(data.documentType, "type"),
    title: string(data.title, "title"),
    version: {
      versionNumber: versionNumber(version.versionNumber),
      title: string(version.title, "version title"),
      publicationState,
      plainText: plainText(version.plainText),
      publishedAt: optionalString(version.publishedAt),
      effectiveFrom: optionalString(version.effectiveFrom),
      effectiveTo: optionalString(version.effectiveTo),
      provisions,
    },
    history,
  };
}

/**
 * Full visible contents, in server-defined legal order. Never silently stop
 * after 40 sections: the last section may contain a binding legal condition.
 */
export function publicWorldDocumentOutline(
  provisions: readonly WorldDocumentProvision[],
): WorldDocumentProvision[] {
  return provisions.filter((provision) => provision.heading || provision.displayLabel);
}

export function normalizeWorldSearch(query: string): string {
  return query.trim().slice(0, MAX_SEARCH);
}

export async function getWorldDocumentIndex(input: {
  organizationSlug?: string;
  search?: string;
  limit?: WorldDocumentLimit;
} = {}): Promise<WorldDocumentIndexRow[]> {
  const slug = input.organizationSlug
    ? assertWorldSlug(input.organizationSlug)
    : null;
  const query = normalizeWorldSearch(input.search ?? "");
  const limit = input.limit ?? 25;
  if (!VALID_LIMITS.includes(limit)) throw new Error("Invalid document index size");
  const { data, error } = await (supabase as any).rpc("world_get_document_index_v1", {
    p_organization_slug: slug,
    p_query: query || null,
    p_limit: limit,
  });
  if (error) throw error;
  return parseWorldDocumentIndex(data);
}

export async function getWorldDocumentDetail(input: {
  organization: string;
  document: string;
  version?: number;
}): Promise<WorldDocumentDetail | null> {
  const organization = assertWorldSlug(input.organization);
  const document = assertWorldSlug(input.document);
  if (input.version !== undefined) versionNumber(input.version);
  const { data, error } = await (supabase as any).rpc("world_get_document_v1", {
    p_organization_slug: organization,
    p_document_slug: document,
    p_version_number: input.version ?? null,
  });
  if (error) throw error;
  const projection = parseWorldDocumentDetail(data);
  if (projection &&
      (projection.organization.slug !== organization || projection.slug !== document ||
       (input.version !== undefined && projection.version.versionNumber !== input.version))) {
    throw new Error("Institutional document response does not match the requested identity");
  }
  return projection;
}
