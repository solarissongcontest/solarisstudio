import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export type LegacyPublicNavigationItem = {
  to: string;
  label: string;
  description: string;
  keywords?: string;
};

export type LegacyPublicNavigationGroup = {
  id: "explore" | "reference" | "insights" | "participate" | "tools" | "account";
  label: string;
  description: string;
  items: LegacyPublicNavigationItem[];
};

export const LEGACY_PUBLIC_NAVIGATION_GROUPS: LegacyPublicNavigationGroup[] = [
  {
    id: "explore",
    label: "Explore",
    description: "Editions, countries, shows and the public archive.",
    items: [
      nav("/", "Home", "The Solaris Studio public home page.", "start welcome"),
      nav("/explore", "Start exploring", "Browse editions, countries, shows, stories and Solaris history from one place.", "explore browse discover archive"),
      nav("/editions", "Editions", "Every Solaris Song Contest edition.", "contest archive ssc"),
      nav("/countries", "Countries", "Delegations, entries and country records.", "country delegation"),
      nav("/shows", "Shows", "Semi-finals, finals, line-ups and broadcasts.", "show semi final lineup"),
      nav("/results", "Results", "Published rankings and official results.", "score ranking scoreboard"),
      nav("/wiki", "Wiki", "Detailed country and contest articles.", "articles history"),
      nav("/stories", "Stories", "Published edition stories and archive moments.", "story storytelling moments"),
      nav("/anniversary", "Anniversary", "Champions, milestones and Solaris history.", "celebration history champions"),
    ],
  },
  {
    id: "reference",
    label: "Rules & help",
    description: "The rulebook, official guidance and Trust & Integrity.",
    items: [
      nav("/rules", "Rules", "Official SSC rules, chapters and individual regulations.", "rulebook regulations"),
      nav("/rules/interpretations", "Interpretations", "Published official rule clarifications.", "rulings clarification precedent"),
      nav("/rules/changes", "Rulebook changes", "Published versions and change history.", "release versions history governance"),
      nav("/integrity", "Trust & Integrity", "Report concerns and follow protected cases.", "report anonymous case safety"),
      nav("/integrity/appeals", "Appeals", "Appeal a decision or continue an existing appeal.", "sanction review decision"),
      nav("/integrity/preclearance", "Ask before acting", "Request a private rule pre-clearance ruling.", "preclearance advice ruling"),
      nav("/guide", "Guide", "Plain-language help for using Solaris Studio.", "help instructions how to"),
    ],
  },
  {
    id: "insights",
    label: "Insights",
    description: "Understand published results and voting patterns.",
    items: [
      nav("/analysis", "Analysis", "Result patterns and contest statistics.", "stats voting patterns"),
      nav("/pulse", "Pulse", "Recent public changes and updates.", "activity recent updates"),
      nav("/relationships", "Relationships", "Repeated voting and competitive patterns.", "similarity support countries"),
      nav("/records", "Records", "All-time records and milestones.", "record milestone all time"),
      nav("/scorecharts", "Scorecharts", "Detailed published vote breakdowns.", "votes jury televote points"),
      nav("/predictions", "Predictions", "Build and track show predictions.", "forecast predict"),
    ],
  },
  {
    id: "participate",
    label: "Participate",
    description: "Submissions, jury voting and public voting.",
    items: [
      nav("/participate", "Start here", "Choose the right participation service.", "participation enter"),
      nav("/confirmations", "Confirmations", "Submit or edit a country confirmation.", "entry response submit"),
      nav("/jury-voting", "Jury voting", "Submit the HOD jury ballot.", "jury points ballot hod"),
      nav("/televoting", "Televoting", "Vote as a public audience member.", "public vote"),
      nav("/televoting/how-to-vote", "How to vote", "Read the public voting instructions.", "televote guide rules"),
      nav("/next-in-line", "Next in Line", "Enter or follow the side competition.", "competition"),
    ],
  },
  {
    id: "tools",
    label: "Tools",
    description: "Compare, test and replay published Solaris data.",
    items: [
      nav("/tools", "All tools", "Choose an interactive Solaris tool.", "interactive"),
      nav("/compare", "Compare countries", "Place two delegations side by side.", "versus comparison"),
      nav("/result-lab", "Result Lab", "Test result scenarios without changing data.", "simulate calculator"),
      nav("/taste-dna", "Taste DNA", "Explore patterns in voting taste.", "voting profile"),
      nav("/broadcast-intelligence", "Broadcast replay", "Replay published result turning points.", "scoreboard reveal"),
      nav("/archive-games", "Archive Games", "Play with Solaris history and results.", "quiz game history"),
    ],
  },
  {
    id: "account",
    label: "MySolaris",
    description: "Your account, participation and country tools.",
    items: [
      nav("/my-solaris", "MySolaris", "Personal activity and participation.", "me account dashboard"),
    ],
  },
];

