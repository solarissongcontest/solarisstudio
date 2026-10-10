import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { User } from "@supabase/supabase-js";
import { useEffect, useState, type ReactNode } from "react";
import { DatabaseZap, ShieldCheck } from "lucide-react";

import { AuthenticatedUserProvider } from "@/components/auth/AuthenticatedUserContext";
import { hasSolarisOrganizerAccess } from "@/integrations/supabase/access";
import { supabase } from "@/integrations/supabase/client";
import { getMergedTelevotingServerStatus } from "@/integrations/televoting/status.functions";
import { AdminShell, AdminPage } from "./AdminShell";
import { AdminCard, AdminPageHeader, AdminStatus } from "./AdminUI";

type GateState =
  | { status: "checking"; user: null }
  | { status: "allowed"; user: User }
  | { status: "redirecting"; user: null }
  | { status: "backend-missing"; user: User };

const LEGACY_SIGN_IN_ROUTES = new Set([
  "/confirmations/admin/sign-in",
  "/televoting/admin/sign-in",
]);

function ServiceAdminShell({ user, children }: { user: User; children: ReactNode }) {
  return (
    <AuthenticatedUserProvider user={user}>
      <AdminShell>{children}</AdminShell>
    </AuthenticatedUserProvider>
  );
}

export function UnifiedServiceAdminGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const getTelevotingStatus = useServerFn(getMergedTelevotingServerStatus);
  const [state, setState] = useState<GateState>({ status: "checking", user: null });

  useEffect(() => {
    let alive = true;
    setState({ status: "checking", user: null });

    void (async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        if (alive) setState({ status: "redirecting", user: null });
        await navigate({ to: "/auth", search: { redirect: pathname }, replace: true });
        return;
      }

      let isOrganizer = false;
      try {
        isOrganizer = await hasSolarisOrganizerAccess(userData.user.id);
      } catch {
        isOrganizer = false;
      }

      if (!isOrganizer) {
        if (alive) setState({ status: "redirecting", user: null });
        await navigate({ to: "/my-solaris", replace: true });
        return;
      }

      if (LEGACY_SIGN_IN_ROUTES.has(pathname)) {
        if (alive) setState({ status: "redirecting", user: null });
        await navigate({ to: "/admin/operations", replace: true });
        return;
      }

      if (pathname.startsWith("/televoting/admin")) {
        try {
          const status = await getTelevotingStatus();
          if (!status.adminReady) {
            if (alive) setState({ status: "backend-missing", user: userData.user });
            return;
          }
        } catch {
          if (alive) setState({ status: "backend-missing", user: userData.user });
          return;
        }
      }

      if (alive) setState({ status: "allowed", user: userData.user });
    })();

    return () => {
      alive = false;
    };
  }, [getTelevotingStatus, navigate, pathname]);

  if (state.status === "backend-missing") {
    return (
      <ServiceAdminShell user={state.user}>
        <AdminPage>
          <div className="mx-auto max-w-2xl">
            <AdminPageHeader
              eyebrow="Voting"
              title="Organizer connection unavailable"
              description="Your Solaris Organizer session is valid, but the privileged public-voting connection is not ready. Public voting may still remain available."
              actions={<AdminStatus tone="attention">Needs attention</AdminStatus>}
            />
            <AdminCard strong>
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-amber-200/15 bg-amber-200/[0.06] text-amber-100">
                  <DatabaseZap className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-foreground">
                    Public voting organizer tools are temporarily unavailable
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Avoid live public-voting organizer actions until the privileged connection is
                    restored. This does not mean public voting or stored ballots were deleted.
                  </p>
                  <details className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground">
                      Technical details
                    </summary>
                    <div className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
                      <p>
                        The deployment cannot complete the privileged Televoting database check.
                      </p>
                      <p>
                        Verify the signed-in Organizer session and that the Solaris Supabase
                        Televoting schema is reachable from the deployment.
                      </p>
                    </div>
                  </details>
                </div>
              </div>
            </AdminCard>
          </div>
        </AdminPage>
      </ServiceAdminShell>
    );
  }

  if (state.status !== "allowed") {
    return (
      <section
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label="Checking organizer access"
        className="grid min-h-[60vh] place-items-center px-4"
      >
        <div className="glass w-full max-w-xl p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-sky-200/10 bg-sky-200/[0.06] text-sky-100">
              <ShieldCheck className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {state.status === "checking" ? "Checking organizer access…" : "Opening sign in…"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Solaris is verifying the current organizer session.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return <ServiceAdminShell user={state.user}>{children}</ServiceAdminShell>;
}