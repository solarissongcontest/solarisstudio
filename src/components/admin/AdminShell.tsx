import { Link, useRouterState } from "@tanstack/react-router";
import { ExternalLink, ShieldCheck } from "lucide-react";
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

  const pageAlreadyShowsHealth =
    pathname === "/admin/control-room" || pathname === "/admin/action-centre";

  return (
    <AdminContextProvider>
      <div className="admin-control-room min-h-screen bg-background [&_.site-nav]:hidden [&_.mobile-quick-nav]:hidden [&_.app-background]:hidden [&_.app-main]:!max-w-none [&_.app-main]:!p-0">
        <header className="sticky top-0 z-[70] border-b border-border/70 bg-background/92 backdrop-blur-xl">
          <div className="flex min-h-16 items-center gap-3 px-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="hidden min-w-0 md:block">
                <p className="truncate font-display text-sm font-black">Solaris Control Room</p>
                <p className="truncate text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Organizer workspace</p>
              </div>
            </div>

            <div className="min-w-0 flex-1 overflow-x-auto">
              <AdminSelectors />
            </div>

            <AdminCommandPalette />

            <Link
              to="/"
              target="_blank"
              className="hidden min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs text-muted-foreground hover:text-foreground lg:flex"
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

        <AdminFrame>{children}</AdminFrame>
      </div>
    </AdminContextProvider>
  );
}
