import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as any;

export type WorldMembershipStatus =
  | "member" | "observer" | "associate" | "suspended"
  | "withdrawn" | "expelled" | "former";

export type WithdrawalMember = {
  organizationId: string;
  organizationSlug: "guard" | "unity";
  organizationName: string;
  membershipId: string | null;
  membershipStatus: WorldMembershipStatus | null;
  membershipType: "member" | "observer" | "associate" | null;
  joinedAt: string | null;
  endedAt: string | null;
  revision: number | null;
  requiresOfficeTransition: boolean;
  canWithdraw: boolean;
};

export type MembershipWithdrawalProjection = {
  countryId: string;
  items: WithdrawalMember[];
};

export type MembershipWithdrawalOperation = {
  operationId: string;
  idempotencyKey: string;
};

export type MembershipWithdrawalAcknowledgement = {
  membershipId: string;
  organizationId: string;
  countryId: string;
  revision: number;
  endedAt: string;
  representationsEnded: number;
  proxiesRevoked: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set([
  "member","observer","associate","suspended","withdrawn","expelled","former",
]);
const MEMBER_TYPES = new Set(["member","observer","associate"]);

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function utcTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length < 65
    && Number.isFinite(Date.parse(value));
}

function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

export function parseMembershipWithdrawalProjection(
  value: unknown, expectedCountryId: string,
): MembershipWithdrawalProjection {
  const response = object(value);
  if (!UUID.test(expectedCountryId) || !response
    || response.countryId !== expectedCountryId
    || !Array.isArray(response.items) || response.items.length > 2) {
    throw new Error("The current institutional membership snapshot could not be verified.");
  }
  const seen = new Set<string>();
  const items: WithdrawalMember[] = response.items.map((entry: unknown) => {
    const row = object(entry);
    if (!row || !UUID.test(String(row.organizationId))
      || (row.organizationSlug !== "guard" && row.organizationSlug !== "unity")
      || typeof row.organizationName !== "string"
      || !row.organizationName.trim() || row.organizationName.length > 180
      || seen.has(row.organizationSlug as string)
      || typeof row.requiresOfficeTransition !== "boolean"
      || typeof row.canWithdraw !== "boolean") {
      throw new Error("The current membership record is incomplete.");
    }
    seen.add(row.organizationSlug as string);

    const absent = row.membershipId === null && row.membershipStatus === null
      && row.membershipType === null && row.joinedAt === null
      && row.endedAt === null && row.revision === null;
    const present = UUID.test(String(row.membershipId))
      && STATUSES.has(String(row.membershipStatus))
      && MEMBER_TYPES.has(String(row.membershipType))
      && utcTimestamp(row.joinedAt)
      && (row.endedAt === null || utcTimestamp(row.endedAt))
      && validRevision(row.revision);
    if ((!absent && !present) || (absent && (row.canWithdraw || row.requiresOfficeTransition))) {
      throw new Error("The current membership record is incomplete.");
    }
    if (present) {
      const ended = row.endedAt !== null;
      const status = row.membershipStatus as WorldMembershipStatus;
      if (
        (ended && !["withdrawn","expelled","former"].includes(status))
        || (!ended && !["member","observer","associate","suspended"].includes(status))
        || (row.canWithdraw && (ended || row.requiresOfficeTransition))
      ) {
        throw new Error("The current membership state is inconsistent.");
      }
    }
    return row as WithdrawalMember;
  });
  return { countryId: expectedCountryId, items };
}

export async function loadMembershipWithdrawal(
  countryId: string,
): Promise<MembershipWithdrawalProjection> {
  if (!UUID.test(countryId)) throw new Error("Select an active country controller.");
  const { data, error } = await supabase.rpc("world_my_membership_withdrawal_v1", {
    p_country_id: countryId,
  });
  if (error) throw error;
  return parseMembershipWithdrawalProjection(data, countryId);
}

