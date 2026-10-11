import { createServerFn } from "@tanstack/react-start";

// Published results are a pure read. Keep this as GET so platform read-only mode
// does not mistake the server-function request itself for a mutation before the
// public Supabase read can run.
export const getMergedPublishedTelevotingResults = createServerFn({ method: "GET" })
  .inputValidator((data: { roundId?: string }) => ({ roundId: data?.roundId }))
  .handler(async ({ data }) => {
    const { getMergedPublishedTelevotingResultsServer } = await import(
      "@/integrations/televoting/results.server"
    );
    return getMergedPublishedTelevotingResultsServer(data.roundId);
  });
