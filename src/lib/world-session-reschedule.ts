import { supabase } from "@/integrations/supabase/client";

const client = supabase as any;
const object = (input: unknown): Record<string, unknown> | null =>
  input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown> : null;
const uuid = (input: unknown): input is string =>
  typeof input === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input);
const integer = (input: unknown): input is number =>
  Number.isSafeInteger(input) && Number(input) >= 1;
const date = (input: unknown): input is string =>
  typeof input === "string" && Number.isFinite(Date.parse(input));
const venueTypes = ["online","external","physical","hybrid"] as const;
const sessionStatuses = ["scheduled","open","recessed","concluded","cancelled","archived"] as const;

export type WorldSessionVenue = typeof venueTypes[number];
export type WorldSessionScheduleManage = {
  sessionId: string;
  organizationId: string;
  organId: string;
  title: string;
  status: typeof sessionStatuses[number];
  startsAt: string;
  endsAt: string;
  venueType: WorldSessionVenue;
  venueLabel: string | null;
  externalUrl: string | null;
  revision: number;
};
export type WorldSessionRescheduleOperation = { id: string; key: string };
export type WorldSessionRescheduleReceipt = {
  operationId: string; sessionId: string; revision: number;
  startsAt: string; endsAt: string; replayed: boolean;
};
export type WorldSessionRescheduleInput = {
  sessionId: string;
  startsAt: string;
  endsAt: string;
  venueType: WorldSessionVenue;
  venueLabel: string;
  externalUrl: string;
  expectedRevision: number;
  operation: WorldSessionRescheduleOperation;
};

function invalid(message = "Official institutional schedule could not be verified."): never {
  throw new Error(message);
}

export function utcInputFromInstant(value: string): string {
  if (!date(value)) return invalid("Invalid official UTC meeting time.");
  return new Date(value).toISOString().slice(0,16);
}

export function utcInstantFromInput(value: string): string {
  // Explicit UTC: never silently interpret datetime-local as device local
  // time, which otherwise gives different scheduling truth across countries.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return invalid("Enter an unambiguous date and time in UTC.");
  }
  const parsed = new Date(value + ":00Z");
  if (!Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0,16) !== value) {
    return invalid("The UTC date or time is not valid.");
  }
  return parsed.toISOString();
}

export function parseWorldSessionScheduleManage(
  input: unknown,
  expectedSessionId: string,
): WorldSessionScheduleManage {
  const root = object(input);
  if (!root || !uuid(expectedSessionId) || root.sessionId !== expectedSessionId ||
      !uuid(root.organizationId) || !uuid(root.organId) ||
      typeof root.title !== "string" || !root.title.trim() ||
      !sessionStatuses.includes(root.status as WorldSessionScheduleManage["status"]) ||
      !date(root.startsAt) || !date(root.endsAt) ||
      Date.parse(root.endsAt as string) <= Date.parse(root.startsAt as string) ||
      !venueTypes.includes(root.venueType as WorldSessionVenue) ||
      !(root.venueLabel === null ||
        (typeof root.venueLabel === "string" && root.venueLabel.length <= 180)) ||
      !(root.externalUrl === null ||
        (typeof root.externalUrl === "string" && /^https:\/\/[^\s]+$/i.test(root.externalUrl))) ||
      !integer(root.revision)) invalid();
  return {
    sessionId: expectedSessionId, organizationId: root.organizationId as string,
    organId: root.organId as string, title: root.title as string,
    status: root.status as WorldSessionScheduleManage["status"],
    startsAt: root.startsAt as string, endsAt: root.endsAt as string,
    venueType: root.venueType as WorldSessionVenue,
    venueLabel: root.venueLabel as string | null,
    externalUrl: root.externalUrl as string | null,
    revision: root.revision as number,
  };
}

export function validateWorldSessionReschedule(input: WorldSessionRescheduleInput): string | null {
  if (!uuid(input.sessionId) || !uuid(input.operation.id) ||
      input.operation.key !== "world.session.reschedule:" + input.operation.id) {
    return "Reload the official session before preparing another operation.";
  }
  if (!integer(input.expectedRevision)) return "The official schedule revision is missing.";
  if (!venueTypes.includes(input.venueType)) return "Choose an approved venue type.";
  if (typeof input.venueLabel !== "string" ||
      typeof input.externalUrl !== "string" ||
      input.venueLabel.length > 180 ||
      (input.externalUrl.trim() && !/^https:\/\/[^\s]+$/i.test(input.externalUrl.trim()))) {
    return "Review the venue label and optional HTTPS meeting link.";
  }
  if (!date(input.startsAt) || !date(input.endsAt) ||
      Date.parse(input.startsAt) >= Date.parse(input.endsAt)) {
    return "The UTC end must be later than the UTC start.";
  }
  // Advisory only. The SQL command is authoritative about server time.
  if (Date.parse(input.startsAt) <= Date.now()) {
    return "Choose a future UTC start time.";
  }
  return null;
}

export function newWorldSessionRescheduleOperation(): WorldSessionRescheduleOperation {
  const id = crypto.randomUUID();
  return { id, key: "world.session.reschedule:" + id };
}

export function parseWorldSessionRescheduleReceipt(
  input: unknown,
  expected: { sessionId: string; operationId: string; startsAt: string; endsAt: string },
): WorldSessionRescheduleReceipt {
  const root = object(input);
  const result = object(root?.result);
  if (!root || root.status !== "succeeded" ||
      root.operationId !== expected.operationId ||
      !result || result.ok !== true ||
      result.operationId !== expected.operationId ||
      result.sessionId !== expected.sessionId ||
      !integer(result.revision) ||
      !date(result.startsAt) || !date(result.endsAt) ||
      Date.parse(result.startsAt as string) !== Date.parse(expected.startsAt) ||
      Date.parse(result.endsAt as string) !== Date.parse(expected.endsAt) ||
      !(root.replayed === undefined || typeof root.replayed === "boolean")) invalid(
        "The official rescheduling receipt did not match the requested session and UTC instants.",
      );
  return {
    sessionId: expected.sessionId, operationId: expected.operationId,
    revision: result.revision as number, startsAt: result.startsAt as string,
    endsAt: result.endsAt as string, replayed: root.replayed === true,
  };
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function loadWorldSessionScheduleManage(id: string): Promise<WorldSessionScheduleManage> {
  if (!uuid(id)) invalid();
  return parseWorldSessionScheduleManage(
    await rpc("world_session_schedule_manage_v1", { p_session_id: id }), id,
  );
}

export async function rescheduleWorldSession(input: WorldSessionRescheduleInput):
  Promise<WorldSessionRescheduleReceipt> {
  const error = validateWorldSessionReschedule(input);
  if (error) return invalid(error);
  const data = await rpc("world_session_reschedule_v1", {
    p_session_id: input.sessionId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_venue_type: input.venueType,
    p_venue_label: input.venueLabel.trim() || null,
    p_external_url: input.externalUrl.trim() || null,
    p_expected_revision: input.expectedRevision,
    p_operation_id: input.operation.id,
    p_idempotency_key: input.operation.key,
  });
  return parseWorldSessionRescheduleReceipt(data, {
    sessionId: input.sessionId, operationId: input.operation.id,
    startsAt: input.startsAt, endsAt: input.endsAt,
  });
}
