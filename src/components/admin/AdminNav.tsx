import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  Flag,
  Gauge,
  Settings,
  Sparkles,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useEditions } from "@/lib/data";
import { cn } from "@/lib/utils";
import { useAdminContext } from "./AdminContext";

type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  exact?: boolean;
};

export function AdminNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort(
      (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
    )[0] ??
    null;

  const sections: Array<{ label: string; items: NavItem[] }> = [
    {
      label: "Overview",
      items: [
        { label: "Control Room", to: "/admin/control-room", icon: Gauge },
        { label: "Action Centre", to: "/admin/action-centre", icon: Bell },
      ],
    },
    {
      label: "Contest",
      items: [
        { label: "Manage editions", to: "/admin", icon: Trophy, exact: true },
        ...(activeEdition
          ? [
              {
                label: "Current edition",
                to: `/admin/${activeEdition.slug}`,
                icon: Trophy,
              },
            ]
          : []),
        { label: "Hosting", to: "/admin/hosts", icon: Flag },
      ],
    },
    {
      label: "Engagement",
      items: [
        { label: "Predictions", to: "/admin/predictions", icon: Sparkles },
        { label: "Beta feedback", to: "/admin/beta-feedback", icon: BarChart3 },
      ],
    },
    {
      label: "Terra Solaris",
      items: [
        { label: "Country accounts", to: "/admin/country-accounts", icon: Users },
      ],
    },
    {
      label: "System",
      items: [
        { label: "Deadlines & audit", to: "/admin/system", icon: Settings },
      ],
    },
  ];

  return (
    <nav className="p-3" aria-label="Organizer navigation">
      {sections.map((section) => (
        <div key={section.label} className="mb-5 last:mb-0">
          <p className="mb-1.5 px-2 text-[9px] font-black uppercase tracking-[0.17em] text-muted-foreground/65">
            {section.label}
          </p>

          <div className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = item.exact
                ? pathname === item.to || pathname === `${item.to}/`
                : pathname === item.to || pathname.startsWith(`${item.to}/`);

              return (
                <Link
                  key={item.to}
                  to={item.to as any}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 items-center gap-3 rounded-lg px-2.5 text-xs font-semibold transition-colors",
                    active
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-surface hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
