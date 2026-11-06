import { supabase } from "@/integrations/supabase/client";

export type ShowLifecycleIdentity = {
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
};

export type ShowLifecyclePreview = {
  editionId: string;
  showId: string;
  expectedVersion: number;
  updatedAt: string;
  show: {
    name: string;
    kind: string;
    sortOrder: number;
    status: string;
    published: boolean;
    broadcastConfig: Record<string, unknown>;
    publicationConfig: Record<string, unknown>;
  };
  publication: {
    state: string;
    version: number;
    hasPublicInformation: boolean;
  };
  dependencies: {
    showId: string;
    blockingTableCount: number;
    blockingReferenceCount: number;
    tables: Record<
      string,
      {
        count: number;
        deleteAction: string;
        blocking: boolean;
      }
    >;
  };
  delete: {
    allowed: boolean;
    blockers: string[];
    requiresFreshAuthentication: boolean;
    riskClass: "R3";
  };
  serverTime: string;
  operations: {
    update: { riskClass: "R2" };
    showModeUpdate: { riskClass: "R2" };
    delete: { riskClass: "R3" };
  };
};

export type ShowLifecycleResult = {
  ok: true;
  editionId: string;
  showId: string;
  stateVersion: number;
  operationId: string;
  receiptId: string;
  serverTime: string;
  deleted?: boolean;
  showMode?: Record<string, unknown>;
};

export type ShowLifecycleReceipt = {
  operationId: string;
  correlationId: string;
  command: "show.create" | "show.update" | "show.mode.update" | "show.delete";
  status: "processing" | "succeeded" | "failed" | "uncertain";
  result: ShowLifecycleResult | null;
  error: { code: string; metadata: Record<string, unknown> } | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  replayed: boolean;
};

type RpcError = { message?: string; code?: string; details?: string; hint?: string };
type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError | null }>;
};

type JsonObject = Record<string, unknown>;

