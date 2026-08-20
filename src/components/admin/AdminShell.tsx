import "@/admin.css";
import "@/admin-desktop.css";

import { Link, useRouterState } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
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

  const pageAlreadyShowsHealth = pathname === "/admin/operations";

  return (
    <AdminContextProvider>
      <div className="admin-control-room relative min-h-screen overflow-x-clip [&_.site-nav]:hidden [&_.mobile-quick-nav]:hidden [&_.app-background]:hidden [&_.app-main]:!max-w-none [&_.app-main]:!p-0">
        <header className="sticky top-0 z-[70] border-b border-white/[0.07] bg-[#06101f]/88 backdrop-blur-2xl">
          <div className="admin-topbar relative flex min-h-[4rem] items-center gap-2 px-3 sm:gap-3 sm:px-5">
            <Link to="/admin/operations" className="min-w-0 shrink-0">
              <p className="admin-brand-title text-[1.02rem] leading-none text-foreground sm:text-lg">Solaris Studio</p>
              <p className="mt-1 hidden text-[11px] font-semibold text-muted-foreground sm:block">Organizer pages</p>
            </Link>

            <div className="min-w-0 flex-1">
              <AdminSelectors />
            </div>

            <AdminCommandPalette />

            <Link
              to="/"
              target="_blank"
              className="hidden min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-xs text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground md:flex"
            >
              <ExternalLink className="size-3.5" /> Public site
            </Link>

            {email ? <p className="hidden max-w-40 truncate text-xs text-muted-foreground xl:block">{email}</p> : null}
          </div>

          {!pageAlreadyShowsHealth ? <AdminHealthStrip /> : null}
        </header>

        <div className="relative z-10">
          <AdminFrame>{children}</AdminFrame>
        </div>
      </div>
    </AdminContextProvider>
  );
}

export function AdminPage({ children }: { children: ReactNode }) {
  return <div className="admin-page-stack space-y-4 sm:space-y-5">{children}</div>;
}
