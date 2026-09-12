import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  Compass,
  FileClock,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  Vote,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import {
  GovernanceLibraryContextResults,
  GovernanceLibraryEmptyHint,
  GovernanceLibraryResults,
} from "@/components/library/GovernanceLibraryResults";
import { searchGovernanceLibrary } from "@/lib/public-library-governance";
import { getRuleContext, sanitizeRuleContextPath } from "@/lib/rule-context";
import { getPublicRuleInterpretations } from "@/lib/rule-interpretations";
import { useRulebookReleaseHistory } from "@/lib/rules-governance";
import { cn } from "@/lib/utils";

type LibrarySearch = { from?: string };
type LibraryGroup = "Explore" | "Rules & help" | "Insights" | "Participate" | "Tools" | "My Solaris";

const RULE_CONTEXT_STORAGE_KEY = "solaris:rule-context-path";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Library — Solaris Studio" },
      {
        name: "description",
        content: "Search Solaris pages, official rules, interpretations and Trust & Integrity help.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    from: sanitizeRuleContextPath(search.from),
  }),
  component: LibraryPage,
});

type LibraryDestination = {
  to: string;
  title: string;
  description: string;
  group: LibraryGroup;
  icon: LucideIcon;
  keywords: string[];
};

const LIBRARY_DESTINATIONS: LibraryDestination[] = [
  { to: "/editions", title: "Editions", description: "Contest archive", group: "Explore", icon: Trophy, keywords: ["edition", "contest", "archive", "ssc"] },
  { to: "/countries", title: "Countries", description: "Countries, entries and results", group: "Explore", icon: Compass, keywords: ["country", "countries", "delegation", "entry"] },
  { to: "/shows", title: "Shows", description: "Semi-finals, finals and line-ups", group: "Explore", icon: Sparkles, keywords: ["show", "semi final", "final", "lineup", "line-up"] },
  { to: "/wiki", title: "Wiki", description: "Country and contest pages", group: "Explore", icon: BookOpen, keywords: ["wiki", "history", "country page", "article"] },

  { to: "/rules", title: "Rulebook", description: "Official SSC regulations", group: "Rules & help", icon: BookOpen, keywords: ["rules", "rulebook", "regulations", "official rules"] },
  { to: "/rules/interpretations", title: "Interpretations", description: "Official rule clarifications", group: "Rules & help", icon: BadgeCheck, keywords: ["interpretation", "clarification", "rule guidance"] },
  { to: "/rules/changes", title: "Rulebook history", description: "Published rule changes", group: "Rules & help", icon: FileClock, keywords: ["rule changes", "history", "release", "governance"] },
  { to: "/integrity", title: "Trust & Integrity", description: "Reports, cases and appeals", group: "Rules & help", icon: ShieldCheck, keywords: ["integrity", "report", "anonymous", "appeal", "case", "help"] },

  { to: "/results", title: "Results", description: "Rankings and scorecharts", group: "Insights", icon: Trophy, keywords: ["result", "results", "ranking", "score", "scoreboard"] },
  { to: "/analysis", title: "Analysis", description: "Voting patterns and statistics", group: "Insights", icon: BarChart3, keywords: ["analysis", "statistics", "stats", "voting pattern"] },
  { to: "/relationships", title: "Relationships", description: "Voting similarities", group: "Insights", icon: BarChart3, keywords: ["relationships", "voting", "similarity", "countries"] },
  { to: "/records", title: "Records", description: "All-time records and milestones", group: "Insights", icon: Trophy, keywords: ["records", "record", "milestone", "all time"] },

  { to: "/participate", title: "Participate", description: "Voting and submissions", group: "Participate", icon: Vote, keywords: ["participate", "participant", "enter", "vote", "submission"] },
  { to: "/confirmations", title: "Confirmations", description: "Submit or edit a confirmation", group: "Participate", icon: Vote, keywords: ["confirmation", "confirmations", "submit", "entry"] },
  { to: "/jury-voting", title: "Jury voting", description: "Submit jury points", group: "Participate", icon: Vote, keywords: ["jury", "jury vote", "jury voting", "points"] },
  { to: "/televoting", title: "Televoting", description: "Public voting", group: "Participate", icon: Vote, keywords: ["televote", "televoting", "public vote", "vote"] },

  { to: "/tools", title: "Tools", description: "Interactive Solaris tools", group: "Tools", icon: Wrench, keywords: ["tools", "result lab", "taste dna", "compare", "archive games"] },
  { to: "/predictions", title: "Predictions", description: "Build and track predictions", group: "Tools", icon: Sparkles, keywords: ["prediction", "predictions", "forecast"] },

  { to: "/my-solaris", title: "MySolaris", description: "Personal activity and participation", group: "My Solaris", icon: UserRound, keywords: ["me", "my solaris", "account", "profile", "dashboard"] },
  { to: "/country-hub", title: "Country workspace", description: "Country, entries and page tools", group: "My Solaris", icon: UserRound, keywords: ["country hub", "workspace", "country account", "edit country"] },
];

