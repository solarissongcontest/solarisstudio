import { createServerFn } from "@tanstack/react-start";

export const getMergedTelevotingIntelligence = createServerFn({ method: "GET" }).handler(async () => {
  const { getMergedIntelligenceServer } = await import("@/integrations/televoting/intelligence.server");
  return getMergedIntelligenceServer();
});
