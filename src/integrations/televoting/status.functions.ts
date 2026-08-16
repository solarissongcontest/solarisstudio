import { createServerFn } from "@tanstack/react-start";

export const getMergedTelevotingServerStatus = createServerFn({ method: "GET" }).handler(
  async () => ({
    votingReady: Boolean(
      import.meta.env.VITE_TELEVOTING_SUPABASE_URL &&
        import.meta.env.VITE_TELEVOTING_SUPABASE_PUBLISHABLE_KEY,
    ),
    adminReady: Boolean(
      process.env.TELEVOTING_SUPABASE_URL &&
        process.env.TELEVOTING_SUPABASE_SERVICE_ROLE_KEY &&
        process.env.TELEVOTING_ADMIN_SESSION_SECRET,
    ),
  }),
);
