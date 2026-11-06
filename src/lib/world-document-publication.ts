/**
 * TG4 publication consumer helpers. These interpret canonical snapshots only;
 * they do not decide authorization or publish legal text in the browser.
 */
import type { WorldDocumentDraftSnapshot } from "./world-document-draft-model";

export const EFFECTIVE_DATE_COMMAND = "world.document.version.effective_date.set";
export const PUBLISH_DOCUMENT_COMMAND = "world.document.version.publish";

/**
 * Exact UTC minute, not a locale-dependent local time. An invalid date (e.g.
 * February 30) must not silently roll into the next month.
 */
export function parseUtcEffectiveMinute(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const parsed = new Date(value + ":00.000Z");
  if (!Number.isFinite(parsed.getTime())) return null;
  const utc = parsed.toISOString();
  return utc.slice(0, 16) === value ? utc : null;
}

export function isPublicationReady(input: {
  document: WorldDocumentDraftSnapshot | null | undefined;
  pending: WorldDocumentDraftSnapshot | null | undefined;
  now: number;
}): boolean {
  const { document, pending, now } = input;
  const draft = pending?.version;
  if (!document || !draft || !document.allowedActions.publish ||
      !document.allowedActions.manage || !pending.allowedActions.manage ||
      !document.revision || !draft.revision || !document.pendingDraft ||
      pending.documentId !== document.documentId ||
      pending.organization.organizationId !== document.organization.organizationId ||
      draft.versionId !== document.pendingDraft.versionId ||
      draft.versionNumber !== document.pendingDraft.versionNumber ||
      draft.publicationState !== "draft" ||
      draft.effectiveFrom === null ||
      !Number.isFinite(Date.parse(draft.effectiveFrom)) ||
      Date.parse(draft.effectiveFrom) > now ||
      !(draft.plainText.trim() || draft.provisions.length)) return false;
  return true;
}

/** A stale receipt/result for another document/version must never show success. */
export function assertPublicationResultIdentity(
  value: Record<string, unknown> | null,
  documentId: string,
  versionId: string,
): void {
  if (!value || value.documentId !== documentId || value.versionId !== versionId ||
      typeof value.contentHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.contentHash)) {
    throw new Error("The legal-publication receipt has mismatched canonical identity or hash.");
  }
}
