import type { WorldDocumentDetail } from "./world-public-documents";

/**
 * A presentation-only archival print model derived from the publication-safe
 * TG4 document projection. Never turns a private, draft, or source-only
 * document into an official public printable record.
 */
export type WorldPublicPrintModel = {
  identity: { organization: string; documentSlug: string; organizationSlug: string };
  institution: string;
  title: string;
  versionTitle: string;
  versionNumber: number;
  publicationState: "published" | "superseded";
  publishedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  plainText: string;
  articles: {
    id: string;
    label: string;
    heading: string;
    text: string;
  }[];
  citation: string;
};

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function utcDate(date: string | null): string | null {
  if (!date) return null;
  const value = new Date(date);
  return Number.isFinite(value.getTime()) ? value.toISOString().slice(0,10) : null;
}

export function buildWorldPublicPrintModel(
  data: WorldDocumentDetail | null,
  expected: { organization: string; document: string; version?: number },
): WorldPublicPrintModel | null {
  if (!SAFE_SLUG.test(expected.organization) || !SAFE_SLUG.test(expected.document) ||
      expected.organization.length > 100 || expected.document.length > 100 ||
      (expected.version !== undefined && (!Number.isSafeInteger(expected.version) || expected.version < 1))) {
    throw new Error("Invalid public legal-document print request");
  }
  if (!data) return null;
  if (data.organization.slug !== expected.organization || data.slug !== expected.document ||
      (expected.version !== undefined && data.version.versionNumber !== expected.version)) {
    throw new Error("Legal print response does not belong to the requested institution or version");
  }
  if (data.version.publicationState !== "published" && data.version.publicationState !== "superseded") {
    return null;
  }
  const seen = new Set<string>();
  const articles = data.version.provisions.map((item) => {
    if (!item.provisionId || seen.has(item.provisionId)) {
      throw new Error("Duplicate or missing canonical legal provision identity");
    }
    seen.add(item.provisionId);
    return {
      id: item.provisionId,
      label: item.displayLabel,
      heading: item.heading,
      text: item.bodyPlainText,
    };
  });
  const officialDate = utcDate(data.version.effectiveFrom) ?? utcDate(data.version.publishedAt);
  const citation = [
    data.organization.officialName,
    data.title,
    `Version ${data.version.versionNumber}`,
    officialDate ? `effective/published ${officialDate}` : null,
    `/world/documents/${data.organization.slug}/${data.slug}?version=${data.version.versionNumber}`,
  ].filter(Boolean).join(" · ");
  return {
    identity: {
      organization: data.organization.slug,
      organizationSlug: data.organization.slug,
      documentSlug: data.slug,
    },
    institution: data.organization.officialName,
    title: data.title,
    versionTitle: data.version.title,
    versionNumber: data.version.versionNumber,
    publicationState: data.version.publicationState,
    publishedAt: utcDate(data.version.publishedAt),
    effectiveFrom: utcDate(data.version.effectiveFrom),
    effectiveTo: utcDate(data.version.effectiveTo),
    plainText: data.version.plainText,
    articles,
    citation,
  };
}
