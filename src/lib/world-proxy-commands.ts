import { supabase } from "@/integrations/supabase/client";

// New TG6 RPC types are not in generated Supabase definitions until migrations
// are adopted. Keep all unknown transport parsing here, never in a UI action.
const client = supabase as any;
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const revision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 1;
const date = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export type WorldProxyOrganization = { id: string; slug: string; name: string };
export type WorldProxyPerson = {
  id: string; personId: string; countryId: string; name: string; revision: number;
};
export type WorldProxyDirectory = {
  organization: WorldProxyOrganization; representatives: WorldProxyPerson[];
};
export type WorldProxyItem = {
  id: string;
  representationId: string;
  proxyPersonId: string;
  proxyPersonName: string;
  organizationId: string | null;
  countryId: string | null;
  reason: string;
  validFrom: string;
  validUntil: string;
  status: "requested" | "approved" | "rejected" | "expired" | "revoked";
  revision: number;
  timeEffective: boolean | null;
};
export type ProxyAction = "request" | "approve" | "reject" | "revoke";
export type ProxyOperation = { id: string; key: string };

export function newProxyOperation(action: ProxyAction): ProxyOperation {
  const id = crypto.randomUUID();
  return { id, key: "world.proxy." + action + ":" + id };
}

export function parseProxyDirectory(value: unknown, slug: string): WorldProxyDirectory | null {
  const root = object(value);
  const org = object(root?.organization);
  if (!org || !uuid(org.id) || org.slug !== slug ||
      typeof org.shortName !== "string" || !org.shortName.trim() ||
      !Array.isArray(root?.representatives)) return null;

  const representatives: WorldProxyPerson[] = [];
  for (const candidate of root.representatives) {
    const row = object(candidate);
    if (!row || !uuid(row.id) || !uuid(row.countryId) ||
        !uuid(row.personId) || !revision(row.revision) ||
        typeof row.displayName !== "string" || !row.displayName.trim() ||
        typeof row.votingAuthority !== "boolean" ||
        row.votingAuthority !== true || row.endsAt !== null ||
        row.role !== "representative") continue;
    representatives.push({
      id: row.id, personId: row.personId, countryId: row.countryId,
      name: row.displayName, revision: row.revision,
    });
  }
  return { organization: { id: org.id, slug, name: org.shortName }, representatives };
}

export function parseProxyItems(value: unknown, scope: "review" | "country"): WorldProxyItem[] {
  const root = object(value);
  if (!root || !Array.isArray(root.items) ||
      root.items.length > (scope === "review" ? 25 : 20)) {
    throw new Error("Official proxy status could not be verified.");
  }
  const result: WorldProxyItem[] = [];
  const states = new Set(["requested", "approved", "rejected", "expired", "revoked"]);
  for (const raw of root.items) {
    const row = object(raw);
    if (!row || !uuid(row.id) || !uuid(row.representationId) ||
        !uuid(row.proxyPersonId) || !revision(row.revision) ||
        typeof row.proxyPersonName !== "string" || !row.proxyPersonName.trim() ||
        typeof row.reason !== "string" || row.reason.length > 500 ||
        !date(row.validFrom) || !date(row.validUntil) ||
        typeof row.status !== "string" || !states.has(row.status) ||
        (scope === "review" && !uuid(row.countryId)) ||
        (scope === "country" && !uuid(row.organizationId)) ||
        !(row.timeEffective === undefined || typeof row.timeEffective === "boolean")) {
      throw new Error("Official proxy history includes an unverified record.");
    }
    result.push({
      id: row.id,
      representationId: row.representationId,
      proxyPersonId: row.proxyPersonId,
      proxyPersonName: row.proxyPersonName,
      organizationId: typeof row.organizationId === "string" ? row.organizationId : null,
      countryId: typeof row.countryId === "string" ? row.countryId : null,
      reason: row.reason, validFrom: row.validFrom, validUntil: row.validUntil,
      status: row.status as WorldProxyItem["status"], revision: row.revision,
      timeEffective: typeof row.timeEffective === "boolean" ? row.timeEffective : null,
    });
  }
  return result;
}

export async function proxyWorldEnabled(): Promise<boolean> {
  const { data, error } = await client.rpc("studio2_feature_enabled", {
    p_key: "terra_world_public", p_edition_id: null,
  });
  if (error) throw new Error("World availability cannot be verified.");
  return data === true;
}

export async function listProxyOrganizations(): Promise<WorldProxyOrganization[]> {
  const { data, error } = await client.from("world_organizations")
    .select("id,slug,short_name").eq("public_visibility", "public")
    .eq("status", "active").order("short_name").limit(20);
  if (error) throw error;
  return (Array.isArray(data) ? data : []).flatMap((entry: unknown) => {
    const row = object(entry);
    return row && uuid(row.id) && typeof row.slug === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) &&
      typeof row.short_name === "string" && row.short_name.trim()
      ? [{ id: row.id, slug: row.slug, name: row.short_name }] : [];
  });
}

