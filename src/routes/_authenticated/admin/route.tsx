import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow, noarchive" }],
  }),
  beforeLoad: async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw redirect({ to: "/auth" });

    const { data: role, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "organizer")
      .maybeSingle();

    if (error || !role) {
      throw redirect({ to: "/country-hub" });
    }

    return { organizer: true };
  },
  component: () => <Outlet />,
});
