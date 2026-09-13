import { Link, useRouterState } from "@tanstack/react-router";
import {
  ClipboardCheck,
  Flag,
  Home,
  ListChecks,
  MailOpen,
  Palette,
  PanelsTopLeft,
  Vote,
  type LucideIcon,
} from "lucide-react";

import { NAV_TARGETS } from "@/lib/navigation-targets";
import { cn } from "@/lib/utils";

type WorkspaceItem = {
  label: string;
  description: string;
  to: string;
  icon: LucideIcon;
  active: (pathname: string) => boolean;
};

const WORKSPACE_ITEMS: WorkspaceItem[] = [
  {
    label: "Dashboard",
    description: "Current edition, history and account overview",
    to: NAV_TARGETS.mySolaris,
    icon: Home,
    active: (pathname) => pathname === NAV_TARGETS.mySolaris || pathname === `${NAV_TARGETS.mySolaris}/`,
  },
  {
    label: "Tasks",
    description: "Deadlines, blockers and delegation work",
    to: NAV_TARGETS.mySolarisTasks,
    icon: ListChecks,
    active: (pathname) => pathname.startsWith(NAV_TARGETS.mySolarisTasks),
  },
  {
    label: "Entry",
    description: "Readiness, eligibility and entry workflow",
    to: NAV_TARGETS.mySolarisEntry,
    icon: ClipboardCheck,
    active: (pathname) => pathname.startsWith(NAV_TARGETS.mySolarisEntry),
  },
  {
    label: "Voting",
    description: "Jury voting and public televoting shortcuts",
    to: "/my-solaris/voting",
    icon: Vote,
    active: (pathname) => pathname.startsWith("/my-solaris/voting"),
  },
  {
    label: "Notices",
    description: "Official organizer communications",
    to: NAV_TARGETS.mySolarisNotices,
    icon: MailOpen,
    active: (pathname) => pathname.startsWith(NAV_TARGETS.mySolarisNotices),
  },
  {
    label: "Country",
    description: "Country identity, entries and public-page controls",
    to: NAV_TARGETS.mySolarisCountry,
    icon: Flag,
    active: (pathname) => pathname.startsWith(NAV_TARGETS.mySolarisCountry),
  },
  {
    label: "Page & media",
    description: "Edit the country page and media blocks",
    to: NAV_TARGETS.mySolarisPageBuilder,
    icon: PanelsTopLeft,
    active: (pathname) => pathname.startsWith(NAV_TARGETS.mySolarisPageBuilder),
  },
  {
    label: "Appearance",
    description: "Country page colours, background and branding",
    to: NAV_TARGETS.mySolarisTheme,
    icon: Palette,
    active: (pathname) => pathname.startsWith(NAV_TARGETS.mySolarisTheme),
  },
];

/**
 * Persistent navigation for the authenticated participant workspace.
 *
 * MySolaris child routes intentionally share this one rail so entering a task
 * or country editor never swaps the user into a second, differently shaped
 * product. Legacy Country Hub routes may still exist as compatibility redirects,
 * but new participant navigation must stay in the /my-solaris family.
 */
export function MySolarisWorkspaceNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <section className="mb-5 rounded-2xl border border-border/70 bg-surface/70 p-2 sm:mb-6">
      <div className="flex items-center justify-between gap-3 px-2 pb-2 pt-1">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">
            MySolaris workspace
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            Your edition and country tools stay in one place.
          </p>
        </div>
      </div>

      <nav
        aria-label="MySolaris workspace"
        className="scroll-slim flex gap-1.5 overflow-x-auto pb-0.5"
      >
        {WORKSPACE_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.active(pathname);
          return (
            <Link
              key={item.to}
              to={item.to as any}
              aria-current={active ? "page" : undefined}
              title={item.description}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors",
                active
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:border-border/80 hover:bg-surface-strong hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
