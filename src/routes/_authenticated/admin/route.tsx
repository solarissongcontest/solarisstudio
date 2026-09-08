import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { reportLovableError } from "@/lib/lovable-error-reporting";

const ADMIN_RELOAD_KEY = "solaris:admin:last-stale-bundle-reload";

function isStaleClientBundleError(error: unknown) {
  const text =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : error instanceof Response
        ? `Response ${error.status} ${error.url}`
        : String(error ?? "");

  return /chunkloaderror|loading chunk|dynamically imported module|importing a module script failed|failed to fetch module|unable to preload css/i.test(
    text,
  );
}

function AdminRouteError({ error }: { error: unknown; reset: () => void }) {
  useEffect(() => {
    reportLovableError(error, { boundary: "admin_route_error" });

    if (!isStaleClientBundleError(error) || typeof window === "undefined") return;

    try {
      const lastReload = Number(window.sessionStorage.getItem(ADMIN_RELOAD_KEY) ?? 0);
      if (!Number.isFinite(lastReload) || Date.now() - lastReload > 30_000) {
        window.sessionStorage.setItem(ADMIN_RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      // If storage itself is unavailable, leave the explicit reload button usable.
    }
  }, [error]);

  const message =
    error instanceof Error
      ? error.message
      : error instanceof Response
        ? `Request failed with status ${error.status}`
        : String(error ?? "Unknown admin error");

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#020817] px-5 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-100/80">Solaris Organizer</p>
        <h1 className="mt-2 text-xl font-bold">Organizer could not open</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/65">
          Reload the current production build. Your contest data has not been changed.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-xl bg-sky-200 px-4 text-sm font-bold text-slate-950"
          >
            Reload Organizer
          </button>
          <a
            href="/"
            className="flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm font-bold"
          >
            Go home
          </a>
        </div>
        <details className="mt-4 text-left text-xs text-white/50">
          <summary className="cursor-pointer text-center font-semibold text-white/60">Technical details</summary>
          <p className="mt-2 break-words rounded-xl bg-black/20 p-3 leading-relaxed">{message}</p>
        </details>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow, noarchive" }] }),
  beforeLoad: async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw redirect({ to: "/auth" });
    const { data: role, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "organizer")
      .maybeSingle();
    if (error || !role) throw redirect({ to: "/country-hub" });
    return { organizer: true };
  },
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
  errorComponent: AdminRouteError,
});
