import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { useEffect, type ReactNode } from "react";

import { AdminShell } from "@/components/admin/AdminShell";
import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext";
import { hasSolarisOrganizerAccess } from "@/integrations/supabase/access";
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

function OrganizerAccessGate({ user, children }: { user: User; children: ReactNode }) {
  const navigate = useNavigate();
  const organizerAccess = useQuery<boolean>({
    queryKey: ["organizer-access-gate", user.id],
    queryFn: async () => {
      try {
        return await hasSolarisOrganizerAccess(user.id);
      } catch {
        return false;
      }
    },
    retry: false,
  });

  useEffect(() => {
    if (organizerAccess.isPending || organizerAccess.data) return;
    void navigate({
      to: "/my-solaris",
      search: { notice: "organizer-access-required" },
      replace: true,
    });
  }, [navigate, organizerAccess.data, organizerAccess.isPending]);

  if (organizerAccess.isPending || !organizerAccess.data) {
    return (
      <main
        className="grid min-h-screen place-items-center bg-[#020817] px-5 text-white"
        aria-busy="true"
      >
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-center shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-100/80">Solaris Organizer</p>
          <p className="mt-2 text-sm font-semibold text-white/85">
            {organizerAccess.isPending ? "Checking organizer access…" : "Opening MySolaris…"}
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow, noarchive" }] }),
  component: AdminRouteLayout,
  errorComponent: AdminRouteError,
});

function AdminRouteLayout() {
  const user = useAuthenticatedUser();
  return (
    <OrganizerAccessGate user={user}>
      <AdminShell userEmail={user.email ?? null}>
        <Outlet />
      </AdminShell>
    </OrganizerAccessGate>
  );
}
