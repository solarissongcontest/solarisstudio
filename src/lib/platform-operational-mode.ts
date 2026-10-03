import { supabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";

export type PlatformOperationalMode = "normal" | "degraded" | "read_only" | "maintenance";

export type PlatformOperationalSnapshot = {
  mode: PlatformOperationalMode;
  version: number;
  affectedServices: string[];
  message: string | null;
  incidentReference: string | null;
  reason: string;
  changedBy: string | null;
  changedAt: string;
};

export type PlatformModeChangePreview = {
  currentMode: PlatformOperationalMode;
  targetMode: PlatformOperationalMode;
  expectedVersion: number;
  alreadyApplied: boolean;
  riskClass: "R2" | "R3";
  affectedServices: string[];
  message: string | null;
  incidentReference: string | null;
  requiresRecoveryStep: boolean;
  writePolicy: string;
};

export type PlatformModeChangeReceipt = {
  ok: true;
  alreadyApplied: boolean;
  mode: PlatformOperationalMode;
  version: number;
  affectedServices?: string[];
  message?: string | null;
  incidentReference?: string | null;
  changedAt?: string;
  operationId?: string;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Solaris returned an invalid ${label}.`);
  return value;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Solaris returned an invalid ${label}.`);
  return parsed;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Solaris returned an invalid ${label}.`);
  return value;
}

function modeValue(value: unknown): PlatformOperationalMode {
  if (
    value !== "normal" &&
    value !== "degraded" &&
    value !== "read_only" &&
    value !== "maintenance"
  ) {
    throw new Error("Solaris returned an unknown platform operating mode.");
  }
  return value;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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

export async function loadPlatformOperationalSnapshot(): Promise<PlatformOperationalSnapshot> {
  const row = record(
    await rpc("studio2_platform_operational_snapshot"),
    "platform operating state",
  );
  return {
    mode: modeValue(row.mode),
    version: numberValue(row.version, "platform state version"),
    affectedServices: stringArray(row.affectedServices),
    message: nullableText(row.message),
    incidentReference: nullableText(row.incidentReference),
    reason: text(row.reason, "platform state reason"),
    changedBy: nullableText(row.changedBy),
    changedAt: text(row.changedAt, "platform state timestamp"),
  };
}

export async function previewPlatformModeChange(input: {
  targetMode: PlatformOperationalMode;
  affectedServices: string[];
  message?: string | null;
  incidentReference?: string | null;
}): Promise<PlatformModeChangePreview> {
  const row = record(
    await rpc("studio2_platform_mode_change_preview", {
      p_target_mode: input.targetMode,
      p_affected_services: input.affectedServices,
      p_message: input.message ?? null,
      p_incident_reference: input.incidentReference ?? null,
    }),
    "platform mode preview",
  );
  const risk = text(row.riskClass, "platform mode risk class");
  if (risk !== "R2" && risk !== "R3") {
    throw new Error("Solaris returned an invalid platform mode risk class.");
  }
  return {
    currentMode: modeValue(row.currentMode),
    targetMode: modeValue(row.targetMode),
    expectedVersion: numberValue(row.expectedVersion, "platform preview version"),
    alreadyApplied: booleanValue(row.alreadyApplied, "platform already-applied state"),
    riskClass: risk,
    affectedServices: stringArray(row.affectedServices),
    message: nullableText(row.message),
    incidentReference: nullableText(row.incidentReference),
    requiresRecoveryStep: booleanValue(
      row.requiresRecoveryStep,
      "platform recovery-step state",
    ),
    writePolicy: text(row.writePolicy, "platform write policy"),
  };
}

export async function reauthenticatePlatformR3(password: string): Promise<void> {
  if (!password) {
    throw new Error("Enter your current Solaris password to authorize this R3 mode change.");
  }

  const { data: current, error: currentError } = await supabase.auth.getUser();
  if (currentError) throw currentError;
  const user = current.user;
  if (!user?.id || !user.email) {
    throw new Error("This organizer account cannot be reauthenticated with a password.");
  }

  const originalUserId = user.id;
  const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (signInError) throw signInError;
  if (!signedIn.user || signedIn.user.id !== originalUserId) {
    await supabase.auth.signOut();
    throw new Error("Fresh authentication returned a different Solaris account.");
  }
}

export async function applyPlatformModeChange(input: {
  preview: PlatformModeChangePreview;
  reason: string;
  affectedServices: string[];
  message?: string | null;
  incidentReference?: string | null;
  operationId?: string;
  idempotencyKey?: string;
}): Promise<PlatformModeChangeReceipt> {
  const command = createOrganisationCommand({
    command: "system.platform_mode.change",
    payload: {
      targetMode: input.preview.targetMode,
      reason: input.reason,
      affectedServices: input.affectedServices,
      message: input.message ?? null,
      incidentReference: input.incidentReference ?? null,
    },
    riskClass: input.preview.riskClass,
    expectedVersion: input.preview.expectedVersion,
    operationId: input.operationId,
    idempotencyKey: input.idempotencyKey,
  });

  const row = record(
    await rpc("studio2_apply_platform_mode_change", {
      p_target_mode: input.preview.targetMode,
      p_reason: input.reason,
      p_affected_services: input.affectedServices,
      p_message: input.message ?? null,
      p_incident_reference: input.incidentReference ?? null,
      p_operation_id: command.operationId,
      p_idempotency_key: command.idempotencyKey,
      p_expected_version: input.preview.expectedVersion,
    }),
    "platform mode receipt",
  );

  return {
    ok: true,
    alreadyApplied: booleanValue(row.alreadyApplied, "platform receipt replay state"),
    mode: modeValue(row.mode),
    version: numberValue(row.version, "platform receipt version"),
    affectedServices: stringArray(row.affectedServices),
    message: nullableText(row.message),
    incidentReference: nullableText(row.incidentReference),
    changedAt: nullableText(row.changedAt) ?? undefined,
    operationId: nullableText(row.operationId) ?? undefined,
  };
}
