import { createServerFn } from "@tanstack/react-start";

/**
 * No browser-supplied country, user or edition selector. The server derives all
 * three from the authenticated request and current canonical contest state.
 */
export const getV3EntryBundle = createServerFn({ method: "GET" }).handler(async () => {
  const { loadCurrentV3EntryBundle } = await import(
    "@/integrations/v3/entry-source.server"
  );
  return loadCurrentV3EntryBundle();
});
