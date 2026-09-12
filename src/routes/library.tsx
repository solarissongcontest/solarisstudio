import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  Compass,
  Search,
  Sparkles,
  Trophy,
  UserRound,
  Vote,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

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

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Library — Solaris Studio" },
      {
        name: "description",
        content:
          "Search Solaris Studio destinations, official SSC rules, interpretations, rulebook history and Trust & Integrity resources.",
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
  group: "Explore" | "Insights" | "Participate" | "Tools" | "My Solaris";
  icon: LucideIcon;
  keywords: string[];
};

const LIBRARY_DESTINATIONS: LibraryDestination[] = [
  {
    to: "/editions",
    title: "Editions",
    description: "Browse every Solaris Song Contest edition.",
    group: "Explore",
    icon: Trophy,
    keywords: ["edition", "contest", "archive", "ssc"],
  },
  {
    to: "/countries",
    title: "Countries",
    description: "Browse countries, entries, participation and results.",
    group: "Explore",
    icon: Compass,
    keywords: ["country", "countries", "delegation", "entry"],
  },
  {
    to: "/shows",
    title: "Shows",
    description: "Open semi-finals, finals, line-ups and results.",
    group: "Explore",
    icon: Sparkles,
    keywords: ["show", "semi final", "final", "lineup", "line-up"],
  },
  {
    to: "/wiki",
    title: "Wiki",
    description: "Read detailed country and contest archive pages.",
    group: "Explore",
    icon: BookOpen,
    keywords: ["wiki", "history", "country page", "article"],
  },
  {
    to: "/results",
    title: "Results",
    description: "Open rankings, scorecharts and published results.",
    group: "Insights",
    icon: Trophy,
    keywords: ["result", "results", "ranking", "score", "scoreboard"],
  },
  {
    to: "/analysis",
    title: "Analysis",
    description: "Explore voting patterns and what published results show.",
    group: "Insights",
    icon: BarChart3,
    keywords: ["analysis", "statistics", "stats", "voting pattern"],
  },
  {
    to: "/relationships",
    title: "Relationships",
    description: "See which countries often vote alike.",
    group: "Insights",
    icon: BarChart3,
    keywords: ["relationships", "voting", "similarity", "countries"],
  },
  {
    to: "/records",
    title: "Records",
    description: "Browse all-time records and milestones.",
    group: "Insights",
    icon: Trophy,
    keywords: ["records", "record", "milestone", "all time"],
  },
  {
    to: "/participate",
    title: "Participate",
    description: "Start a confirmation, vote or open another participant service.",
    group: "Participate",
    icon: Vote,
    keywords: ["participate", "participant", "enter", "vote", "submission"],
  },
  {
    to: "/confirmations",
    title: "Confirmations",
    description: "Submit or edit an SSC confirmation.",
    group: "Participate",
    icon: Vote,
    keywords: ["confirmation", "confirmations", "submit", "entry"],
  },
  {
    to: "/jury-voting",
    title: "Jury voting",
    description: "Open the jury voting service.",
    group: "Participate",
    icon: Vote,
    keywords: ["jury", "jury vote", "jury voting", "points"],
  },
  {
    to: "/televoting",
    title: "Televoting",
    description: "Open the public televoting service.",
    group: "Participate",
    icon: Vote,
    keywords: ["televote", "televoting", "public vote", "vote"],
  },
  {
    to: "/tools",
    title: "All tools",
    description: "Open Solaris interactive tools and experiments.",
    group: "Tools",
    icon: Wrench,
    keywords: ["tools", "result lab", "taste dna", "compare", "archive games"],
  },
  {
    to: "/predictions",
    title: "Predictions",
    description: "Build and track a contest prediction.",
    group: "Tools",
    icon: Sparkles,
    keywords: ["prediction", "predictions", "forecast"],
  },
  {
    to: "/my-solaris",
    title: "My Solaris",
    description: "Open your personal activity and participation overview.",
    group: "My Solaris",
    icon: UserRound,
    keywords: ["me", "my solaris", "account", "profile", "dashboard"],
  },
  {
    to: "/country-hub",
    title: "Country workspace",
    description: "Open your country, entries and public-page tools.",
    group: "My Solaris",
    icon: UserRound,
    keywords: ["country hub", "workspace", "country account", "edit country"],
  },
];

