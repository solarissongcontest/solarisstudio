import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, LayoutDashboard, Menu, Settings, Trophy, type LucideIcon } from "lucide-react";
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
    { label: "Operations", href: "/admin/operations", icon: LayoutDashboard },
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
        <aside className="hidden border-r border-white/10 bg-black/[0.08] lg:block">
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
        className="fixed bottom-[4.55rem] right-3 z-50 grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-[#071023]/90 shadow-xl backdrop-blur-xl lg:hidden"
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
          <aside className="absolute inset-y-0 left-0 w-[min(88vw,330px)] overflow-y-auto border-r border-white/10 bg-[#071023]">
            <div className="border-b border-white/10 p-4">
              <p className="font-display text-sm uppercase">Solaris Operations</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Unified organizer navigation</p>
            </div>
            <div onClick={() => setMobileOpen(false)}>
              <AdminNav />
            </div>
          </aside>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#071023]/92 px-2 pt-2 backdrop-blur-2xl lg:hidden"
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
                  "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold",
                  active ? "bg-sky-200/[0.09] text-sky-100" : "text-muted-foreground",
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