function rpcClient(): RpcClient {
  return supabase as unknown as RpcClient;
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value as JsonObject;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await rpcClient().rpc(name, args);
  if (error) {
    const failure = new Error(error.message || `Solaris RPC failed: ${name}`);
    Object.assign(failure, {
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw failure;
  }
  return data;
}

function parseResult(value: unknown, expected: {
  operationId: string;
  editionId: string;
  showId?: string;
}): ShowLifecycleResult {
  const row = object(value, "Show lifecycle result");
  const operationId = text(row.operationId, "Show operation id");
  const editionId = text(row.editionId, "Show edition id");
  const showId = text(row.showId, "Show id");

  if (operationId !== expected.operationId) {
    throw new Error("Solaris returned a result for a different Show operation.");
  }
  if (editionId !== expected.editionId) {
    throw new Error("Solaris returned a Show result outside the reviewed edition.");
  }
  if (expected.showId && showId !== expected.showId) {
    throw new Error("Solaris returned a result for a different Show.");
  }
  if (row.ok !== true) {
    throw new Error("Solaris returned an unsuccessful Show lifecycle result.");
  }

  return {
    ok: true,
    editionId,
    showId,
    stateVersion: numberValue(row.stateVersion, "Show state version"),
    operationId,
    receiptId: text(row.receiptId, "Show receipt id"),
    serverTime: text(row.serverTime, "Show server time"),
    deleted: typeof row.deleted === "boolean" ? row.deleted : undefined,
    showMode:
      row.showMode && typeof row.showMode === "object" && !Array.isArray(row.showMode)
        ? (row.showMode as Record<string, unknown>)
        : undefined,
  };
}

function parseReceipt(value: unknown, expected: {
  operationId: string;
  editionId: string;
  command: ShowLifecycleReceipt["command"];
  showId?: string;
}): ShowLifecycleReceipt {
  const row = object(value, "Show operation receipt");
  const operationId = text(row.operationId, "Show operation id");
  const command = text(row.command, "Show operation command");
  const status = text(row.status, "Show operation status");

  if (operationId !== expected.operationId || command !== expected.command) {
    throw new Error("Solaris returned a receipt for a different Show operation.");
  }
  if (!(["processing", "succeeded", "failed", "uncertain"] as string[]).includes(status)) {
    throw new Error("Solaris returned an unsupported Show operation status.");
  }

  const result = row.result
    ? parseResult(row.result, {
        operationId: expected.operationId,
        editionId: expected.editionId,
        showId: expected.showId,
      })
    : null;
  const errorRow = row.error ? object(row.error, "Show operation error") : null;

  return {
    operationId,
    correlationId: text(row.correlationId, "Show correlation id"),
    command: command as ShowLifecycleReceipt["command"],
    status: status as ShowLifecycleReceipt["status"],
    result,
    error: errorRow
      ? {
          code: text(errorRow.code, "Show operation error code"),
          metadata: record(errorRow.metadata),
        }
      : null,
    createdAt: text(row.createdAt, "Show receipt creation time"),
    updatedAt: text(row.updatedAt, "Show receipt update time"),
    completedAt: optionalText(row.completedAt),
    replayed: row.replayed === true,
  };
}

function terminalResult(receipt: ShowLifecycleReceipt): ShowLifecycleResult {
  if (receipt.status === "succeeded" && receipt.result?.ok) return receipt.result;

  const error = new Error(
    receipt.status === "processing"
      ? "The Show operation is still processing. Reconcile before retrying."
      : receipt.status === "uncertain"
        ? "The Show operation outcome is uncertain. Reconcile before retrying."
        : `The Show operation failed${receipt.error?.code ? `: ${receipt.error.code}` : "."}`,
  );
  Object.assign(error, {
    code: receipt.error?.code ?? receipt.status.toUpperCase(),
    operationId: receipt.operationId,
    status: receipt.status,
  });
  throw error;
}

export function createShowLifecycleIdentity(prefix = "show"): ShowLifecycleIdentity {
  const operationId = crypto.randomUUID();
  return {
    operationId,
    idempotencyKey: `${prefix}:${operationId}`,
    correlationId: operationId,
  };
}

export async function reconcileShowLifecycleOperation(input: {
  operationId: string;
  editionId: string;
  command: ShowLifecycleReceipt["command"];
  showId?: string;
}): Promise<ShowLifecycleReceipt> {
  return parseReceipt(
    await rpc("studio2_reconcile_operation", { p_operation_id: input.operationId }),
    input,
  );
}

async function runShowCommand(input: {
  rpcName: string;
  args: Record<string, unknown>;
  operationId: string;
  editionId: string;
  command: ShowLifecycleReceipt["command"];
  showId?: string;
}): Promise<ShowLifecycleResult> {
  try {
    const receipt = parseReceipt(
      await rpc(input.rpcName, input.args),
      input,
    );
    return terminalResult(receipt);
  } catch (error) {
    try {
      const receipt = await reconcileShowLifecycleOperation(input);
      return terminalResult(receipt);
    } catch {
      // Keep the original domain/transport failure. Reconciliation is recovery,
      // not permission to turn a precise conflict into a generic second error.
      throw error;
    }
  }
}

export async function previewShowLifecycle(input: {
  editionId: string;
  showId: string;
}): Promise<ShowLifecyclePreview> {
  const row = object(
    await rpc("studio2_show_lifecycle_preview", {
      p_edition_id: input.editionId,
      p_show_id: input.showId,
    }),
    "Show lifecycle preview",
  );

  if (text(row.editionId, "Show preview edition") !== input.editionId) {
    throw new Error("Solaris returned a Show preview outside the requested edition.");
  }
  if (text(row.showId, "Show preview id") !== input.showId) {
    throw new Error("Solaris returned a preview for a different Show.");
  }

  const show = object(row.show, "Show preview state");
  const publication = object(row.publication, "Show publication state");
  const dependencies = object(row.dependencies, "Show dependency state");
  const deleteState = object(row.delete, "Show deletion state");
  const operations = object(row.operations, "Show operation policy");
  const dependencyTables = record(dependencies.tables);

  return {
    editionId: input.editionId,
    showId: input.showId,
    expectedVersion: numberValue(row.expectedVersion, "Show expected version"),
    updatedAt: text(row.updatedAt, "Show updated time"),
    show: {
      name: text(show.name, "Show name"),
      kind: text(show.kind, "Show kind"),
      sortOrder: numberValue(show.sortOrder, "Show order"),
      status: text(show.status, "Show status"),
      published: bool(show.published, "Show published state"),
      broadcastConfig: record(show.broadcastConfig),
      publicationConfig: record(show.publicationConfig),
    },
    publication: {
      state: text(publication.state, "Show publication state"),
      version: numberValue(publication.version, "Show publication version"),
      hasPublicInformation: bool(
        publication.hasPublicInformation,
        "Show public-information state",
      ),
    },
    dependencies: {
      showId: text(dependencies.showId, "Show dependency id"),
      blockingTableCount: numberValue(
        dependencies.blockingTableCount,
        "Show blocking table count",
      ),
      blockingReferenceCount: numberValue(
        dependencies.blockingReferenceCount,
        "Show blocking reference count",
      ),
      tables: Object.fromEntries(
        Object.entries(dependencyTables).map(([key, raw]) => {
          const value = object(raw, `Show dependency ${key}`);
          return [
            key,
            {
              count: numberValue(value.count, `Show dependency ${key} count`),
              deleteAction: text(
                value.deleteAction,
                `Show dependency ${key} delete action`,
              ),
              blocking: bool(value.blocking, `Show dependency ${key} blocking state`),
            },
          ];
        }),
      ),
    },
    delete: {
      allowed: bool(deleteState.allowed, "Show delete eligibility"),
      blockers: stringArray(deleteState.blockers),
      requiresFreshAuthentication: bool(
        deleteState.requiresFreshAuthentication,
        "Show fresh-auth requirement",
      ),
      riskClass: text(deleteState.riskClass, "Show delete risk class") as "R3",
    },
    serverTime: text(row.serverTime, "Show preview server time"),
    operations: {
      update: {
        riskClass: text(
          object(operations.update, "Show update policy").riskClass,
          "Show update risk class",
        ) as "R2",
      },
      showModeUpdate: {
        riskClass: text(
          object(operations.showModeUpdate, "Show Mode policy").riskClass,
          "Show Mode risk class",
        ) as "R2",
      },
      delete: {
        riskClass: text(
          object(operations.delete, "Show delete policy").riskClass,
          "Show delete risk class",
        ) as "R3",
      },
    },
  };
}

export async function createShow(input: {
  editionId: string;
  name: string;
  kind: string;
  sortOrder: number;
  publicationConfig: Record<string, unknown>;
  identity: ShowLifecycleIdentity;
}) {
  return runShowCommand({
    rpcName: "studio2_create_show_v3",
    operationId: input.identity.operationId,
    editionId: input.editionId,
    command: "show.create",
    args: {
      p_edition_id: input.editionId,
      p_name: input.name,
      p_kind: input.kind,
      p_sort_order: input.sortOrder,
      p_publication_config: input.publicationConfig,
      p_operation_id: input.identity.operationId,
      p_idempotency_key: input.identity.idempotencyKey,
      p_correlation_id: input.identity.correlationId,
    },
  });
}

export async function updateShow(input: {
  editionId: string;
  showId: string;
  name: string;
  kind: string;
  sortOrder: number;
  expectedVersion: number;
  identity: ShowLifecycleIdentity;
}) {
  return runShowCommand({
    rpcName: "studio2_update_show_v3",
    operationId: input.identity.operationId,
    editionId: input.editionId,
    showId: input.showId,
    command: "show.update",
    args: {
      p_edition_id: input.editionId,
      p_show_id: input.showId,
      p_name: input.name,
      p_kind: input.kind,
      p_sort_order: input.sortOrder,
      p_expected_version: input.expectedVersion,
      p_operation_id: input.identity.operationId,
      p_idempotency_key: input.identity.idempotencyKey,
      p_correlation_id: input.identity.correlationId,
    },
  });
}

export async function updateShowMode(input: {
  editionId: string;
  showId: string;
  phase: string;
  scheduledStart: string | null;
  youtubeUrl: string;
  televoteRoundId: string | null;
  expectedVersion: number;
  identity: ShowLifecycleIdentity;
}) {
  return runShowCommand({
    rpcName: "studio2_update_show_mode_v3",
    operationId: input.identity.operationId,
    editionId: input.editionId,
    showId: input.showId,
    command: "show.mode.update",
    args: {
      p_edition_id: input.editionId,
      p_show_id: input.showId,
      p_phase: input.phase,
      p_scheduled_start: input.scheduledStart,
      p_youtube_url: input.youtubeUrl,
      p_televote_round_id: input.televoteRoundId,
      p_expected_version: input.expectedVersion,
      p_operation_id: input.identity.operationId,
      p_idempotency_key: input.identity.idempotencyKey,
      p_correlation_id: input.identity.correlationId,
    },
  });
}

export async function deleteShow(input: {
  editionId: string;
  showId: string;
  expectedVersion: number;
  reason: string;
  identity: ShowLifecycleIdentity;
}) {
  return runShowCommand({
    rpcName: "studio2_delete_show_v3",
    operationId: input.identity.operationId,
    editionId: input.editionId,
    showId: input.showId,
    command: "show.delete",
    args: {
      p_edition_id: input.editionId,
      p_show_id: input.showId,
      p_expected_version: input.expectedVersion,
      p_reason: input.reason,
      p_operation_id: input.identity.operationId,
      p_idempotency_key: input.identity.idempotencyKey,
      p_correlation_id: input.identity.correlationId,
    },
  });
}

export async function reauthenticateShowLifecycleR3(password: string): Promise<void> {
  if (!password) {
    throw new Error("Enter your current Solaris password to authorize permanent Show deletion.");
  }

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