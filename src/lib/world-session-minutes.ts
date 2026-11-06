import { supabase } from "@/integrations/supabase/client";

const rpcClient = supabase as any;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const revision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 1;
const instant = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export type WorldMinutesStatus = "draft" | "in_review" | "published";
export type WorldMinutesAction = "save" | "submit" | "publish";
export type WorldMinutesOperation = { id: string; key: string };
export type WorldMinutesReceipt = {
  sessionId: string;
  operationId: string;
  revision: number;
  status: WorldMinutesStatus;
  replayed: boolean;
};
export type WorldPublicMinutes = {
  sessionId: string;
  status: "published";
  summary: string;
  body: string;
  revision: number;
  publishedAt: string;
};
export type WorldManageMinutes = {
  sessionId: string;
  title: string;
  sessionStatus: "scheduled" | "open" | "recessed" | "concluded" | "cancelled" | "archived";
  sessionRevision: number;
  status: WorldMinutesStatus | "missing";
  summary: string;
  body: string;
  revision: number | null;
  publishedAt: string | null;
  canManage: boolean;
  canPublish: boolean;
};

function invalid(): never {
  throw new Error("Official institutional minutes could not be verified.");
}

export function newWorldMinutesOperation(action: WorldMinutesAction): WorldMinutesOperation {
  const id = crypto.randomUUID();
  return { id, key: "world.session.minutes." + action + ":" + id };
}

export function parseWorldPublicMinutes(value: unknown, sessionId: string): WorldPublicMinutes | null {
  if (value === null) return null;
  const root = object(value);
  if (!root || !uuid(sessionId) || root.sessionId !== sessionId ||
      root.status !== "published" || typeof root.summary !== "string" ||
      typeof root.body !== "string" || !root.body.trim() ||
      root.summary.length > 1200 || root.body.length > 20000 ||
      !revision(root.revision) || !instant(root.publishedAt)) invalid();
  return {
    sessionId, status: "published", summary: root.summary,
    body: root.body, revision: root.revision as number,
    publishedAt: root.publishedAt as string,
  };
}

export function parseWorldManageMinutes(value: unknown, sessionId: string): WorldManageMinutes {
  const root = object(value);
  const states = ["scheduled","open","recessed","concluded","cancelled","archived"];
  const minutesStates = ["missing","draft","in_review","published"];
  if (!root || !uuid(sessionId) || root.sessionId !== sessionId ||
      typeof root.title !== "string" || !root.title.trim() ||
      !states.includes(String(root.sessionStatus)) ||
      !minutesStates.includes(String(root.status)) ||
      !revision(root.sessionRevision) ||
      !(root.revision === null || revision(root.revision)) ||
      (root.status === "missing") !== (root.revision === null) ||
      typeof root.summary !== "string" || typeof root.body !== "string" ||
      root.summary.length > 1200 || root.body.length > 20000 ||
      !(root.publishedAt === null || instant(root.publishedAt)) ||
      (root.status === "published") !== (root.publishedAt !== null) ||
      (root.status === "published" && !root.body.trim()) ||
      typeof root.canManage !== "boolean" ||
      typeof root.canPublish !== "boolean") invalid();
  return {
    sessionId, title: root.title as string,
    sessionStatus: root.sessionStatus as WorldManageMinutes["sessionStatus"],
    sessionRevision: root.sessionRevision as number,
    status: root.status as WorldManageMinutes["status"],
    summary: root.summary as string, body: root.body as string,
    revision: root.revision as number | null,
    publishedAt: root.publishedAt as string | null,
    canManage: root.canManage as boolean, canPublish: root.canPublish as boolean,
  };
}

export function parseWorldMinutesReceipt(
  value: unknown,
  expected: { sessionId: string; operationId: string; status: WorldMinutesStatus },
): WorldMinutesReceipt {
  const root = object(value);
  const result = object(root?.result);
  if (!root || !result || root.status !== "succeeded" ||
      root.operationId !== expected.operationId ||
      result.ok !== true || result.operationId !== expected.operationId ||
      result.sessionId !== expected.sessionId || result.status !== expected.status ||
      !revision(result.revision) ||
      !(root.replayed === undefined || typeof root.replayed === "boolean")) invalid();
  return {
    sessionId: expected.sessionId,
    operationId: expected.operationId,
    revision: result.revision as number,
    status: expected.status,
    replayed: root.replayed === true,
  };
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpcClient.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function loadWorldPublicMinutes(sessionId: string): Promise<WorldPublicMinutes | null> {
  if (!uuid(sessionId)) return null;
  return parseWorldPublicMinutes(await rpc("world_session_minutes_public_v1", {
    p_session_id: sessionId,
  }), sessionId);
}

export async function loadWorldManageMinutes(sessionId: string): Promise<WorldManageMinutes> {
  if (!uuid(sessionId)) invalid();
  return parseWorldManageMinutes(await rpc("world_session_minutes_manage_v1", {
    p_session_id: sessionId,
  }), sessionId);
}

export async function mutateWorldMinutes(input: {
  sessionId: string;
  action: WorldMinutesAction;
  expectedRevision: number | null;
  operation: WorldMinutesOperation;
  summary?: string;
  body?: string;
}): Promise<WorldMinutesReceipt> {
  if (!uuid(input.sessionId) || !uuid(input.operation.id) ||
      !input.operation.key.endsWith(input.operation.id) ||
      !(input.expectedRevision === null || revision(input.expectedRevision)) ||
      (input.action !== "save" && !revision(input.expectedRevision)) ||
      !["save","submit","publish"].includes(input.action)) invalid();
  if (input.action === "save" &&
      (typeof input.body !== "string" || typeof input.summary !== "string" ||
       input.body.length > 20000 || input.summary.length > 1200)) {
    throw new Error("Meeting minutes exceed the allowed length or are incomplete.");
  }
  const params: Record<string, unknown> = {
    p_session_id: input.sessionId,
    p_expected_revision: input.expectedRevision,
    p_operation_id: input.operation.id,
    p_idempotency_key: input.operation.key,
  };
  let method = "";
  let status: WorldMinutesStatus = "draft";
  if (input.action === "save") {
    method = "world_save_session_minutes_v1";
    params.p_summary = input.summary;
    params.p_body = input.body;
  } else if (input.action === "submit") {
    method = "world_submit_session_minutes_v1";
    status = "in_review";
  } else {
    method = "world_publish_session_minutes_v1";
    status = "published";
  }
  return parseWorldMinutesReceipt(await rpc(method, params), {
    sessionId: input.sessionId, operationId: input.operation.id, status,
  });
}
