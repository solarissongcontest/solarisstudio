import { createServerFn } from "@tanstack/react-start";

/** Authenticated caller-scoped Me → History boundary. No browser-selected identity. */
export const getV3PersonalHistory = createServerFn({ method: "GET" }).handler(async () => {
  const { loadV3PersonalHistory } = await import(
    "@/integrations/v3/personal-history.server"
  );
  return loadV3PersonalHistory();
});
