import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { CountryFlagLayerEditorAddon } from "@/components/CountryFlagLayerEditorAddon";
import { CountrySystemFunFactsEditorAddon } from "@/components/CountrySystemFunFactsEditorAddon";
import { HistoricalNationalFinalManager } from "@/components/HistoricalNationalFinalManager";
import { MySolarisPortalExtension } from "@/components/MySolarisPortalExtension";
import { NationalFinalResultOrderAddon } from "@/components/NationalFinalResultOrderAddon";
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
  const isCountryHub = pathname === "/country-hub" || pathname === "/country-hub/";
  const isCountryTheme = pathname === "/country-hub/theme" || pathname === "/country-hub/theme/";
  const isPageBuilder = pathname === "/country-hub/page-builder" || pathname === "/country-hub/page-builder/";

  return (
    <>
      <Outlet />
      {isMySolaris && <MySolarisPortalExtension />}
      {isCountryHub && (
        <>
          <HistoricalNationalFinalManager />
          <NationalFinalResultOrderAddon />
        </>
      )}
      {isCountryTheme && <CountryFlagLayerEditorAddon />}
      {isPageBuilder && <CountrySystemFunFactsEditorAddon />}
    </>
  );
}
