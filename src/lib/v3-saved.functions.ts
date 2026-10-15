import { createServerFn } from "@tanstack/react-start";

/** Viewer identity is resolved from the authenticated request on the server. */
export const getV3SavedProjection = createServerFn({ method: "GET" }).handler(async () => {
  const { loadCurrentV3SavedProjection } = await import(
    "@/integrations/v3/saved-source.server"
  );
  return loadCurrentV3SavedProjection();
});
