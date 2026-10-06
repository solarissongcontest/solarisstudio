import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { CountryFlagLayerEditorAddon } from "@/components/CountryFlagLayerEditorAddon";
import { CountrySystemFunFactsEditorAddon } from "@/components/CountrySystemFunFactsEditorAddon";
import { HistoricalNationalFinalManager } from "@/components/HistoricalNationalFinalManager";
import { NationalFinalResultOrderAddon } from "@/components/NationalFinalResultOrderAddon";
import { hasSolarisOrganizerAccess } from "@/integrations/supabase/access";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: { redirect: `${location.pathname}${location.searchStr}` },
      });
    }

    // Keep Organizer authorization in the same authenticated route boundary that
    // already owns the user lookup. A second async beforeLoad in the nested admin
    // route used to resolve after React had begun the client-only route transition,
    // which could enqueue router state before the Organizer subtree mounted.
    const isAdminPath =
      location.pathname === "/admin" || location.pathname.startsWith("/admin/");
    if (isAdminPath) {
      let isOrganizer = false;
      try {
        isOrganizer = await hasSolarisOrganizerAccess(data.user.id);
      } catch {
        isOrganizer = false;
      }
      if (!isOrganizer) {
        throw redirect({
          to: "/my-solaris",
          search: { notice: "organizer-access-required" },
          replace: true,
        });
      }
    }

    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isMySolarisTheme = pathname === "/my-solaris/theme" || pathname === "/my-solaris/theme/";
  const isMySolarisPageBuilder =
    pathname === "/my-solaris/page-builder" || pathname === "/my-solaris/page-builder/";
  const isCountryWorkspace =
    pathname === "/my-solaris/country" || pathname === "/my-solaris/country/";

  return (
    <>
      <Outlet />
      {isCountryWorkspace && (
        <>
          <HistoricalNationalFinalManager />
          <NationalFinalResultOrderAddon />
        </>
      )}
      {isMySolarisTheme && <CountryFlagLayerEditorAddon />}
      {isMySolarisPageBuilder && <CountrySystemFunFactsEditorAddon />}
    </>
  );
}
