import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { CountryFlagLayerEditorAddon } from "@/components/CountryFlagLayerEditorAddon";
import { CountrySystemFunFactsEditorAddon } from "@/components/CountrySystemFunFactsEditorAddon";
import { HistoricalNationalFinalManager } from "@/components/HistoricalNationalFinalManager";
import { NationalFinalResultOrderAddon } from "@/components/NationalFinalResultOrderAddon";
import { OrganizerAccessGate } from "@/components/admin/OrganizerAccessGate";
import { supabase } from "@/integrations/supabase/client";
import { beginLifecycleGeneration } from "@/lib/lifecycle-generation";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AuthenticatedSessionGate>
      {(user) => <AuthenticatedContent user={user} />}
    </AuthenticatedSessionGate>
  );
}

function AuthenticatedSessionGate({ children }: { children: (user: User) => ReactNode }) {
  const navigate = useNavigate();
  const generationRef = useRef(0);
  const verifiedUserIdRef = useRef<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const lifecycle = beginLifecycleGeneration(generationRef);

    const redirectToAuth = () => {
      if (!lifecycle.isCurrent()) return;
      verifiedUserIdRef.current = null;
      setUser(null);
      setRedirecting(true);
      const redirect = `${window.location.pathname}${window.location.search}`;
      void navigate({
        to: "/auth",
        search: { redirect },
        replace: true,
      });
    };

    const verifyCurrentUser = async (expectedUserId?: string) => {
      const { data, error } = await supabase.auth.getUser();
      if (!lifecycle.isCurrent()) return;
      if (error || !data.user || (expectedUserId && data.user.id !== expectedUserId)) {
        redirectToAuth();
        return;
      }
      verifiedUserIdRef.current = data.user.id;
      setRedirecting(false);
      setUser(data.user);
    };

    void verifyCurrentUser();
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!lifecycle.isCurrent()) return;
      const nextUserId = session?.user?.id ?? null;
      if (!nextUserId) {
        if (event === "SIGNED_OUT") redirectToAuth();
        return;
      }
      if (nextUserId === verifiedUserIdRef.current) return;

      // Stop private observers before asynchronously validating a new account.
      verifiedUserIdRef.current = null;
      setUser(null);
      setRedirecting(false);
      window.setTimeout(() => {
        if (lifecycle.isCurrent()) void verifyCurrentUser(nextUserId);
      }, 0);
    });

    return () => {
      lifecycle.deactivate();
      subscription.subscription.unsubscribe();
    };
  }, [navigate]);

  if (user) return <>{children(user)}</>;

  return (
    <main
      id="main-content"
      className="grid min-h-[60vh] place-items-center bg-[#020817] px-4 text-white"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-sky-200/10 bg-sky-200/[0.06] text-sky-100">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {redirecting ? "Opening sign in…" : "Checking your Solaris session…"}
            </p>
            <p className="mt-1 text-xs text-white/60">
              Private workspaces stay closed until the current account is verified.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function AuthenticatedContent({ user }: { user: User }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const isMySolarisTheme = pathname === "/my-solaris/theme" || pathname === "/my-solaris/theme/";
  const isMySolarisPageBuilder =
    pathname === "/my-solaris/page-builder" || pathname === "/my-solaris/page-builder/";
  const isCountryWorkspace =
    pathname === "/my-solaris/country" || pathname === "/my-solaris/country/";

  return (
    <>
      {isAdminPath ? (
        <OrganizerAccessGate key={user.id} userId={user.id}>
          <Outlet />
        </OrganizerAccessGate>
      ) : (
        <Outlet />
      )}
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
