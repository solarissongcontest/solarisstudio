import type { OperationalNotice } from "@/lib/official-communications";
import { validateOperationalNotice } from "@/lib/official-communications";
import type { SaveStudio2NoticeInput } from "@/lib/studio2-communications";
import {
  executeV3NoticeLifecycle,
  preflightV3NoticeLifecycle,
  type V3NoticeLifecycleAction,
  type V3NoticeLifecycleCommandResult,
  type V3NoticeLifecycleIntent,
} from "@/lib/v3-official-communications-commands";
import {
  createV3NoticeDraft,
  createV3SupersedingNoticeDraft,
  updateV3NoticeDraft,
  type V3NoticeDraftCommandResult,
  type V3NoticeDraftContent,
} from "@/lib/v3-official-communications-draft-commands";

type RawNotice = {
  id?: unknown;
  edition_id?: unknown;
  notice_type?: unknown;
  title?: unknown;
  body?: unknown;
  severity?: unknown;
  audience?: unknown;
  audience_group?: unknown;
  country_ids?: unknown;
  acknowledgement_required?: unknown;
  display_surfaces?: unknown;
  status?: unknown;
  scheduled_at?: unknown;
  sent_at?: unknown;
  cancelled_at?: unknown;
  archived_at?: unknown;
  superseded_by_id?: unknown;
  revision?: unknown;
};

type CommandResult = V3NoticeLifecycleCommandResult | V3NoticeDraftCommandResult;

function editionScope(editionId: string | null | undefined) {
  const normalized = editionId?.trim() ?? "";
  if (!normalized) {
    throw new Error("Official Communications requires an explicit edition scope.");
  }
  return { scopeKind: "edition" as const, editionId: normalized };
}

function draftContent(input: SaveStudio2NoticeInput): V3NoticeDraftContent {
  return {
    noticeType: input.noticeType,
    title: input.title.trim(),
    body: input.body.trim(),
    severity: input.severity,
    audience: input.audience,
    audienceGroup: input.audienceGroup,
    countryIds: [...input.countryIds],
    acknowledgementRequired: input.acknowledgementRequired,
    displaySurfaces: [...input.displaySurfaces],
  };
}

function requireSucceeded(result: CommandResult, label: string) {
  if (result.status !== "succeeded" || !result.result?.ok) {
    const code = result.error?.code ? ` (${result.error.code})` : "";
    throw new Error(`${label} did not complete authoritatively${code}. Reconcile the operation before retrying.`);
  }
  return result.result;
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Official Communications command returned an invalid ${label}.`);
  }
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Official Communications command returned invalid ${label}.`);
  }
  return value as string[];
}

function noticeFromCommand(result: CommandResult, expectedEditionId: string, expectedNoticeId?: string) {
  const payload = requireSucceeded(result, "Official Communications operation");
  const raw = payload.notice as RawNotice | undefined;
  if (!raw || typeof raw !== "object") {
    throw new Error("Official Communications command completed without an authoritative notice projection.");
  }

  const id = requiredString(raw.id, "notice id");
  const editionId = requiredString(raw.edition_id, "edition id");
  if (editionId !== expectedEditionId) {
    throw new Error("Official Communications command crossed edition scope.");
  }
  if (expectedNoticeId && id !== expectedNoticeId) {
    throw new Error("Official Communications command returned a different notice than the reviewed object.");
  }

  const revision = Number(raw.revision);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error("Official Communications command returned an invalid notice revision.");
  }

  const notice: OperationalNotice = {
    id,
    editionId,
    noticeType: requiredString(raw.notice_type, "notice type") as OperationalNotice["noticeType"],
    title: requiredString(raw.title, "title"),
    body: requiredString(raw.body, "body"),
    severity: requiredString(raw.severity, "severity") as OperationalNotice["severity"],
    audience: requiredString(raw.audience, "audience") as OperationalNotice["audience"],
    audienceGroup: nullableString(raw.audience_group) as OperationalNotice["audienceGroup"],
    countryIds: stringArray(raw.country_ids ?? [], "country ids"),
    acknowledgementRequired: Boolean(raw.acknowledgement_required),
    displaySurfaces: stringArray(raw.display_surfaces ?? [], "display surfaces") as OperationalNotice["displaySurfaces"],
    state: requiredString(raw.status, "notice state") as OperationalNotice["state"],
    scheduledAt: nullableString(raw.scheduled_at),
    sentAt: nullableString(raw.sent_at),
    cancelledAt: nullableString(raw.cancelled_at),
    archivedAt: nullableString(raw.archived_at),
    supersededById: nullableString(raw.superseded_by_id),
    revision,
  };

  validateOperationalNotice(notice);
  return notice;
}

function assertReviewedNoticeScope(notice: OperationalNotice, expectedEditionId: string) {
  if (notice.editionId !== expectedEditionId) {
    throw new Error("The reviewed communication is outside the current edition scope.");
  }
  if (!Number.isInteger(notice.revision) || notice.revision < 1) {
    throw new Error("The reviewed communication does not have a valid canonical revision.");
  }
}