const GROUP_ORDER: LibraryDestination["group"][] = ["Explore", "Insights", "Participate", "Tools", "My Solaris"];

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
  const [query, setQuery] = useState("");
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
  const hasResults = destinationResults.length > 0 || governanceResults.length > 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl pb-20">
        <PageHeader
          eyebrow="Library"
          title="Search Solaris"
          description="Find public pages, participant services, official rules, interpretations, rulebook history and Trust & Integrity help from one place."
        />

        <section className="rounded-[1.6rem] border border-white/[0.09] bg-white/[0.025] p-4 sm:p-5">
          <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/[0.1] bg-black/15 px-4 focus-within:border-primary/35 focus-within:bg-black/20">
            <Search className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              placeholder="Search countries, results, friend voting, artist reuse, appeals…"
              className="min-w-0 flex-1 border-0 !bg-transparent text-sm shadow-none outline-none placeholder:text-muted-foreground/65 focus-visible:!shadow-none"
              aria-label="Search Solaris Library"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-lg px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
              >
                Clear
              </button>
            ) : null}
          </label>
          <p className="mt-2 px-1 text-[10px] leading-4 text-muted-foreground">
            Try ordinary language such as <strong>friend voting</strong>, <strong>permission</strong>, <strong>DQ</strong>, <strong>anonymous</strong> or an exact rule number.
          </p>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,.8fr)] lg:items-start">
          <section className="rounded-[1.6rem] border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5" aria-label="Solaris destinations">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">Solaris Library</p>
                <h2 className="mt-1 text-lg font-black">{query.trim() ? "Matching destinations" : "Browse Solaris"}</h2>
              </div>
              <span className="rounded-full border border-white/[0.07] px-2 py-1 text-[9px] font-bold text-muted-foreground">
                {destinationResults.length}
              </span>
            </div>

            {destinationResults.length ? (
              <div className="space-y-5">
                {GROUP_ORDER.map((group) => {
                  const items = destinationResults.filter((destination) => destination.group === group);
                  if (!items.length) return null;
                  return (
                    <div key={group}>
                      <p className="mb-1.5 px-1 text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/70">{group}</p>
                      <div className="space-y-1">
                        {items.map((destination) => <DestinationRow key={destination.to} destination={destination} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-5 text-center text-xs text-muted-foreground">
                No ordinary Solaris destination matches “{query.trim()}”.
              </div>
            )}
          </section>

          <section className="rounded-[1.6rem] border border-sky-200/[0.08] bg-[linear-gradient(145deg,rgba(19,45,78,.18),rgba(4,15,31,.5))] p-4 sm:p-5" aria-label="Rules and Trust & Integrity">
            <div className="mb-4">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-sky-200/65">Official guidance</p>
              <h2 className="mt-1 text-lg font-black">Rules & Integrity</h2>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                Search chapters, current rules, published TSBC interpretations and rulebook releases, or open protected reporting and appeals.
              </p>
            </div>

            {ruleContext ? <GovernanceLibraryContextResults context={ruleContext} /> : null}
            <GovernanceLibraryResults
              query={query}
              interpretations={interpretations.data ?? []}
              releases={releases.data ?? []}
              limit={16}
            />
            {governanceResults.length === 0 ? <GovernanceLibraryEmptyHint query={query} /> : null}

            {interpretations.isError || releases.isError ? (
              <p className="mt-3 rounded-xl border border-amber-200/10 bg-amber-200/[0.035] px-3 py-2 text-[10px] leading-4 text-amber-50/80">
                Some published governance history is temporarily unavailable. Current rulebook and Integrity search still works.
              </p>
            ) : null}
          </section>
        </div>

        {!hasResults && query.trim() ? (
          <div className="mt-5 rounded-2xl border border-dashed border-white/[0.09] p-6 text-center">
            <p className="text-sm font-bold">Nothing in the Library matches “{query.trim()}”.</p>
            <p className="mt-1 text-xs text-muted-foreground">Try a shorter phrase, a rule number, or a related term.</p>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function DestinationRow({ destination }: { destination: LibraryDestination }) {
  const Icon = destination.icon;
  return (
    <Link
      to={destination.to as any}
      className="group flex items-start gap-3 rounded-xl border border-transparent px-3 py-3 transition-colors hover:border-white/[0.07] hover:bg-white/[0.04]"
    >
      <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.025] text-sky-100")}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-foreground">{destination.title}</span>
        <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{destination.description}</span>
      </span>
    </Link>
  );
}
