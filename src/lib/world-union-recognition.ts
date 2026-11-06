import { supabase } from "@/integrations/supabase/client";

export type UnionApplicationStatus =
  | "collecting_founders" | "submitted" | "under_review" | "ballot_pending"
  | "recognized" | "rejected" | "withdrawn";
export type UnionFounderStatus = "invited" | "accepted" | "declined";

export type UnionRecognitionApplication = {
  id: string;
  unityOrganizationId: string;
  leadCountryId: string;
  proposedName: string;
  proposedShortName: string;
  mission: string;
  governance: string;
  scope: string;
  exceptionRequested: boolean;
  charterDocumentId: string | null;
  status: UnionApplicationStatus;
  revision: number;
  createdAt: string;
};
export type UnionFounder = {
  id: string;
  applicationId: string;
  countryId: string;
  status: UnionFounderStatus;
  respondedAt: string | null;
};
export type UnionWorkspace = {
  signedIn: boolean;
  activeCountryId: string | null;
  unityOrganizationId: string | null;
  applications: UnionRecognitionApplication[];
  founders: UnionFounder[];
  countries: { id: string; name: string }[];
};
export type UnionOperation = { operationId: string; key: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES: readonly UnionApplicationStatus[] = [
  "collecting_founders", "submitted", "under_review", "ballot_pending",
  "recognized", "rejected", "withdrawn",
];
const FOUNDER_STATUSES: readonly UnionFounderStatus[] = ["invited", "accepted", "declined"];
const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const nonempty = (x: unknown): string => {
  if (typeof x !== "string" || !x.trim()) throw new Error("Union recognition data is incomplete.");
  return x;
};
const id = (x: unknown): string => {
  const text = nonempty(x);
  if (!UUID.test(text)) throw new Error("Union recognition identifier is malformed.");
  return text;
};
const optionalId = (x: unknown): string | null => x === null ? null : id(x);
const safeRevision = (x: unknown): number => {
  if (typeof x !== "number" || !Number.isSafeInteger(x) || x < 1) {
    throw new Error("Union recognition revision could not be verified.");
  }
  return x;
};
const check = (error: { message: string } | null): void => { if (error) throw error; };

export function parseUnionApplication(input: unknown): UnionRecognitionApplication {
  if (!record(input)) throw new Error("No verifiable union application.");
  if (!STATUSES.includes(input.status as UnionApplicationStatus)) {
    throw new Error("Unrecognized union application state.");
  }
  if (typeof input.exception_requested !== "boolean") {
    throw new Error("Unverifiable union application exception status.");
  }
  return {
    id: id(input.id), unityOrganizationId: id(input.unity_organization_id),
    leadCountryId: id(input.lead_country_id),
    proposedName: nonempty(input.proposed_name),
    proposedShortName: nonempty(input.proposed_short_name),
    mission: nonempty(input.mission),
    governance: nonempty(input.governance),
    scope: nonempty(input.scope),
    exceptionRequested: input.exception_requested,
    charterDocumentId: optionalId(input.founding_charter_document_id),
    status: input.status as UnionApplicationStatus,
    revision: safeRevision(input.revision),
    createdAt: nonempty(input.created_at),
  };
}
export function parseUnionFounder(input: unknown): UnionFounder {
  if (!record(input) || !FOUNDER_STATUSES.includes(input.status as UnionFounderStatus)) {
    throw new Error("Unverifiable founding-country invitation.");
  }
  return {
    id: id(input.id), applicationId: id(input.application_id),
    countryId: id(input.country_id), status: input.status as UnionFounderStatus,
    respondedAt: input.responded_at === null ? null : nonempty(input.responded_at),
  };
}

export function acceptedFounderCount(applicationId: string, founders: readonly UnionFounder[]): number {
  return founders.filter((founder) =>
    founder.applicationId === applicationId && founder.status === "accepted").length;
}
export function isSixFoundersMet(applicationId: string, founders: readonly UnionFounder[]): boolean {
  return acceptedFounderCount(applicationId, founders) >= 6;
}
export function mayRespondToFoundingInvitation(
  application: UnionRecognitionApplication,
  founders: readonly UnionFounder[],
  activeCountryId: string | null,
): boolean {
  return application.status === "collecting_founders" && activeCountryId !== null
    && founders.some((founder) => founder.applicationId === application.id
      && founder.countryId === activeCountryId && founder.status === "invited");
}

export function unionRecognitionError(error: unknown): string {
  const text = record(error) && typeof error.message === "string" ? error.message : "";
  if (/VERSION_CONFLICT|40001/.test(text)) return "The application changed. Refresh before deciding.";
  if (/AUTHORIZATION|42501/.test(text)) return "Your country authority could not be verified.";
  if (/NAME_ALREADY_USED|23505/.test(text)) return "The proposed union name or invitation is already registered.";
  if (/STATE_CHANGED|23514|INVITATION_UNAVAILABLE/.test(text)) return "This application or invitation is no longer available.";
  if (/VALIDATION|22023/.test(text)) return "Review the required fields and their lengths.";
  return "This action could not be confirmed. Retry safely using the same operation identity.";
}

/** A country only receives the applications/invitations allowed by private RLS. */
export async function fetchUnionWorkspace(): Promise<UnionWorkspace> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  check(authError);
  if (!auth.user) return {
    signedIn: false, activeCountryId: null, unityOrganizationId: null,
    applications: [], founders: [], countries: [],
  };
  const db = supabase as any;
  const [accounts, organizations, countries, applications] = await Promise.all([
    db.from("country_accounts").select("country_id")
      .eq("user_id", auth.user.id).eq("status", "active").maybeSingle(),
    db.from("world_organizations").select("id")
      .eq("slug", "unity").eq("public_visibility", "public")
      .in("status", ["recognized", "active"]).limit(1),
    db.from("countries").select("id,name").order("name").limit(100),
    db.from("world_union_recognition_applications")
      .select("id,unity_organization_id,lead_country_id,proposed_name,proposed_short_name,mission,governance,scope,founding_charter_document_id,exception_requested,status,revision,created_at")
      .order("created_at", { ascending: false }).limit(10),
  ]);
  for (const result of [accounts, organizations, countries, applications]) check(result.error);
  const parsedApplications = (applications.data ?? []).map(parseUnionApplication);
  let founders: UnionFounder[] = [];
  if (parsedApplications.length) {
    const result = await db.from("world_union_recognition_founders")
      .select("id,application_id,country_id,status,responded_at")
      .in("application_id", parsedApplications.map((app: UnionRecognitionApplication) => app.id))
      .order("invited_at", { ascending: true }).limit(1000);
    check(result.error);
    if ((result.data ?? []).length >= 1000) {
      throw new Error("Union founding records are too numerous to verify safely.");
    }
    founders = (result.data ?? []).map(parseUnionFounder);
  }
  return {
    signedIn: true,
    activeCountryId: accounts.data?.country_id ? id(accounts.data.country_id) : null,
    unityOrganizationId: organizations.data?.[0]?.id ? id(organizations.data[0].id) : null,
    countries: (countries.data ?? []).map((item: any) => ({
      id: id(item.id), name: nonempty(item.name),
    })),
    applications: parsedApplications, founders,
  };
}

