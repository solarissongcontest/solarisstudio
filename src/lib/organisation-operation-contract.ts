import { createSystemCommand, type SystemCommand } from "./system-operation-contract";

export const ORGANISATION_SCREEN_STATES = [
  "loading",
  "ready",
  "empty",
  "partial",
  "stale",
  "offline",
  "error",
  "forbidden",
  "conflict",
  "expired",
  "submitting",
  "acknowledged",
  "read-only",
  "maintenance",
  "degraded",
] as const;

export type OrganisationScreenState = (typeof ORGANISATION_SCREEN_STATES)[number];

export const ORGANISATION_RISK_CLASSES = ["R0", "R1", "R2", "R3"] as const;
export type OrganisationRiskClass = (typeof ORGANISATION_RISK_CLASSES)[number];

export type OrganisationCommandScope = {
  editionId?: string | null;
  countryId?: string | null;
  showId?: string | null;
  roundId?: string | null;
  entityId?: string | null;
};

export type OrganisationCommandEnvelope<TPayload> = SystemCommand<TPayload> & {
  expectedVersion: number | string | null;
  riskClass: OrganisationRiskClass;
  scope: OrganisationCommandScope;
};

export function createOrganisationCommand<TPayload>(input: {
  command: string;
  payload: TPayload;
  riskClass: OrganisationRiskClass;
  scope?: OrganisationCommandScope;
  expectedVersion?: number | string | null;
  reason?: string | null;
  commandId?: string;
  operationId?: string;
  idempotencyKey?: string;
  correlationId?: string;
  requestedAt?: string;
}): OrganisationCommandEnvelope<TPayload> {
  const scope = input.scope ?? {};
  const command = createSystemCommand({
    command: input.command,
    payload: input.payload,
    expectedVersion: input.expectedVersion,
    editionId: scope.editionId,
    showId: scope.showId,
    subjectType: scope.entityId
      ? "entity"
      : scope.roundId
        ? "round"
        : scope.countryId
          ? "country"
          : undefined,
    subjectId: scope.entityId ?? scope.roundId ?? scope.countryId,
    reason: input.reason,
    commandId: input.commandId,
    operationId: input.operationId,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    requestedAt: input.requestedAt,
  });
  return {
    ...command,
    expectedVersion: command.expectedVersion ?? null,
    riskClass: input.riskClass,
    scope,
  };
}

export function requiresImpactPreview(riskClass: OrganisationRiskClass) {
  return riskClass === "R2" || riskClass === "R3";
}

export function requiresLiveAcknowledgement(riskClass: OrganisationRiskClass) {
  return riskClass === "R2" || riskClass === "R3";
}
