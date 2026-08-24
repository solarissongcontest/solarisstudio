import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { DatabaseZap, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getMergedTelevotingServerStatus } from "@/integrations/televoting/status.functions";
import { AdminShell, AdminPage } from "./AdminShell";
import { AdminCard, AdminPageHeader, AdminStatus } from "./AdminUI";

type GateState = "checking" | "allowed" | "redirecting" | "backend-missing";

const LEGACY_SIGN_IN_ROUTES = new Set([
  "/confirmations/admin/sign-in",
  "/televoting/admin/sign-in",
]);

export function UnifiedServiceAdminGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const getTelevotingStatus = useServerFn(getMergedTelevotingServerStatus);
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    let alive = true;
    setState("checking");

    void (async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        if (alive) setState("redirecting");
        await navigate({ to: "/auth", search: { redirect: pathname }, replace: true });
        return;
      }

      const { data: role, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "organizer")
        .maybeSingle();

      if (roleError || !role) {
        if (alive) setState("redirecting");
        await navigate({ to: "/country-hub", replace: true });
        return;
      }

      if (LEGACY_SIGN_IN_ROUTES.has(pathname)) {
        if (alive) setState("redirecting");
        await navigate({ to: "/admin/operations", replace: true });
        return;
      }

      if (pathname.startsWith("/televoting/admin")) {
        try {
          const status = await getTelevotingStatus();
          if (!status.adminReady) {
            if (alive) setState("backend-missing");
            return;
          }
        } catch {
          if (alive) setState("backend-missing");
          return;
        }
      }

      if (alive) setState("allowed");
    })();

    return () => { alive = false; };
  }, [getTelevotingStatus, navigate, pathname]);

  if (state === "backend-missing") {
    return (
      <AdminShell>
        <AdminPage>
          <div className="mx-auto max-w-2xl">
            <AdminPageHeader
              eyebrow="Voting service"
              title="Organizer connection unavailable"
              description="Your Solaris organizer session is valid, but the privileged Televoting connection is not ready. Public voting may still remain available."
              actions={<AdminStatus tone="attention">Needs attention</AdminStatus>}
            />
            <AdminCard strong>
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-amber-200/15 bg-amber-200/[0.06] text-amber-100"><DatabaseZap className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-foreground">Televoting organizer tools are temporarily unavailable</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Avoid live organizer actions until the privileged service connection is restored. This screen does not mean public voting or stored ballots were deleted.</p>
                  <details className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground">Technical details</summary>
                    <div className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
                      <p>The deployment cannot complete the privileged Televoting database check.</p>
                      <p>Verify the server-side Televoting service credentials and that the configured Televoting Supabase project is reachable from the deployment.</p>
                    </div>
                  </details>
                </div>
              </div>
            </AdminCard>
          </div>
        </AdminPage>
      </AdminShell>
    );
  }

  if (state !== "allowed") {
    return (
      <main className="grid min-h-[60vh] place-items-center px-4" aria-busy="true">
        <div className="glass w-full max-w-xl p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-sky-200/10 bg-sky-200/[0.06] text-sky-100"><ShieldCheck className="size-4" /></span>
            <div className="min-w-0"><p className="text-sm font-semibold text-foreground">{state === "checking" ? "Checking organizer access…" : "Opening sign in…"}</p><p className="mt-1 text-xs text-muted-foreground">Solaris is verifying the current organizer session.</p></div>
          </div>
        </div>
      </main>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
