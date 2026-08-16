import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Blend,
  BrainCircuit,
  ClipboardCheck,
  ExternalLink,
  Flag,
  Gauge,
  History,
  LayoutDashboard,
  ListChecks,
  PlayCircle,
  Settings,
  ShieldAlert,
  Trophy,
  UserCog,
  Vote,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Item = { label: string; to: string; icon: typeof Gauge };
type Section = { label: string; items: Item[] };

const sections: Section[] = [
  {
    label: "Solaris Operations",
    items: [
      { label: "All systems", to: "/admin/operations", icon: LayoutDashboard },
      { label: "Studio readiness", to: "/admin/control-room", icon: Gauge },
    ],
  },
  {
    label: "Confirmations",
    items: [
      { label: "Overview", to: "/confirmations/admin", icon: ClipboardCheck },
      { label: "Responses", to: "/confirmations/admin/responses", icon: ClipboardCheck },
      { label: "Rounds", to: "/confirmations/admin/rounds", icon: PlayCircle },
      { label: "Editions", to: "/confirmations/admin/editions", icon: Trophy },
      { label: "Countries", to: "/confirmations/admin/countries", icon: Flag },
      { label: "Calendar", to: "/confirmations/admin/calendar", icon: History },
      { label: "Settings", to: "/confirmations/admin/settings", icon: Settings },
    ],
  },
  {
    label: "Televoting",
    items: [
      { label: "Overview", to: "/televoting/admin", icon: Vote },
      { label: "Rounds & entries", to: "/televoting/admin/rounds", icon: Vote },
      { label: "Editions", to: "/televoting/admin/editions", icon: Trophy },
      { label: "Results", to: "/televoting/admin/results", icon: ListChecks },
      { label: "Combined results", to: "/televoting/admin/combined", icon: Blend },
      { label: "Analytics", to: "/televoting/admin/analytics", icon: BarChart3 },
      { label: "Intelligence", to: "/televoting/admin/intelligence", icon: BrainCircuit },
      { label: "Integrity", to: "/televoting/admin/integrity", icon: ShieldAlert },
      { label: "Admin accounts", to: "/televoting/admin/accounts", icon: UserCog },
      { label: "Audit log", to: "/televoting/admin/audit-log", icon: History },
    ],
  },
];

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav className="p-3" aria-label="Solaris organizer navigation">
      {sections.map((section) => (
        <div key={section.label} className="mb-5 last:mb-0">
          <p className="mb-1.5 px-2 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">
            {section.label}
          </p>
          <div className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <Link
                  key={item.to}
                  to={item.to as any}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 items-center gap-3 rounded-xl border px-2.5 text-xs font-semibold transition-all",
                    active
                      ? "border-sky-200/10 bg-sky-200/[0.09] text-sky-100"
                      : "border-transparent text-muted-foreground hover:border-white/10 hover:bg-white/[0.045] hover:text-foreground",
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

export function ServiceAdminShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const product = pathname.startsWith("/confirmations/admin") ? "Confirmations" : "Televoting";

  return (
    <div className="admin-control-room relative min-h-screen overflow-x-clip bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 8% 8%, rgba(84,160,255,.13), transparent 31%), radial-gradient(circle at 92% 28%, rgba(255,120,210,.08), transparent 30%), linear-gradient(rgba(4,9,29,.36), rgba(4,9,29,.68))",
        }}
      />

      <header className="sticky top-0 z-[80] border-b border-white/10 bg-[#071023]/75 backdrop-blur-2xl">
        <div className="relative flex min-h-16 items-center gap-3 px-3 sm:px-5">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.045] lg:hidden"
            aria-label="Open organizer navigation"
          >
            ☰
          </button>

          <Link to="/admin/operations" className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sky-200/10 bg-sky-200/[0.08] text-sky-100">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-sm uppercase">Solaris Operations</p>
              <p className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{product} workspace</p>
            </div>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/participate"
              target="_blank"
              className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-muted-foreground hover:text-foreground sm:flex"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Public portal
            </Link>
            <Link
              to="/admin/operations"
              className="rounded-xl border border-sky-200/10 bg-sky-200/[0.08] px-3 py-2 text-xs font-semibold text-sky-100"
            >
              All systems
            </Link>
          </div>
        </div>
      </header>

      <div className="relative z-10 lg:grid lg:grid-cols-[238px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-4rem)] border-r border-white/10 bg-black/[0.08] lg:block">
          <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <Navigation />
          </div>
        </aside>

        <main className="min-w-0 px-3 py-4 pb-24 sm:px-5 sm:py-6 lg:px-7 lg:py-7">
          {children}
        </main>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[130] lg:hidden">
          <button
            type="button"
            aria-label="Close organizer navigation"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[min(88vw,330px)] overflow-y-auto border-r border-white/10 bg-[#071023] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div>
                <p className="font-display text-sm uppercase">Solaris Operations</p>
                <p className="mt-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Unified admin</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04]"
                aria-label="Close organizer navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Navigation onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
