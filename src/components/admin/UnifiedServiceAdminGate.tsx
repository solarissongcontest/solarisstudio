import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "./AdminShell";

type GateState = "checking" | "allowed" | "redirecting";

const LEGACY_SIGN_IN_ROUTES = new Set([
  "/confirmations/admin/sign-in",
  "/televoting/admin/sign-in",
]);

export function UnifiedServiceAdminGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    let alive = true;

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

      if (alive) setState("allowed");
    })();

    return () => {
      alive = false;
    };
  }, [navigate, pathname]);

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
