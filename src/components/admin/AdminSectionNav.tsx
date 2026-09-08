import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";

import { useEditions } from "@/lib/data";
import { cn } from "@/lib/utils";
import { useAdminContext } from "./AdminContext";

type SectionTab = {
  label: string;
  to: string;
  active: (pathname: string) => boolean;
};

type SectionDefinition = {
  label: string;
  description: string;
  tabs: SectionTab[];
};

export function AdminSectionNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;

  const section = useMemo<SectionDefinition | null>(() => {
    const slug = activeEdition?.slug;

    if (pathname.startsWith("/confirmations/admin")) {
      return {
        label: "Delegations",
        description: "Participation, submissions, rounds and delegation access",
        tabs: [
          { label: "Overview", to: "/confirmations/admin", active: (path) => path === "/confirmations/admin" || path === "/confirmations/admin/" },
          { label: "Responses", to: "/confirmations/admin/responses", active: (path) => path.startsWith("/confirmations/admin/responses") || path.startsWith("/confirmations/admin/countries") },
          { label: "Rounds", to: "/confirmations/admin/rounds", active: (path) => path.startsWith("/confirmations/admin/rounds") || path.startsWith("/confirmations/admin/editions") || path.startsWith("/confirmations/admin/sync") },
          { label: "Calendar", to: "/confirmations/admin/calendar", active: (path) => path.startsWith("/confirmations/admin/calendar") },
          { label: "Access", to: "/confirmations/admin/recovery-codes", active: (path) => path.startsWith("/confirmations/admin/recovery-codes") || path.startsWith("/confirmations/admin/settings") },
        ],
      };
    }

    if (
      pathname.startsWith("/televoting/admin") ||
      pathname.startsWith("/admin/jury/") ||
      pathname.startsWith("/admin/voting-system/") ||
      pathname.startsWith("/admin/televote/") ||
      pathname.startsWith("/admin/friend-voting") ||
      pathname.startsWith("/admin/jury-integrity")
    ) {
      return {
        label: "Voting",
        description: "Rules, juries, public voting, integrity and official results",
        tabs: [
          { label: "Overview", to: "/televoting/admin", active: (path) => path === "/televoting/admin" || path === "/televoting/admin/" },
          { label: "Rules", to: slug ? `/admin/voting-system/${slug}` : "/admin", active: (path) => path.startsWith("/admin/voting-system/") },
          { label: "Jury", to: slug ? `/admin/jury/${slug}` : "/admin", active: (path) => path.startsWith("/admin/jury/") || path.startsWith("/admin/jury-integrity") },
          { label: "Public voting", to: "/televoting/admin/rounds", active: (path) => path.startsWith("/televoting/admin/rounds") || path.startsWith("/televoting/admin/analytics") },
          { label: "Integrity", to: "/televoting/admin/integrity", active: (path) => path.startsWith("/televoting/admin/integrity") || path.startsWith("/televoting/admin/anti-abuse") || path.startsWith("/admin/friend-voting") || path.startsWith("/televoting/admin/intelligence") },
          { label: "Results", to: "/televoting/admin/results", active: (path) => path.startsWith("/televoting/admin/results") || path.startsWith("/televoting/admin/combined") || path.startsWith("/televoting/admin/backtest") || path.startsWith("/admin/televote/") },
        ],
      };
    }

    if (
      pathname.startsWith("/admin/shows/") ||
      pathname.startsWith("/admin/entries/") ||
      pathname.startsWith("/admin/lineup-sync/") ||
      pathname.startsWith("/admin/participant-status/") ||
      (slug ? pathname === `/admin/${slug}` : false)
    ) {
      return {
        label: "Contest",
        description: "Shows, entries, allocations, running order and participation",
        tabs: [
          { label: "Overview", to: slug ? `/admin/${slug}` : "/admin", active: (path) => Boolean(slug && path === `/admin/${slug}`) },
          { label: "Shows", to: slug ? `/admin/shows/${slug}` : "/admin", active: (path) => path.startsWith("/admin/shows/") },
          { label: "Entries", to: slug ? `/admin/entries/${slug}` : "/admin", active: (path) => path.startsWith("/admin/entries/") },
          { label: "Sync", to: slug ? `/admin/lineup-sync/${slug}` : "/admin", active: (path) => path.startsWith("/admin/lineup-sync/") },
          { label: "Participation", to: slug ? `/admin/participant-status/${slug}` : "/admin", active: (path) => path.startsWith("/admin/participant-status/") },
        ],
      };
    }

    if (pathname.startsWith("/admin/publication/")) {
      return {
        label: "Publish",
        description: "Control what becomes public and when",
        tabs: [
          { label: "Release controls", to: slug ? `/admin/publication/${slug}` : "/admin", active: (path) => path.startsWith("/admin/publication/") },
        ],
      };
    }

    if (pathname.startsWith("/admin/design/") || pathname.startsWith("/admin/edition-theme/")) {
      return {
        label: "Broadcast",
        description: "Design, scoreboard and live presentation",
        tabs: [
          { label: "Design & broadcast", to: slug ? `/admin/design/${slug}` : "/admin", active: (path) => path.startsWith("/admin/design/") },
          { label: "Edition theme", to: slug ? `/admin/edition-theme/${slug}` : "/admin", active: (path) => path.startsWith("/admin/edition-theme/") },
        ],
      };
    }

    if (
      pathname.startsWith("/admin/more") ||
      pathname.startsWith("/admin/country-accounts") ||
      pathname.startsWith("/admin/hod-history") ||
      pathname.startsWith("/admin/hosts") ||
      pathname.startsWith("/admin/predictions") ||
      pathname.startsWith("/admin/system") ||
      pathname.startsWith("/admin/sync-health") ||
      pathname.startsWith("/admin/beta") ||
      pathname.startsWith("/admin/admin-beta") ||
      pathname.startsWith("/admin/anniversary")
    ) {
      return {
        label: "Administration",
        description: "Accounts, history, diagnostics and low-frequency controls",
        tabs: [
          { label: "Overview", to: "/admin/more", active: (path) => path.startsWith("/admin/more") },
          { label: "Accounts", to: "/admin/country-accounts", active: (path) => path.startsWith("/admin/country-accounts") },
          { label: "HOD history", to: "/admin/hod-history", active: (path) => path.startsWith("/admin/hod-history") },
          { label: "Predictions", to: "/admin/predictions", active: (path) => path.startsWith("/admin/predictions") },
          { label: "System health", to: "/admin/sync-health", active: (path) => path.startsWith("/admin/sync-health") },
          { label: "System", to: "/admin/system", active: (path) => path.startsWith("/admin/system") || path.startsWith("/admin/hosts") || path.startsWith("/admin/beta") || path.startsWith("/admin/admin-beta") || path.startsWith("/admin/anniversary") },
        ],
      };
    }

    return null;
  }, [activeEdition?.slug, pathname]);

  if (!section) return null;

  return (
    <section className="mb-4 border-b border-white/[0.07] pb-3 sm:mb-5 sm:pb-4" aria-label={`${section.label} navigation`}>
      <div className="mb-2.5 flex min-w-0 items-baseline gap-2 px-0.5">
        <p className="shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-sky-100/85">{section.label}</p>
        <p className="hidden min-w-0 truncate text-[11px] text-muted-foreground sm:block">{section.description}</p>
      </div>
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 scroll-slim">
        {section.tabs.map((tab) => {
          const active = tab.active(pathname);
          return (
            <Link
              key={tab.label}
              to={tab.to as any}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                active
                  ? "border-sky-200/15 bg-sky-200/[0.09] text-sky-50"
                  : "border-transparent text-muted-foreground hover:border-white/[0.07] hover:bg-white/[0.035] hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
