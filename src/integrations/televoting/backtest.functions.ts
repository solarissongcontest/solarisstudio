import { createServerFn } from "@tanstack/react-start";

export const runHistoricalTelevoteBacktest = createServerFn({ method: "POST" })
  .inputValidator((data: { roundId?: string | null; limit?: number } | undefined) => ({
    roundId: data?.roundId ? String(data.roundId) : null,
    limit: Math.max(1, Math.min(100, Math.trunc(Number(data?.limit ?? 30)))),
  }))
  .handler(async ({ data }) => {
    const { runHistoricalTelevoteBacktestServer } = await import(
      "@/integrations/televoting/backtest.server"
    );
    return runHistoricalTelevoteBacktestServer(data);
  });
