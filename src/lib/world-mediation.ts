import { supabase } from "@/integrations/supabase/client";

export const MEDIATION_STATES = [
  "requested", "accepted", "open", "negotiating", "settled", "failed",
  "referred_to_court", "closed",
] as const;

export type MediationState = typeof MEDIATION_STATES[number];
export type MediationCase = {
  id: string;
  organizationId: string;
  requesterCountryId: string;
  respondentCountryId: string;
  summary: string;
  state: MediationState;
  revision: number;
  submittedAt: string;
  updatedAt: string;
  closedAt: string | null;
  closureReason: string | null;
};
export type MediationHistory = {
  id: string;
  fromState: MediationState | null;
  toState: MediationState;
  revision: number;
  occurredAt: string;
  reason: string | null;
};
export type MediationWorkspace = {
  signedIn: boolean;
  requesterCountryId: string | null;
  organizations: { id: string; name: string }[];
  countries: { id: string; name: string }[];
  cases: MediationCase[];
  managedOrganizations: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES = new Set<string>(MEDIATION_STATES);
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const requiredText = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error("Mediation data is incomplete.");
  return value;
};
const uuid = (value: unknown): string => {
  const str = requiredText(value);
  if (!UUID.test(str)) throw new Error("Mediation data has an invalid identifier.");
  return str;
};
const state = (value: unknown): MediationState => {
  if (typeof value !== "string" || !STATES.has(value)) throw new Error("Mediation data has an unknown state.");
  return value as MediationState;
};
const optionalText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;
const revision = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("Mediation revision could not be verified.");
  }
  return value;
};

export function parseMediationCase(input: unknown): MediationCase {
  if (!isObject(input)) throw new Error("Mediation data is unavailable.");
  return {
    id: uuid(input.id),
    organizationId: uuid(input.organization_id),
    requesterCountryId: uuid(input.requester_country_id),
    respondentCountryId: uuid(input.respondent_country_id),
    summary: requiredText(input.issue_summary),
    state: state(input.state),
    revision: revision(input.revision),
    submittedAt: requiredText(input.submitted_at),
    updatedAt: requiredText(input.updated_at),
    closedAt: optionalText(input.closed_at),
    closureReason: optionalText(input.closure_reason),
  };
}

export function parseMediationHistory(input: unknown): MediationHistory {
  if (!isObject(input)) throw new Error("Mediation history is unavailable.");
  return {
    id: uuid(input.id),
    fromState: input.from_state === null ? null : state(input.from_state),
    toState: state(input.to_state),
    revision: revision(input.revision),
    occurredAt: requiredText(input.occurred_at),
    reason: optionalText(input.reason),
  };
}

export const MEDIATION_NEXT: Readonly<Record<MediationState, readonly MediationState[]>> = {
  requested: ["accepted", "failed"],
  accepted: ["open", "failed"],
  open: ["negotiating", "failed"],
  negotiating: ["settled", "failed", "referred_to_court"],
  settled: ["closed"],
  failed: ["closed"],
  referred_to_court: ["closed"],
  closed: [],
};

export function allowedMediationTargets(
  current: MediationState,
  canRespond: boolean,
  canManage: boolean,
): readonly MediationState[] {
  if (current === "requested") return canRespond ? MEDIATION_NEXT.requested : [];
  return canManage ? MEDIATION_NEXT[current] : [];
}

export function mediationReasonRequired(target: MediationState): boolean {
  return ["settled", "failed", "referred_to_court", "closed"].includes(target);
}

export function mediationError(error: unknown): string {
  const input = isObject(error) ? error : null;
  const message = typeof input?.message === "string" ? input.message : "";
  if (/VERSION_CONFLICT|40001/.test(message)) return "The case changed elsewhere. Refresh and review the latest version.";
  if (/AUTHORIZATION|42501|permission denied/.test(message)) return "Your authorization for this action could not be verified.";
  if (/INVALID_TRANSITION|STATE_CHANGED|23514/.test(message)) return "The case is no longer in a state that permits this action.";
  if (/REASON_REQUIRED|22023|VALIDATION/.test(message)) return "Check the case details and required reason.";
  return "This operation could not be confirmed. You can retry safely without creating a second operation.";
}

