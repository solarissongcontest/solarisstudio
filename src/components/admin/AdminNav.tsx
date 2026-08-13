import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Flag, Gauge, Home, RadioTower, Settings, Sparkles, Trophy, Users } from "lucide-react";

import { useEditions } from "@/lib/data";
import { cn } from "@/lib/utils";
import { useAdminContext } from "./AdminContext";

export function AdminNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const activeEdition = editions.find((edition) => edition.id === editionId) ?? editions[0] ?? null;

  const rows = [
    ["Control Room", "/admin/control-room", Gauge],
    ["Action Centre", "/admin/action-centre", Bell],
    ["Manage editions", "/admin", Home],
    ...(activeEdition ? [["Current edition", `/admin/${activeEdition.slug}`, Trophy]] : []),
    ["Status", "/admin/status", RadioTower],
    ["Hosting", "/admin/hosts", Flag],
    ["Predictions", "/admin/predictions", Sparkles],
    ["Country accounts", "/admin/country-accounts", Users],
    ["Deadlines & audit", "/admin/system", Settings],
  ] as const;

  return (
    <nav className="space-y-1 p-3 text-sm" aria-label="Organizer navigation">
      {rows.map(([label, to, Icon]) => {
        const active = to === "/admin" ? pathname === "/admin" || pathname === "/admin/" : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to as any}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-lg px-2.5 text-xs font-semibold transition-colors",
              active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-surface hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