const GROUP_ORDER: LibraryGroup[] = ["Explore", "Rules & help", "Insights", "Participate", "Tools", "My Solaris"];

function normalize(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function destinationMatches(destination: LibraryDestination, query: string) {
  const needle = normalize(query);
  if (!needle) return true;
  const searchable = normalize([destination.title, destination.description, destination.group, ...destination.keywords].join(" "));
  return needle.split(" ").every((term) => searchable.includes(term));
}

function LibraryPage() {
  const { from } = Route.useSearch();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (from) return;
    const stored = sanitizeRuleContextPath(window.sessionStorage.getItem(RULE_CONTEXT_STORAGE_KEY));
    if (!stored) return;

    const timer = window.setTimeout(() => {
      void navigate({ to: "/library", search: { from: stored }, replace: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [from, navigate]);

  const ruleContext = useMemo(() => (from ? getRuleContext(from) : null), [from]);
  const interpretations = useQuery({
    queryKey: ["public-rule-interpretations", "library"],
    queryFn: () => getPublicRuleInterpretations(null),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const releases = useRulebookReleaseHistory();

  const destinationResults = useMemo(
    () => LIBRARY_DESTINATIONS.filter((destination) => destinationMatches(destination, query)),
    [query],
  );
  const governanceResults = searchGovernanceLibrary(query, interpretations.data ?? [], releases.data ?? []);
  const searching = Boolean(query.trim());
  const hasResults = destinationResults.length > 0 || governanceResults.length > 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl pb-20">
        <PageHeader
          eyebrow="Library"
          title="Library"
          description="Search Solaris pages, rules and help."
        />

        <section className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
          <label className="flex min-h-11 items-center gap-2.5 rounded-xl border border-white/[0.09] bg-black/10 px-3 focus-within:border-sky-200/25">
            <Search className="size-4 shrink-0 text-sky-200" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              placeholder="Search Library"
              className="min-w-0 flex-1 border-0 !bg-transparent text-sm shadow-none outline-none placeholder:text-muted-foreground/60 focus-visible:!shadow-none"
              aria-label="Search Solaris Library"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} className="rounded-lg px-2 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground">
                Clear
              </button>
            ) : null}
          </label>
        </section>

        <section className="mt-4 rounded-[1.6rem] border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5" aria-label="Solaris Library">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground/65">Solaris Library</p>
              <h2 className="mt-1 text-lg font-black">{searching ? "Search results" : "Browse"}</h2>
            </div>
            <span className="text-[10px] font-bold text-muted-foreground">{destinationResults.length}</span>
          </div>

          {ruleContext ? <GovernanceLibraryContextResults context={ruleContext} /> : null}

          {destinationResults.length ? (
            <div className="space-y-5">
              {GROUP_ORDER.map((group) => {
                const items = destinationResults.filter((destination) => destination.group === group);
                if (!items.length) return null;
                return (
                  <div key={group}>
                    <p className="mb-1.5 px-1 text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/65">{group}</p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {items.map((destination) => <DestinationRow key={destination.to} destination={destination} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {searching ? (
            <div className="mt-5 border-t border-white/[0.07] pt-5">
              <GovernanceLibraryResults
                query={query}
                interpretations={interpretations.data ?? []}
                releases={releases.data ?? []}
                limit={12}
              />
              {governanceResults.length === 0 ? <GovernanceLibraryEmptyHint query={query} /> : null}
            </div>
          ) : null}

          {!hasResults && searching ? (
            <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-6 text-center">
              <p className="text-sm font-bold">No results for “{query.trim()}”</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a shorter term or a rule number.</p>
            </div>
          ) : null}

          {interpretations.isError || releases.isError ? (
            <p className="mt-4 border-t border-white/[0.07] pt-3 text-[10px] leading-4 text-muted-foreground">
              Some rule history is temporarily unavailable. Current rules and other Library pages still work.
            </p>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

function DestinationRow({ destination }: { destination: LibraryDestination }) {
  const Icon = destination.icon;
  return (
    <Link
      to={destination.to as any}
      className="group flex min-h-16 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-white/[0.07] hover:bg-white/[0.035]"
    >
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.025] text-sky-100")}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-foreground">{destination.title}</span>
        <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{destination.description}</span>
      </span>
    </Link>
  );
}
