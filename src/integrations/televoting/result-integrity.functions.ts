import { createServerFn } from "@tanstack/react-start";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: unknown, label: string) {
  const normalized = String(value ?? "").trim();
  if (!UUID_RE.test(normalized)) throw new Error(`Invalid ${label}`);
  return normalized;
}

function validateRead(data: { roundId: string; editionId?: string | null }) {
  if (!data?.roundId) throw new Error("Missing round");
  const editionId = data.editionId ? requireUuid(data.editionId, "edition") : undefined;
  return { roundId: requireUuid(data.roundId, "round"), editionId };
}

function validateLegacyRecompute(data: { roundId: string }) {
  if (!data?.roundId) throw new Error("Missing round");
  return { roundId: requireUuid(data.roundId, "round") };
}

function validateOperation(data: {
  editionId: string;
  roundId: string;
  expectedCalculationVersion: number;
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
}) {
  const expectedCalculationVersion = Number(data?.expectedCalculationVersion);
  if (!Number.isSafeInteger(expectedCalculationVersion) || expectedCalculationVersion <= 0) {
    throw new Error("Invalid expected calculation version");
  }
  const idempotencyKey = String(data?.idempotencyKey ?? "").trim();
  if (!idempotencyKey || idempotencyKey.length > 240) {
    throw new Error("Invalid idempotency key");
  }

  return {
    editionId: requireUuid(data?.editionId, "edition"),
    roundId: requireUuid(data?.roundId, "round"),
    expectedCalculationVersion,
    operationId: requireUuid(data?.operationId, "operation"),
    idempotencyKey,
    correlationId: requireUuid(data?.correlationId, "correlation"),
  };
}

export const getResultIntegrity = createServerFn({ method: "POST" })
  .inputValidator(validateRead)
  .handler(async ({ data }) => {
    const { getResultIntegrityServer } = await import(
      "@/integrations/televoting/result-integrity.server"
    );
    return getResultIntegrityServer(data.roundId, data.editionId);
  });

/**
 * Compatibility surface for the pre-V3 specialist route. The server derives
 * exact edition/version scope and still executes the canonical operation RPC.
 */
export const recomputeResultIntegrity = createServerFn({ method: "POST" })
  .inputValidator(validateLegacyRecompute)
  .handler(async ({ data }) => {
    const { recomputeResultIntegrityServer } = await import(
      "@/integrations/televoting/result-integrity.server"
    );
    return recomputeResultIntegrityServer(data.roundId);
  });

/**
 * Canonical V3 surface for Organizer. Stable operation identity belongs to the
 * caller so a lost response can be reconciled without creating a second write.
 */
export const recomputeResultIntegrityOperation = createServerFn({ method: "POST" })
  .inputValidator(validateOperation)
  .handler(async ({ data }) => {
    const { recomputeResultIntegrityOperationServer } = await import(
      "@/integrations/televoting/result-integrity.server"
    );
    return recomputeResultIntegrityOperationServer(data);
  });