export async function getProxyDirectory(slug: string): Promise<WorldProxyDirectory | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const { data, error } = await client.rpc("world_organization_projection_v1", { p_slug: slug });
  if (error) throw error;
  return parseProxyDirectory(data, slug);
}

export async function getProxyReviewQueue(organizationId: string): Promise<WorldProxyItem[]> {
  if (!uuid(organizationId)) throw new Error("Select a valid institution.");
  const { data, error } = await client.rpc("world_proxy_review_queue_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  const root = object(data);
  if (!root || root.organizationId !== organizationId) {
    throw new Error("Institutional proxy permissions could not be verified.");
  }
  return parseProxyItems(data, "review");
}

export async function getMyProxyHistory(countryId: string): Promise<WorldProxyItem[]> {
  if (!uuid(countryId)) throw new Error("An active country is required.");
  const { data, error } = await client.rpc("world_my_proxy_requests_v1", {
    p_country_id: countryId,
  });
  if (error) throw error;
  const root = object(data);
  if (!root || root.countryId !== countryId) {
    throw new Error("Your country's proxy history could not be verified.");
  }
  return parseProxyItems(data, "country");
}

export function parseProxyReceipt(
  input: unknown,
  expected: { proxyId?: string; representationId?: string; operationId: string; status: WorldProxyItem["status"] },
): { proxyId: string; revision: number; operationId: string } {
  const envelope = object(input);
  const result = object(envelope?.result);
  if (!envelope || !result ||
      envelope.status !== "succeeded" ||
      envelope.operationId !== expected.operationId ||
      result.ok !== true || !uuid(result.proxyId) ||
      !revision(result.revision) || result.status !== expected.status ||
      (expected.proxyId && expected.proxyId !== result.proxyId) ||
      (expected.representationId && expected.representationId !== result.representationId)) {
    throw new Error("Official operation receipt could not be verified. Refresh before retrying.");
  }
  return { proxyId: result.proxyId, revision: result.revision, operationId: expected.operationId };
}

export async function requestWorldProxy(input: {
  representationId: string; personId: string; from: string; until: string;
  reason: string; expectedRevision: number; operation: ProxyOperation;
}): Promise<{ proxyId: string; revision: number; operationId: string }> {
  if (!uuid(input.representationId) || !uuid(input.personId) ||
      !revision(input.expectedRevision) ||
      !date(input.from) || !date(input.until) ||
      input.reason.trim().length < 5 || input.reason.trim().length > 500) {
    throw new Error("Check the proposed proxy and validity period.");
  }
  const { data, error } = await client.rpc("world_request_proxy_v1", {
    p_representation_id: input.representationId,
    p_proxy_person_id: input.personId,
    p_session_id: null,
    p_valid_from: input.from,
    p_valid_until: input.until,
    p_reason: input.reason.trim(),
    p_expected_representation_revision: input.expectedRevision,
    p_operation_id: input.operation.id,
    p_idempotency_key: input.operation.key,
  });
  if (error) throw error;
  return parseProxyReceipt(data, {
    representationId: input.representationId,
    operationId: input.operation.id, status: "requested",
  });
}

export async function decideWorldProxy(input: {
  proxyId: string; status: "approved" | "rejected";
  revision: number; operation: ProxyOperation;
}): Promise<{ proxyId: string; revision: number; operationId: string }> {
  if (!uuid(input.proxyId) || !revision(input.revision)) {
    throw new Error("Select a valid proxy request.");
  }
  const { data, error } = await client.rpc("world_approve_proxy_v1", {
    p_proxy_id: input.proxyId,
    p_target_status: input.status,
    p_expected_revision: input.revision,
    p_operation_id: input.operation.id,
    p_idempotency_key: input.operation.key,
  });
  if (error) throw error;
  return parseProxyReceipt(data, {
    proxyId: input.proxyId, operationId: input.operation.id, status: input.status,
  });
}

export async function revokeWorldProxy(input: {
  proxyId: string; revision: number; reason: string; operation: ProxyOperation;
}): Promise<{ proxyId: string; revision: number; operationId: string }> {
  if (!uuid(input.proxyId) || !revision(input.revision) ||
      input.reason.trim().length < 5 || input.reason.trim().length > 500) {
    throw new Error("Provide a valid revocation reason.");
  }
  const { data, error } = await client.rpc("world_revoke_proxy_v1", {
    p_proxy_id: input.proxyId, p_expected_revision: input.revision,
    p_reason: input.reason.trim(), p_operation_id: input.operation.id,
    p_idempotency_key: input.operation.key,
  });
  if (error) throw error;
  return parseProxyReceipt(data, {
    proxyId: input.proxyId, operationId: input.operation.id, status: "revoked",
  });
}
