import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as any;

// Client validation is a usability aid only. The authoritative SQL command
// independently checks scope, lengths, current membership and duplicate intake.
export const GUARD_APPLICATION_LIMITS = {
  officialDesignation: { min: 2, max: 160 },
  governmentSystem: { min: 2, max: 200 },
  motivation: { min: 20, max: 3000 },
  contributions: { min: 20, max: 3000 },
  commitment: { min: 20, max: 3000 },
} as const;

export type GuardApplicationFields = {
  officialDesignation: string;
  governmentSystem: string;
  motivation: string;
  contributions: string;
  commitment: string;
};

export type GuardApplicationField = keyof GuardApplicationFields;
export type GuardApplicationErrors = Partial<Record<GuardApplicationField, string>>;

export const EMPTY_GUARD_APPLICATION: GuardApplicationFields = {
  officialDesignation: "",
  governmentSystem: "",
  motivation: "",
  contributions: "",
  commitment: "",
};

export function normalizeGuardApplication(input: GuardApplicationFields): GuardApplicationFields {
  return {
    officialDesignation: input.officialDesignation.trim(),
    governmentSystem: input.governmentSystem.trim(),
    motivation: input.motivation.trim(),
    contributions: input.contributions.trim(),
    commitment: input.commitment.trim(),
  };
}

export function validateGuardApplication(input: GuardApplicationFields): GuardApplicationErrors {
  const values = normalizeGuardApplication(input);
  const errors: GuardApplicationErrors = {};
  (Object.keys(GUARD_APPLICATION_LIMITS) as GuardApplicationField[]).forEach((field) => {
    const limit = GUARD_APPLICATION_LIMITS[field];
    if (values[field].length < limit.min) {
      errors[field] = `At least ${limit.min} characters are required.`;
    } else if (values[field].length > limit.max) {
      errors[field] = `Use no more than ${limit.max} characters.`;
    }
  });
  return errors;
}

export type GuardMembershipApplicationRow = {
  id: string;
  status: "submitted" | "under_review" | "introduced" | "approved" | "rejected" | "withdrawn";
  official_state_designation: string;
  submitted_at: string;
  revision: number;
};

export type GuardIntakeProjection = {
  organizationId: string;
  organizationName: string;
  activeMembership: string | null;
  applications: GuardMembershipApplicationRow[];
};

