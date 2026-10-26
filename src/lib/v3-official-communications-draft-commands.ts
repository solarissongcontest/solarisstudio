import { supabase } from "@/integrations/supabase/client";
import type { V3NoticeScopeKind } from "@/lib/v3-official-communications-commands";
import { createV3NoticeOperationId } from "@/lib/v3-official-communications-commands";

export type V3NoticeDraftContent = {
  noticeType: string;
  title: string;
  body: string;
  severity: string;
  audience: string;
  audienceGroup?: string | null;
  countryIds?: string[];
  acknowledgementRequired?: boolean;
  displaySurfaces: string[];
};

export type V3NoticeDraftScope = {
  scopeKind: V3NoticeScopeKind;
  editionId: string | null;
};

export type V3NoticeDraftCommandResult = {
  status: "processing" | "succeeded" | "failed" | "uncertain";
  operationId: string;
  correlationId?: string;
  replayed?: boolean;
  result?: {
    ok?: boolean;
    noticeId?: string;
    sourceNoticeId?: string;
    editionId?: string | null;
    scopeKind?: V3NoticeScopeKind;
    action?: string;
    stateVersion?: number;
    sourceRevision?: number;
    state?: string;
    notice?: Record<string, unknown>;
    operationId?: string;
    serverTime?: string;
  };
  error?: { code?: string; metadata?: Record<string, unknown> } | null;
};

async function reconcileOrThrow(
  operationId: string,
  originalError: unknown,
): Promise<V3NoticeDraftCommandResult> {
  const { data, error } = await (supabase as any).rpc(
    "studio2_reconcile_operation",
    { p_operation_id: operationId },
  );
  const recovered = data as V3NoticeDraftCommandResult | null;
  if (!error && recovered?.status === "succeeded") return recovered;
  throw originalError;
}

function identity(operationId?: string) {
  const value = operationId ?? createV3NoticeOperationId();
  return {
    p_operation_id: value,
    p_idempotency_key: value,
    p_correlation_id: value,
  };
}

export async function createV3NoticeDraft(
  scope: V3NoticeDraftScope,
  content: V3NoticeDraftContent,
  options: { supersedesId?: string | null; operationId?: string } = {},
): Promise<V3NoticeDraftCommandResult> {
  const ids = identity(options.operationId);
  const { data, error } = await (supabase as any).rpc("v3_create_notice_draft", {
    p_scope_kind: scope.scopeKind,
    p_edition_id: scope.editionId,
    p_notice_type: content.noticeType,
    p_title: content.title,
    p_body: content.body,
    p_severity: content.severity,
    p_audience: content.audience,
    p_audience_group: content.audienceGroup ?? null,
    p_country_ids: content.countryIds ?? [],
    p_acknowledgement_required: content.acknowledgementRequired ?? false,
    p_display_surfaces: content.displaySurfaces,
    p_supersedes_id: options.supersedesId ?? null,
    ...ids,
  });
  if (!error) return data as V3NoticeDraftCommandResult;
  return reconcileOrThrow(ids.p_operation_id, error);
}

export async function updateV3NoticeDraft(
  scope: V3NoticeDraftScope,
  noticeId: string,
  expectedRevision: number,
  content: V3NoticeDraftContent,
  operationId?: string,
): Promise<V3NoticeDraftCommandResult> {
  const ids = identity(operationId);
  const { data, error } = await (supabase as any).rpc("v3_update_notice_draft", {
    p_scope_kind: scope.scopeKind,
    p_edition_id: scope.editionId,
    p_notice_id: noticeId,
    p_expected_revision: expectedRevision,
    p_notice_type: content.noticeType,
    p_title: content.title,
    p_body: content.body,
    p_severity: content.severity,
    p_audience: content.audience,
    p_audience_group: content.audienceGroup ?? null,
    p_country_ids: content.countryIds ?? [],
    p_acknowledgement_required: content.acknowledgementRequired ?? false,
    p_display_surfaces: content.displaySurfaces,
    ...ids,
  });
  if (!error) return data as V3NoticeDraftCommandResult;
  return reconcileOrThrow(ids.p_operation_id, error);
}

export async function createV3SupersedingNoticeDraft(
  scope: V3NoticeDraftScope,
  sourceNoticeId: string,
  expectedRevision: number,
  operationId?: string,
): Promise<V3NoticeDraftCommandResult> {
  const ids = identity(operationId);
  const { data, error } = await (supabase as any).rpc(
    "v3_create_superseding_notice_draft",
    {
      p_scope_kind: scope.scopeKind,
      p_edition_id: scope.editionId,
      p_notice_id: sourceNoticeId,
      p_expected_revision: expectedRevision,
      ...ids,
    },
  );
  if (!error) return data as V3NoticeDraftCommandResult;
  return reconcileOrThrow(ids.p_operation_id, error);
}
