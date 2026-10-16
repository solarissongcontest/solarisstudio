import { createServerFn } from "@tanstack/react-start";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const listMergedIntegrityDeclarations = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId: string; limit?: number; signedOnly?: boolean }) => {
    const editionId = String(data?.editionId ?? "").trim();
    if (!UUID.test(editionId)) {
      throw new Error("Voting integrity declarations require a valid edition id");
    }
    return {
      editionId,
      limit: Math.max(1, Math.min(1000, Number(data?.limit ?? 300))),
      signedOnly: Boolean(data?.signedOnly),
    };
  })
  .handler(async ({ data }) => {
    const { listIntegrityDeclarationsServer } = await import(
      "@/integrations/televoting/integrity-declarations.server"
    );
    return listIntegrityDeclarationsServer(data);
  });
