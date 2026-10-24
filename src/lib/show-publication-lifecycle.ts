import { supabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import type { PublicationConfig } from "@/lib/publication";

export type ShowPublicationState = "draft" | "scheduled" | "public" | "hidden";

export type ShowPublicationControl = {
  showId: string;
  editionId: string;
  state: ShowPublicationState;
  version: number;
  frozenConfig: PublicationConfig;
  scheduledFor: string | null;
  scheduledFromState: Exclude<ShowPublicationState, "scheduled"> | null;
  sourceShowUpdatedAt: string | null;
  sourceResultVersion: number | null;
  scheduledBy: string | null;
  scheduledOperationId: string | null;
  lastFailure: string | null;
  lastFailureAt: string | null;
  updatedAt: string;
};

export type ShowPublicationPreview = {
  showId: string;
  editionId: string;
  currentState: ShowPublicationState;
  targetState: ShowPublicationState;
  expectedVersion: number;
  alreadyApplied: boolean;
  riskClass: "R2" | "R3";
  config: PublicationConfig;
  scheduledFor: string | null;
  sourceShowUpdatedAt: string | null;
  sourceResultVersion: number | null;
  hasOutcomes: boolean;
  resultReleaseReady: boolean;
  integrityClear: boolean;
};

export type ShowPublicationReceipt = {
  operationId: string;
  showId: string;
  state: ShowPublicationState;
  version: number;
  scheduledFor: string | null;
};

export type ShowPublicationReconciliation =
  | { status: "succeeded"; receipt: ShowPublicationReceipt }
  | { status: "processing" | "uncertain" | "unknown"; errorCode: string | null }
  | { status: "failed"; errorCode: string | null };

export type ShowPublicationRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type Obj = Record<string, unknown>;

const publicationRpcClient = supabase as unknown as ShowPublicationRpcClient;

// Once an operation has produced an ambiguous transport outcome in this runtime,
// subsequent attempts with the same operation identity are reconciliation-only.
// This prevents the UI from issuing a second mutation while the current server
// publication command still checks mutable version state before receipt replay.
const ambiguousPublicationOperations = new Set<string>();

function object(value: unknown, label: string): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value as Obj;
}

function text(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`Solaris returned an invalid ${label}.`);
  return value;
}

