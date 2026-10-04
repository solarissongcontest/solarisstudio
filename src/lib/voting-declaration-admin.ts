import { supabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";

export type VotingDeclarationState =
  | "required"
  | "signed"
  | "missing"
  | "wrong_version"
  | "invalidated";

export type VotingDeclarationInvalidationPreview = {
  id: string;
  state: VotingDeclarationState;
  declarationVersion: number;
  statementVersion: number;
  requiredStatementVersion: number;
  attestedAt: string | null;
  signedName: string | null;
  submittedAt: string | null;
  expiresAt: string;
  invalidatedAt: string | null;
  invalidationReason: string | null;
  riskClass: "R2";
  alreadyApplied: boolean;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return parsed;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value;
}

function stateValue(value: unknown): VotingDeclarationState {
  if (
    value !== "required" &&
    value !== "signed" &&
    value !== "missing" &&
    value !== "wrong_version" &&
    value !== "invalidated"
  ) {
    throw new Error("Solaris returned an unknown voting declaration state.");
  }
  return value;
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

export async function previewVotingDeclarationInvalidation(
  preflightId: string,
): Promise<VotingDeclarationInvalidationPreview> {
  const row = record(
    await rpc("studio2_voting_declaration_invalidation_preview", {
      p_preflight_id: preflightId,
    }),
    "voting declaration invalidation preview",
  );

  return {
    id: text(row.id, "declaration id"),
    state: stateValue(row.state),
    declarationVersion: numberValue(row.declarationVersion, "declaration version"),
    statementVersion: numberValue(row.statementVersion, "statement version"),
    requiredStatementVersion: numberValue(
      row.requiredStatementVersion,
      "required statement version",
    ),
    attestedAt: nullableText(row.attestedAt),
    signedName: nullableText(row.signedName),
    submittedAt: nullableText(row.submittedAt),
    expiresAt: text(row.expiresAt, "declaration expiry"),
    invalidatedAt: nullableText(row.invalidatedAt),
    invalidationReason: nullableText(row.invalidationReason),
    riskClass: "R2",
    alreadyApplied: booleanValue(row.alreadyApplied, "declaration already-applied state"),
  };
}

export async function applyVotingDeclarationInvalidation(input: {
  preview: VotingDeclarationInvalidationPreview;
  reason: string;
  operationId?: string;
  idempotencyKey?: string;
}) {
  const command = createOrganisationCommand({
    command: "integrity.declaration.invalidate",
    riskClass: "R2",
    scope: { entityId: input.preview.id },
    payload: { reason: input.reason },
    expectedVersion: input.preview.declarationVersion,
    operationId: input.operationId,
    idempotencyKey: input.idempotencyKey,
  });

  return record(
    await rpc("studio2_apply_voting_declaration_invalidation", {
      p_preflight_id: input.preview.id,
      p_reason: input.reason,
      p_operation_id: command.operationId,
      p_idempotency_key: command.idempotencyKey,
      p_expected_version: input.preview.declarationVersion,
    }),
    "voting declaration invalidation receipt",
  );
}
