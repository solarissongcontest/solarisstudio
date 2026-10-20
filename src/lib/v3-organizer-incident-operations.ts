import type { SystemJsonValue, SystemReceipt } from "@/lib/system-operation-contract";
import {
  applyIncidentCommandV3,
  loadIncidentCommandProjection,
  preflightIncidentCommand,
  type V3IncidentAction,
  type V3IncidentCommandPreflight,
} from "@/lib/v3-incident-command";

export type OrganizerIncidentContext = {
  editionId: string;
};

export type OrganizerIncidentCurrentState = {
  editionId: string;
  incidentId: string;
  version: number;
};

export type OrganizerIncidentOperationReview = {
  editionId: string;
  incidentId: string | null;
  action: V3IncidentAction;
  expectedVersion: number | null;
  payload: Record<string, unknown>;
  reason: string | null;
  riskClass: V3IncidentCommandPreflight["riskClass"];
  requiredCapability: string;
  reasonRequired: boolean;
  consequences: string[];
  serverTime: string;
};

function requireId(value: string | null | undefined, label: string): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function requireVersion(value: number | null | undefined): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) < 1) {
    throw new Error("Incident Command requires a positive canonical incident version.");
  }
  return value as number;
}

function normalizeReason(reason: string | null | undefined): string | null {
  const normalized = reason?.trim() ?? "";
  return normalized || null;
}

function assertPreflightScope(input: {
  editionId: string;
  incidentId: string | null;
  action: V3IncidentAction;
  preflight: V3IncidentCommandPreflight;
}) {
  if (input.preflight.editionId !== input.editionId) {
    throw new Error("Incident Command preflight crossed Organizer edition scope.");
  }
  if ((input.preflight.incidentId ?? null) !== input.incidentId) {
    throw new Error("Incident Command preflight returned a different incident.");
  }
  if (input.preflight.action !== input.action) {
    throw new Error("Incident Command preflight returned a different action.");
  }
  if (!input.preflight.requiredCapability.trim()) {
    throw new Error("Incident Command preflight omitted capability evidence.");
  }
  if (!Array.isArray(input.preflight.consequences)) {
    throw new Error("Incident Command preflight omitted consequence evidence.");
  }
}

/**
 * Load only the exact canonical identity/version required to commit a reviewed
 * Incident operation. The route may keep its mature compatibility read model
 * during cutover, but consequential mutation CAS always binds to this bounded
 * System projection.
 */
export async function loadOrganizerIncidentCurrentState(input: {
  context: OrganizerIncidentContext;
  incidentId: string;
}): Promise<OrganizerIncidentCurrentState> {
  const editionId = requireId(input.context.editionId, "Organizer edition");
  const incidentId = requireId(input.incidentId, "Incident");
  const projection = await loadIncidentCommandProjection(editionId, {
    incidentId,
    limit: 1,
  });
  if (projection.editionId !== editionId) {
    throw new Error("Incident Command projection crossed Organizer edition scope.");
  }
  const incident = projection.incidents.find((candidate) => candidate.id === incidentId);
  if (!incident) {
    throw new Error("The reviewed incident no longer exists in the selected edition.");
  }
  return {
    editionId,
    incidentId,
    version: requireVersion(incident.version),
  };
}

export async function prepareOrganizerIncidentOperation(input: {
  context: OrganizerIncidentContext;
  incidentId?: string | null;
  action: V3IncidentAction;
  payload?: Record<string, unknown>;
  reason?: string | null;
}): Promise<OrganizerIncidentOperationReview> {
  const editionId = requireId(input.context.editionId, "Organizer edition");
  const incidentId = input.action === "create"
    ? null
    : requireId(input.incidentId, "Incident");
  const payload = input.payload ?? {};
  const reason = normalizeReason(input.reason);

  const preflight = await preflightIncidentCommand({
    editionId,
    incidentId,
    action: input.action,
    payload,
  });
  assertPreflightScope({ editionId, incidentId, action: input.action, preflight });

  const expectedVersion = input.action === "create"
    ? null
    : requireVersion(preflight.expectedVersion);

  // Reason requirements are authoritative preflight evidence shown to the
  // organizer. The human may supply the reason after preflight; commit is the
  // point that must fail closed when required evidence is still absent.
  return {
    editionId,
    incidentId,
    action: input.action,
    expectedVersion,
    payload,
    reason,
    riskClass: preflight.riskClass,
    requiredCapability: preflight.requiredCapability,
    reasonRequired: preflight.reasonRequired,
    consequences: [...preflight.consequences],
    serverTime: preflight.serverTime,
  };
}

export function withOrganizerIncidentReviewReason(
  review: OrganizerIncidentOperationReview,
  reason: string | null | undefined,
): OrganizerIncidentOperationReview {
  return {
    ...review,
    reason: normalizeReason(reason),
  };
}

export async function commitOrganizerIncidentOperation(input: {
  context: OrganizerIncidentContext;
  review: OrganizerIncidentOperationReview;
  current?: OrganizerIncidentCurrentState | null;
}): Promise<SystemReceipt<SystemJsonValue>> {
  const editionId = requireId(input.context.editionId, "Organizer edition");
  const { review } = input;

  if (review.editionId !== editionId) {
    throw new Error("Organizer edition changed after Incident Command review. Review again.");
  }

  if (review.action === "create") {
    if (review.incidentId !== null || review.expectedVersion !== null) {
      throw new Error("Incident creation review contains stale subject/version state.");
    }
  } else {
    const current = input.current;
    if (!current) {
      throw new Error("Reload the current incident before committing this reviewed operation.");
    }
    if (
      current.editionId !== review.editionId
      || current.incidentId !== review.incidentId
      || current.version !== review.expectedVersion
    ) {
      throw new Error("Incident state changed after review. Reload the incident and review again.");
    }
  }

  if (review.reasonRequired && !review.reason) {
    throw new Error("Incident Command reason is missing from the reviewed operation.");
  }

  return applyIncidentCommandV3({
    editionId: review.editionId,
    incidentId: review.incidentId,
    action: review.action,
    expectedVersion: review.expectedVersion,
    payload: review.payload,
    reason: review.reason,
  });
}
