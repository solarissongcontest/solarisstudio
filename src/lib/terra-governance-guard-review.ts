import { supabase as typedSupabase } from "@/integrations/supabase/client";
import {
  normalizeGuardApplication,
  parseGuardIntakeReceipt,
  validateGuardApplication,
  type GuardApplicationFields,
} from "@/lib/terra-governance-guard-intake";

// The database command, not this UI adapter, decides eligibility and workflow state.
const supabase = typedSupabase as any;

export type GuardReviewPhase = "submitted" | "under_review" | "introduced";
export type GuardReviewAction = "review" | "introduce";
export type GuardReviewCursor = { submittedAt: string; id: string };

export type GuardReviewApplication = {
  id: string;
  countryId: string;
  countryName: string;
  countryCode: string;
  officialDesignation: string;
  governmentSystem: string;
  motivation: string;
  contributions: string;
  commitment: string;
  intakeSource: "solaris" | "external";
  sourceReference: string | null;
  status: GuardReviewPhase;
  submittedAt: string;
  revision: number;
};

export type GuardReviewInbox = {
  organizationId: string;
  organizationName: string;
  status: GuardReviewPhase;
  canIntroduce: boolean;
  items: GuardReviewApplication[];
  nextCursor: GuardReviewCursor | null;
};

export type GuardReviewOperation = {
  operationId: string;
  idempotencyKey: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHASES = ["submitted", "under_review", "introduced"] as const;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64
    && Number.isFinite(Date.parse(value));
}

function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

export function parseGuardReviewInbox(
  response: unknown,
  phase: GuardReviewPhase,
): GuardReviewInbox {
  const input = record(response);
  if (!input || !UUID.test(String(input.organizationId))
    || !validText(input.organizationName, 160)
    || input.status !== phase
    || typeof input.canIntroduce !== "boolean"
    || !Array.isArray(input.items) || input.items.length > 20) {
    throw new Error("The institutional review projection is incomplete.");
  }

  const items: GuardReviewApplication[] = input.items.map((unknownRow: unknown) => {
    const row = record(unknownRow);
    if (!row
      || !UUID.test(String(row.id)) || !UUID.test(String(row.countryId))
      || !validText(row.countryName, 160) || !validText(row.countryCode, 20)
      || !validText(row.officialDesignation, 160)
      || !validText(row.governmentSystem, 200)
      || !validText(row.motivation, 3000)
      || !validText(row.contributions, 3000)
      || !validText(row.commitment, 3000)
      || (row.intakeSource !== "solaris" && row.intakeSource !== "external")
      || !((row.intakeSource === "solaris" && row.sourceReference === null) ||
        (row.intakeSource === "external" && validText(row.sourceReference, 500)))
      || row.status !== phase || !validTimestamp(row.submittedAt)
      || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1) {
      throw new Error("The institutional review projection is incomplete.");
    }
    return row as GuardReviewApplication;
  });

  const next = input.nextCursor === null ? null : record(input.nextCursor);
  if (input.nextCursor !== null && (
    !next || !UUID.test(String(next.id)) || !validTimestamp(next.submittedAt)
    || items.length !== 20
    || items[19]?.id !== next.id
    || items[19]?.submittedAt !== next.submittedAt
  )) {
    throw new Error("The institutional review pagination cursor is invalid.");
  }
  return {
    organizationId: input.organizationId as string,
    organizationName: input.organizationName as string,
    status: phase,
    canIntroduce: input.canIntroduce as boolean,
    items,
    nextCursor: next as GuardReviewCursor | null,
  };
}

export async function loadGuardReviewInbox(
  phase: GuardReviewPhase,
  cursor: GuardReviewCursor | null = null,
): Promise<GuardReviewInbox> {
  if (!PHASES.includes(phase)) throw new Error("Invalid review phase.");
  const { data, error } = await supabase.rpc("world_guard_review_inbox_v1", {
    p_status: phase,
    p_before_submitted_at: cursor?.submittedAt ?? null,
    p_before_id: cursor?.id ?? null,
  });
  if (error) throw error;
  return parseGuardReviewInbox(data, phase);
}

export function newGuardReviewOperation(): GuardReviewOperation {
  const id = crypto.randomUUID();
  return {
    operationId: id,
    idempotencyKey: "guard-review:" + id,
  };
}

export function nextGuardReviewPhase(
  current: GuardReviewPhase,
  action: GuardReviewAction,
): GuardReviewPhase | null {
  if (current === "submitted" && action === "review") return "under_review";
  if (current === "under_review" && action === "introduce") return "introduced";
  return null;
}

export function parseGuardReviewReceipt(
  response: unknown,
  expected: {
    applicationId: string;
    organizationId: string;
    countryId: string;
    expectedRevision: number;
    targetStatus: GuardReviewPhase;
    operationId: string;
  },
): { applicationId: string; revision: number; status: GuardReviewPhase } {
  const envelope = record(response);
  const result = record(envelope?.result);
  if (!envelope || !result || envelope.status !== "succeeded"
    || envelope.operationId !== expected.operationId
    || result.ok !== true || result.operationId !== expected.operationId
    || result.applicationId !== expected.applicationId
    || result.organizationId !== expected.organizationId
    || result.countryId !== expected.countryId
    || result.status !== expected.targetStatus
    || result.revision !== expected.expectedRevision + 1) {
    throw new Error("The GUARD review receipt could not be verified. Refresh the current application before retrying.");
  }
  return {
    applicationId: expected.applicationId,
    revision: result.revision as number,
    status: expected.targetStatus,
  };
}

