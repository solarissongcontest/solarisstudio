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

type Obj = Record<string, unknown>;

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

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const client = supabase as unknown as {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message || `Solaris RPC failed: ${name}`);
  return data;
}

export async function loadShowPublicationControls(
  editionId: string,
): Promise<ShowPublicationControl[]> {
  const rows = await rpc("studio2_show_publication_snapshot", {
    p_edition_id: editionId,
  });
  if (!Array.isArray(rows)) throw new Error("Solaris returned an invalid publication snapshot.");
  return rows.map((value) => {
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
    };
  });
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
  return {
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

export async function applyShowPublicationChange(input: {
  preview: ShowPublicationPreview;
  operationId: string;
  idempotencyKey: string;
}): Promise<{ state: ShowPublicationState; version: number; scheduledFor: string | null }> {
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

  const row = object(
    await rpc("studio2_apply_show_publication_change", {
      p_show_id: input.preview.showId,
      p_target_state: input.preview.targetState,
      p_config: input.preview.config,
      p_scheduled_for: input.preview.scheduledFor,
      p_operation_id: command.operationId,
      p_idempotency_key: command.idempotencyKey,
      p_expected_version: input.preview.expectedVersion,
    }),
    "publication receipt",
  );
  return {
    state: state(row.state),
    version: numberValue(row.version, "publication receipt version"),
    scheduledFor: nullableText(row.scheduledFor),
  };
}
