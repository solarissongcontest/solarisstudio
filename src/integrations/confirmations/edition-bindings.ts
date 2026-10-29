import { confirmationsSupabase } from "@/integrations/confirmations/client";

export type ConfirmationEditionBindingState = "linked" | "missing" | "stale" | "conflict";
export type ConfirmationEditionBindingChangeKind = "bind" | "remove" | "editing";

export type ConfirmationEditionBindingProjection = {
  editionId: string;
  editionNumber: number | null;
  name: string;
  description: string | null;
  status: string;
  editingEnabled: boolean;
  version: number;
  bindingState: ConfirmationEditionBindingState;
  binding: {
    id: string;
    remoteId: string;
    syncStatus: string;
    metadata: Record<string, unknown>;
    lastSyncedAt: string | null;
    updatedAt: string;
  } | null;
  roundCount: number;
  responseCount: number;
  blockers: string[];
};

export type ConfirmationEditionBindingPreview = {
  editionId: string;
  changeKind: ConfirmationEditionBindingChangeKind;
  enabled: boolean | null;
  expectedVersion: number;
  riskClass: "R2" | "R3";
  alreadyApplied: boolean;
  bindingState: ConfirmationEditionBindingState;
  editingEnabled: boolean;
  roundCount: number;
  responseCount: number;
  blockers: string[];
};

export type ConfirmationEditionBindingResult = {
  ok: true;
  operationId: string;
  editionId: string;
  changeKind: ConfirmationEditionBindingChangeKind;
  changed: boolean;
  previousVersion: number;
  version: number;
  bindingState: ConfirmationEditionBindingState;
  editingEnabled: boolean;
  projection: ConfirmationEditionBindingProjection;
};

export type ConfirmationEditionBindingReceipt = {
  operationId: string;
  correlationId: string;
  command: string;
  status: "processing" | "succeeded" | "failed" | "uncertain";
  result: ConfirmationEditionBindingResult | null;
  error: { code: string; metadata?: Record<string, unknown> } | null;
  replayed?: boolean;
};

function rpcClient() {
  return confirmationsSupabase as unknown as {
    rpc: (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
}

function asObject<T>(value: unknown, label: string): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} returned an invalid response.`);
  }
  return value as T;
}

export async function loadConfirmationEditionBinding(
  editionId: string,
): Promise<ConfirmationEditionBindingProjection> {
  const { data, error } = await rpcClient().rpc("studio2_confirmation_edition_binding", {
    p_edition_id: editionId,
  });
  if (error) throw new Error(error.message || "Could not load Confirmation edition binding.");
  return asObject<ConfirmationEditionBindingProjection>(data, "Confirmation edition binding");
}

export async function previewConfirmationEditionBindingChange(input: {
  editionId: string;
  kind: ConfirmationEditionBindingChangeKind;
  enabled?: boolean | null;
}): Promise<ConfirmationEditionBindingPreview> {
  const { data, error } = await rpcClient().rpc(
    "studio2_confirmation_edition_binding_preview",
    {
      p_edition_id: input.editionId,
      p_change_kind: input.kind,
      p_enabled: input.enabled ?? null,
    },
  );
  if (error) throw new Error(error.message || "Could not preview Confirmation edition change.");
  return asObject<ConfirmationEditionBindingPreview>(data, "Confirmation edition preview");
}

export async function reauthenticateConfirmationEditionR3(password: string): Promise<void> {
  if (!password) {
    throw new Error("Enter your current Solaris password to authorize this R3 edition change.");
  }

  const { data: current, error: currentError } = await confirmationsSupabase.auth.getUser();
  if (currentError) throw currentError;
  const user = current.user;
  if (!user?.id || !user.email) {
    throw new Error("This organizer account cannot be reauthenticated with a password.");
  }

  const originalUserId = user.id;
  const { data: signedIn, error: signInError } = await confirmationsSupabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (signInError) throw signInError;
  if (!signedIn.user || signedIn.user.id !== originalUserId) {
    await confirmationsSupabase.auth.signOut();
    throw new Error("Fresh authentication returned a different Solaris account.");
  }
}

export async function applyConfirmationEditionBindingChange(input: {
  editionId: string;
  kind: ConfirmationEditionBindingChangeKind;
  enabled?: boolean | null;
  operationId: string;
  idempotencyKey: string;
  expectedVersion: number;
  correlationId?: string | null;
}): Promise<ConfirmationEditionBindingReceipt> {
  const { data, error } = await rpcClient().rpc(
    "studio2_apply_confirmation_edition_binding_change",
    {
      p_edition_id: input.editionId,
      p_change_kind: input.kind,
      p_enabled: input.enabled ?? null,
      p_operation_id: input.operationId,
      p_idempotency_key: input.idempotencyKey,
      p_expected_version: input.expectedVersion,
      p_correlation_id: input.correlationId ?? input.operationId,
    },
  );
  if (error) throw new Error(error.message || "Confirmation edition change could not be applied.");
  return asObject<ConfirmationEditionBindingReceipt>(data, "Confirmation edition operation");
}
