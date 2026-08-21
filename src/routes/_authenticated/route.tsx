import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { MySolarisPortalExtension } from "@/components/MySolarisPortalExtension";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isMySolaris = pathname === "/my-solaris" || pathname === "/my-solaris/";

  return (
    <>
      <Outlet />
      {isMySolaris && <MySolarisPortalExtension />}
    </>
  );
}
