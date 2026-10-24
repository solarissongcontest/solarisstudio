import {
  applyProductionDesign,
  createProductionDesignCommandIdentity,
  loadProductionDesignProjection,
  reconcileProductionDesignOperation,
  type ProductionDesignCommandResult,
  type ProductionDesignMutationRequest,
  type ProductionDesignProjection,
} from "@/lib/v3-production-design";

export type OrganizerProductionDesignReview = {
  editionId: string;
  showId: string | null;
  request: ProductionDesignMutationRequest;
  expectedStateVersion: string;
  operationId: string;
  idempotencyKey: string;
  serverTime: string;
};

function requireId(value: string | null | undefined, label: string): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function assertProjectionScope(
  projection: ProductionDesignProjection,
  editionId: string,
  showId: string | null,
) {
  if (projection.editionId !== editionId) {
    throw new Error("Production review crossed Organizer edition scope.");
  }
  if ((projection.showId ?? null) !== showId) {
    throw new Error("Production review returned a different show scope.");
  }
  if (!projection.stateVersion.trim()) {
    throw new Error("Production review is missing canonical state-version evidence.");
  }
}

export async function prepareOrganizerProductionDesignReview(input: {
  editionId: string;
  request: ProductionDesignMutationRequest;
}): Promise<OrganizerProductionDesignReview> {
  const editionId = requireId(input.editionId, "Organizer edition");
  const showId = input.request.mode === "edition_default"
    ? null
    : requireId(input.request.showId, "Production show");
  const projection = await loadProductionDesignProjection({ editionId, showId });
  assertProjectionScope(projection, editionId, showId);

  const identity = createProductionDesignCommandIdentity({
    editionId,
    mode: input.request.mode,
    showId,
  });

  return {
    editionId,
    showId,
    request: structuredClone(input.request),
    expectedStateVersion: projection.stateVersion,
    operationId: identity.operationId,
    idempotencyKey: identity.idempotencyKey,
    serverTime: projection.serverTime,
  };
}

function commandResultFromReconciliation(
  row: Record<string, unknown>,
  operationId: string,
): ProductionDesignCommandResult | null {
  if (row.operationId !== operationId || row.status !== "succeeded") return null;
  const payload = objectOrNull(row.result);
  if (!payload || payload.ok !== true) return null;
  return {
    ok: true,
    mode:
      payload.mode === "edition_default"
      || payload.mode === "show_override"
      || payload.mode === "show_reset"
        ? payload.mode
        : undefined,
    editionId: typeof payload.editionId === "string" ? payload.editionId : undefined,
    showId: typeof payload.showId === "string" ? payload.showId : payload.showId === null ? null : undefined,
    affectedShowIds: Array.isArray(payload.affectedShowIds)
      ? payload.affectedShowIds.filter((value): value is string => typeof value === "string")
      : undefined,
    stateVersion: typeof payload.stateVersion === "string" ? payload.stateVersion : undefined,
    operationId,
    receiptId: typeof payload.receiptId === "string" ? payload.receiptId : operationId,
    correlationId: typeof row.correlationId === "string" ? row.correlationId : undefined,
    status: "succeeded",
    replayed: true,
    serverTime: typeof payload.serverTime === "string" ? payload.serverTime : undefined,
    error: null,
  };
}

export async function commitOrganizerProductionDesignReview(input: {
  review: OrganizerProductionDesignReview;
  currentEditionId: string;
  reason?: string | null;
}): Promise<ProductionDesignCommandResult> {
  const currentEditionId = requireId(input.currentEditionId, "Organizer edition");
  const { review } = input;
  if (review.editionId !== currentEditionId) {
    throw new Error("Organizer edition changed after Production review. Review again.");
  }

  const current = await loadProductionDesignProjection({
    editionId: review.editionId,
    showId: review.showId,
  });
  assertProjectionScope(current, review.editionId, review.showId);
  if (current.stateVersion !== review.expectedStateVersion) {
    throw new Error("Production state changed after review. Reload the editor and review the current state.");
  }

  try {
    const result = await applyProductionDesign({
      editionId: review.editionId,
      request: review.request,
      expectedStateVersion: review.expectedStateVersion,
      operationId: review.operationId,
      idempotencyKey: review.idempotencyKey,
      reason: input.reason,
    });
    if (!result.ok) {
      const code = result.error?.code ? ` (${result.error.code})` : "";
      throw new Error(`Production design command did not succeed${code}. Reload authoritative state before retrying.`);
    }
    if (result.operationId !== review.operationId) {
      throw new Error("Production design command returned a different operation identity.");
    }
    if (result.editionId && result.editionId !== review.editionId) {
      throw new Error("Production design command crossed Organizer edition scope.");
    }
    if (review.showId !== null && result.showId !== undefined && result.showId !== review.showId) {
      throw new Error("Production design command returned a different show scope.");
    }
    return result;
  } catch (originalError) {
    // Never blindly retry an uncertain consequential mutation. Reconcile the
    // same operation identity once; only a proven succeeded receipt is accepted.
    try {
      const reconciliation = await reconcileProductionDesignOperation(review.operationId);
      const reconciled = commandResultFromReconciliation(reconciliation, review.operationId);
      if (reconciled) return reconciled;
    } catch {
      // Preserve the original mutation error when reconciliation itself is unavailable.
    }
    throw originalError;
  }
}