const KNOWN_GUARD_APPLICATION_STATES = new Set([
  "submitted", "under_review", "introduced", "approved", "rejected", "withdrawn",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse the authenticated, single-snapshot projection. Invalid or unknown
 * server states do not open the form; they produce a recoverable error.
 */
export function parseGuardIntakeProjection(value: unknown): GuardIntakeProjection {
  if (!isRecord(value) ||
    typeof value.organizationId !== "string" ||
    value.organizationId.length < 30 ||
    typeof value.organizationName !== "string" ||
    !value.organizationName.trim() ||
    !(value.activeMembership === null || typeof value.activeMembership === "string") ||
    !Array.isArray(value.applications) ||
    value.applications.length > 5) {
    throw new Error("The GUARD application status response is incomplete.");
  }

  const applications: GuardMembershipApplicationRow[] = [];
  for (const row of value.applications) {
    if (!isRecord(row) ||
      typeof row.id !== "string" ||
      row.id.length < 30 ||
      typeof row.status !== "string" ||
      !KNOWN_GUARD_APPLICATION_STATES.has(row.status) ||
      typeof row.official_state_designation !== "string" ||
      row.official_state_designation.length > 160 ||
      typeof row.submitted_at !== "string" ||
      !Number.isFinite(Date.parse(row.submitted_at)) ||
      !Number.isSafeInteger(row.revision) ||
      (row.revision as number) < 1) {
      throw new Error("The GUARD application history response is incomplete.");
    }
    applications.push({
      id: row.id,
      status: row.status as GuardMembershipApplicationRow["status"],
      official_state_designation: row.official_state_designation,
      submitted_at: row.submitted_at,
      revision: row.revision as number,
    });
  }

  return {
    organizationId: value.organizationId,
    organizationName: value.organizationName,
    activeMembership: value.activeMembership,
    applications,
  } as GuardIntakeProjection;
}

/** Canonical one-request, active-country-controller read, with five-row bound. */
export async function loadGuardIntake(countryId: string): Promise<GuardIntakeProjection> {
  if (!countryId) throw new Error("An active country is required.");
  const { data, error } = await supabase.rpc("world_my_guard_membership_intake_v1", {
    p_country_id: countryId,
  });
  if (error) throw error;
  return parseGuardIntakeProjection(data);
}

export type GuardIntakeOperation = { operationId: string; idempotencyKey: string };

export function newGuardIntakeOperation(): GuardIntakeOperation {
  const id = crypto.randomUUID();
  return { operationId: id, idempotencyKey: `guard-intake:${id}` };
}

export type GuardConfirmedApplication = {
  applicationId: string;
  operationId: string;
  status: "submitted";
};

/**
 * Reject ambiguous/scope-mismatched acknowledgements. A successful HTTP
 * response is not a durable receipt: only a succeeded canonical operation
 * containing the matching country, organization and operation counts.
 */
export function parseGuardIntakeReceipt(
  value: unknown,
  expected: { operationId: string; organizationId: string; countryId: string },
): GuardConfirmedApplication {
  const envelope = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
  const result = envelope?.result && typeof envelope.result === "object" &&
    !Array.isArray(envelope.result)
    ? envelope.result as Record<string, unknown> : null;
  if (
    envelope?.status !== "succeeded" ||
    envelope.operationId !== expected.operationId ||
    result?.ok !== true ||
    typeof result.applicationId !== "string" ||
    result.applicationId.length < 30 ||
    result.status !== "submitted" ||
    result.organizationId !== expected.organizationId ||
    result.countryId !== expected.countryId
  ) {
    throw new Error("The application response could not be verified. Check the server status before retrying.");
  }
  return {
    applicationId: result.applicationId,
    operationId: expected.operationId,
    status: "submitted",
  };
}

export async function submitGuardApplication(args: {
  organizationId: string;
  countryId: string;
  fields: GuardApplicationFields;
  operation: GuardIntakeOperation;
}): Promise<{ applicationId: string; operationId: string; status: string }> {
  const errors = validateGuardApplication(args.fields);
  if (Object.keys(errors).length > 0) throw new Error("Correct the marked fields before submitting.");
  const fields = normalizeGuardApplication(args.fields);
  const { data, error } = await supabase.rpc("world_submit_guard_membership_application_v1", {
    p_organization_id: args.organizationId,
    p_country_id: args.countryId,
    p_official_state_designation: fields.officialDesignation,
    p_government_system: fields.governmentSystem,
    p_motivation: fields.motivation,
    p_contributions: fields.contributions,
    p_international_commitment: fields.commitment,
    p_operation_id: args.operation.operationId,
    p_idempotency_key: args.operation.idempotencyKey,
  });
  if (error) throw error;
  return parseGuardIntakeReceipt(data, {
    operationId: args.operation.operationId,
    organizationId: args.organizationId,
    countryId: args.countryId,
  });
}

export function guardApplicationStatusLabel(status: GuardMembershipApplicationRow["status"]): string {
  switch (status) {
    case "submitted": return "Submitted for review";
    case "under_review": return "Under review";
    case "introduced": return "Introduced to the General Assembly";
    case "approved": return "Approved; activation not yet confirmed";
    case "rejected": return "Not approved";
    case "withdrawn": return "Withdrawn";
  }
}

export function guardIntakeErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message) : "";
  if (message.includes("VERSION_CONFLICT") || message.includes("APPLICATION_LOCKED")) {
    return "This application changed or entered formal institutional proceedings. Refresh its current status before acting.";
  }
  if (message.includes("APPLICATION_ALREADY_PENDING") || message.includes("ALREADY_MEMBER")) {
    return "Your membership or a pending application has changed. Refresh the current status before taking another action.";
  }
  if (code === "42501" || message.includes("AUTHORIZATION")) {
    return "Your current country authority does not permit this submission. Check your delegation access.";
  }
  if (code === "PGRST202" || code === "PGRST205" || code === "42P01") {
    return "Institutional applications are not available on this deployment yet.";
  }
  if (message.includes("VALIDATION")) return "The server rejected an application field. Review the lengths and try again.";
  // Never echo raw PostgREST diagnostics or sensitive input into participant UI.
  return "The request could not be confirmed. Check your application status before retrying.";
}


/** A withdrawal retry must preserve its operation identity after an uncertain response. */
export function newGuardWithdrawalOperation(): GuardIntakeOperation {
  const id = crypto.randomUUID();
  return { operationId: id, idempotencyKey: "guard-application-withdraw:" + id };
}

export function parseGuardWithdrawalReceipt(
  value: unknown,
  expected: {
    operationId: string;
    organizationId: string;
    countryId: string;
    applicationId: string;
    revision: number;
  },
): { applicationId: string; operationId: string; revision: number } {
  const envelope = isRecord(value) ? value : null;
  const result = envelope && isRecord(envelope.result) ? envelope.result : null;
  if (!result || envelope?.status !== "succeeded" ||
      envelope.operationId !== expected.operationId ||
      result.ok !== true ||
      result.applicationId !== expected.applicationId ||
      result.organizationId !== expected.organizationId ||
      result.countryId !== expected.countryId ||
      result.status !== "withdrawn" ||
      !Number.isSafeInteger(result.revision) ||
      result.revision !== expected.revision + 1) {
    throw new Error("The withdrawal receipt could not be verified. Refresh the server status before taking another action.");
  }
  return {
    applicationId: expected.applicationId,
    operationId: expected.operationId,
    revision: result.revision as number,
  };
}

export async function withdrawGuardApplication(args: {
  organizationId: string;
  countryId: string;
  applicationId: string;
  revision: number;
  operation: GuardIntakeOperation;
}): Promise<{ applicationId: string; operationId: string; revision: number }> {
  if (!Number.isSafeInteger(args.revision) || args.revision < 1) {
    throw new Error("Refresh your current application before withdrawing.");
  }
  const { data, error } = await supabase.rpc("world_withdraw_guard_application_v1", {
    p_organization_id: args.organizationId,
    p_country_id: args.countryId,
    p_application_id: args.applicationId,
    p_expected_revision: args.revision,
    p_operation_id: args.operation.operationId,
    p_idempotency_key: args.operation.idempotencyKey,
  });
  if (error) throw error;
  return parseGuardWithdrawalReceipt(data, {
    operationId: args.operation.operationId,
    organizationId: args.organizationId,
    countryId: args.countryId,
    applicationId: args.applicationId,
    revision: args.revision,
  });
}
