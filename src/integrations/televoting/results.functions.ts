import { createServerFn } from "@tanstack/react-start";

export const getMergedPublishedTelevotingResults = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId?: string }) => ({ roundId: data?.roundId }))
  .handler(async ({ data }) => {
    const { getMergedPublishedTelevotingResultsServer } = await import(
      "@/integrations/televoting/results.server"
    );
    return getMergedPublishedTelevotingResultsServer(data.roundId);
  });
