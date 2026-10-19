import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as any;

export type IntegrityCaseLifecycleStatus =
  | "received"
  | "awaiting_review"
  | "under_review"
  | "waiting_for_reporter"
  | "investigation_opened"
  | "action_taken"
  | "closed_no_violation"
  | "closed_insufficient_evidence"
  | "closed_outside_jurisdiction"
  | "closed_duplicate"
  | "closed";

export type IntegrityCaseTransitionPreview = {
  caseId: string;
  publicCode: string;
  currentStatus: IntegrityCaseLifecycleStatus;
  targetStatus: IntegrityCaseLifecycleStatus;
  expectedVersion: number;
  riskClass: "R2" | "R3";
  isClosure: boolean;
  isReopen: boolean;
  isClosedReclassification: boolean;
  reasonRequired: boolean;
  findings: {
    violation: number;
    noViolation: number;
    insufficientEvidence: number;
    outsideJurisdiction: number;
    duplicate: number;
    administrativeResolution: number;
  };
  findingCount: number;
  activeSanctionCount: number;
  openAppealCount: number;
  openRequestCount: number;
  activeReviewerCount: number;
  actorRecused: boolean;
  actorActiveReviewer: boolean;
  closureAllowed: boolean;
  reopenAllowed: boolean;
  consequence: string;
  blockers: string[];
  serverTime: string;
};

export type IntegrityCaseTransitionReceipt = {
  ok: true;
  riskClass: "R2" | "R3";
  command: "integrity.case_transition";
  operationId: string;
  receiptId: string;
  eventId: string;
  caseId: string;
  publicCode: string;
  previousStatus: IntegrityCaseLifecycleStatus;
  status: IntegrityCaseLifecycleStatus;
  previousVersion: number;
  version: number;
  closedAt: string | null;
  serverTime: string;
};

function required(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

export async function previewIntegrityCaseTransition(input: {
  caseId: string;
  targetStatus: IntegrityCaseLifecycleStatus;
}): Promise<IntegrityCaseTransitionPreview> {
  const caseId = required(input.caseId, "Integrity case");
  const { data, error } = await supabase.rpc("studio2_integrity_case_transition_preview", {
    p_case_id: caseId,
    p_target_status: input.targetStatus,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Integrity lifecycle preview returned invalid data.");
  }

  const preview = data as IntegrityCaseTransitionPreview;
  if (preview.caseId !== caseId || preview.targetStatus !== input.targetStatus) {
    throw new Error("Integrity lifecycle preview returned a different case or target state.");
  }
  if (!Number.isInteger(preview.expectedVersion) || preview.expectedVersion < 0) {
    throw new Error("Integrity lifecycle preview returned an invalid case version.");
  }
  if (!Array.isArray(preview.blockers)) {
    throw new Error("Integrity lifecycle preview omitted blocker evidence.");
  }
  return preview;
}

export async function applyIntegrityCaseTransition(input: {
  caseId: string;
  targetStatus: IntegrityCaseLifecycleStatus;
  reason?: string | null;
  expectedVersion: number;
  operationId: string;
  idempotencyKey: string;
}): Promise<IntegrityCaseTransitionReceipt> {
  const caseId = required(input.caseId, "Integrity case");
  const operationId = required(input.operationId, "Operation id");
  const idempotencyKey = required(input.idempotencyKey, "Idempotency key");

  const { data, error } = await supabase.rpc("studio2_apply_integrity_case_transition", {
    p_case_id: caseId,
    p_target_status: input.targetStatus,
    p_reason: input.reason ?? null,
    p_expected_version: input.expectedVersion,
    p_operation_id: operationId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Integrity lifecycle command returned invalid receipt evidence.");
  }

  const receipt = data as IntegrityCaseTransitionReceipt;
  if (
    !receipt.ok ||
    receipt.command !== "integrity.case_transition" ||
    receipt.caseId !== caseId ||
    receipt.status !== input.targetStatus ||
    receipt.operationId !== operationId ||
    receipt.receiptId !== operationId
  ) {
    throw new Error("Integrity lifecycle command returned contradictory receipt evidence.");
  }
  if (
    !Number.isInteger(receipt.version) ||
    receipt.version <= input.expectedVersion ||
    receipt.previousVersion !== input.expectedVersion
  ) {
    throw new Error("Integrity lifecycle command returned stale or contradictory version evidence.");
  }
  return receipt;
}