async function executeReviewedLifecycle(
  notice: OperationalNotice,
  action: V3NoticeLifecycleAction,
  options: { scheduledAt?: string | null; reason?: string | null } = {},
): Promise<V3NoticeLifecycleCommandResult> {
  const scope = editionScope(notice.editionId);
  assertReviewedNoticeScope(notice, scope.editionId);

  if (action === "delete" && !options.reason?.trim()) {
    throw new Error("Permanent communication deletion requires an Organizer reason.");
  }

  const intent: V3NoticeLifecycleIntent = {
    ...scope,
    noticeId: notice.id,
    expectedRevision: notice.revision,
    action,
    scheduledAt: options.scheduledAt ?? null,
    reason: options.reason?.trim() || null,
  };

  const preflight = await preflightV3NoticeLifecycle(intent);
  if (preflight.currentRevision !== notice.revision) {
    throw new Error(
      `This communication changed while it was being reviewed (r${notice.revision} → r${preflight.currentRevision}). Reload it before applying the action.`,
    );
  }
  if (!preflight.canCommit) {
    const detail = preflight.blockers.length ? ` ${preflight.blockers.join(" ")}` : "";
    throw new Error(`The server blocked this communication action.${detail}`);
  }

  return executeV3NoticeLifecycle(intent);
}

export async function createOrganizerNoticeDraft(
  input: SaveStudio2NoticeInput,
): Promise<OperationalNotice> {
  const scope = editionScope(input.editionId);
  const result = await createV3NoticeDraft(scope, draftContent(input));
  return noticeFromCommand(result, scope.editionId);
}

export async function updateOrganizerNoticeDraft(
  reviewedNotice: OperationalNotice,
  input: SaveStudio2NoticeInput,
): Promise<OperationalNotice> {
  const scope = editionScope(input.editionId);
  assertReviewedNoticeScope(reviewedNotice, scope.editionId);
  const result = await updateV3NoticeDraft(
    scope,
    reviewedNotice.id,
    reviewedNotice.revision,
    draftContent(input),
  );
  return noticeFromCommand(result, scope.editionId, reviewedNotice.id);
}

export async function createSupersedingOrganizerNoticeDraft(
  reviewedNotice: OperationalNotice,
): Promise<OperationalNotice> {
  const scope = editionScope(reviewedNotice.editionId);
  assertReviewedNoticeScope(reviewedNotice, scope.editionId);
  const result = await createV3SupersedingNoticeDraft(
    scope,
    reviewedNotice.id,
    reviewedNotice.revision,
  );
  return noticeFromCommand(result, scope.editionId);
}

export async function scheduleOrganizerNotice(
  reviewedNotice: OperationalNotice,
  scheduledAt: string,
): Promise<OperationalNotice> {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error("The scheduled publication time is invalid.");
  }
  const result = await executeReviewedLifecycle(reviewedNotice, "schedule", {
    scheduledAt: date.toISOString(),
  });
  return noticeFromCommand(result, editionScope(reviewedNotice.editionId).editionId, reviewedNotice.id);
}

export async function publishOrganizerNotice(
  reviewedNotice: OperationalNotice,
): Promise<OperationalNotice> {
  const result = await executeReviewedLifecycle(reviewedNotice, "publish");
  return noticeFromCommand(result, editionScope(reviewedNotice.editionId).editionId, reviewedNotice.id);
}

export async function cancelOrganizerNotice(
  reviewedNotice: OperationalNotice,
  reason: string,
): Promise<OperationalNotice> {
  const result = await executeReviewedLifecycle(reviewedNotice, "cancel", { reason });
  return noticeFromCommand(result, editionScope(reviewedNotice.editionId).editionId, reviewedNotice.id);
}

export async function archiveOrganizerCommunication(
  reviewedNotice: OperationalNotice,
  reason: string,
): Promise<OperationalNotice> {
  const result = await executeReviewedLifecycle(reviewedNotice, "archive", { reason });
  return noticeFromCommand(result, editionScope(reviewedNotice.editionId).editionId, reviewedNotice.id);
}

export async function restoreOrganizerCommunication(
  reviewedNotice: OperationalNotice,
): Promise<OperationalNotice> {
  const result = await executeReviewedLifecycle(reviewedNotice, "restore");
  return noticeFromCommand(result, editionScope(reviewedNotice.editionId).editionId, reviewedNotice.id);
}

export async function deleteOrganizerCommunication(
  reviewedNotice: OperationalNotice,
  reason: string,
): Promise<void> {
  const result = await executeReviewedLifecycle(reviewedNotice, "delete", { reason });
  const payload = requireSucceeded(result, "Permanent communication deletion");
  if (!payload.deleted || payload.noticeId !== reviewedNotice.id) {
    throw new Error("Permanent communication deletion did not return authoritative deletion evidence.");
  }
}
