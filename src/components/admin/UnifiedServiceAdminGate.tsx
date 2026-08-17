import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { DatabaseZap } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getMergedTelevotingServerStatus } from "@/integrations/televoting/status.functions";
import { AdminShell } from "./AdminShell";

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
        await navigate({
          to: "/auth",
          search: { redirect: pathname },
          replace: true,
        });
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

    return () => {
      alive = false;
    };
  }, [getTelevotingStatus, navigate, pathname]);

  if (state === "backend-missing") {
    return (
      <AdminShell>
        <section className="glass-strong mx-auto mt-8 max-w-2xl border-amber-300/25 p-7">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-100">
              <DatabaseZap className="size-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100/70">
                Televoting backend
              </p>
              <h1 className="mt-2 text-xl font-medium">Privileged backend is not ready</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Solaris organizer authentication is working, but this Cloudflare deployment cannot complete a privileged Televoting database check. Confirm the Worker has the required Televoting service-role secret and that the configured Televoting Supabase project is reachable.
              </p>
              <p className="mt-3 text-xs text-amber-100/70">
                Public voting uses the separate browser-safe connection and can remain available while the organizer backend is restored.
              </p>
            </div>
          </div>
        </section>
      </AdminShell>
    );
  }

  if (state !== "allowed") {
    return (
      <AdminShell>
        <section className="glass-strong mx-auto mt-8 max-w-xl p-8 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-100/60">
            Solaris Operations
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            {state === "checking" ? "Checking organizer access…" : "Opening the authorized workspace…"}
          </p>
        </section>
      </AdminShell>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