function nullableText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown, label: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Solaris returned an invalid ${label}.`);
  return parsed;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(`Solaris returned an invalid ${label}.`);
  return value;
}

function state(value: unknown): ShowPublicationState {
  if (value !== "draft" && value !== "scheduled" && value !== "public" && value !== "hidden") {
    throw new Error("Solaris returned an unknown publication state.");
  }
  return value;
}

function config(value: unknown): PublicationConfig {
  const row = object(value, "publication config");
  return {
    participants: row.participants === true,
    artists: row.artists === true,
    songs: row.songs === true,
    semi_split: row.semi_split === true,
    running_order: row.running_order === true,
    qualifiers: row.qualifiers === true,
    results: row.results === true,
    jury_results: row.jury_results === true,
    televote_results: row.televote_results === true,
    detailed_voting: row.detailed_voting === true,
  };
}

function errorRecord(error: unknown): Obj | null {
  return error && typeof error === "object" && !Array.isArray(error)
    ? (error as Obj)
    : null;
}

function rpcError(error: unknown, fallback: string) {
  if (error instanceof Error) return error;
  const row = errorRecord(error);
  const message = typeof row?.message === "string" && row.message ? row.message : fallback;
  const next = new Error(message) as Error & { code?: unknown; status?: unknown };
  if (row && "code" in row) next.code = row.code;
  if (row && "status" in row) next.status = row.status;
  return next;
}

function errorCode(error: unknown) {
  const row = errorRecord(error);
  return typeof row?.code === "string" ? row.code : null;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  const row = errorRecord(error);
  return typeof row?.message === "string" ? row.message : "";
}

function isDeterministicRpcFailure(error: unknown) {
  // PostgREST/PostgreSQL errors carry a stable code and mean the request reached
  // an authoritative server response. Network/transport loss generally does not.
  return Boolean(errorCode(error));
}

async function rpc(
  name: string,
  args: Record<string, unknown> = {},
  client: ShowPublicationRpcClient = publicationRpcClient,
) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw rpcError(error, `Solaris RPC failed: ${name}`);
  return data;
}

function mapPublicationReceipt(
  value: unknown,
  input: { preview: ShowPublicationPreview; operationId: string },
): ShowPublicationReceipt {
  const row = object(value, "publication receipt");
  const receipt = {
    operationId: text(row.operationId, "publication receipt operation id"),
    showId: text(row.showId, "publication receipt show id"),
    state: state(row.state),
    version: numberValue(row.version, "publication receipt version"),
    scheduledFor: nullableText(row.scheduledFor),
  } satisfies ShowPublicationReceipt;

  if (receipt.operationId !== input.operationId) {
    throw new Error("Solaris returned a publication receipt for a different operation.");
  }
  if (receipt.showId !== input.preview.showId) {
    throw new Error("Solaris returned a publication receipt for a different show.");
  }
  if (receipt.state !== input.preview.targetState) {
    throw new Error("Solaris returned a publication receipt for a different target state.");
  }
  if (receipt.version !== input.preview.expectedVersion + 1) {
    throw new Error("Solaris returned a publication receipt for a different reviewed version.");
  }

  return receipt;
}

function unresolvedPublicationError(status: "processing" | "uncertain" | "unknown", operationId: string) {
  return Object.assign(
    new Error(
      status === "unknown"
        ? "Solaris could not yet find a settled receipt for this publication operation. Reconcile the same operation before issuing another publication command."
        : `Solaris reports publication operation ${operationId} as ${status}. Reconcile it before issuing another publication command.`,
    ),
    { code: "PUBLICATION_OUTCOME_UNCONFIRMED", outcomeUnknown: true },
  );
}

function failedPublicationError(errorCodeValue: string | null) {
  return Object.assign(
    new Error(
      errorCodeValue
        ? `The canonical publication operation failed (${errorCodeValue}). Reload publication state before trying again.`
        : "The canonical publication operation failed. Reload publication state before trying again.",
    ),
    { status: 409, code: errorCodeValue ?? "PUBLICATION_OPERATION_FAILED" },
  );
}

export async function loadShowPublicationControls(
  editionId: string,
): Promise<ShowPublicationControl[]> {
  const rows = await rpc("studio2_show_publication_snapshot", {
    p_edition_id: editionId,
  });
  if (!Array.isArray(rows)) throw new Error("Solaris returned an invalid publication snapshot.");
  const controls = rows.map((value) => {
    const row = object(value, "show publication control");
    const scheduledFrom = nullableText(row.scheduledFromState);
    return {
      showId: text(row.showId, "publication show id"),
      editionId: text(row.editionId, "publication edition id"),
      state: state(row.state),
      version: numberValue(row.version, "publication version"),
      frozenConfig: config(row.frozenConfig),
      scheduledFor: nullableText(row.scheduledFor),
      scheduledFromState: scheduledFrom ? state(scheduledFrom) as Exclude<ShowPublicationState, "scheduled"> : null,
      sourceShowUpdatedAt: nullableText(row.sourceShowUpdatedAt),
      sourceResultVersion: nullableNumber(row.sourceResultVersion),
      scheduledBy: nullableText(row.scheduledBy),
      scheduledOperationId: nullableText(row.scheduledOperationId),
      lastFailure: nullableText(row.lastFailure),
      lastFailureAt: nullableText(row.lastFailureAt),
      updatedAt: text(row.updatedAt, "publication updated time"),
    } satisfies ShowPublicationControl;
  });
  if (controls.some((control) => control.editionId !== editionId)) {
    throw new Error("Solaris returned publication controls outside the requested edition scope.");
  }
  return controls;
}

export async function previewShowPublicationChange(input: {
  showId: string;
  targetState: ShowPublicationState;
  config: PublicationConfig;
  scheduledFor?: string | null;
}): Promise<ShowPublicationPreview> {
  const row = object(
    await rpc("studio2_show_publication_change_preview", {
      p_show_id: input.showId,
      p_target_state: input.targetState,
      p_config: input.config,
      p_scheduled_for: input.scheduledFor ?? null,
    }),
    "publication preview",
  );
  const risk = text(row.riskClass, "publication risk class");
  if (risk !== "R2" && risk !== "R3") throw new Error("Solaris returned an invalid publication risk class.");
  const preview: ShowPublicationPreview = {
    showId: text(row.showId, "publication show id"),
    editionId: text(row.editionId, "publication edition id"),
    currentState: state(row.currentState),
    targetState: state(row.targetState),
    expectedVersion: numberValue(row.expectedVersion, "publication expected version"),
    alreadyApplied: bool(row.alreadyApplied, "publication already-applied state"),
    riskClass: risk,
    config: config(row.config),
    scheduledFor: nullableText(row.scheduledFor),
    sourceShowUpdatedAt: nullableText(row.sourceShowUpdatedAt),
    sourceResultVersion: nullableNumber(row.sourceResultVersion),
    hasOutcomes: row.hasOutcomes === true,
    resultReleaseReady: row.resultReleaseReady !== false,
    integrityClear: row.integrityClear !== false,
  };
  if (preview.showId !== input.showId || preview.targetState !== input.targetState) {
    throw new Error("Solaris returned a publication preview for a different requested operation.");
  }
  return preview;
}

export async function reauthenticateShowPublicationR3(password: string) {
  if (!password) throw new Error("Enter your current Solaris password for this R3 publication.");
  const { data: current, error: currentError } = await supabase.auth.getUser();
  if (currentError) throw currentError;
  const user = current.user;
  if (!user?.id || !user.email) throw new Error("This Organizer account cannot be reauthenticated with a password.");
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

export async function reconcileShowPublicationChange(
  input: { preview: ShowPublicationPreview; operationId: string },
  client: ShowPublicationRpcClient = publicationRpcClient,
): Promise<ShowPublicationReconciliation> {
  const { data, error } = await client.rpc("studio2_reconcile_operation", {
    p_operation_id: input.operationId,
  });

  if (error) {
    const code = errorCode(error);
    const message = errorMessage(error);
    if (code === "P0002" || message === "UNKNOWN") {
      return { status: "unknown", errorCode: "UNKNOWN" };
    }
    throw rpcError(error, "Solaris could not reconcile the publication operation.");
  }

  const row = object(data, "publication reconciliation receipt");
  const operationId = text(row.operationId, "publication reconciliation operation id");
  const command = text(row.command, "publication reconciliation command");
  const status = text(row.status, "publication reconciliation status");

  if (operationId !== input.operationId) {
    throw new Error("Solaris returned a reconciliation receipt for a different operation.");
  }
  if (command !== "publication.show.change") {
    throw new Error("Solaris returned a reconciliation receipt for a different command.");
  }

  if (status === "succeeded") {
    return {
      status,
      receipt: mapPublicationReceipt(row.result, input),
    };
  }

  const errorRow = row.error && typeof row.error === "object" && !Array.isArray(row.error)
    ? (row.error as Obj)
    : null;
  const receiptErrorCode = typeof errorRow?.code === "string" ? errorRow.code : null;

  if (status === "processing" || status === "uncertain") {
    return { status, errorCode: receiptErrorCode };
  }
  if (status === "failed") {
    return { status, errorCode: receiptErrorCode };
  }

  throw new Error("Solaris returned an unknown publication reconciliation status.");
}

export async function applyShowPublicationChange(
  input: {
    preview: ShowPublicationPreview;
    operationId: string;
    idempotencyKey: string;
  },
  client: ShowPublicationRpcClient = publicationRpcClient,
): Promise<ShowPublicationReceipt> {
  if (ambiguousPublicationOperations.has(input.operationId)) {
    const reconciliation = await reconcileShowPublicationChange(input, client);
    if (reconciliation.status === "succeeded") {
      ambiguousPublicationOperations.delete(input.operationId);
      return reconciliation.receipt;
    }
    if (reconciliation.status === "failed") {
      ambiguousPublicationOperations.delete(input.operationId);
      throw failedPublicationError(reconciliation.errorCode);
    }
    throw unresolvedPublicationError(reconciliation.status, input.operationId);
  }

  const command = createOrganisationCommand({
    command: "publication.show.change",
    riskClass: input.preview.riskClass,
    payload: {
      showId: input.preview.showId,
      targetState: input.preview.targetState,
      config: input.preview.config,
      scheduledFor: input.preview.scheduledFor,
    },
    scope: { editionId: input.preview.editionId, showId: input.preview.showId },
    expectedVersion: input.preview.expectedVersion,
    operationId: input.operationId,
    idempotencyKey: input.idempotencyKey,
  });

  try {
    const receipt = mapPublicationReceipt(
      await rpc(
        "studio2_apply_show_publication_change",
        {
          p_show_id: input.preview.showId,
          p_target_state: input.preview.targetState,
          p_config: input.preview.config,
          p_scheduled_for: input.preview.scheduledFor,
          p_operation_id: command.operationId,
          p_idempotency_key: command.idempotencyKey,
          p_expected_version: input.preview.expectedVersion,
        },
        client,
      ),
      input,
    );
    ambiguousPublicationOperations.delete(input.operationId);
    return receipt;
  } catch (mutationError) {
    if (isDeterministicRpcFailure(mutationError)) {
      ambiguousPublicationOperations.delete(input.operationId);
      throw mutationError;
    }

    ambiguousPublicationOperations.add(input.operationId);
    try {
      const reconciliation = await reconcileShowPublicationChange(input, client);
      if (reconciliation.status === "succeeded") {
        ambiguousPublicationOperations.delete(input.operationId);
        return reconciliation.receipt;
      }
      if (reconciliation.status === "failed") {
        ambiguousPublicationOperations.delete(input.operationId);
        throw failedPublicationError(reconciliation.errorCode);
      }
    } catch (reconciliationError) {
      // Keep the original mutation/transport failure authoritative unless the
      // canonical receipt positively proves success or failure. The operation
      // remains reconciliation-only for every later attempt in this runtime.
      if (
        reconciliationError instanceof Error &&
        (reconciliationError as Error & { status?: unknown }).status === 409
      ) {
        throw reconciliationError;
      }
    }
    throw mutationError;
  }
}