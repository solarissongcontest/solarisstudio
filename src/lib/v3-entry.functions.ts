import { createServerFn } from "@tanstack/react-start";

import { deriveV3EntryLifecycle } from "./v3-entry";

/**
 * No browser-supplied country, user or edition selector. The server derives all
 * three from the authenticated request and current canonical contest state.
 */
export const getV3EntryBundle = createServerFn({ method: "GET" }).handler(async () => {
  const { loadCurrentV3EntryBundle } = await import(
    "@/integrations/v3/entry-source.server"
  );
  const bundle = await loadCurrentV3EntryBundle();
  if (bundle.projection.state === "ready") {
    bundle.projection.lifecycle = deriveV3EntryLifecycle(bundle.projection.confirmation);
  }
  return bundle;
});
