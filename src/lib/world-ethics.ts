import { supabase } from "@/integrations/supabase/client";
import { assertTg13CurrentActor } from "@/lib/world-tg13-private-session";

export type EthicsState = "filed" | "assigned" | "under_review" |
  "findings_prepared" | "concluded" | "archived";
export type EthicsCase = {
  id: string; organizationId: string; organId: string; reportingCountryId: string;
  subjectCountryId: string | null; subjectPersonId: string | null;
  allegation: string; state: EthicsState; revision: number; openedAt: string;
};
export type EthicsCommitteeMember = {
  id: string; organId: string; personId: string; userId: string | null;
  appointmentReference: string; startedAt: string;
};
export type EthicsEvidence = {
  id: string; statement: string; createdAt: string;
};
export type EthicsAssignment = { caseId: string; memberId: string };
export type EthicsWorkspace = {
  signedIn: boolean;
  countryId: string | null;
  organizationId: string | null;
  organId: string | null;
  countries: { id: string; name: string }[];
  cases: EthicsCase[];
  committee: EthicsCommitteeMember[];
  assignments: EthicsAssignment[];
  canManage: boolean;
  canConfigure: boolean;
};
export type EthicsOperation = { operationId: string; key: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ETHICS_STATES: readonly EthicsState[] = [
  "filed", "assigned", "under_review", "findings_prepared", "concluded", "archived",
];
const obj = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const text = (x: unknown): string => {
  if (typeof x !== "string" || !x.trim()) throw new Error("Ethics record is incomplete.");
  return x;
};
const uuid = (x: unknown): string => {
  const t = text(x);
  if (!UUID.test(t)) throw new Error("Ethics identifier is malformed.");
  return t;
};
const maybeId = (x: unknown) => x === null ? null : uuid(x);
const rev = (x: unknown): number => {
  if (typeof x !== "number" || !Number.isSafeInteger(x) || x < 1) {
    throw new Error("Ethics revision could not be verified.");
  }
  return x;
};
const check = (error: { message: string } | null) => { if (error) throw error; };

export function parseEthicsCase(x: unknown): EthicsCase {
  if (!obj(x) || !ETHICS_STATES.includes(x.status as EthicsState)) {
    throw new Error("Unverifiable Ethics case state.");
  }
  return {
    id: uuid(x.id), organizationId: uuid(x.organization_id), organId: uuid(x.organ_id),
    reportingCountryId: uuid(x.reporting_country_id),
    subjectCountryId: maybeId(x.subject_country_id),
    subjectPersonId: maybeId(x.subject_person_id),
    allegation: text(x.allegation),
    state: x.status as EthicsState, revision: rev(x.revision), openedAt: text(x.opened_at),
  };
}
export function parseEthicsMember(x: unknown): EthicsCommitteeMember {
  if (!obj(x)) throw new Error("Unverifiable Ethics Committee roster.");
  return {
    id: uuid(x.id), organId: uuid(x.organ_id), personId: uuid(x.person_id),
    userId: maybeId(x.user_id), appointmentReference: text(x.appointment_reference),
    startedAt: text(x.started_at),
  };
}
export function parseEthicsEvidence(x: unknown): EthicsEvidence {
  if (!obj(x)) throw new Error("Unverifiable private Ethics evidence.");
  return { id: uuid(x.id), statement: text(x.statement_text), createdAt: text(x.created_at) };
}
export function canAssignEthicsCase(
  caseRow: EthicsCase, activeMembers: readonly EthicsCommitteeMember[], canManage: boolean,
): boolean {
  return caseRow.state === "filed" && canManage
    && activeMembers.some((member) => member.organId === caseRow.organId);
}

export function ethicsError(error: unknown): string {
  const msg = obj(error) && typeof error.message === "string" ? error.message : "";
  if (/VERSION_CONFLICT|40001/.test(msg)) return "This case changed. Refresh before taking an official action.";
  if (/COMMITTEE_NOT_CONFIGURED|MEMBER_NOT_ACTIVE/.test(msg)) return "The UNITY Ethics Committee must have an explicitly appointed active member before cases can be assigned.";
  if (/AUTHORIZATION|42501/.test(msg)) return "Your Ethics Committee authority could not be verified.";
  if (/STATE_CHANGED|23514/.test(msg)) return "The case is no longer in a valid state for this action.";
  if (/VALIDATION|22023/.test(msg)) return "Check the required fields and supporting statement.";
  return "The Ethics operation could not be confirmed. Retry with the same operation identity.";
}

export async function fetchEthicsWorkspace(expectedUserId: string): Promise<EthicsWorkspace> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  check(authError);
  if (!auth.user || auth.user.id !== expectedUserId) throw new Error("AUTHORIZATION");
  const db = supabase as any;
  const [account, organizations, countries, cases] = await Promise.all([
    db.from("country_accounts").select("country_id")
      .eq("user_id", auth.user.id).eq("status", "active").maybeSingle(),
    db.from("world_organizations").select("id")
      .eq("slug", "unity").eq("public_visibility", "public")
      .in("status", ["active", "recognized"]).limit(1),
    db.from("countries").select("id,name").order("name").limit(100),
    db.from("world_ethics_cases")
      .select("id,organization_id,organ_id,reporting_country_id,subject_country_id,subject_person_id,allegation,status,revision,opened_at")
      .order("opened_at", { ascending: false }).limit(30),
  ]);
  for (const result of [account, organizations, countries, cases]) check(result.error);
  const organizationId = organizations.data?.[0]?.id ? uuid(organizations.data[0].id) : null;
  const caseRows = (cases.data ?? []).map(parseEthicsCase);
  let organId: string | null = null;
  let roster: EthicsCommitteeMember[] = [];
  let assignments: EthicsAssignment[] = [];
  let canManage = false;
  let canConfigure = false;
  if (organizationId) {
    const organs = await db.from("world_organization_organs").select("id")
      .eq("organization_id", organizationId).eq("slug", "ethics-committee")
      .eq("status", "active").limit(1);
    check(organs.error);
    organId = organs.data?.[0]?.id ? uuid(organs.data[0].id) : null;
  }
  if (organizationId && organId) {
    const [manage, configure, members] = await Promise.all([
      db.rpc("world_access_allowed", {
        p_capability: "world.ethics.case.manage", p_organization_id: organizationId,
        p_country_id: null, p_organ_id: organId, p_object_type: null, p_object_id: null,
      }),
      db.rpc("world_access_allowed", {
        p_capability: "world.ethics.member.configure", p_organization_id: organizationId,
        p_country_id: null, p_organ_id: organId, p_object_type: null, p_object_id: null,
      }),
      db.from("world_ethics_committee_memberships")
        .select("id,organ_id,person_id,user_id,appointment_reference,started_at")
        .eq("organization_id", organizationId).eq("organ_id", organId)
        .is("ended_at", null).limit(100),
    ]);
    for (const result of [manage, configure, members]) check(result.error);
    canManage = manage.data === true;
    canConfigure = configure.data === true;
    roster = (members.data ?? []).map(parseEthicsMember);
  }
  if (caseRows.length) {
    const result = await db.from("world_ethics_case_assignments")
      .select("case_id,member_id").in("case_id", caseRows.map((row: EthicsCase) => row.id))
      .is("ended_at", null).limit(100);
    check(result.error);
    assignments = (result.data ?? []).map((item: any) => ({
      caseId: uuid(item.case_id), memberId: uuid(item.member_id),
    }));
  }
  await assertTg13CurrentActor(expectedUserId);
  return {
    signedIn: true,
    countryId: account.data?.country_id ? uuid(account.data.country_id) : null,
    organizationId, organId,
    countries: (countries.data ?? []).map((item: any) => ({
      id: uuid(item.id), name: text(item.name),
    })),
    cases: caseRows, committee: roster, assignments, canManage, canConfigure,
  };
}
export async function fetchEthicsEvidence(caseId: string, expectedUserId: string): Promise<EthicsEvidence[]> {
  await assertTg13CurrentActor(expectedUserId);
  const db = supabase as any;
  const { data, error } = await db.from("world_ethics_case_evidence")
    .select("id,statement_text,created_at")
    .eq("case_id",uuid(caseId)).order("created_at",{ascending:true}).limit(100);
  check(error);
  await assertTg13CurrentActor(expectedUserId);
  return (data ?? []).map(parseEthicsEvidence);
}

