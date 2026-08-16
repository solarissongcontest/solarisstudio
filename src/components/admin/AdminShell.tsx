import { Link, useRouterState } from "@tanstack/react-router";
import { ExternalLink, LayoutDashboard } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { AdminCommandPalette } from "./AdminCommandPalette";
import { AdminContextProvider } from "./AdminContext";
import { AdminFrame } from "./AdminFrame";
import { AdminHealthStrip } from "./AdminHealthStrip";
import { AdminSelectors } from "./AdminSelectors";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const editionStudio = /^\/admin\/ssc-[^/]+\/?$/i.test(pathname);
  const pageAlreadyShowsHealth =
    pathname === "/admin/control-room" ||
    pathname === "/admin/action-centre" ||
    pathname === "/admin/operations" ||
    editionStudio;

  return (
    <AdminContextProvider>
      <div className="admin-control-room relative min-h-screen overflow-x-clip bg-background [&_.site-nav]:hidden [&_.mobile-quick-nav]:hidden [&_.app-background]:hidden [&_.app-main]:!max-w-none [&_.app-main]:!p-0">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 opacity-70"
          style={{
            background:
              "radial-gradient(circle at 8% 8%, rgba(84,160,255,.13), transparent 31%), radial-gradient(circle at 92% 28%, rgba(255,120,210,.08), transparent 30%), linear-gradient(rgba(4,9,29,.36), rgba(4,9,29,.68))",
          }}
        />

        <header className="sticky top-0 z-[70] border-b border-white/10 bg-[#071023]/72 backdrop-blur-2xl">
          <div className="relative flex min-h-16 items-center gap-3 px-3 sm:px-5">
            <Link to="/admin/operations" className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sky-200/12 bg-sky-200/[0.08] text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,.1)]">
                <LayoutDashboard className="h-4 w-4" />
              </div>
              <div className="hidden min-w-0 md:block">
                <p className="truncate font-display text-sm uppercase">Solaris Operations</p>
                <p className="truncate text-[9px] font-bold uppercase tracking-[0.17em] text-muted-foreground">Unified organizer workspace</p>
              </div>
            </Link>

            <div className="min-w-0 flex-1 overflow-x-auto">
              <AdminSelectors />
            </div>

            <AdminCommandPalette />

            <Link
              to="/"
              target="_blank"
              className="hidden min-h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs text-muted-foreground transition hover:bg-white/[0.07] hover:text-foreground lg:flex"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Public site
            </Link>

            {email && (
              <p className="hidden max-w-44 truncate text-[10px] text-muted-foreground xl:block">
                {email}
              </p>
            )}
          </div>

          {!pageAlreadyShowsHealth && <AdminHealthStrip />}
        </header>

        <div className="relative z-10">
          <AdminFrame>{children}</AdminFrame>
        </div>
      </div>
    </AdminContextProvider>
  );
}
