import { createServerFn } from "@tanstack/react-start";

/** Public Pulse accepts no browser-selected identity or publication scope. */
export const getV3PublicPulseEvents = createServerFn({ method: "GET" }).handler(async () => {
  const { loadV3PublicPulseEvents } = await import(
    "@/integrations/v3/public-pulse.server"
  );
  return loadV3PublicPulseEvents();
});
