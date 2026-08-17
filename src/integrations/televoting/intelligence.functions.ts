import { createServerFn } from "@tanstack/react-start";
import type { IntelligenceChannel, IntelligenceLens } from "@/integrations/televoting/intelligence.server";

export const getMergedTelevotingIntelligence = createServerFn({ method: "POST" })
  .inputValidator((data?: {
    lens?: IntelligenceLens;
    channel?: IntelligenceChannel;
    hodPersonId?: string | null;
    editionId?: string | null;
  }) => ({
    lens: data?.lens === "country" ? "country" as const : "hod" as const,
    channel: data?.channel === "jury" || data?.channel === "televote" ? data.channel : "combined" as const,
    hodPersonId: data?.hodPersonId ? String(data.hodPersonId) : null,
    editionId: data?.editionId ? String(data.editionId) : null,
  }))
  .handler(async ({ data }) => {
    const { getMergedIntelligenceServer } = await import("@/integrations/televoting/intelligence.server");
    return getMergedIntelligenceServer(data);
  });