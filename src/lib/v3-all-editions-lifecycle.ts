import { supabase } from "@/integrations/supabase/client";

export type EditionCreateDraftInput = {
  editionNumber: number;
  name?: string | null;
  year?: number | null;
  hostCity?: string | null;
  hostCountryId?: string | null;
};

export type EditionCreateDraftPreview = {
  schemaVersion: number;
  editionNumber: number;
  name: string;
  slug: string;
  year: number | null;
  hostCity: string | null;
  hostCountryId: string | null;
  riskClass: "R2";
  blockers: string[];
  canCommit: boolean;
  serverTime: string;
};

export type EditionMakePrivateShowControl = {
  showId: string;
  state: "draft" | "scheduled" | "public" | "hidden";
  version: number;
  scheduledFor: string | null;
  config: Record<string, boolean>;
};

export type EditionMakePrivatePreview = {
  schemaVersion: number;
  editionId: string;
  editionNumber: number | null;
  name: string;
  slug: string;
  published: boolean;
  catalogueStatus: string;
  runtimeState: string | null;
  runtimeVersion: number | null;
  stateVersion: number;
  showPublicationControls: EditionMakePrivateShowControl[];
  activePublicationCount: number;
  alreadyApplied: boolean;
  riskClass: "R3";
  requiresFreshAuth: true;
  blockers: string[];
  canCommit: boolean;
  serverTime: string;
};

export type EditionCreateDraftResult = {
  ok: true;
  editionId: string;
  editionNumber: number;
  name: string;
  slug: string;
  published: false;
  stateVersion: number;
  operationId: string;
  receiptId: string;
  replayed?: boolean;
};

export type EditionMakePrivateResult = {
  ok: true;
  alreadyApplied: boolean;
  editionId: string;
  published?: false;
  hiddenShowCount: number;
  childOperations?: Array<{
    showId: string;
    operationId: string | null;
    state: string | null;
    version: number | null;
  }>;
  previousVersion?: number;
  stateVersion: number;
  operationId: string;
  receiptId: string;
  replayed?: boolean;
};

type RpcError = { message?: string } | null;

