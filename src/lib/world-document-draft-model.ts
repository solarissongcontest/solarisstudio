/**
 * TG4 Organizer draft consumer of the canonical World Document RPCs.
 * This module owns no legal truth, access decision, publication or mutations.
 * Do not infer a successful command from a transport response alone.
 */
import { parseWorldDocumentProvisions, type WorldDocumentProvision } from "./world-document-provisions";

export const WORLD_DOCUMENT_KINDS = [
  "charter", "rulebook", "annex", "treaty", "protocol",
  "procedural_rules", "report", "minutes", "communique", "other",
] as const;

export const WORLD_DOCUMENT_VISIBILITIES = ["public", "members", "private"] as const;
export type WorldDocumentKind = (typeof WORLD_DOCUMENT_KINDS)[number];
export type WorldDocumentVisibility = (typeof WORLD_DOCUMENT_VISIBILITIES)[number];

export type WorldDocumentIndexRow = {
  documentId: string;
  organizationId: string;
  organizationSlug: string;
  slug: string;
  title: string;
  documentType: string;
  visibility: string;
  status: string;
  currentVersion: { versionId: string; versionNumber: number } | null;
};

export type WorldDocumentDraftSnapshot = {
  documentId: string;
  slug: string;
  title: string;
  revision: number | null;
  organization: { organizationId: string; slug: string; officialName: string };
  allowedActions: { manage: boolean; publish: boolean };
  hasUnpublishedDraft: boolean;
  pendingDraft: { versionId: string; versionNumber: number; title: string } | null;
  version: null | {
    versionId: string;
    versionNumber: number;
    revision: number | null;
    title: string;
    plainText: string;
    structuredContent: Record<string, unknown>;
    provisions: WorldDocumentProvision[];
    publicationState: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    /** Null for public readers. Manager-only canonical provenance. */
    sourceDescription: string | null;
    sourceProvenance: Record<string, unknown> | null;
  };
};

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;
const revision = (value: unknown): number | null =>
  Number.isSafeInteger(value) && (value as number) >= 1 ? value as number : null;

/**
 * Compare whole legal form state (including article identity, hierarchy and order),
 * not just displayed text. This signature stays in component memory only.
 */
export function worldDocumentDraftSignature(input: {
  title: string;
  plainText: string;
  provisions: readonly WorldDocumentProvision[];
}): string {
  return JSON.stringify([input.title, input.plainText, input.provisions]);
}

/** The TG4 index applies the authoritative full-text filter server-side. */
export function normalizeWorldDocumentSearch(input: string): string {
  return input.trim().slice(0, 120);
}