/** Keep this operation after an uncertain response, reusing its exact inputs. */
export function newMembershipWithdrawalOperation(): MembershipWithdrawalOperation {
  const id = crypto.randomUUID();
  return { operationId: id, idempotencyKey: "world-member-withdraw:" + id };
}

export function parseMembershipWithdrawalReceipt(
  value: unknown,
  expected: {
    organizationId: string;
    countryId: string;
    membershipId: string;
    revision: number;
    operationId: string;
  },
): MembershipWithdrawalAcknowledgement {
  const envelope = object(value);
  const result = object(envelope?.result);
  if (!envelope || !result
    || envelope.status !== "succeeded"
    || envelope.operationId !== expected.operationId
    || result.ok !== true || result.operationId !== expected.operationId
    || result.organizationId !== expected.organizationId
    || result.countryId !== expected.countryId
    || result.membershipId !== expected.membershipId
    || result.status !== "withdrawn"
    || !validRevision(result.revision)
    || result.revision !== expected.revision + 1
    || !utcTimestamp(result.endedAt)
    || !Number.isSafeInteger(result.representationsEnded)
    || (result.representationsEnded as number) < 0
    || !Number.isSafeInteger(result.proxiesRevoked)
    || (result.proxiesRevoked as number) < 0) {
    throw new Error("The membership withdrawal receipt could not be verified. Refresh the server state before retrying.");
  }
  return {
    membershipId: expected.membershipId,
    organizationId: expected.organizationId,
    countryId: expected.countryId,
    revision: result.revision as number,
    endedAt: result.endedAt as string,
    representationsEnded: result.representationsEnded as number,
    proxiesRevoked: result.proxiesRevoked as number,
  };
}

export async function withdrawWorldMembership(input: {
  member: WithdrawalMember;
  countryId: string;
  operation: MembershipWithdrawalOperation;
}): Promise<MembershipWithdrawalAcknowledgement> {
  const { member, countryId, operation } = input;
  if (!UUID.test(countryId) || !member.canWithdraw || member.requiresOfficeTransition
    || !member.membershipId || !validRevision(member.revision)
    || !UUID.test(member.organizationId)) {
    throw new Error("The membership is not eligible for immediate voluntary withdrawal.");
  }
  const { data, error } = await supabase.rpc("world_withdraw_membership_v1", {
    p_organization_id: member.organizationId,
    p_country_id: countryId,
    p_membership_id: member.membershipId,
    p_expected_revision: member.revision,
    p_operation_id: operation.operationId,
    p_idempotency_key: operation.idempotencyKey,
  });
  if (error) throw error;
  return parseMembershipWithdrawalReceipt(data, {
    organizationId: member.organizationId,
    countryId,
    membershipId: member.membershipId,
    revision: member.revision,
    operationId: operation.operationId,
  });
}

export function membershipWithdrawalError(error: unknown): string {
  const value = object(error);
  const code = typeof value?.code === "string" ? value.code : "";
  const message = typeof value?.message === "string" ? value.message : "";
  if (message.includes("OFFICE_TRANSITION_REQUIRED"))
    return "An active or scheduled institutional officer represents this country. The succession process must be completed before withdrawal.";
  if (code === "40001" || message.includes("VERSION_CONFLICT") || message.includes("MEMBERSHIP_NOT_EFFECTIVE"))
    return "The membership has changed. Refresh its authoritative status before continuing.";
  if (code === "42501" || message.includes("AUTHORIZATION"))
    return "The current country account is not authorized to withdraw this membership.";
  if (code === "PGRST202" || code === "PGRST205" || code === "42P01")
    return "Institutional membership withdrawal is not yet available on this deployment.";
  if (message.includes("VALIDATION")) return "The server rejected the withdrawal parameters. Refresh the record.";
  // Never echo raw PostgREST diagnostics, internal grants or country account identifiers.
  return "Withdrawal could not be confirmed. Check the current record before retrying the identical operation.";
}
