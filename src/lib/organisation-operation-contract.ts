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

export type OrganisationCommandEnvelope<TPayload> = {
  operationId: string;
  idempotencyKey: string;
  expectedVersion: number | null;
  riskClass: OrganisationRiskClass;
  scope: OrganisationCommandScope;
  command: string;
  payload: TPayload;
};

export function createOrganisationCommand<TPayload>(input: {
  command: string;
  payload: TPayload;
  riskClass: OrganisationRiskClass;
  scope?: OrganisationCommandScope;
  expectedVersion?: number | null;
  operationId?: string;
  idempotencyKey?: string;
}): OrganisationCommandEnvelope<TPayload> {
  const operationId = input.operationId ?? crypto.randomUUID();
  return {
    operationId,
    idempotencyKey: input.idempotencyKey ?? operationId,
    expectedVersion: input.expectedVersion ?? null,
    riskClass: input.riskClass,
    scope: input.scope ?? {},
    command: input.command,
    payload: input.payload,
  };
}

export function requiresImpactPreview(riskClass: OrganisationRiskClass) {
  return riskClass === "R2" || riskClass === "R3";
}

export function requiresLiveAcknowledgement(riskClass: OrganisationRiskClass) {
  return riskClass === "R2" || riskClass === "R3";
}