export function toWorldDocumentSlug(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

export function validateWorldDocumentDraft(input: {
  slug?: string;
  title: string;
  kind?: string;
  visibility?: string;
  plainText?: string;
  hasProvisions?: boolean;
}): string | null {
  if (!input.title.trim() || input.title.trim().length > 180) return "Enter a title of up to 180 characters.";
  if (input.slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
    return "Use a lowercase, hyphenated document identifier.";
  }
  if (input.kind !== undefined && !WORLD_DOCUMENT_KINDS.includes(input.kind as WorldDocumentKind)) {
    return "Select a supported legal document type.";
  }
  if (input.visibility !== undefined &&
      !WORLD_DOCUMENT_VISIBILITIES.includes(input.visibility as WorldDocumentVisibility)) {
    return "Select a supported visibility.";
  }
  if (input.plainText !== undefined && input.plainText.trim().length === 0 && !input.hasProvisions) {
    return "Add the draft text before saving a version.";
  }
  if (input.plainText !== undefined && input.plainText.length > 100000) {
    return "Draft text is too large for this editor. Split the document into structured provisions.";
  }
  return null;
}

/** Strictly accept the bounded, authorized TG4 index RPC shape. Never use direct document tables. */
export function parseWorldDocumentIndex(value: unknown): WorldDocumentIndexRow[] {
  const root = record(value);
  if (!root || !Array.isArray(root.documents) || root.documents.length > 100) {
    throw new Error("The institution document index returned invalid data.");
  }
  return root.documents.map((entry: unknown) => {
    const row = record(entry);
    if (!row || !str(row.documentId) || !str(row.organizationId) ||
        !str(row.organizationSlug) || !str(row.slug) || !str(row.title) ||
        !str(row.documentType) || !str(row.visibility) || !str(row.status)) {
      throw new Error("The institution document index contains an invalid record.");
    }
    const current = row.currentVersion == null ? null : record(row.currentVersion);
    if (row.currentVersion != null &&
        (!current || !str(current.versionId) || !revision(current.versionNumber))) {
      throw new Error("The institution document index contains an invalid version.");
    }
    return {
      documentId: row.documentId as string,
      organizationId: row.organizationId as string,
      organizationSlug: row.organizationSlug as string,
      slug: row.slug as string,
      title: row.title as string,
      documentType: row.documentType as string,
      visibility: row.visibility as string,
      status: row.status as string,
      currentVersion: current
        ? { versionId: current.versionId as string, versionNumber: current.versionNumber as number }
        : null,
    };
  });
}

/** A manager-only editor cannot open on absent revision/permission evidence. */
export function parseWorldDocumentDraftSnapshot(value: unknown): WorldDocumentDraftSnapshot {
  const root = record(value);
  const organization = record(root?.organization);
  const actions = record(root?.allowedActions);
  if (!root || !organization || !actions || !str(root.documentId) ||
      !str(root.slug) || !str(root.title) || !str(organization.organizationId) ||
      !str(organization.slug) || !str(organization.officialName) ||
      typeof actions.manage !== "boolean" || typeof actions.publish !== "boolean") {
    throw new Error("The canonical document snapshot is unavailable.");
  }
  const canManage = actions.manage;
  if (canManage && !Array.isArray(root.history)) {
    throw new Error("Cannot edit without canonical legal-version history.");
  }
  const pendingDrafts = canManage ? (root.history as unknown[]).flatMap((item) => {
    const history = record(item);
    if (!history || !str(history.publicationState)) {
      throw new Error("The canonical legal-version history is invalid.");
    }
    if (history.publicationState !== "draft") return [];
    if (!str(history.versionId) || !revision(history.versionNumber) || !str(history.title)) {
      throw new Error("The unpublished draft is missing canonical version identity.");
    }
    return [{
      versionId: history.versionId as string,
      versionNumber: history.versionNumber as number,
      title: history.title as string,
    }];
  }) : [];
  const pendingDraft = [...pendingDrafts].sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null;
  const hasUnpublishedDraft = pendingDraft !== null;
  if (canManage && !revision(root.revision)) {
    throw new Error("Cannot edit without the current document revision.");
  }
  const v = root.version == null ? null : record(root.version);
  if (root.version != null &&
      (!v || !str(v.versionId) || !revision(v.versionNumber) || !str(v.title) ||
       typeof v.plainText !== "string" || !str(v.publicationState) ||
       !record(v.structuredContent) || !Array.isArray(v.provisions) ||
       (v.effectiveTo !== null && v.effectiveTo !== undefined && typeof v.effectiveTo !== "string") ||
       (canManage && (!revision(v.revision) ||
         !record(v.sourceProvenance) ||
         (v.sourceDescription !== null && typeof v.sourceDescription !== "string"))))) {
    throw new Error("The document version returned invalid revision evidence.");
  }
  return {
    documentId: root.documentId as string,
    slug: root.slug as string,
    title: root.title as string,
    revision: revision(root.revision),
    organization: {
      organizationId: organization.organizationId as string,
      slug: organization.slug as string,
      officialName: organization.officialName as string,
    },
    allowedActions: { manage: canManage, publish: actions.publish as boolean },
    hasUnpublishedDraft,
    pendingDraft,
    version: v ? {
      versionId: v.versionId as string,
      versionNumber: v.versionNumber as number,
      revision: revision(v.revision),
      title: v.title as string,
      plainText: v.plainText as string,
      structuredContent: v.structuredContent as Record<string, unknown>,
      provisions: parseWorldDocumentProvisions(v.provisions),
      publicationState: v.publicationState as string,
      effectiveFrom: typeof v.effectiveFrom === "string" ? v.effectiveFrom : null,
      effectiveTo: typeof v.effectiveTo === "string" ? v.effectiveTo : null,
      sourceDescription: canManage && typeof v.sourceDescription === "string" ? v.sourceDescription : null,
      sourceProvenance: canManage ? v.sourceProvenance as Record<string, unknown> : null,
    } : null,
  };
}

export type WorldOperationReceipt = {
  operationId: string;
  status: "succeeded" | "processing" | "uncertain" | "failed";
  result: Record<string, unknown> | null;
};

/** Every apparent success must match the exact operation/command and persisted receipt. */
export function parseWorldOperationReceipt(
  value: unknown,
  operationId: string,
  command: string,
): WorldOperationReceipt {
  const root = record(value);
  if (!root || root.operationId !== operationId || root.command !== command ||
      !["succeeded", "processing", "uncertain", "failed"].includes(String(root.status))) {
    throw new Error("The operation receipt did not match the reviewed action.");
  }
  const result = root.result == null ? null : record(root.result);
  if (root.status === "succeeded" && (result?.ok !== true || result.operationId !== operationId)) {
    throw new Error("The operation receipt has no matching canonical success result.");
  }
  return {
    operationId,
    status: root.status as WorldOperationReceipt["status"],
    result,
  };
}