export async function advanceGuardReview({
  organizationId, application, action, operation,
}: {
  organizationId: string;
  application: GuardReviewApplication;
  action: GuardReviewAction;
  operation: GuardReviewOperation;
}): Promise<{ applicationId: string; revision: number; status: GuardReviewPhase }> {
  const targetStatus = nextGuardReviewPhase(application.status, action);
  if (!targetStatus || !Number.isSafeInteger(application.revision)
    || application.revision < 1) {
    throw new Error("This application cannot take that procedural action.");
  }
  const { data, error } = await supabase.rpc("world_review_guard_application_v1", {
    p_organization_id: organizationId,
    p_country_id: application.countryId,
    p_application_id: application.id,
    p_expected_revision: application.revision,
    p_action: action,
    p_operation_id: operation.operationId,
    p_idempotency_key: operation.idempotencyKey,
  });
  if (error) throw error;
  return parseGuardReviewReceipt(data, {
    applicationId: application.id,
    organizationId,
    countryId: application.countryId,
    expectedRevision: application.revision,
    targetStatus,
    operationId: operation.operationId,
  });
}


/** Bounded public country names for the private Chairperson intake picker. */
export type GuardReviewCountry = { id: string; name: string; short_code: string };

export function parseGuardReviewCountries(value: unknown): GuardReviewCountry[] {
  if (!Array.isArray(value) || value.length > 200) {
    throw new Error("Country options could not be verified.");
  }
  const seen = new Set<string>();
  return value.map((item) => {
    const row = record(item);
    if (!row || !UUID.test(String(row.id)) || !validText(row.name, 200)
      || !validText(row.short_code, 20) || seen.has(row.id as string)) {
      throw new Error("Country options could not be verified.");
    }
    seen.add(row.id as string);
    return { id: row.id as string, name: row.name as string, short_code: row.short_code as string };
  });
}

export async function loadGuardReviewCountries(): Promise<GuardReviewCountry[]> {
  const { data, error } = await supabase.from("countries")
    .select("id,name,short_code").order("name").limit(200);
  if (error) throw error;
  return parseGuardReviewCountries(data);
}

export type GuardExternalIntakeRequest = {
  organizationId: string;
  countryId: string;
  fields: GuardApplicationFields;
  sourceReference: string;
  operation: GuardReviewOperation;
};

export function newGuardExternalIntakeOperation(): GuardReviewOperation {
  const id = crypto.randomUUID();
  return { operationId: id, idempotencyKey: "guard-external-intake:" + id };
}

export function validateGuardExternalIntake(
  fields: GuardApplicationFields,
  sourceReference: string,
): Record<string, string> {
  const errors: Record<string, string> = { ...validateGuardApplication(fields) };
  const length = sourceReference.trim().length;
  if (length < 8 || length > 500) errors.sourceReference = "Provide a source record between 8 and 500 characters.";
  return errors;
}

export function parseGuardExternalIntakeReceipt(
  response: unknown,
  expected: { organizationId: string; countryId: string; operationId: string },
): { applicationId: string; operationId: string; status: "submitted" } {
  const envelope = record(response);
  const result = record(envelope?.result);
  if (!result || result.intakeSource !== "external") {
    throw new Error("The external application receipt could not be verified.");
  }
  return parseGuardIntakeReceipt(response, expected);
}

export async function registerExternalGuardApplication({
  organizationId,countryId,fields,sourceReference,operation,
}: GuardExternalIntakeRequest): Promise<{ applicationId: string; operationId: string; status: "submitted" }> {
  if (!UUID.test(organizationId) || !UUID.test(countryId) ||
    !UUID.test(operation.operationId) ||
    Object.keys(validateGuardExternalIntake(fields,sourceReference)).length > 0) {
    throw new Error("Correct the external application fields before registration.");
  }
  const normalized = normalizeGuardApplication(fields);
  const { data, error } = await supabase.rpc("world_register_external_guard_application_v1", {
    p_organization_id: organizationId,
    p_country_id: countryId,
    p_official_state_designation: normalized.officialDesignation,
    p_government_system: normalized.governmentSystem,
    p_motivation: normalized.motivation,
    p_contributions: normalized.contributions,
    p_international_commitment: normalized.commitment,
    p_source_reference: sourceReference.trim(),
    p_operation_id: operation.operationId,
    p_idempotency_key: operation.idempotencyKey,
  });
  if (error) throw error;
  return parseGuardExternalIntakeReceipt(data, {
    organizationId,countryId,operationId:operation.operationId,
  });
}

export function guardReviewErrorMessage(error: unknown): string {
  const row = record(error);
  const code = typeof row?.code === "string" ? row.code : "";
  const message = typeof row?.message === "string" ? row.message : "";
  if (code === "42501" || message.includes("AUTHORIZATION"))
    return "Your current institutional authority does not permit this review.";
  if (message.includes("VERSION_CONFLICT") || message.includes("APPLICATION_LOCKED"))
    return "The application changed. Refresh before taking another action.";
  if (code === "PGRST202" || code === "PGRST205" || code === "42P01")
    return "Institutional application review is not available on this deployment.";
  if (message.includes("VALIDATION"))
    return "The requested action was rejected. Refresh and check the current state.";
  // Never show private application data or raw SQL diagnostics in error banners.
  return "The operation could not be confirmed. Check the server state before retrying.";
}
