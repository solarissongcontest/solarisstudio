import { createServerFn } from "@tanstack/react-start";

function validate(data: { roundId: string }) {
  const roundId = String(data?.roundId ?? "").trim();
  if (!roundId) throw new Error("Missing round");
  return { roundId };
}

function validateEditionScopedRead(data: { roundId: string; editionId: string }) {
  const roundId = String(data?.roundId ?? "").trim();
  const editionId = String(data?.editionId ?? "").trim();
  if (!roundId) throw new Error("Missing round");
  if (!editionId) throw new Error("Result Integrity requires an explicit Organizer edition scope.");
  return { roundId, editionId };
}

export const getResultIntegrity = createServerFn({ method: "POST" })
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const { getResultIntegrityServer } = await import(
      "@/integrations/televoting/result-integrity.server"
    );
    return getResultIntegrityServer(data.roundId);
  });

export const getEditionScopedResultIntegrity = createServerFn({ method: "POST" })
  .inputValidator(validateEditionScopedRead)
  .handler(async ({ data }) => {
    const { getResultIntegrityServer } = await import(
      "@/integrations/televoting/result-integrity.server"
    );
    return getResultIntegrityServer(data.roundId, data.editionId);
  });

export const recomputeResultIntegrity = createServerFn({ method: "POST" })
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const { recomputeResultIntegrityServer } = await import(
      "@/integrations/televoting/result-integrity.server"
    );
    return recomputeResultIntegrityServer(data.roundId);
  });