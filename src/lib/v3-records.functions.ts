import { createServerFn } from "@tanstack/react-start";

/**
 * Canonical Public V3 Records server boundary. Archive rows and publication
 * state stay server-side; the browser receives only derived public records.
 */
export const getV3RecordsBundle = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadV3RecordsBundle } = await import(
      "@/integrations/v3/records-source.server"
    );
    return loadV3RecordsBundle();
  },
);