type ReceiptEnvelope = {
  status?: string;
  result?: unknown;
  replayed?: boolean;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function message(error: RpcError, fallback: string) {
  return error?.message?.trim() || fallback;
}

function normalizeCreatePreview(value: unknown): EditionCreateDraftPreview {
  const row = object(value);
  if (
    !row ||
    typeof row.editionNumber !== "number" ||
    typeof row.name !== "string" ||
    typeof row.slug !== "string" ||
    row.riskClass !== "R2" ||
    !Array.isArray(row.blockers) ||
    typeof row.canCommit !== "boolean"
  ) {
    throw new Error("Edition draft preview returned an invalid server projection.");
  }
  return value as EditionCreateDraftPreview;
}

function normalizePrivatePreview(value: unknown): EditionMakePrivatePreview {
  const row = object(value);
  if (
    !row ||
    typeof row.editionId !== "string" ||
    typeof row.name !== "string" ||
    typeof row.slug !== "string" ||
    typeof row.stateVersion !== "number" ||
    row.riskClass !== "R3" ||
    row.requiresFreshAuth !== true ||
    !Array.isArray(row.showPublicationControls) ||
    !Array.isArray(row.blockers) ||
    typeof row.canCommit !== "boolean"
  ) {
    throw new Error("Edition make-private preview returned an invalid server projection.");
  }
  return value as EditionMakePrivatePreview;
}

function normalizeResult<T extends { ok: true; editionId: string; operationId: string; receiptId: string }>(
  value: unknown,
  editionId: string | null,
): T | null {
  const row = object(value);
  const receipt = row as ReceiptEnvelope | null;
  const result = receipt?.status === "succeeded" && receipt.result ? object(receipt.result) : row;
  if (
    !result ||
    result.ok !== true ||
    typeof result.editionId !== "string" ||
    (editionId !== null && result.editionId !== editionId) ||
    typeof result.operationId !== "string" ||
    typeof result.receiptId !== "string"
  ) {
    return null;
  }
  return {
    ...(result as T),
    replayed: row?.replayed === true || undefined,
  };
}

async function reconcileOperation<T extends { ok: true; editionId: string; operationId: string; receiptId: string }>(
  operationId: string,
  editionId: string | null,
): Promise<T | null> {
  const { data, error } = await (supabase as any).rpc("studio2_reconcile_operation", {
    p_operation_id: operationId,
  });
  if (error) return null;
  return normalizeResult<T>(data, editionId);
}

async function executeGoverned<T extends { ok: true; editionId: string; operationId: string; receiptId: string }>(
  rpcName: string,
  args: Record<string, unknown>,
  operationId: string,
  editionId: string | null,
  fallback: string,
): Promise<T> {
  const { data, error } = await (supabase as any).rpc(rpcName, args);
  if (!error) {
    const result = normalizeResult<T>(data, editionId);
    if (!result) throw new Error("Edition operation returned an invalid receipt.");
    return result;
  }

  // The mutation may have committed while its HTTP response was lost. Consult
  // the original durable operation exactly once. Never create a second mutation
  // identity just because the browser is uncertain about the first one.
  const reconciled = await reconcileOperation<T>(operationId, editionId);
  if (reconciled) return reconciled;
  throw new Error(message(error, fallback));
}

export async function previewEditionDraftV3(
  input: EditionCreateDraftInput,
): Promise<EditionCreateDraftPreview> {
  const { data, error } = await (supabase as any).rpc("studio2_edition_create_draft_preview", {
    p_edition_number: input.editionNumber,
    p_name: input.name ?? null,
    p_year: input.year ?? null,
    p_host_city: input.hostCity ?? null,
    p_host_country_id: input.hostCountryId ?? null,
  });
  if (error) throw new Error(message(error, "Could not review edition draft creation."));
  return normalizeCreatePreview(data);
}

export async function createEditionDraftV3(
  preview: EditionCreateDraftPreview,
): Promise<EditionCreateDraftResult> {
  if (!preview.canCommit || preview.blockers.length) {
    throw new Error(preview.blockers[0] || "Edition draft cannot be created.");
  }

  const operationId = crypto.randomUUID();
  const idempotencyKey = [
    "edition-create-draft",
    preview.editionNumber,
    preview.slug,
    preview.year ?? "none",
    preview.hostCountryId ?? "none",
  ].join(":");

  return executeGoverned<EditionCreateDraftResult>(
    "studio2_create_edition_draft_v3",
    {
      p_edition_number: preview.editionNumber,
      p_name: preview.name,
      p_year: preview.year,
      p_host_city: preview.hostCity,
      p_host_country_id: preview.hostCountryId,
      p_operation_id: operationId,
      p_idempotency_key: idempotencyKey,
    },
    operationId,
    null,
    "Could not create the edition draft.",
  );
}

export async function previewEditionMakePrivateV3(
  editionId: string,
): Promise<EditionMakePrivatePreview> {
  if (!editionId) throw new Error("Exact edition context is required.");
  const { data, error } = await (supabase as any).rpc("studio2_edition_make_private_preview", {
    p_edition_id: editionId,
  });
  if (error) throw new Error(message(error, "Could not review edition visibility."));
  const preview = normalizePrivatePreview(data);
  if (preview.editionId !== editionId) {
    throw new Error("Edition visibility preview returned a different edition scope.");
  }
  return preview;
}

export async function makeEditionPrivateV3(
  preview: EditionMakePrivatePreview,
  reason: string,
): Promise<EditionMakePrivateResult> {
  const cleanReason = reason.trim();
  if (!preview.canCommit || preview.blockers.length) {
    throw new Error(preview.blockers[0] || "Edition cannot be made private.");
  }
  if (cleanReason.length < 5) {
    throw new Error("Explain why this edition must be made private.");
  }

  const operationId = crypto.randomUUID();
  const idempotencyKey = [
    "edition-make-private",
    preview.editionId,
    preview.stateVersion,
  ].join(":");

  return executeGoverned<EditionMakePrivateResult>(
    "studio2_apply_edition_make_private_v3",
    {
      p_edition_id: preview.editionId,
      p_expected_version: preview.stateVersion,
      p_operation_id: operationId,
      p_idempotency_key: idempotencyKey,
      p_reason: cleanReason,
    },
    operationId,
    preview.editionId,
    "Could not make the edition private.",
  );
}
