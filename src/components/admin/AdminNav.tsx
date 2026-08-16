import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  Blend,
  BrainCircuit,
  CalendarDays,
  ClipboardCheck,
  Flag,
  Gauge,
  History,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  PlayCircle,
  Settings,
  ShieldAlert,
  Sparkles,
  Trophy,
  Users,
  Vote,
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
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;

  const sections: Array<{ label: string; items: NavItem[] }> = [
    {
      label: "Operations",
      items: [
        { label: "All systems", to: "/admin/operations", icon: LayoutDashboard },
        { label: "Studio readiness", to: "/admin/control-room", icon: Gauge },
        { label: "Action Centre", to: "/admin/action-centre", icon: Bell },
      ],
    },
    {
      label: "Solaris Studio",
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
        { label: "Predictions", to: "/admin/predictions", icon: Sparkles },
        { label: "Country accounts", to: "/admin/country-accounts", icon: Users },
      ],
    },
    {
      label: "Confirmations",
      items: [
        { label: "Overview", to: "/confirmations/admin", icon: ClipboardCheck, exact: true },
        { label: "Responses", to: "/confirmations/admin/responses", icon: ClipboardCheck },
        { label: "Rounds", to: "/confirmations/admin/rounds", icon: PlayCircle },
        { label: "Editions", to: "/confirmations/admin/editions", icon: Trophy },
        { label: "Countries", to: "/confirmations/admin/countries", icon: Flag },
        { label: "Calendar", to: "/confirmations/admin/calendar", icon: CalendarDays },
        { label: "Recovery codes", to: "/confirmations/admin/recovery-codes", icon: KeyRound },
        { label: "Settings", to: "/confirmations/admin/settings", icon: Settings },
      ],
    },
    {
      label: "Televoting",
      items: [
        { label: "Overview", to: "/televoting/admin", icon: Vote, exact: true },
        { label: "Rounds & entries", to: "/televoting/admin/rounds", icon: Vote },
        { label: "Editions", to: "/televoting/admin/editions", icon: Trophy },
        { label: "Results", to: "/televoting/admin/results", icon: ListChecks },
        { label: "Combined results", to: "/televoting/admin/combined", icon: Blend },
        { label: "Analytics", to: "/televoting/admin/analytics", icon: BarChart3 },
        { label: "Intelligence", to: "/televoting/admin/intelligence", icon: BrainCircuit },
        { label: "Integrity", to: "/televoting/admin/integrity", icon: ShieldAlert },
        { label: "Audit log", to: "/televoting/admin/audit-log", icon: History },
      ],
    },
    {
      label: "System",
      items: [{ label: "Deadlines & audit", to: "/admin/system", icon: Settings }],
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
                    "flex min-h-10 items-center gap-3 rounded-xl px-2.5 text-xs font-semibold transition-all",
                    active
                      ? "border border-sky-200/10 bg-sky-200/[0.09] text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,.08)]"
                      : "border border-transparent text-muted-foreground hover:border-white/10 hover:bg-white/[0.045] hover:text-foreground",
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