function verifiedReceipt(input: unknown, operationId: string): { applicationId: string; revision: number; acceptedFounderCount: number | null } {
  const envelope = record(input) ? input : null;
  const result = record(envelope?.result) ? envelope.result : null;
  if (envelope?.status !== "succeeded" || envelope.operationId !== operationId
    || result?.ok !== true || result.operationId !== operationId) {
    throw new Error("Union recognition operation receipt could not be verified.");
  }
  const count = result.acceptedFounderCount;
  if (count !== undefined && (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > 100)) {
    throw new Error("Unverifiable accepted founder count.");
  }
  return {
    applicationId: id(result.applicationId),
    revision: safeRevision(result.revision),
    acceptedFounderCount: typeof count === "number" ? count : null,
  };
}

export async function startUnionRecognition(
  input: {
    unityOrganizationId: string; countryId: string;
    name: string; shortName: string; mission: string;
    governance: string; scope: string; exceptionRequested: boolean;
  }, operation: UnionOperation,
) {
  const db = supabase as any;
  const { data, error } = await db.rpc("world_start_union_recognition_v1", {
    p_unity_organization_id: id(input.unityOrganizationId),
    p_lead_country_id: id(input.countryId),
    p_proposed_name: input.name.trim(),
    p_proposed_short_name: input.shortName.trim(),
    p_mission: input.mission.trim(),
    p_governance: input.governance.trim(),
    p_scope: input.scope.trim(),
    p_exception_requested: input.exceptionRequested,
    p_operation_id: id(operation.operationId), p_idempotency_key: operation.key,
  });
  check(error);
  return verifiedReceipt(data, operation.operationId);
}

export async function inviteUnionFounder(
  input: { applicationId: string; countryId: string; expectedRevision: number },
  operation: UnionOperation,
) {
  const db = supabase as any;
  const { data, error } = await db.rpc("world_invite_union_founder_v1", {
    p_application_id: id(input.applicationId),
    p_country_id: id(input.countryId),
    p_expected_revision: input.expectedRevision,
    p_operation_id: id(operation.operationId), p_idempotency_key: operation.key,
  });
  check(error);
  return verifiedReceipt(data, operation.operationId);
}

export async function respondUnionFounder(
  input: { applicationId: string; countryId: string; accept: boolean; expectedRevision: number },
  operation: UnionOperation,
) {
  const db = supabase as any;
  const { data, error } = await db.rpc("world_respond_union_founder_v1", {
    p_application_id: id(input.applicationId),
    p_country_id: id(input.countryId),
    p_accept: input.accept,
    p_expected_revision: input.expectedRevision,
    p_operation_id: id(operation.operationId), p_idempotency_key: operation.key,
  });
  check(error);
  return verifiedReceipt(data, operation.operationId);
}
