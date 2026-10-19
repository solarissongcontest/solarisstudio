import { supabase } from "@/integrations/supabase/client";
import {
  createOrganisationCommand,
  type OrganisationCommandEnvelope,
} from "@/lib/organisation-operation-contract";

export type V3ShowLineupStage = "lineup" | "allocation" | "running_order";
export type V3ShowAllocation = "first_half" | "second_half" | "producer_choice";

export type V3ShowLineupParticipant = {
  id: string;
  countryId: string | null;
  contestEntityId: string | null;
  runningOrder: number | null;
  allocation: V3ShowAllocation | null;
  updatedAt: string | null;
};

export type V3ShowLineupPreflight = {
  showId: string;
  editionId: string;
  stage: V3ShowLineupStage;
  participants: V3ShowLineupParticipant[];
  participantCount: number;
  allowedTransitions: V3ShowLineupStage[];
  stateVersion: string;
};

export type V3ShowLineupMemberDependencies = {
  participantId: string;
  showId: string;
  contestEntityId: string | null;
  countryId: string | null;
  results: number;
  juryReceivedVotes: number;
  juryVoterVotes: number;
  juryBallotStatuses: number;
  juryBallotSubmissions: number;
  televoteVotes: number;
  voterRecords: number;
  total: number;
  canRemove: boolean;
};

export type V3ShowLineupMemberPreflight = {
  editionId: string;
  showId: string;
  participantId: string;
  stage: V3ShowLineupStage;
  stateVersion: string;
  dependencies: V3ShowLineupMemberDependencies;
  canRemove: boolean;
};

export type V3ShowLineupCommandResult = {
  ok: boolean;
  operationId: string;
  editionId?: string;
  showId?: string;
  stage?: V3ShowLineupStage;
  stateVersion?: string;
  participantId?: string;
  removed?: boolean;
  replayed?: boolean;
  status?: string;
  result?: unknown;
};

type CommandIdentity = Pick<
  OrganisationCommandEnvelope<unknown>,
  "operationId" | "idempotencyKey" | "correlationId"
>;

type LineupCommandName =
  | "show.lineup.stage.transition"
  | "show.allocation.save"
  | "show.running_order.save"
  | "show.lineup.member.add"
  | "show.lineup.member.remove";

function assertRpcData<T>(data: T | null, error: { message?: string } | null): T {
  if (error) throw error;
  if (data == null) throw new Error("Solaris did not acknowledge the line-up operation.");
  return data;
}

export async function getV3ShowLineupPreflight(showId: string): Promise<V3ShowLineupPreflight> {
  const { data, error } = await (supabase as any).rpc("studio2_show_lineup_preflight", {
    p_show_id: showId,
  });
  return assertRpcData(data as V3ShowLineupPreflight | null, error);
}

export async function getV3ShowLineupMemberPreflight(
  showId: string,
  participantId: string,
): Promise<V3ShowLineupMemberPreflight> {
  const { data, error } = await (supabase as any).rpc("studio2_show_lineup_member_preflight", {
    p_show_id: showId,
    p_participant_id: participantId,
  });
  return assertRpcData(data as V3ShowLineupMemberPreflight | null, error);
}

function createLineupCommand(input: {
  command: LineupCommandName;
  editionId: string;
  showId: string;
  expectedStateVersion: string;
  payload: Record<string, unknown>;
  identity?: Partial<CommandIdentity>;
}) {
  return createOrganisationCommand({
    command: input.command,
    payload: input.payload,
    riskClass: "R2",
    scope: { editionId: input.editionId, showId: input.showId },
    expectedVersion: input.expectedStateVersion,
    operationId: input.identity?.operationId,
    idempotencyKey: input.identity?.idempotencyKey,
    correlationId: input.identity?.correlationId,
  });
}

