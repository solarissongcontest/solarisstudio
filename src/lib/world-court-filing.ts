import { supabase } from "@/integrations/supabase/client";

export const COURT_STATES = [
  "filed", "preliminary_review", "response_pending", "proceedings", "hearing",
  "judgment_pending", "decided", "reconsideration_requested", "reconsideration",
  "closed", "archived",
] as const;
export type CourtStatus = typeof COURT_STATES[number];
export type CourtCase = {
  id: string; identifier: string; organizationId: string;
  applicantCountryId: string; respondentCountryId: string;
  claim: string; legalBasis: string; requestedRemedy: string;
  status: CourtStatus; revision: number; filedAt: string; updatedAt: string;
};
export type CourtFiling = {
  id: string; caseId: string; partyCountryId: string;
  filingType: "claim" | "response" | "additional_submission" | "reconsideration_request";
  body: string; revision: number; filedAt: string;
};
export type CourtDocketEntry = {
  id: string; identifier: string; applicantCountryId: string;
  respondentCountryId: string; status: CourtStatus; filedAt: string;
};
export type CourtWorkspace = {
  signedIn: boolean;
  countryId: string | null;
  courtOrganizationId: string | null;
  countries: { id: string; name: string }[];
  cases: CourtCase[];
  respondedCaseIds: string[];
  docket: CourtDocketEntry[];
};
export type CourtOperation = { operationId: string; key: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES = new Set<string>(COURT_STATES);
const obj = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const txt = (x: unknown): string => {
  if (typeof x !== "string" || !x.trim()) throw new Error("Court data is incomplete.");
  return x;
};
const uid = (x: unknown): string => {
  const id = txt(x);
  if (!UUID.test(id)) throw new Error("Court data has an invalid identifier.");
  return id;
};
const status = (x: unknown): CourtStatus => {
  if (typeof x !== "string" || !STATES.has(x)) throw new Error("Unknown Court status.");
  return x as CourtStatus;
};
const version = (x: unknown): number => {
  if (typeof x !== "number" || !Number.isSafeInteger(x) || x < 1) {
    throw new Error("Court revision could not be verified.");
  }
  return x;
};
const check = (error: { message: string } | null) => {
  if (error) throw error;
};

export function parseCourtCase(x: unknown): CourtCase {
  if (!obj(x)) throw new Error("Court case could not be verified.");
  return {
    id: uid(x.id), identifier: txt(x.identifier), organizationId: uid(x.organization_id),
    applicantCountryId: uid(x.applicant_country_id),
    respondentCountryId: uid(x.respondent_country_id),
    claim: txt(x.claim), legalBasis: txt(x.legal_basis),
    requestedRemedy: txt(x.requested_remedy),
    status: status(x.status), revision: version(x.revision),
    filedAt: txt(x.filed_at), updatedAt: txt(x.updated_at),
  };
}
export function parseCourtFiling(x: unknown): CourtFiling {
  if (!obj(x)) throw new Error("Court filing could not be verified.");
  if (!["claim", "response", "additional_submission", "reconsideration_request"].includes(String(x.filing_type))) {
    throw new Error("Unknown Court filing type.");
  }
  return {
    id: uid(x.id), caseId: uid(x.case_id), partyCountryId: uid(x.party_country_id),
    filingType: x.filing_type as CourtFiling["filingType"], body: txt(x.body),
    revision: version(x.case_revision), filedAt: txt(x.filed_at),
  };
}
export function parseCourtDocketEntry(x: unknown): CourtDocketEntry {
  if (!obj(x)) throw new Error("Public Court docket could not be verified.");
  return {
    id: uid(x.id), identifier: txt(x.identifier),
    applicantCountryId: uid(x.applicantCountryId),
    respondentCountryId: uid(x.respondentCountryId),
    status: status(x.status), filedAt: txt(x.filedAt),
  };
}

export function isCourtResponseAllowed(
  record: CourtCase, currentCountryId: string | null, alreadyResponded: boolean,
): boolean {
  return record.respondentCountryId === currentCountryId && !alreadyResponded
    && ["filed", "preliminary_review", "response_pending"].includes(record.status);
}

export function courtError(error: unknown): string {
  const message = obj(error) && typeof error.message === "string" ? error.message : "";
  if (/VERSION_CONFLICT|40001/.test(message)) return "The case was updated. Refresh before submitting a response.";
  if (/AUTHORIZATION|42501/.test(message)) return "Your authority for this Court action could not be verified.";
  if (/STATE_CHANGED|23514|COURT_UNAVAILABLE/.test(message)) return "The Court case is no longer in a valid state for that action.";
  if (/VALIDATION|22023/.test(message)) return "Check the submitted fields and their length.";
  return "The Court operation could not be confirmed. Retry with the same operation identity.";
}

/** Deliberately small, public-only RPC result. Never read private claim columns for anonymous users. */
export async function fetchCourtPublicDocket(): Promise<CourtDocketEntry[]> {
  const client = supabase as any;
  const { data, error } = await client.rpc("world_court_public_docket_v1", { p_limit: 20 });
  check(error);
  if (!Array.isArray(data)) throw new Error("Public Court docket response is invalid.");
  return data.map(parseCourtDocketEntry);
}

export async function fetchCourtWorkspace(): Promise<CourtWorkspace> {
  const docket = await fetchCourtPublicDocket();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  check(authError);
  if (!auth.user) return {
    signedIn: false, countryId: null, courtOrganizationId: null, countries: [],
    cases: [], respondedCaseIds: [], docket,
  };

  const db = supabase as any;
  const [account, org, countries, cases] = await Promise.all([
    db.from("country_accounts").select("country_id")
      .eq("user_id", auth.user.id).eq("status", "active").maybeSingle(),
    db.from("world_organizations").select("id,slug")
      .eq("slug", "unity").eq("public_visibility", "public")
      .in("status", ["active", "recognized"]).limit(1),
    db.from("countries").select("id,name").order("name").limit(100),
    db.from("world_court_cases")
      .select("id,identifier,organization_id,applicant_country_id,respondent_country_id,claim,legal_basis,requested_remedy,status,revision,filed_at,updated_at")
      .order("filed_at", { ascending: false }).limit(50),
  ]);
  for (const result of [account, org, countries, cases]) check(result.error);
  const parsedCases = (cases.data ?? []).map(parseCourtCase);
  let responseIds: string[] = [];
  if (parsedCases.length) {
    const response = await db.from("world_court_filings")
      .select("case_id").in("case_id", parsedCases.map((item: CourtCase) => item.id))
      .eq("filing_type", "response").limit(50);
    check(response.error);
    responseIds = (response.data ?? []).map((item: any) => uid(item.case_id));
  }
  return {
    signedIn: true,
    countryId: account.data?.country_id ? uid(account.data.country_id) : null,
    courtOrganizationId: org.data?.[0]?.id ? uid(org.data[0].id) : null,
    countries: (countries.data ?? []).map((item: any) => ({
      id: uid(item.id), name: txt(item.name),
    })),
    cases: parsedCases,
    respondedCaseIds: responseIds,
    docket,
  };
}

export async function fetchCourtCaseFilings(caseId: string): Promise<CourtFiling[]> {
  const db = supabase as any;
  const { data, error } = await db.from("world_court_filings")
    .select("id,case_id,party_country_id,filing_type,body,case_revision,filed_at")
    .eq("case_id", uid(caseId)).order("case_revision", { ascending: true }).limit(100);
  check(error);
  return (data ?? []).map(parseCourtFiling);
}

function verifiedReceipt(input: unknown): { id: string; identifier: string; revision: number; status: CourtStatus } {
  if (!obj(input) || input.ok !== true) throw new Error("Court operation was not acknowledged.");
  return { id: uid(input.caseId), identifier: txt(input.identifier),
    revision: version(input.revision), status: status(input.status) };
}

export async function fileCourtCase(input: {
  organizationId: string; applicantCountryId: string; respondentCountryId: string;
  claim: string; legalBasis: string; requestedRemedy: string;
}, op: CourtOperation) {
  const db = supabase as any;
  const { data, error } = await db.rpc("world_file_court_case_v1", {
    p_organization_id: uid(input.organizationId),
    p_applicant_country_id: uid(input.applicantCountryId),
    p_respondent_country_id: uid(input.respondentCountryId),
    p_claim: input.claim.trim(), p_legal_basis: input.legalBasis.trim(),
    p_requested_remedy: input.requestedRemedy.trim(),
    p_operation_id: uid(op.operationId), p_idempotency_key: op.key,
  });
  check(error);
  return verifiedReceipt(data);
}

export async function submitCourtResponse(input: {
  caseId: string; response: string; expectedRevision: number;
}, op: CourtOperation) {
  const db = supabase as any;
  const { data, error } = await db.rpc("world_respond_to_court_case_v1", {
    p_case_id: uid(input.caseId), p_response: input.response.trim(),
    p_expected_revision: input.expectedRevision,
    p_operation_id: uid(op.operationId), p_idempotency_key: op.key,
  });
  check(error);
  return verifiedReceipt(data);
}
