import { createServerFn } from "@tanstack/react-start";

export const listMergedIntegrityDeclarations = createServerFn({ method: "GET" })
  .inputValidator((data: { limit?: number; signedOnly?: boolean; attestationOnly?: boolean } | undefined) => ({
    limit: Math.max(1, Math.min(1000, Number(data?.limit ?? 300))),
    signedOnly: Boolean(data?.signedOnly),
    attestationOnly: data?.attestationOnly !== false,
  }))
  .handler(async ({ data }) => {
    const { listIntegrityDeclarationsServer } = await import(
      "@/integrations/televoting/integrity-declarations.server"
    );
    return listIntegrityDeclarationsServer(data);
  });
