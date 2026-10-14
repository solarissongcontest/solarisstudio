import { createServerFn } from "@tanstack/react-start";

// No caller-supplied identity or delegation selector. The existing auth
// middleware carries the verified session to the database-owned read boundary.
export const getV3MeSummary = createServerFn({ method: "GET" }).handler(async () => {
  const { loadV3MeSummary } = await import("@/integrations/v3/me-summary.server");
  return loadV3MeSummary();
});
