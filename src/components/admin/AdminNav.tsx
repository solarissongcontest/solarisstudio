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

type NavSection = {
  label: string;
  description: string;
  items: NavItem[];
};

export function AdminNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;

  const sections: NavSection[] = [
    {
      label: "Operations",
      description: "What needs attention now",
      items: [
        { label: "Operations", to: "/admin/operations", icon: LayoutDashboard },
        { label: "Studio readiness", to: "/admin/control-room", icon: Gauge },
        { label: "Action Centre", to: "/admin/action-centre", icon: Bell },
      ],
    },
    {
      label: "Contest data",
      description: "Editions, countries and hosting",
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
        { label: "Country accounts", to: "/admin/country-accounts", icon: Users },
      ],
    },
    {
      label: "Engagement",
      description: "Audience tools and public testing",
      items: [
        { label: "Predictions", to: "/admin/predictions", icon: Sparkles },
        { label: "Beta feedback", to: "/admin/beta-feedback", icon: BarChart3 },
      ],
    },
    {
      label: "Confirmations",
      description: "Delegation intake and eligibility",
      items: [
        { label: "Overview", to: "/confirmations/admin", icon: ClipboardCheck, exact: true },
        { label: "Responses", to: "/confirmations/admin/responses", icon: ClipboardCheck },
        { label: "Rounds", to: "/confirmations/admin/rounds", icon: PlayCircle },
        { label: "Countries", to: "/confirmations/admin/countries", icon: Flag },
        { label: "Calendar", to: "/confirmations/admin/calendar", icon: CalendarDays },
        { label: "Recovery codes", to: "/confirmations/admin/recovery-codes", icon: KeyRound },
        { label: "Settings", to: "/confirmations/admin/settings", icon: Settings },
      ],
    },
    {
      label: "Voting",
      description: "Rounds, results and audience data",
      items: [
        { label: "Voting overview", to: "/televoting/admin", icon: Vote, exact: true },
        { label: "Rounds & entries", to: "/televoting/admin/rounds", icon: Vote },
        { label: "Results", to: "/televoting/admin/results", icon: ListChecks },
        { label: "Combined results", to: "/televoting/admin/combined", icon: Blend },
        { label: "Analytics", to: "/televoting/admin/analytics", icon: BarChart3 },
      ],
    },
    {
      label: "Integrity",
      description: "Identity, risk and traceability",
      items: [
        { label: "Intelligence", to: "/televoting/admin/intelligence", icon: BrainCircuit },
        { label: "Integrity review", to: "/televoting/admin/integrity", icon: ShieldAlert },
        { label: "HOD history", to: "/admin/hod-history", icon: Users },
        { label: "Sync health", to: "/admin/sync-health", icon: Gauge },
        { label: "Audit log", to: "/televoting/admin/audit-log", icon: History },
      ],
    },
    {
      label: "System",
      description: "Platform-wide configuration",
      items: [{ label: "Deadlines & audit", to: "/admin/system", icon: Settings }],
    },
  ];

  return (
    <nav className="p-3" aria-label="Organizer navigation">
      {sections.map((section) => (
        <section
          key={section.label}
          className="mb-6 last:mb-0"
          aria-labelledby={`admin-nav-${section.label.toLowerCase().replaceAll(" ", "-")}`}
        >
          <div className="mb-2 px-2">
            <p
              id={`admin-nav-${section.label.toLowerCase().replaceAll(" ", "-")}`}
              className="text-[9px] font-black uppercase tracking-[0.18em] text-foreground/72"
            >
              {section.label}
            </p>
            <p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground/60">
              {section.description}
            </p>
          </div>

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
                    "group flex min-h-11 items-center gap-3 rounded-xl border px-2.5 text-xs font-semibold transition-colors",
                    active
                      ? "border-sky-200/12 bg-sky-200/[0.09] text-sky-100"
                      : "border-transparent text-muted-foreground hover:border-white/8 hover:bg-white/[0.035] hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition-colors",
                      active
                        ? "border-sky-200/10 bg-sky-200/[0.08] text-sky-100"
                        : "border-white/[0.06] bg-white/[0.025] text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}
