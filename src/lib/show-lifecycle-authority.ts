import { supabase } from "@/integrations/supabase/client";

export type ShowLifecycleAction = "create" | "update" | "show_mode" | "delete";

export type ShowLifecyclePreflight = {
  ok: true;
  action: Exclude<ShowLifecycleAction, "create">;
  editionId: string;
  showId: string;
  stateVersion: number;
  show: {
    id: string;
    editionId: string;
    name: string;
    kind: string;
    sortOrder: number;
    published: boolean;
    publicationConfig: Record<string, unknown> | null;
    broadcastConfig: Record<string, unknown>;
    status: string;
    revision: number;
    updatedAt: string;
  };
  publication: {
    state: string;
    scheduledFor: string | null;
    version: number;
    configured: boolean;
  };
  dependencies: {
    total: number;
    tables: Record<string, number>;
  };
  deleteAllowed: boolean | null;
  blockers: string[];
  serverTime: string;
};

export type ShowLifecycleReceipt = {
  ok: true;
  operationId: string;
  receiptId: string;
  action: ShowLifecycleAction;
  editionId: string;
  showId: string;
  revision: number;
  stateVersion: number;
  serverTime: string;
  replayed: boolean;
  reason?: string;
  before?: Record<string, unknown>;
  show?: ShowLifecyclePreflight["show"];
};

type RpcError = { message?: string; code?: string };
type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError | null }>;
};

type Obj = Record<string, unknown>;

function object(value: unknown, label: string): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value as Obj;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value;
}

function numberValue(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return parsed;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberRecord(value: unknown): Record<string, number> {
  const row = object(value ?? {}, "show dependency table map");
  return Object.fromEntries(
    Object.entries(row).flatMap(([key, item]) => {
      const parsed = typeof item === "number" ? item : Number(item);
      return Number.isFinite(parsed) ? [[key, parsed] as const] : [];
    }),
  );
}

function client(): RpcClient {
  return supabase as unknown as RpcClient;
}

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client().rpc(name, args);
  if (error) {
    const failure = new Error(error.message || `Solaris RPC failed: ${name}`);
    if (error.code) Object.assign(failure, { code: error.code });
    throw failure;
  }
  return data;
}

async function reconcile(operationId: string): Promise<unknown | null> {
  try {
    const row = object(
      await rpc("studio2_reconcile_operation", { p_operation_id: operationId }),
      "operation reconciliation",
    );
    if (row.status === "succeeded" && row.result) return row.result;
  } catch {
    // Preserve the original transport/domain error. Reconciliation is recovery,
    // not an excuse to replace a useful failure with a second failure.
  }
  return null;
}

function parseShow(value: unknown): ShowLifecyclePreflight["show"] {
  const row = object(value, "show lifecycle state");
  return {
    id: text(row.id, "show id"),
    editionId: text(row.editionId, "show edition id"),
    name: text(row.name, "show name"),
    kind: text(row.kind, "show kind"),
    sortOrder: numberValue(row.sortOrder, "show sort order"),
    published: bool(row.published, "show published state"),
    publicationConfig:
      row.publicationConfig && typeof row.publicationConfig === "object" && !Array.isArray(row.publicationConfig)
        ? (row.publicationConfig as Record<string, unknown>)
        : null,
    broadcastConfig:
      row.broadcastConfig && typeof row.broadcastConfig === "object" && !Array.isArray(row.broadcastConfig)
        ? (row.broadcastConfig as Record<string, unknown>)
        : {},
    status: text(row.status, "show status"),
    revision: numberValue(row.revision, "show revision"),
    updatedAt: text(row.updatedAt, "show updated time"),
  };
}

export async function preflightShowLifecycle(input: {
  editionId: string;
  showId: string;
  action: "update" | "show_mode" | "delete";
}): Promise<ShowLifecyclePreflight> {
  const row = object(
    await rpc("studio2_show_lifecycle_preflight", {
      p_edition_id: input.editionId,
      p_show_id: input.showId,
      p_action: input.action,
    }),
    "show lifecycle preflight",
  );

  const action = text(row.action, "show lifecycle action");
  if (action !== input.action) {
    throw new Error("Solaris returned a Show preflight for a different action.");
  }
  if (text(row.editionId, "show preflight edition") !== input.editionId) {
    throw new Error("Solaris returned a Show preflight outside the requested edition.");
  }
  if (text(row.showId, "show preflight id") !== input.showId) {
    throw new Error("Solaris returned a Show preflight for a different show.");
  }

  const publication = object(row.publication, "show publication preflight");
  const dependencies = object(row.dependencies, "show dependencies");

  return {
    ok: true,
    action: input.action,
    editionId: input.editionId,
    showId: input.showId,
    stateVersion: numberValue(row.stateVersion, "show state version"),
    show: parseShow(row.show),
    publication: {
      state: text(publication.state, "show publication state"),
      scheduledFor: typeof publication.scheduledFor === "string" ? publication.scheduledFor : null,
      version: numberValue(publication.version, "show publication version"),
      configured: publication.configured === true,
    },
    dependencies: {
      total: numberValue(dependencies.total, "show dependency total"),
      tables: numberRecord(dependencies.tables),
    },
    deleteAllowed: typeof row.deleteAllowed === "boolean" ? row.deleteAllowed : null,
    blockers: stringArray(row.blockers),
    serverTime: text(row.serverTime, "show preflight server time"),
  };
}

