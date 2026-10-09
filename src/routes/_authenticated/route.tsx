import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { CountryFlagLayerEditorAddon } from "@/components/CountryFlagLayerEditorAddon";
import { CountrySystemFunFactsEditorAddon } from "@/components/CountrySystemFunFactsEditorAddon";
import { HistoricalNationalFinalManager } from "@/components/HistoricalNationalFinalManager";
import { NationalFinalResultOrderAddon } from "@/components/NationalFinalResultOrderAddon";
import { hasSolarisOrganizerAccess } from "@/integrations/supabase/access";
import { supabase } from "@/integrations/supabase/client";
import { useMyCountryAccount } from "@/lib/country-account";

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

    // Resolve Organizer authorization in the already-established authenticated
    // boundary. Keeping this lookup out of the lazy /admin child boundary avoids
    // starting async route work while Organizer chrome is being committed, while
    // still failing closed before any Organizer screen can render.
    let organizerAccess: boolean | null = null;
    if (location.pathname === "/admin" || location.pathname.startsWith("/admin/")) {
      try {
        organizerAccess = await hasSolarisOrganizerAccess(data.user.id);
      } catch {
        organizerAccess = false;
      }
    }

    return { user: data.user, organizerAccess };
  },
  component: AuthenticatedLayout,
});

function MySolarisAccessGate({ children }: { children: ReactNode }) {
  const account = useMyCountryAccount();

  if (account.isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Opening MySolaris…</p>
      </AppShell>
    );
  }

  if (account.data?.access.countryStatus === "suspended") {
    const reason = account.data.access.suspensionReason;
    return (
      <AppShell>
        <PageHeader
          eyebrow="MySolaris"
          title="Country account suspended"
          description="Participation and delegation tools are unavailable while this account is suspended."
        />
        <Panel title="Access unavailable">
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Contact the Solaris organizer before trying to submit votes, confirmations, entries or delegation changes.
            </p>
            {reason ? <p>Organizer note: {reason}</p> : null}
            <Link
              to="/my-solaris/account"
              className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 font-semibold text-foreground"
            >
              Open account settings
            </Link>
          </div>
        </Panel>
      </AppShell>
    );
  }

  return <>{children}</>;
}

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isMySolaris =
    pathname === "/my-solaris" ||
    pathname === "/my-solaris/" ||
    pathname.startsWith("/my-solaris/");
  const isMySolarisAccount =
    pathname === "/my-solaris/account" || pathname === "/my-solaris/account/";
  const isMySolarisTheme = pathname === "/my-solaris/theme" || pathname === "/my-solaris/theme/";
  const isMySolarisPageBuilder =
    pathname === "/my-solaris/page-builder" || pathname === "/my-solaris/page-builder/";
  const isCountryWorkspace =
    pathname === "/my-solaris/country" || pathname === "/my-solaris/country/";

  const content = (
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

  if (isMySolaris && !isMySolarisAccount) {
    return <MySolarisAccessGate>{content}</MySolarisAccessGate>;
  }

  return content;
}