function receipt(input: unknown, op: EthicsOperation): {
  caseId: string | null; memberId: string | null; evidenceId: string | null; revision: number;
} {
  const envelope = obj(input) ? input : null;
  const result = obj(envelope?.result) ? envelope.result : null;
  if (envelope?.status !== "succeeded" || envelope.operationId !== op.operationId
    || result?.ok !== true || result.operationId !== op.operationId) {
    throw new Error("The Ethics operation lacks a matching authoritative receipt.");
  }
  return {
    caseId: result.caseId ? uuid(result.caseId) : null,
    memberId: result.memberId ? uuid(result.memberId) : null,
    evidenceId: result.evidenceId ? uuid(result.evidenceId) : null,
    revision: rev(result.revision),
  };
}
export async function fileEthicsCase(
  input: { organizationId: string; reportingCountryId: string;
    subjectCountryId: string | null; subjectPersonId: string | null; allegation: string },
  op: EthicsOperation,
) {
  const db = supabase as any;
  const { data, error } = await db.rpc("world_file_ethics_case_v1", {
    p_organization_id:uuid(input.organizationId),
    p_reporting_country_id:uuid(input.reportingCountryId),
    p_subject_country_id:input.subjectCountryId ? uuid(input.subjectCountryId) : null,
    p_subject_person_id:input.subjectPersonId ? uuid(input.subjectPersonId) : null,
    p_allegation:input.allegation.trim(),
    p_operation_id:uuid(op.operationId),p_idempotency_key:op.key,
  });
  check(error);
  return receipt(data,op);
}
export async function configureEthicsMember(
  input: { organizationId: string; personId: string; userId: string | null;
    appointmentReference: string }, op: EthicsOperation,
) {
  const db = supabase as any;
  const { data, error } = await db.rpc("world_configure_ethics_member_v1", {
    p_organization_id:uuid(input.organizationId),
    p_person_id:uuid(input.personId),
    p_user_id:input.userId ? uuid(input.userId) : null,
    p_appointment_reference:input.appointmentReference.trim(),
    p_operation_id:uuid(op.operationId),p_idempotency_key:op.key,
  });
  check(error);
  return receipt(data,op);
}
export async function assignEthicsCase(
  input: { caseId: string; memberId: string; expectedRevision: number }, op: EthicsOperation,
) {
  const db = supabase as any;
  const { data, error } = await db.rpc("world_assign_ethics_case_v1", {
    p_case_id:uuid(input.caseId), p_member_id:uuid(input.memberId),
    p_expected_revision:input.expectedRevision,
    p_operation_id:uuid(op.operationId), p_idempotency_key:op.key,
  });
  check(error);
  return receipt(data,op);
}
export async function appendEthicsEvidence(
  input: { caseId: string; statement: string }, op: EthicsOperation,
) {
  const db = supabase as any;
  const { data, error } = await db.rpc("world_append_ethics_evidence_v1", {
    p_case_id:uuid(input.caseId),p_statement:input.statement.trim(),
    p_operation_id:uuid(op.operationId),p_idempotency_key:op.key,
  });
  check(error);
  return receipt(data,op);
}
