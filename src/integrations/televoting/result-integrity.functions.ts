import { createServerFn } from "@tanstack/react-start";

function validate(data: { roundId: string }) {
  if (!data?.roundId) throw new Error("Missing round");
  return { roundId: String(data.roundId) };
}

export const getResultIntegrity = createServerFn({ method: "POST" })
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const { getResultIntegrityServer } = await import(
      "@/integrations/televoting/result-integrity.server"
    );
    return getResultIntegrityServer(data.roundId);
  });

export const recomputeResultIntegrity = createServerFn({ method: "POST" })
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const { recomputeResultIntegrityServer } = await import(
      "@/integrations/televoting/result-integrity.server"
    );
    return recomputeResultIntegrityServer(data.roundId);
  });
