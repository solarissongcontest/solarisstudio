import { supabase } from "@/integrations/supabase/client";

export type V3NoticeScopeKind = "edition" | "global";
export type V3NoticeLifecycleAction =
  | "schedule"
  | "publish"
  | "cancel"
  | "archive"
  | "restore"
  | "delete";

export type V3NoticeLifecycleIntent = {
  scopeKind: V3NoticeScopeKind;
  editionId: string | null;
  noticeId: string;
  expectedRevision: number;
  action: V3NoticeLifecycleAction;
  scheduledAt?: string | null;
  reason?: string | null;
};

export type V3NoticeLifecyclePreflight = {
  ok: true;
  serverTime: string;
  scopeKind: V3NoticeScopeKind;
  editionId: string | null;
  noticeId: string;
  action: V3NoticeLifecycleAction;
  riskClass: "R1" | "R2" | "R3";
  currentRevision: number;
  expectedRevision: number;
  state: string;
  archived: boolean;
  scheduledAt: string | null;
  publishedAt: string | null;
  audience: string;
  audienceGroup: string | null;
  displaySurfaces: string[];
  acknowledgementRequired: boolean;
  recipientReceiptCount: number;
  blockers: string[];
  canCommit: boolean;
};

export type V3NoticeLifecycleCommandResult = {
  status: "processing" | "succeeded" | "failed" | "uncertain";
  operationId: string;
  correlationId?: string;
  replayed?: boolean;
  result?: {
    ok?: boolean;
    noticeId?: string;
    editionId?: string | null;
    scopeKind?: V3NoticeScopeKind;
    action?: V3NoticeLifecycleAction;
    stateVersion?: number;
    state?: string;
    archived?: boolean;
    scheduledAt?: string | null;
    publishedAt?: string | null;
    deleted?: boolean;
    previousRevision?: number;
    operationId?: string;
    serverTime?: string;
    notice?: Record<string, unknown>;
  };
  error?: {
    code?: string;
    metadata?: Record<string, unknown>;
  } | null;
};

function rpcArgs(intent: V3NoticeLifecycleIntent) {
  return {
    p_scope_kind: intent.scopeKind,
    p_edition_id: intent.editionId,
    p_notice_id: intent.noticeId,
    p_expected_revision: intent.expectedRevision,
    p_action: intent.action,
    p_scheduled_at: intent.scheduledAt ?? null,
    p_reason: intent.reason?.trim() || null,
  };
}

export async function preflightV3NoticeLifecycle(
  intent: V3NoticeLifecycleIntent,
): Promise<V3NoticeLifecyclePreflight> {
  const { data, error } = await (supabase as any).rpc(
    "v3_preflight_notice_lifecycle",
    rpcArgs(intent),
  );
  if (error) throw error;
  if (!data || data.noticeId !== intent.noticeId || data.scopeKind !== intent.scopeKind) {
    throw new Error("Official Communications preflight returned the wrong command scope.");
  }
  if ((data.editionId ?? null) !== intent.editionId) {
    throw new Error("Official Communications preflight crossed edition scope.");
  }
  return data as V3NoticeLifecyclePreflight;
}

export function createV3NoticeOperationId(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("Secure operation identity is unavailable in this browser.");
  }
  return crypto.randomUUID();
}

export async function executeV3NoticeLifecycle(
  intent: V3NoticeLifecycleIntent,
  operationId = createV3NoticeOperationId(),
): Promise<V3NoticeLifecycleCommandResult> {
  const commandArgs = {
    ...rpcArgs(intent),
    p_operation_id: operationId,
    p_idempotency_key: operationId,
    p_correlation_id: operationId,
  };

  const { data, error } = await (supabase as any).rpc(
    "v3_execute_notice_lifecycle",
    commandArgs,
  );
  if (!error) return data as V3NoticeLifecycleCommandResult;

  // A transport failure after commit is not permission to publish/delete twice.
  // Resolve the same operation identity first. If it never reached the server,
  // reconciliation will not claim a success and the original failure survives.
  const { data: reconciled, error: reconcileError } = await (supabase as any).rpc(
    "studio2_reconcile_operation",
    { p_operation_id: operationId },
  );
  const recovery = reconciled as V3NoticeLifecycleCommandResult | null;
  if (!reconcileError && recovery?.status === "succeeded") return recovery;

  throw error;
}
