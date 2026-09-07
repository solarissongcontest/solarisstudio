import { createServerFn } from "@tanstack/react-start";

export const getJuryIntegrityCases = createServerFn({ method: "GET" }).handler(async () => {
  const { listJuryIntegrityCasesServer } = await import(
    "@/integrations/jury-voting/jury-integrity-admin.server"
  );
  return listJuryIntegrityCasesServer();
});
