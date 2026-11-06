import { anonymousWorldRpcRequest, assertWorldSlug } from "@/lib/world-public-documents";
import { noteSupabaseResponse } from "@/lib/supabase-service-restriction";

/**
 * TG4 read-only Archive. Legal truth stays in world_document_versions.
 * This endpoint is always called as anon, even from an authenticated browser.
 * Server projection additionally filters *before* keyset paging, so privileged
 * drafts cannot displace public Versions in the first page.
 */
export type PublishedLegalVersion = {
  versionId: string;
  versionNumber: number;
  title: string;
  publicationState: "published" | "superseded" | "historical_source";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
  contentHash: string;
  recordClass: "official" | "permanent";
  supersedesVersionId: string | null;
  supersededByVersionId: string | null;
  fullTextAvailable: boolean;
};

export type PublicLegalArchivePage = {
  documentId: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  documentSlug: string;
  documentTitle: string;
  documentType: string;
  documentStatus: "active" | "retired" | "historical";
  currentVersionId: string | null;
  versions: PublishedLegalVersion[];
  hasMore: boolean;
  nextBeforeVersion: number | null;
  serverTime: string;
};

const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid public legal Archive projection");
  }
  return value as Record<string, unknown>;
};
const string = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid public legal Archive " + name);
  }
  return value;
};
const optional = (value: unknown, name: string): string | null => (
  value === null ? null : string(value, name)
);
const positiveInteger = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error("Invalid public legal Archive version number");
  }
  return value as number;
};
function publishedVersion(value: unknown): PublishedLegalVersion {
  const row = object(value);
  // All three states correspond to officially retained, immutable legal text.
  if (!["published", "superseded", "historical_source"].includes(String(row.publicationState))) {
    throw new Error("Unpublished legal Archive version");
  }
  if (row.recordClass !== "official" && row.recordClass !== "permanent") {
    throw new Error("Non-official legal Archive version");
  }
  if (typeof row.fullTextAvailable !== "boolean") {
    throw new Error("Invalid full-text availability");
  }
  const hash = string(row.contentHash, "content hash");
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error("Unverifiable legal Archive content hash");
  }
  // Raw source provenance is not part of the public read contract.
  if ("sourceProvenance" in row || "sourceDescription" in row ||
      "plainText" in row || "structuredContent" in row) {
    throw new Error("Unexpected sensitive legal Archive fields");
  }
  return {
    versionId: string(row.versionId, "version ID"),
    versionNumber: positiveInteger(row.versionNumber),
    title: string(row.title, "title"),
    publicationState: row.publicationState as PublishedLegalVersion["publicationState"],
    effectiveFrom: optional(row.effectiveFrom, "effectiveFrom"),
    effectiveTo: optional(row.effectiveTo, "effectiveTo"),
    publishedAt: optional(row.publishedAt, "publishedAt"),
    contentHash: hash,
    recordClass: row.recordClass,
    supersedesVersionId: optional(row.supersedesVersionId, "supersedesVersionId"),
    supersededByVersionId: optional(row.supersededByVersionId, "supersededByVersionId"),
    fullTextAvailable: row.fullTextAvailable,
  };
}

/** Reject malformed, mismatched or draft-containing projections rather than treating them as empty. */
export function parsePublicLegalArchive(
  input: unknown,
  requestedOrganization: string,
  requestedDocument: string,
  requestedCursor: number | null,
  requestedLimit: number,
): PublicLegalArchivePage | null {
  if (input === null) return null;
  const row = object(input);
  const organizationSlug = assertWorldSlug(string(row.organizationSlug, "organization slug"));
  const documentSlug = assertWorldSlug(string(row.documentSlug, "document slug"));
  if (organizationSlug !== requestedOrganization || documentSlug !== requestedDocument ||
      row.archiveOwner !== "world_document_versions+domain_events") {
    throw new Error("Public legal Archive belongs to another Work or authority");
  }
  if (!Array.isArray(row.versions) || row.versions.length > requestedLimit ||
      typeof row.hasMore !== "boolean") {
    throw new Error("Invalid legal Archive page boundary");
  }
  if (!["active", "retired", "historical"].includes(String(row.documentStatus))) {
    throw new Error("Invalid legal Work archival status");
  }
  const versions = row.versions.map(publishedVersion);
  const seen = new Set<string>();
  let previous = requestedCursor ?? Number.MAX_SAFE_INTEGER;
  for (const v of versions) {
    if (seen.has(v.versionId) || v.versionNumber >= previous) {
      throw new Error("Duplicate, misordered or out-of-cursor legal Archive history");
    }
    seen.add(v.versionId);
    previous = v.versionNumber;
  }
  const next = row.nextBeforeVersion === null ? null : positiveInteger(row.nextBeforeVersion);
  if (row.hasMore && (!versions.length || next !== previous)) {
    throw new Error("Invalid legal Archive continuation cursor");
  }
  if (!row.hasMore && next !== null) {
    throw new Error("Unexpected legal Archive continuation cursor");
  }
  const currentVersionId = optional(row.currentVersionId, "current version ID");
  return {
    organizationId: string(row.organizationId, "organization ID"),
    organizationSlug, organizationName: string(row.organizationName, "organization name"),
    documentId: string(row.documentId, "document ID"),
    documentSlug, documentTitle: string(row.documentTitle, "document title"),
    documentType: string(row.documentType, "document type"),
    documentStatus: row.documentStatus as PublicLegalArchivePage["documentStatus"],
    currentVersionId,
    versions,
    hasMore: row.hasMore,
    nextBeforeVersion: next,
    serverTime: string(row.serverTime, "server time"),
  };
}

export function legalArchiveRequestArgs(
  organization: string,
  document: string,
  cursor: number | null,
  limit = 30,
) {
  assertWorldSlug(organization);
  assertWorldSlug(document);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      (cursor !== null && (!Number.isSafeInteger(cursor) || cursor < 1))) {
    throw new Error("Invalid legal Archive page request");
  }
  return {
    p_organization_slug: organization,
    p_document_slug: document,
    p_before_version: cursor,
    p_limit: limit,
  };
}

export async function readPublicLegalArchive(
  organization: string,
  document: string,
  cursor: number | null,
  signal?: AbortSignal,
): Promise<PublicLegalArchivePage | null> {
  const args = legalArchiveRequestArgs(organization, document, cursor);
  if (signal?.aborted) throw new Error("Legal Archive request canceled");
  const url = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Public legal Archive service is not configured");
  const response = await fetch(
    url.replace(/\/$/, "") + "/rest/v1/rpc/world_get_public_legal_archive_v1",
    anonymousWorldRpcRequest(key, args, signal),
  );
  noteSupabaseResponse(response);
  if (!response.ok) {
    const error = new Error("Public legal Archive service unavailable (" + response.status + ")");
    Object.assign(error, { status: response.status });
    throw error;
  }
  return parsePublicLegalArchive(await response.json(), organization, document, cursor, 30);
}
