import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { useEffect, type ReactNode } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { AuthenticatedUserProvider } from "@/components/auth/AuthenticatedUserContext";
import { CountryFlagLayerEditorAddon } from "@/components/CountryFlagLayerEditorAddon";
import { CountrySystemFunFactsEditorAddon } from "@/components/CountrySystemFunFactsEditorAddon";
import { HistoricalNationalFinalManager } from "@/components/HistoricalNationalFinalManager";
import { NationalFinalResultOrderAddon } from "@/components/NationalFinalResultOrderAddon";
import { supabase } from "@/integrations/supabase/client";
import { useMyCountryAccount } from "@/lib/country-account";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedIdentityGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const identity = useQuery<User | null>({
    queryKey: ["authenticated-identity-gate"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      return error || !data.user ? null : data.user;
    },
    retry: false,
  });

  useEffect(() => {
    if (identity.isPending || identity.data) return;
    const redirect = `${window.location.pathname}${window.location.search}`;
    void navigate({
      to: "/auth",
      search: { redirect },
      replace: true,
    });
  }, [identity.data, identity.isPending, navigate]);

  if (identity.isPending || !identity.data) {
    return (
      <main
        className="grid min-h-screen place-items-center bg-[#020817] px-5 text-white"
        aria-busy="true"
      >
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-center shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-100/80">
            Solaris Studio
          </p>
          <p className="mt-2 text-sm font-semibold text-white/85">
            {identity.isPending ? "Checking your session…" : "Opening sign in…"}
          </p>
        </div>
      </main>
    );
  }

  return (
    <AuthenticatedUserProvider user={identity.data}>{children}</AuthenticatedUserProvider>
  );
}

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

function AuthenticatedContent() {
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

function AuthenticatedLayout() {
  return (
    <AuthenticatedIdentityGate>
      <AuthenticatedContent />
    </AuthenticatedIdentityGate>
  );
}
