import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Gauge, Menu, Settings, Trophy, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useEditions } from "@/lib/data";
import { cn } from "@/lib/utils";
import { AdminNav } from "./AdminNav";
import { useAdminContext } from "./AdminContext";

type MobileItem = { label: string; href: string; icon: LucideIcon };

export function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const activeEdition = editions.find((edition) => edition.id === editionId) ?? editions[0] ?? null;
  const editionHref = activeEdition ? `/admin/${activeEdition.slug}` : "/admin";
  const isEditionWorkspace = editions.some((edition) => pathname === `/admin/${edition.slug}`);

  const mobileItems: MobileItem[] = [
    { label: "Dashboard", href: "/admin/control-room", icon: Gauge },
    { label: "Contest", href: editionHref, icon: Trophy },
    { label: "Actions", href: "/admin/action-centre", icon: Bell },
    { label: "System", href: "/admin/system", icon: Settings },
  ];

  return (
    <div
      className={cn(
        "min-h-[calc(100vh-4rem)]",
        !isEditionWorkspace && "lg:grid lg:grid-cols-[238px_minmax(0,1fr)]",
      )}
    >
      {!isEditionWorkspace && (
        <aside className="hidden border-r border-border/70 bg-background/40 lg:block">
          <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <AdminNav />
          </div>
        </aside>
      )}

      <main
        className={cn(
          "min-w-0 p-3 pb-24 sm:p-5 lg:pb-6",
          isEditionWorkspace ? "lg:px-7 lg:py-6" : "lg:p-6",
        )}
      >
        {children}
      </main>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-[4.55rem] right-3 z-50 grid h-11 w-11 place-items-center rounded-full border border-border bg-background shadow-xl lg:hidden"
        aria-label="Open organizer navigation"
      >
        <Menu className="h-4 w-4" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-[120] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            aria-label="Close organizer navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[min(86vw,310px)] overflow-y-auto border-r border-border bg-background">
            <div className="border-b border-border p-4">
              <p className="font-display text-sm font-black">Solaris Control Room</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Organizer navigation</p>
            </div>
            <div onClick={() => setMobileOpen(false)}>
              <AdminNav />
            </div>
          </aside>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-background/95 px-2 pt-2 backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: "max(.45rem, env(safe-area-inset-bottom))" }}
        aria-label="Organizer quick navigation"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.label}
                to={item.href as any}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-semibold",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