export function legacyPublicPathMatches(pathname: string, route: string) {
  return route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(route + "/");
}

export function legacyPublicGroup(id: LegacyPublicNavigationGroup["id"]) {
  return LEGACY_PUBLIC_NAVIGATION_GROUPS.find((group) => group.id === id)!;
}

export function LegacyPublicSiteSidebar({
  pathname,
  isOrganizer,
}: {
  pathname: string;
  isOrganizer: boolean;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(
    () => filterNavigation(withRoleItems(LEGACY_PUBLIC_NAVIGATION_GROUPS, isOrganizer), query),
    [isOrganizer, query],
  );

  return (
    <aside className="public-site-sidebar" aria-label="All public pages">
      <nav>
        <label className="public-site-sidebar-search">
          <Search className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Find a public page</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a page…"
            aria-label="Find a public page"
          />
        </label>

        <NavigationGroups groups={groups} pathname={pathname} compact idPrefix="legacy-sidebar" />

        {!groups.length ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">No page matches that search.</p>
        ) : null}
      </nav>
    </aside>
  );
}

export function LegacyPublicDrawerNavigation({
  pathname,
  isOrganizer,
}: {
  pathname: string;
  isOrganizer: boolean;
}) {
  return (
    <NavigationGroups
      groups={withRoleItems(LEGACY_PUBLIC_NAVIGATION_GROUPS, isOrganizer)}
      pathname={pathname}
      idPrefix="legacy-drawer"
    />
  );
}

function NavigationGroups({
  groups,
  pathname,
  compact = false,
  idPrefix,
}: {
  groups: LegacyPublicNavigationGroup[];
  pathname: string;
  compact?: boolean;
  idPrefix: string;
}) {
  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={idPrefix + "-public-nav-" + group.id}>
          <div className="px-2">
            <h2 id={idPrefix + "-public-nav-" + group.id} className="public-site-sidebar-label">
              {group.label}
            </h2>
            {!compact ? (
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground/70">{group.description}</p>
            ) : null}
          </div>
          <div className="mt-1.5 space-y-0.5">
            {group.items.map((item) => {
              const active = group.items
                .filter((candidate) => legacyPublicPathMatches(pathname, candidate.to))
                .sort((a, b) => b.to.length - a.to.length)[0]?.to === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to as any}
                  aria-current={active ? "page" : undefined}
                  title={item.description}
                  className={cn(
                    compact ? "public-site-sidebar-link" : "public-drawer-page-link",
                    active && "is-active",
                  )}
                >
                  <span>{item.label}</span>
                  {!compact ? <small>{item.description}</small> : null}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function filterNavigation(groups: LegacyPublicNavigationGroup[], query: string) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return groups;

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const value = (group.label + " " + item.label + " " + item.description + " " + (item.keywords ?? "")).toLowerCase();
        return terms.every((term) => value.includes(term));
      }),
    }))
    .filter((group) => group.items.length > 0);
}

function withRoleItems(groups: LegacyPublicNavigationGroup[], isOrganizer: boolean) {
  if (!isOrganizer) return groups;
  return groups.map((group) =>
    group.id === "account"
      ? {
          ...group,
          items: [
            ...group.items,
            nav("/admin/operations", "Organizer workspace", "Open Solaris Organizer.", "admin control operations"),
          ],
        }
      : group,
  );
}

function nav(to: string, label: string, description: string, keywords?: string): LegacyPublicNavigationItem {
  return { to, label, description, keywords };
}