function parseReceipt(value: unknown, expected: {
  operationId: string;
  editionId: string;
  action: ShowLifecycleAction;
  showId?: string;
}): ShowLifecycleReceipt {
  const row = object(value, "show lifecycle receipt");
  const operationId = text(row.operationId, "show operation id");
  const editionId = text(row.editionId, "show receipt edition id");
  const action = text(row.action, "show receipt action");
  const showId = text(row.showId, "show receipt id");

  if (operationId !== expected.operationId || editionId !== expected.editionId || action !== expected.action) {
    throw new Error("Solaris returned a receipt for a different Show operation.");
  }
  if (expected.showId && showId !== expected.showId) {
    throw new Error("Solaris returned a receipt for a different show.");
  }

  return {
    ok: true,
    operationId,
    receiptId: text(row.receiptId, "show receipt id"),
    action: expected.action,
    editionId,
    showId,
    revision: numberValue(row.revision, "show receipt revision"),
    stateVersion: numberValue(row.stateVersion, "show receipt state version"),
    serverTime: text(row.serverTime, "show receipt server time"),
    replayed: row.replayed === true,
    reason: typeof row.reason === "string" ? row.reason : undefined,
    before:
      row.before && typeof row.before === "object" && !Array.isArray(row.before)
        ? (row.before as Record<string, unknown>)
        : undefined,
    show: row.show ? parseShow(row.show) : undefined,
  };
}

async function applyShowLifecycle(input: {
  editionId: string;
  action: ShowLifecycleAction;
  payload: Record<string, unknown>;
  operationId: string;
  idempotencyKey: string;
  showId?: string;
  expectedRevision?: number;
  reason?: string;
}): Promise<ShowLifecycleReceipt> {
  const args = {
    p_edition_id: input.editionId,
    p_action: input.action,
    p_payload: input.payload,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
    p_show_id: input.showId ?? null,
    p_expected_revision: input.expectedRevision ?? null,
    p_reason: input.reason ?? null,
  };

  try {
    return parseReceipt(
      await rpc("studio2_apply_show_lifecycle_change", args),
      input,
    );
  } catch (error) {
    const recovered = await reconcile(input.operationId);
    if (recovered) return parseReceipt(recovered, input);
    throw error;
  }
}

export function createShowLifecycleIdentity(prefix = "show"): {
  operationId: string;
  idempotencyKey: string;
} {
  const operationId = crypto.randomUUID();
  return {
    operationId,
    idempotencyKey: `${prefix}:${operationId}`,
  };
}

export async function createShow(input: {
  editionId: string;
  name: string;
  kind: string;
  sortOrder: number;
  operationId: string;
  idempotencyKey: string;
}) {
  return applyShowLifecycle({
    editionId: input.editionId,
    action: "create",
    payload: { name: input.name, kind: input.kind, sortOrder: input.sortOrder },
    operationId: input.operationId,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function updateShow(input: {
  editionId: string;
  showId: string;
  expectedRevision: number;
  name: string;
  kind: string;
  sortOrder: number;
  operationId: string;
  idempotencyKey: string;
}) {
  return applyShowLifecycle({
    editionId: input.editionId,
    showId: input.showId,
    expectedRevision: input.expectedRevision,
    action: "update",
    payload: { name: input.name, kind: input.kind, sortOrder: input.sortOrder },
    operationId: input.operationId,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function updateShowMode(input: {
  editionId: string;
  showId: string;
  expectedRevision: number;
  showMode: Record<string, unknown>;
  operationId: string;
  idempotencyKey: string;
}) {
  return applyShowLifecycle({
    editionId: input.editionId,
    showId: input.showId,
    expectedRevision: input.expectedRevision,
    action: "show_mode",
    payload: { showMode: input.showMode },
    operationId: input.operationId,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function deleteShow(input: {
  editionId: string;
  showId: string;
  expectedRevision: number;
  reason: string;
  operationId: string;
  idempotencyKey: string;
}) {
  return applyShowLifecycle({
    editionId: input.editionId,
    showId: input.showId,
    expectedRevision: input.expectedRevision,
    action: "delete",
    payload: {},
    operationId: input.operationId,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
  });
}

export async function reauthenticateShowLifecycleR3(password: string): Promise<void> {
  if (!password) throw new Error("Enter your current Solaris password to authorize this destructive Show change.");

  const { data: current, error: currentError } = await supabase.auth.getUser();
  if (currentError) throw currentError;
  const user = current.user;
  if (!user?.id || !user.email) {
    throw new Error("This Organizer account cannot be reauthenticated with a password.");
  }

  const originalId = user.id;
  const { data: signedIn, error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (error) throw error;
  if (!signedIn.user || signedIn.user.id !== originalId) {
    await supabase.auth.signOut();
    throw new Error("Fresh authentication returned a different Solaris account.");
  }
}
