import { supabase } from "@/integrations/supabase/client";

const client = supabase as any;
const record = (input: unknown): Record<string, unknown> | null =>
  input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown> : null;
const uuid = (input: unknown): input is string =>
  typeof input === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input);
const revision = (input: unknown): input is number =>
  Number.isSafeInteger(input) && (input as number) >= 1;
const date = (input: unknown): input is string =>
  typeof input === "string" && Number.isFinite(Date.parse(input));
const statuses = ["present", "absent", "proxy"] as const;

export type WorldAttendanceStatus = typeof statuses[number];
export type WorldAttendanceRecord = {
  status: WorldAttendanceStatus;
  proxyId: string | null;
  revision: number;
  recordedAt: string;
};
export type WorldAttendanceProxy = {
  id: string;
  proxyPersonId: string;
  proxyPersonName: string;
  validFrom: string;
  validUntil: string;
};
export type WorldAttendanceCountry = {
  countryId: string;
  countryName: string;
  membershipStatus: "member" | "observer" | "associate";
  representationId: string;
  representativeName: string;
  attendance: WorldAttendanceRecord | null;
  proxies: WorldAttendanceProxy[];
};
export type WorldAttendanceManage = {
  sessionId: string;
  organizationId: string;
  organId: string;
  title: string;
  status: string;
  revision: number;
  countries: WorldAttendanceCountry[];
};
export type WorldAttendanceOperation = { id: string; key: string };
export type WorldAttendanceReceipt = {
  sessionId: string; countryId: string; status: WorldAttendanceStatus;
  proxyId: string | null; operationId: string; revision: number;
};

export function newWorldAttendanceOperation(): WorldAttendanceOperation {
  const id = crypto.randomUUID();
  return { id, key: "world.session.attendance.record:" + id };
}

function invalid(): never {
  throw new Error("Official institutional attendance state could not be verified.");
}

function parseAttendance(input: unknown): WorldAttendanceRecord | null {
  if (input === null) return null;
  const value = record(input);
  if (!value || !statuses.includes(value.status as WorldAttendanceStatus) ||
      !revision(value.revision) || !date(value.recordedAt) ||
      !(value.proxyId === null || uuid(value.proxyId)) ||
      (value.status === "proxy") !== (value.proxyId !== null)) invalid();
  return {
    status: value.status as WorldAttendanceStatus,
    proxyId: value.proxyId as string | null,
    revision: value.revision as number, recordedAt: value.recordedAt as string,
  };
}

export function parseWorldAttendanceManage(input: unknown, sessionId: string): WorldAttendanceManage {
  const root = record(input);
  if (!root || !uuid(sessionId) || root.sessionId !== sessionId ||
      !uuid(root.organizationId) || !uuid(root.organId) ||
      typeof root.title !== "string" || !root.title.trim() ||
      typeof root.status !== "string" || !revision(root.revision) ||
      !Array.isArray(root.countries) || root.countries.length > 100) invalid();

  const seen = new Set<string>();
  const countries: WorldAttendanceCountry[] = [];
  for (const inputCountry of root.countries) {
    const country = record(inputCountry);
    if (!country || !uuid(country.countryId) || seen.has(country.countryId) ||
        !uuid(country.representationId) ||
        typeof country.countryName !== "string" || !country.countryName.trim() ||
        typeof country.representativeName !== "string" || !country.representativeName.trim() ||
        !["member", "observer", "associate"].includes(String(country.membershipStatus)) ||
        !Array.isArray(country.proxies) || country.proxies.length > 5) invalid();
    seen.add(country.countryId);
    const proxies: WorldAttendanceProxy[] = [];
    const seenProxies = new Set<string>();
    for (const proxyInput of country.proxies) {
      const proxy = record(proxyInput);
      if (!proxy || !uuid(proxy.id) || seenProxies.has(proxy.id) ||
          !uuid(proxy.proxyPersonId) ||
          typeof proxy.proxyPersonName !== "string" || !proxy.proxyPersonName.trim() ||
          !date(proxy.validFrom) || !date(proxy.validUntil) ||
          Date.parse(proxy.validFrom) >= Date.parse(proxy.validUntil)) invalid();
      seenProxies.add(proxy.id);
      proxies.push({
        id: proxy.id, proxyPersonId: proxy.proxyPersonId,
        proxyPersonName: proxy.proxyPersonName,
        validFrom: proxy.validFrom, validUntil: proxy.validUntil,
      });
    }
    countries.push({
      countryId: country.countryId,
      countryName: country.countryName,
      membershipStatus: country.membershipStatus as WorldAttendanceCountry["membershipStatus"],
      representationId: country.representationId,
      representativeName: country.representativeName,
      attendance: parseAttendance(country.attendance),
      proxies,
    });
  }

  return {
    sessionId,
    organizationId: root.organizationId as string,
    organId: root.organId as string,
    title: root.title as string,
    status: root.status as string,
    revision: root.revision as number,
    countries,
  };
}

export async function loadWorldAttendanceManage(sessionId: string): Promise<WorldAttendanceManage> {
  if (!uuid(sessionId)) invalid();
  const { data, error } = await client.rpc("world_session_attendance_manage_v1", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return parseWorldAttendanceManage(data, sessionId);
}

export function parseWorldAttendanceReceipt(
  input: unknown,
  expected: {
    sessionId: string; countryId: string; status: WorldAttendanceStatus;
    proxyId: string | null; operationId: string;
  },
): WorldAttendanceReceipt {
  const root = record(input);
  const result = record(root?.result);
  if (!root || !result || root.status !== "succeeded" ||
      root.operationId !== expected.operationId || result.ok !== true ||
      result.operationId !== expected.operationId ||
      result.sessionId !== expected.sessionId ||
      result.countryId !== expected.countryId ||
      result.status !== expected.status ||
      (result.proxyId ?? null) !== expected.proxyId ||
      !revision(result.revision)) {
    throw new Error("Official attendance receipt could not be verified. Reload the server record before another action.");
  }
  return {
    sessionId: expected.sessionId,countryId: expected.countryId,
    status: expected.status,proxyId: expected.proxyId,
    operationId: expected.operationId,revision: result.revision,
  };
}

export async function recordWorldAttendance(input: {
  sessionId: string;
  countryId: string;
  representationId: string;
  status: WorldAttendanceStatus;
  proxyId: string | null;
  expectedRevision: number | null;
  operation: WorldAttendanceOperation;
}): Promise<WorldAttendanceReceipt> {
  if (!uuid(input.sessionId) || !uuid(input.countryId) || !uuid(input.representationId) ||
      !statuses.includes(input.status) ||
      (input.status === "proxy") !== (input.proxyId !== null) ||
      (input.proxyId !== null && !uuid(input.proxyId)) ||
      !(input.expectedRevision === null || revision(input.expectedRevision))) {
    throw new Error("Review official attendance, country and proxy before submitting.");
  }

  const { data, error } = await client.rpc("world_record_session_attendance_v1", {
    p_session_id: input.sessionId,
    p_country_id: input.countryId,
    p_representation_id: input.representationId,
    p_status: input.status,
    p_proxy_id: input.proxyId,
    p_expected_revision: input.expectedRevision,
    p_operation_id: input.operation.id,
    p_idempotency_key: input.operation.key,
  });
  if (error) throw error;
  return parseWorldAttendanceReceipt(data, {
    sessionId: input.sessionId,countryId: input.countryId,
    status: input.status,proxyId: input.proxyId,
    operationId: input.operation.id,
  });
}
