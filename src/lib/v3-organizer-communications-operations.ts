import type { OperationalNotice } from "@/lib/official-communications";
import {
  createV3NoticeDraft,
  createV3SupersedingNoticeDraft,
  updateV3NoticeDraft,
  type V3NoticeDraftCommandResult,
  type V3NoticeDraftContent,
} from "@/lib/v3-official-communications-draft-commands";
import {
  createV3NoticeOperationId,
  executeV3NoticeLifecycle,
  preflightV3NoticeLifecycle,
  type V3NoticeLifecycleAction,
  type V3NoticeLifecycleCommandResult,
  type V3NoticeLifecyclePreflight,
} from "@/lib/v3-official-communications-commands";

export type OrganizerCommunicationsContext = {
  editionId: string;
};

export type OrganizerNoticeLifecycleReview = {
  editionId: string;
  noticeId: string;
  action: V3NoticeLifecycleAction;
  expectedRevision: number;
  scheduledAt: string | null;
  reason: string | null;
  operationId: string;
  preflight: V3NoticeLifecyclePreflight;
};

function requireEditionId(editionId: string): string {
  const value = editionId.trim();
  if (!value) throw new Error("Choose an edition before operating Official Communications.");
  return value;
}

function requireRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Official Communications requires a positive canonical revision.");
  }
  return revision;
}

function assertNoticeScope(context: OrganizerCommunicationsContext, notice: OperationalNotice): string {
  const editionId = requireEditionId(context.editionId);
  if (notice.editionId !== editionId) {
    throw new Error("The selected communication is outside the current Organizer edition.");
  }
  requireRevision(notice.revision);
  return editionId;
}

function assertLifecycleResult(
  result: V3NoticeLifecycleCommandResult,
  review: OrganizerNoticeLifecycleReview,
): V3NoticeLifecycleCommandResult {
  if (result.status !== "succeeded") {
    throw new Error("Official Communications operation did not settle successfully.");
  }
  const settled = result.result;
  if (!settled || settled.noticeId !== review.noticeId) {
    throw new Error("Official Communications receipt returned the wrong notice.");
  }
  if ((settled.editionId ?? null) !== review.editionId || settled.scopeKind !== "edition") {
    throw new Error("Official Communications receipt crossed Organizer edition scope.");
  }
  if (settled.action !== review.action) {
    throw new Error("Official Communications receipt returned the wrong lifecycle action.");
  }
  return result;
}

function assertDraftResult(
  result: V3NoticeDraftCommandResult,
  editionId: string,
  expectedNoticeId?: string,
): V3NoticeDraftCommandResult {
  if (result.status !== "succeeded") {
    throw new Error("Official Communications draft operation did not settle successfully.");
  }
  const settled = result.result;
  if (!settled || settled.scopeKind !== "edition" || (settled.editionId ?? null) !== editionId) {
    throw new Error("Official Communications draft receipt crossed Organizer edition scope.");
  }
  if (expectedNoticeId && settled.noticeId !== expectedNoticeId) {
    throw new Error("Official Communications draft receipt returned the wrong notice.");
  }
  return result;
}

export async function prepareOrganizerNoticeLifecycleReview(input: {
  context: OrganizerCommunicationsContext;
  notice: OperationalNotice;
  action: V3NoticeLifecycleAction;
  scheduledAt?: string | null;
  reason?: string | null;
}): Promise<OrganizerNoticeLifecycleReview> {
  const editionId = assertNoticeScope(input.context, input.notice);
  const expectedRevision = requireRevision(input.notice.revision);
  const reason = input.reason?.trim() || null;
  const scheduledAt = input.scheduledAt ?? null;
  const operationId = createV3NoticeOperationId();
  const preflight = await preflightV3NoticeLifecycle({
    scopeKind: "edition",
    editionId,
    noticeId: input.notice.id,
    expectedRevision,
    action: input.action,
    scheduledAt,
    reason,
  });

  if (preflight.currentRevision !== expectedRevision || preflight.expectedRevision !== expectedRevision) {
    throw new Error("This communication changed before review. Reload it before continuing.");
  }
  if (!preflight.canCommit || preflight.blockers.length > 0) {
    const detail = preflight.blockers.length > 0 ? ` ${preflight.blockers.join(" ")}` : "";
    throw new Error(`Official Communications cannot perform this action.${detail}`);
  }

  return {
    editionId,
    noticeId: input.notice.id,
    action: input.action,
    expectedRevision,
    scheduledAt,
    reason,
    operationId,
    preflight,
  };
}

export async function commitOrganizerNoticeLifecycleReview(input: {
  context: OrganizerCommunicationsContext;
  currentNotice: OperationalNotice;
  review: OrganizerNoticeLifecycleReview;
}): Promise<V3NoticeLifecycleCommandResult> {
  const editionId = assertNoticeScope(input.context, input.currentNotice);
  const { review } = input;
  if (
    review.editionId !== editionId
    || review.noticeId !== input.currentNotice.id
    || review.expectedRevision !== input.currentNotice.revision
  ) {
    throw new Error("Organizer context or communication revision changed after review. Review again.");
  }

  const result = await executeV3NoticeLifecycle(
    {
      scopeKind: "edition",
      editionId,
      noticeId: review.noticeId,
      expectedRevision: review.expectedRevision,
      action: review.action,
      scheduledAt: review.scheduledAt,
      reason: review.reason,
    },
    review.operationId,
  );
  return assertLifecycleResult(result, review);
}

export async function saveOrganizerNoticeDraft(input: {
  context: OrganizerCommunicationsContext;
  content: V3NoticeDraftContent;
  existing?: OperationalNotice | null;
  operationId?: string;
}): Promise<V3NoticeDraftCommandResult> {
  const editionId = requireEditionId(input.context.editionId);
  const operationId = input.operationId ?? createV3NoticeOperationId();
  if (!input.existing) {
    const result = await createV3NoticeDraft(
      { scopeKind: "edition", editionId },
      input.content,
      { operationId },
    );
    return assertDraftResult(result, editionId);
  }

  assertNoticeScope(input.context, input.existing);
  const result = await updateV3NoticeDraft(
    { scopeKind: "edition", editionId },
    input.existing.id,
    requireRevision(input.existing.revision),
    input.content,
    operationId,
  );
  return assertDraftResult(result, editionId, input.existing.id);
}

export async function supersedeOrganizerNotice(input: {
  context: OrganizerCommunicationsContext;
  notice: OperationalNotice;
  operationId?: string;
}): Promise<V3NoticeDraftCommandResult> {
  const editionId = assertNoticeScope(input.context, input.notice);
  const result = await createV3SupersedingNoticeDraft(
    { scopeKind: "edition", editionId },
    input.notice.id,
    requireRevision(input.notice.revision),
    input.operationId ?? createV3NoticeOperationId(),
  );
  return assertDraftResult(result, editionId);
}
