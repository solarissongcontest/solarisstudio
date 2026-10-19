import { supabase } from "@/integrations/supabase/client";
import {
  createOrganisationCommand,
  type OrganisationCommandEnvelope,
} from "@/lib/organisation-operation-contract";

type CommandIdentity = Pick<
  OrganisationCommandEnvelope<unknown>,
  "operationId" | "idempotencyKey" | "correlationId"
>;

export type V3ContestEntityDependency = {
  schema: string;
  table: string;
  column: string;
  constraint: string;
  deleteAction: "no_action" | "restrict" | "cascade" | "set_null" | "set_default" | "unknown";
  count: number;
};

export type V3CustomContestEntityPreflight = {
  editionId: string;
  entityId: string;
  entityType: "custom";
  displayName: string;
  abbreviation: string;
  flagImage: string | null;
  region: string | null;
  updatedAt: string;
  dependencies: {
    contestEntityId: string;
    totalReferences: number;
    canDelete: boolean;
    references: V3ContestEntityDependency[];
  };
  canDelete: boolean;
  deleteRiskClass: "R3";
};

type V3ContestEntityOperationResult = {
  ok: boolean;
  operationId: string;
  status?: string;
  result?: unknown;
  replayed?: boolean;
};

function assertRpcData<T>(data: T | null, error: { message?: string } | null): T {
  if (error) throw error;
  if (data == null) throw new Error("Solaris did not acknowledge the contest-entity operation.");
  return data;
}

export async function getV3CustomContestEntityPreflight(input: {
  editionId: string;
  entityId: string;
}): Promise<V3CustomContestEntityPreflight> {
  const { data, error } = await (supabase as any).rpc("studio2_custom_contest_entity_preflight", {
    p_edition_id: input.editionId,
    p_entity_id: input.entityId,
  });
  return assertRpcData(data as V3CustomContestEntityPreflight | null, error);
}

export async function createV3CustomShowEntity(input: {
  editionId: string;
  showId: string;
  expectedLineupStateVersion: string;
  displayName: string;
  abbreviation: string;
  flagImage?: string | null;
  region?: string | null;
  identity?: Partial<CommandIdentity>;
}) {
  const command = createOrganisationCommand({
    command: "show.custom_entity.create",
    riskClass: "R2",
    scope: { editionId: input.editionId, showId: input.showId },
    expectedVersion: input.expectedLineupStateVersion,
    payload: {
      displayName: input.displayName,
      abbreviation: input.abbreviation,
      flagImage: input.flagImage ?? null,
      region: input.region ?? null,
    },
    operationId: input.identity?.operationId,
    idempotencyKey: input.identity?.idempotencyKey,
    correlationId: input.identity?.correlationId,
  });

  const { data, error } = await (supabase as any).rpc("studio2_create_custom_show_entity", {
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_correlation_id: command.correlationId,
    p_show_id: input.showId,
    p_expected_lineup_state_version: input.expectedLineupStateVersion,
    p_display_name: input.displayName,
    p_abbreviation: input.abbreviation,
    p_flag_image: input.flagImage ?? null,
    p_region: input.region ?? null,
  });

  return {
    command,
    receipt: assertRpcData(data as V3ContestEntityOperationResult | null, error),
  };
}

export async function updateV3CustomContestEntity(input: {
  editionId: string;
  entityId: string;
  expectedUpdatedAt: string;
  displayName: string;
  abbreviation: string;
  flagImage?: string | null;
  region?: string | null;
  identity?: Partial<CommandIdentity>;
}) {
  const command = createOrganisationCommand({
    command: "contest_entity.custom.update",
    riskClass: "R2",
    scope: { editionId: input.editionId },
    expectedVersion: input.expectedUpdatedAt,
    payload: {
      entityId: input.entityId,
      displayName: input.displayName,
      abbreviation: input.abbreviation,
      flagImage: input.flagImage ?? null,
      region: input.region ?? null,
    },
    operationId: input.identity?.operationId,
    idempotencyKey: input.identity?.idempotencyKey,
    correlationId: input.identity?.correlationId,
  });

  const { data, error } = await (supabase as any).rpc("studio2_update_custom_contest_entity", {
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_correlation_id: command.correlationId,
    p_edition_id: input.editionId,
    p_entity_id: input.entityId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_display_name: input.displayName,
    p_abbreviation: input.abbreviation,
    p_flag_image: input.flagImage ?? null,
    p_region: input.region ?? null,
  });

  return {
    command,
    receipt: assertRpcData(data as V3ContestEntityOperationResult | null, error),
  };
}

export async function deleteV3CustomContestEntity(input: {
  editionId: string;
  entityId: string;
  expectedUpdatedAt: string;
  reason: string;
  identity?: Partial<CommandIdentity>;
}) {
  const command = createOrganisationCommand({
    command: "contest_entity.custom.delete",
    riskClass: "R3",
    scope: { editionId: input.editionId },
    expectedVersion: input.expectedUpdatedAt,
    reason: input.reason,
    payload: {
      entityId: input.entityId,
      reason: input.reason,
    },
    operationId: input.identity?.operationId,
    idempotencyKey: input.identity?.idempotencyKey,
    correlationId: input.identity?.correlationId,
  });

  const { data, error } = await (supabase as any).rpc("studio2_delete_custom_contest_entity", {
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_correlation_id: command.correlationId,
    p_edition_id: input.editionId,
    p_entity_id: input.entityId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_reason: input.reason,
  });

  return {
    command,
    receipt: assertRpcData(data as V3ContestEntityOperationResult | null, error),
  };
}