function check(error: { message: string } | null): void {
  if (error) throw error;
}

/** Only signed-in parties and explicitly scoped managers ever receive this read. */
export async function fetchMediationWorkspace(): Promise<MediationWorkspace> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  check(authError);
  if (!auth.user) {
    return { signedIn: false, requesterCountryId: null,
      organizations: [], countries: [], cases: [], managedOrganizations: [] };
  }
  const client = supabase as any;
  const [accountResult, organizationResult, countryResult, caseResult] = await Promise.all([
    client.from("country_accounts").select("country_id")
      .eq("user_id", auth.user.id).eq("status", "active").maybeSingle(),
    client.from("world_organizations").select("id,short_name")
      .eq("slug", "unity").eq("public_visibility", "public").in("status", ["active", "recognized"]).limit(1),
    client.from("countries").select("id,name").order("name").limit(100),
    client.from("world_mediation_cases")
      .select("id,organization_id,requester_country_id,respondent_country_id,issue_summary,state,revision,submitted_at,updated_at,closed_at,closure_reason")
      .order("updated_at", { ascending: false }).limit(50),
  ]);
  for (const result of [accountResult, organizationResult, countryResult, caseResult]) check(result.error);
  const organizations = (organizationResult.data ?? []).map((item: any) =>
    ({ id: uuid(item.id), name: requiredText(item.short_name) }));
  const countries = (countryResult.data ?? []).map((item: any) =>
    ({ id: uuid(item.id), name: requiredText(item.name) }));
  const cases = (caseResult.data ?? []).map(parseMediationCase);
  const manageChecks = await Promise.all(organizations.map(async (organization: { id: string }) => {
    const { data, error } = await client.rpc("world_access_allowed", {
      p_capability: "world.mediation.manage", p_organization_id: organization.id,
      p_country_id: null, p_organ_id: null, p_object_type: null, p_object_id: null,
    });
    check(error);
    return data === true ? organization.id : null;
  }));
  return {
    signedIn: true,
    requesterCountryId: accountResult.data?.country_id ? uuid(accountResult.data.country_id) : null,
    organizations,
    countries,
    cases,
    managedOrganizations: manageChecks.filter((id): id is string => id !== null),
  };
}

export async function fetchMediationHistory(caseId: string): Promise<MediationHistory[]> {
  const client = supabase as any;
  const { data, error } = await client.from("world_mediation_history")
    .select("id,from_state,to_state,revision,occurred_at,reason")
    .eq("case_id", uuid(caseId)).order("revision", { ascending: true }).limit(100);
  check(error);
  return (data ?? []).map(parseMediationHistory);
}

export type MediationOperation = { operationId: string; key: string };

function verifiedReceipt(input: unknown): { caseId: string; revision: number; state: MediationState } {
  if (!isObject(input) || input.ok !== true) throw new Error("Mediation operation was not acknowledged.");
  return { caseId: uuid(input.caseId), revision: revision(input.revision), state: state(input.state) };
}

/** No UI may infer success from a network request without a verified server receipt. */
export async function requestMediation(
  input: { organizationId: string; requesterCountryId: string; respondentCountryId: string; summary: string },
  operation: MediationOperation,
) {
  const client = supabase as any;
  const { data, error } = await client.rpc("world_request_mediation_v1", {
    p_organization_id: uuid(input.organizationId),
    p_requester_country_id: uuid(input.requesterCountryId),
    p_respondent_country_id: uuid(input.respondentCountryId),
    p_summary: input.summary.trim(),
    p_operation_id: uuid(operation.operationId),
    p_idempotency_key: operation.key,
  });
  check(error);
  return verifiedReceipt(data);
}

export async function transitionMediation(
  input: { caseId: string; target: MediationState; reason: string; expectedRevision: number },
  operation: MediationOperation,
) {
  const client = supabase as any;
  const { data, error } = await client.rpc("world_transition_mediation_v1", {
    p_case_id: uuid(input.caseId), p_target_state: state(input.target),
    p_reason: input.reason.trim(), p_expected_revision: input.expectedRevision,
    p_operation_id: uuid(operation.operationId), p_idempotency_key: operation.key,
  });
  check(error);
  return verifiedReceipt(data);
}
