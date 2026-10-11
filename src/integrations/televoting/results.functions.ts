import { createServerFn } from "@tanstack/react-start";

// TanStack Start server functions are invoked through the framework's POST
// transport even when the operation is a pure read. The Supabase read-only gate
// only governs the downstream Data API/RPC request, so keep the framework
// transport canonical here and enforce read-only semantics at the database
// boundary instead.
export const getMergedPublishedTelevotingResults = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId?: string }) => ({ roundId: data?.roundId }))
  .handler(async ({ data }) => {
    const { getMergedPublishedTelevotingResultsServer } = await import(
      "@/integrations/televoting/results.server"
    );
    return getMergedPublishedTelevotingResultsServer(data.roundId);
  });
