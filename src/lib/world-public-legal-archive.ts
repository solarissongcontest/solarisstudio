import { supabase } from "@/integrations/supabase/client";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const WORLD_LEGAL_ARCHIVE_PAGE_SIZE = 30;

export type PublishedLegalVersion = {
  versionId: string;
  versionNumber: number;
  title: string;
  publicationState: "published" | "superseded" | "historical_source";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
  contentHash: string;
  supersedesVersionId: string | null;
};

export type PublicLegalArchive = {
  archiveOwner: "world_document_versions";
  organizationSlug: string;
  organizationName: string;
  documentId: string;
  documentSlug: string;
  documentTitle: string;
  documentType: string;
  documentStatus: "active" | "retired" | "historical";
  currentVersionId: string | null;
  versions: PublishedLegalVersion[];
  hasMore: boolean;
  nextBeforeVersion: number | null;
};

export type PublicLegalDocument = {
  organizationSlug: string;
  organizationName: string;
  documentSlug: string;
  title: string;
  documentType: string;
  documentStatus: "active" | "retired" | "historical";
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const nullableText = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

export function legalArchiveRequestArgs(
  organization: string,
  document: string,
  before: number | null,
): { p_organization_slug: string; p_document_slug: string; p_before_version: number | null; p_limit: number } {
  if (!slugPattern.test(organization) || !slugPattern.test(document) ||
      before !== null && (!Number.isSafeInteger(before) || before <= 1)) {
    throw new Error("Invalid public legal archive request.");
  }
  return {
    p_organization_slug: organization,
    p_document_slug: document,
    p_before_version: before,
    p_limit: WORLD_LEGAL_ARCHIVE_PAGE_SIZE,
  };
}

function parseVersion(value: unknown): PublishedLegalVersion | null {
  const row = record(value);
  if (!row || !text(row.versionId) || !Number.isSafeInteger(row.versionNumber) ||
      row.versionNumber < 1 || !text(row.title) ||
      !["published", "superseded", "historical_source"].includes(String(row.publicationState)) ||
      !text(row.contentHash) || !/^[0-9a-f]{64}$/.test(row.contentHash)) return null;
  return {
    versionId: row.versionId,
    versionNumber: row.versionNumber,
    title: row.title,
    publicationState: row.publicationState as PublishedLegalVersion["publicationState"],
    effectiveFrom: nullableText(row.effectiveFrom),
    effectiveTo: nullableText(row.effectiveTo),
    publishedAt: nullableText(row.publishedAt),
    contentHash: row.contentHash,
    supersedesVersionId: nullableText(row.supersedesVersionId),
  };
}

export function parsePublicLegalArchive(value: unknown, organization: string, document: string): PublicLegalArchive | null {
  const row = record(value);
  if (!row || row.archiveOwner !== "world_document_versions" ||
      row.organizationSlug !== organization || row.documentSlug !== document ||
      !text(row.organizationName) || !text(row.documentId) || !text(row.documentTitle) ||
      !text(row.documentType) || !["active", "retired", "historical"].includes(String(row.documentStatus)) ||
      (row.currentVersionId !== null && !text(row.currentVersionId)) ||
      !Array.isArray(row.versions) || row.versions.length > WORLD_LEGAL_ARCHIVE_PAGE_SIZE ||
      typeof row.hasMore !== "boolean" ||
      (row.nextBeforeVersion !== null && !Number.isSafeInteger(row.nextBeforeVersion))) return null;
  const versions = row.versions.map(parseVersion);
  if (versions.some((version) => !version)) return null;
  const parsed = versions as PublishedLegalVersion[];
  for (let index = 1; index < parsed.length; index += 1) {
    if (parsed[index - 1].versionNumber <= parsed[index].versionNumber) return null;
  }

  if (row.hasMore !== (parsed.length === WORLD_LEGAL_ARCHIVE_PAGE_SIZE) ||
      row.hasMore !== (row.nextBeforeVersion !== null)) return null;
  return {
    archiveOwner: "world_document_versions",
    organizationSlug: organization,
    organizationName: row.organizationName,
    documentId: row.documentId,
    documentSlug: document,
    documentTitle: row.documentTitle,
    documentType: row.documentType,
    documentStatus: row.documentStatus as PublicLegalArchive["documentStatus"],
    currentVersionId: row.currentVersionId as string | null,
    versions: parsed,
    hasMore: row.hasMore,
    nextBeforeVersion: row.nextBeforeVersion as number | null,
  };
}

export function parsePublicLegalDocuments(value: unknown): PublicLegalDocument[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const parsed = value.map((item) => {
    const row = record(item);
    if (!row || !text(row.organizationSlug) || !text(row.organizationName) ||
        !text(row.documentSlug) || !text(row.title) || !text(row.documentType) ||
        !["active", "retired", "historical"].includes(String(row.documentStatus)) ||
        !slugPattern.test(row.organizationSlug) || !slugPattern.test(row.documentSlug)) return null;
    return {
      organizationSlug: row.organizationSlug,
      organizationName: row.organizationName,
      documentSlug: row.documentSlug,
      title: row.title,
      documentType: row.documentType,
      documentStatus: row.documentStatus as PublicLegalDocument["documentStatus"],
    };
  });
  return parsed.some((item) => !item) ? null : parsed as PublicLegalDocument[];
}

export async function readPublicLegalArchive(
  organization: string, document: string, before: number | null = null,
): Promise<PublicLegalArchive | null> {
  const args = legalArchiveRequestArgs(organization, document, before);
  const { data, error } = await (supabase as any).rpc("world_get_public_legal_archive_v1", args);
  if (error) throw new Error("The public legal archive could not be verified.");
  return parsePublicLegalArchive(data, organization, document);
}

export async function readPublicLegalDocuments(
  organization?: string,
): Promise<PublicLegalDocument[]> {
  if (organization !== undefined && !slugPattern.test(organization)) {
    throw new Error("Invalid public legal document organization.");
  }
  const { data, error } = await (supabase as any).rpc("world_list_public_legal_documents_v1", {
    p_organization_slug: organization ?? null,
    p_limit: 100,
  });
  if (error) throw new Error("The public legal document directory could not be verified.");
  const parsed = parsePublicLegalDocuments(data);
  if (!parsed) throw new Error("The public legal document directory was invalid.");
  return parsed;
}
