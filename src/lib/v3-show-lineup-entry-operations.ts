import { supabase } from "@/integrations/supabase/client";
import {
  createOrganisationCommand,
  type OrganisationCommandEnvelope,
} from "@/lib/organisation-operation-contract";

type CommandIdentity = Pick<
  OrganisationCommandEnvelope<unknown>,
  "operationId" | "idempotencyKey" | "correlationId"
>;

type V3OperationResult = {
  ok: boolean;
  operationId: string;
  status?: string;
  result?: unknown;
  replayed?: boolean;
};

export type V3EntryDetailSyncTarget = {
  participantId: string;
  sourceParticipantId: string;
  artist: string | null;
  song: string | null;
};

export type V3EntryDetailSyncPreflight = {
  editionId: string;
  stateVersion: string;
  targetCount: number;
  targets: V3EntryDetailSyncTarget[];
};

export type V3ShowQualifierCandidate = {
  sourceParticipantId: string;
  countryId: string | null;
  contestEntityId: string | null;
  artist: string | null;
  song: string | null;
  sourceUpdatedAt: string;
};

export type V3ShowQualifierPreflight = {
  showId: string;
  editionId: string;
  lineupStateVersion: string;
  stateVersion: string;
  candidateCount: number;
  candidates: V3ShowQualifierCandidate[];
};

function assertRpcData<T>(data: T | null, error: { message?: string } | null): T {
  if (error) throw error;
  if (data == null) throw new Error("Solaris did not acknowledge the entry operation.");
  return data;
}

export async function getV3EntryDetailSyncPreflight(
  editionId: string,
): Promise<V3EntryDetailSyncPreflight> {
  const { data, error } = await (supabase as any).rpc("studio2_entry_detail_sync_preflight", {
    p_edition_id: editionId,
  });
  return assertRpcData(data as V3EntryDetailSyncPreflight | null, error);
}

export async function getV3ShowQualifierPreflight(
  showId: string,
): Promise<V3ShowQualifierPreflight> {
  const { data, error } = await (supabase as any).rpc("studio2_show_qualifier_preflight", {
    p_show_id: showId,
  });
  return assertRpcData(data as V3ShowQualifierPreflight | null, error);
}

export async function updateV3ShowLineupEntry(input: {
  editionId: string;
  showId: string;
  participantId: string;
  expectedStateVersion: string;
  artist: string;
  song: string;
  identity?: Partial<CommandIdentity>;
}) {
  const command = createOrganisationCommand({
    command: "show.lineup.entry.update",
    riskClass: "R2",
    scope: { editionId: input.editionId, showId: input.showId },
    expectedVersion: input.expectedStateVersion,
    payload: {
      participantId: input.participantId,
      artist: input.artist,
      song: input.song,
    },
    operationId: input.identity?.operationId,
    idempotencyKey: input.identity?.idempotencyKey,
    correlationId: input.identity?.correlationId,
  });

  const { data, error } = await (supabase as any).rpc("studio2_update_show_lineup_entry", {
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_correlation_id: command.correlationId,
    p_show_id: input.showId,
    p_participant_id: input.participantId,
    p_expected_state_version: input.expectedStateVersion,
    p_artist: input.artist,
    p_song: input.song,
  });

  return {
    command,
    receipt: assertRpcData(data as V3OperationResult | null, error),
  };
}

export async function syncV3EditionEntryDetails(input: {
  editionId: string;
  expectedStateVersion: string;
  identity?: Partial<CommandIdentity>;
}) {
  const command = createOrganisationCommand({
    command: "entry.details.sync",
    riskClass: "R2",
    scope: { editionId: input.editionId },
    expectedVersion: input.expectedStateVersion,
    payload: {},
    operationId: input.identity?.operationId,
    idempotencyKey: input.identity?.idempotencyKey,
    correlationId: input.identity?.correlationId,
  });

  const { data, error } = await (supabase as any).rpc("studio2_sync_edition_entry_details", {
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_correlation_id: command.correlationId,
    p_edition_id: input.editionId,
    p_expected_state_version: input.expectedStateVersion,
  });

  return {
    command,
    receipt: assertRpcData(data as V3OperationResult | null, error),
  };
}

export async function promoteV3ShowQualifiers(input: {
  editionId: string;
  showId: string;
  expectedStateVersion: string;
  identity?: Partial<CommandIdentity>;
}) {
  const command = createOrganisationCommand({
    command: "show.qualifiers.promote",
    riskClass: "R2",
    scope: { editionId: input.editionId, showId: input.showId },
    expectedVersion: input.expectedStateVersion,
    payload: {},
    operationId: input.identity?.operationId,
    idempotencyKey: input.identity?.idempotencyKey,
    correlationId: input.identity?.correlationId,
  });

  const { data, error } = await (supabase as any).rpc("studio2_promote_show_qualifiers", {
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_correlation_id: command.correlationId,
    p_show_id: input.showId,
    p_expected_state_version: input.expectedStateVersion,
  });

  return {
    command,
    receipt: assertRpcData(data as V3OperationResult | null, error),
  };
}