export async function transitionV3ShowLineupStage(input: {
  editionId: string;
  showId: string;
  expectedStateVersion: string;
  targetStage: Exclude<V3ShowLineupStage, "lineup">;
  initialRunningOrder?: string[] | null;
  identity?: Partial<CommandIdentity>;
}) {
  const command = createLineupCommand({
    command: "show.lineup.stage.transition",
    editionId: input.editionId,
    showId: input.showId,
    expectedStateVersion: input.expectedStateVersion,
    payload: {
      targetStage: input.targetStage,
      initialRunningOrder: input.initialRunningOrder ?? null,
    },
    identity: input.identity,
  });

  const { data, error } = await (supabase as any).rpc("studio2_transition_show_lineup_stage", {
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_correlation_id: command.correlationId,
    p_show_id: input.showId,
    p_expected_state_version: input.expectedStateVersion,
    p_target_stage: input.targetStage,
    p_initial_running_order: input.initialRunningOrder ?? null,
  });

  return {
    command,
    receipt: assertRpcData(data as V3ShowLineupCommandResult | null, error),
  };
}

export async function saveV3ShowAllocations(input: {
  editionId: string;
  showId: string;
  expectedStateVersion: string;
  allocations: Array<{ id: string; allocation: V3ShowAllocation }>;
  identity?: Partial<CommandIdentity>;
}) {
  const command = createLineupCommand({
    command: "show.allocation.save",
    editionId: input.editionId,
    showId: input.showId,
    expectedStateVersion: input.expectedStateVersion,
    payload: { allocations: input.allocations },
    identity: input.identity,
  });

  const { data, error } = await (supabase as any).rpc("studio2_save_show_allocations", {
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_correlation_id: command.correlationId,
    p_show_id: input.showId,
    p_expected_state_version: input.expectedStateVersion,
    p_allocations: input.allocations,
  });

  return {
    command,
    receipt: assertRpcData(data as V3ShowLineupCommandResult | null, error),
  };
}

export async function saveV3ShowRunningOrder(input: {
  editionId: string;
  showId: string;
  expectedStateVersion: string;
  participantIds: string[];
  identity?: Partial<CommandIdentity>;
}) {
  const command = createLineupCommand({
    command: "show.running_order.save",
    editionId: input.editionId,
    showId: input.showId,
    expectedStateVersion: input.expectedStateVersion,
    payload: { participantIds: input.participantIds },
    identity: input.identity,
  });

  const { data, error } = await (supabase as any).rpc("studio2_save_show_running_order", {
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_correlation_id: command.correlationId,
    p_show_id: input.showId,
    p_expected_state_version: input.expectedStateVersion,
    p_participant_ids: input.participantIds,
  });

  return {
    command,
    receipt: assertRpcData(data as V3ShowLineupCommandResult | null, error),
  };
}

export async function addV3ShowLineupMember(input: {
  editionId: string;
  showId: string;
  expectedStateVersion: string;
  contestEntityId: string;
  identity?: Partial<CommandIdentity>;
}) {
  const command = createLineupCommand({
    command: "show.lineup.member.add",
    editionId: input.editionId,
    showId: input.showId,
    expectedStateVersion: input.expectedStateVersion,
    payload: { contestEntityId: input.contestEntityId },
    identity: input.identity,
  });

  const { data, error } = await (supabase as any).rpc("studio2_add_show_lineup_member", {
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_correlation_id: command.correlationId,
    p_show_id: input.showId,
    p_expected_state_version: input.expectedStateVersion,
    p_contest_entity_id: input.contestEntityId,
  });

  return {
    command,
    receipt: assertRpcData(data as V3ShowLineupCommandResult | null, error),
  };
}

export async function removeV3ShowLineupMember(input: {
  editionId: string;
  showId: string;
  participantId: string;
  expectedStateVersion: string;
  reason: string;
  identity?: Partial<CommandIdentity>;
}) {
  const command = createLineupCommand({
    command: "show.lineup.member.remove",
    editionId: input.editionId,
    showId: input.showId,
    expectedStateVersion: input.expectedStateVersion,
    payload: { participantId: input.participantId, reason: input.reason },
    identity: input.identity,
  });

  const { data, error } = await (supabase as any).rpc("studio2_remove_show_lineup_member", {
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_correlation_id: command.correlationId,
    p_show_id: input.showId,
    p_participant_id: input.participantId,
    p_expected_state_version: input.expectedStateVersion,
    p_reason: input.reason,
  });

  return {
    command,
    receipt: assertRpcData(data as V3ShowLineupCommandResult | null, error),
  };
}
