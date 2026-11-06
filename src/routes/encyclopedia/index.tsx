import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Check, Search, SlidersHorizontal, X } from "lucide-react";
import { useV3DirectoryPresentation, type V3DirectoryPresentation } from "@/lib/v3-directory-presentation";
import "@/styles/v3-directory-family.css";
import "@/styles/v3-reference-directory.css";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { ArchiveDataLoading } from "@/components/ArchiveDataState";
import { supabase } from "@/integrations/supabase/client";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";

export const Route = createFileRoute("/encyclopedia/")({
  validateSearch: (search: Record<string, unknown>) => ({
    // Backward-compatible search hint only. This must not become Artist identity.
    artist: typeof search.artist === "string" ? search.artist : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Reference — Solaris Studio" },
      {
        name: "description",
        content:
          "Solaris Reference: publication-safe contest history across editions, countries, entries and shows.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://studio.solaris-song-contest.workers.dev/encyclopedia",
      },
    ],
  }),
  component: ReferencePage,
});

type ResultKind = "edition" | "country" | "entry" | "show";
type Kind = "all" | ResultKind;
type ReferenceItem = {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle: string;
  href: string;
};
type Coverage = {
  countries: number;
  entries: number;
  shows: number;
  stories: number;
};

const KIND_LABELS: Record<Kind, string> = {
  all: "All",
  edition: "Editions",
  country: "Countries",
  entry: "Entries",
  show: "Shows",
};
const RESULT_LABELS: Record<ResultKind, string> = {
  edition: "Edition",
  country: "Country",
  entry: "Entry",
  show: "Show",
};
const KINDS = Object.keys(KIND_LABELS) as Kind[];
const REFERENCE_SEARCH_DELAY_MS = 300;
const MAX_REFERENCE_QUERY_LENGTH = 120;
const RESULT_KINDS = new Set<ResultKind>([
  "edition",
  "country",
  "entry",
  "show",
]);
const BROWSE_DESTINATIONS = [
  { kind: "edition", label: "Editions", description: "Browse every published Solaris edition.", href: "/editions" },
  { kind: "country", label: "Countries", description: "Open canonical country profiles and participation history.", href: "/countries" },
  { kind: "show", label: "Shows", description: "Find published shows and their edition context.", href: "/shows" },
  { kind: "story", label: "Stories", description: "Continue into published Solaris editorial history.", href: "/stories" },
  { kind: "rule", label: "Official rules", description: "Read the current published Rules and guidance.", href: "/rules" },
] as const;

function parseSearchRows(value: unknown): ReferenceItem[] {
  if (!Array.isArray(value)) throw new Error("Invalid public search projection");

  const seen = new Set<string>();
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid public search row");
    }

    const row = raw as Record<string, unknown>;
    // The published search RPC still emits legacy Wiki country hits. Route those
    // through the canonical Country destination instead of silently dropping them.
    const legacyWiki = row.result_type === "wiki";
    if (!legacyWiki && !RESULT_KINDS.has(row.result_type as ResultKind)) return [];

    const id = typeof row.result_id === "string" ? row.result_id.trim() : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const href = typeof row.href === "string" ? row.href.trim() : "";

    if (!id || !title || !href.startsWith("/") || href.startsWith("//") ||
      (legacyWiki && !/^\/wiki\/[A-Za-z0-9_-]+$/.test(href))) {
      throw new Error("Invalid public Reference result");
    }
    const canonicalHref = legacyWiki ? href.replace(/^\/wiki\//, "/countries/") : href;
    const kind = legacyWiki ? "country" : row.result_type as ResultKind;
    // Country and legacy Wiki records point to the same canonical public entity.
    const dedupeKey = kind === "country" ? `country:${canonicalHref}` : id;
    if (seen.has(dedupeKey)) return [];
    seen.add(dedupeKey);

    return [
      {
        id,
        kind,
        title: legacyWiki && title.endsWith(" in the Wiki") ? title.slice(0, -" in the Wiki".length) : title,
        subtitle: typeof row.subtitle === "string" ? row.subtitle : "",
        href: canonicalHref,
      },
    ];
  });
}

function parseCoverage(value: unknown): Coverage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid public archive coverage");
  }

  const row = value as Record<string, unknown>;
  for (const key of ["countries", "entries", "shows", "stories"] as const) {
    const count = row[key];
    if (
      typeof count !== "number" ||
      !Number.isSafeInteger(count) ||
      count < 0
    ) {
      throw new Error("Invalid public archive coverage");
    }
  }
  return row as Coverage;
}

function ReferencePage() {
  const { platformResolved } = useSolarisApp();
  const presentation = useV3DirectoryPresentation();
  const search = Route.useSearch();
  const [query, setQuery] = useState(search.artist ?? "");
  const [kind, setKind] = useState<Kind>("all");
  const normalizedQuery = query.trim();
  const [settledQuery, setSettledQuery] = useState(normalizedQuery);
  useEffect(() => {
    if (settledQuery === normalizedQuery) return;
    const timeoutId = window.setTimeout(() => setSettledQuery(normalizedQuery), REFERENCE_SEARCH_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [normalizedQuery, settledQuery]);
  const searchPending = settledQuery !== normalizedQuery;

  const feature = useQuery({
    queryKey: ["studio2-feature", "public_encyclopedia"],
    queryFn: () => isStudio2FeatureEnabled("public_encyclopedia"),
    staleTime: 30_000,
  });

  const coverageQuery = useQuery({
    queryKey: ["v3", "reference", "coverage"],
    enabled: feature.data === true,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "v3_public_explore_counts",
      );
      if (error) throw error;
      return parseCoverage(data);
    },
  });

  const referenceQuery = useQuery({
    queryKey: [
      "v3",
      "reference",
      "search",
      settledQuery.toLocaleLowerCase(),
    ],
    enabled: feature.data === true && normalizedQuery.length >= 2 &&
      normalizedQuery.length <= MAX_REFERENCE_QUERY_LENGTH && !searchPending,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "solaris_public_search",
        {
          search_query: settledQuery,
          result_limit: 50,
        },
      );
      if (error) throw error;
      return parseSearchRows(data);
    },
  });

  // Topic choices must also filter the idle browse index, not only typed search hits.
  // Entries have no independent public directory yet: users search the published projection.
  const browseDestinations = BROWSE_DESTINATIONS.filter((destination) =>
    kind === "all" || destination.kind === kind,
  );

  const filtered = useMemo(
    () =>
      kind === "all"
        ? referenceQuery.data ?? []
        : (referenceQuery.data ?? []).filter((item) => item.kind === kind),
    [kind, referenceQuery.data],
  );

  if (!platformResolved) {
    return <div data-directory-boot="" role="status" aria-label="Opening Reference" className="min-h-20" />;
  }

  if (feature.isLoading) {
    return (
      <AppShell>
        <div className="v3-directory-family v3-reference-directory" data-directory-experience={presentation}>
          <ReferenceDirectoryHeader presentation={presentation} />
          <ArchiveDataLoading label="Opening the public reference…" />
        </div>
      </AppShell>
    );
  }

  if (feature.isError) {
    return (
      <AppShell>
        <div className="v3-directory-family v3-reference-directory" data-directory-experience={presentation}>
          <ReferenceDirectoryHeader presentation={presentation} />
          <Panel title="Reference availability could not be checked">
            <p className="text-sm text-muted-foreground">
              Solaris could not verify whether the public Reference is enabled. No unpublished articles are shown.
            </p>
            <button type="button" onClick={() => void feature.refetch()}
              className="mt-3 min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold">
              Retry availability check
            </button>
          </Panel>
        </div>
      </AppShell>
    );
  }

  if (feature.data !== true) {
    return (
      <AppShell>
        <div className="v3-directory-family v3-reference-directory" data-directory-experience={presentation}>
          <ReferenceDirectoryHeader presentation={presentation} />
        <Panel title="Reference is not enabled yet">
          <p className="text-sm text-muted-foreground">
            The product is installed but its rollout flag is still off while production
            verification finishes.
          </p>
        </Panel>
        </div>
      </AppShell>
    );
  }

  const coverage = coverageQuery.data;
  const coverageValue = (value: number | undefined) =>
    coverageQuery.isLoading
      ? "…"
      : coverageQuery.isError || value === undefined
        ? "—"
        : value;

  return (
    <AppShell>
      <div className="v3-directory-family v3-reference-directory" data-directory-experience={presentation}>
        <ReferenceDirectoryHeader presentation={presentation} />
        <div className="v3-directory-workspace">
          {presentation === "desktop-web" ? (
            <aside className="v3-directory-desktop-rail" aria-label="Filter Reference">
              <h2>Reference topics</h2>
              {KINDS.map((value) => (
                <button key={value} type="button" aria-pressed={kind === value}
                  onClick={() => setKind(value)}>
                  <span>{KIND_LABELS[value]}</span>
                </button>
              ))}
            </aside>
          ) : null}
          <div className="v3-directory-results">
      <Panel
        title="Archive coverage"
        description="Small server-owned aggregates describe the public archive without downloading it into this page."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile
            label="Countries"
            value={coverageValue(coverage?.countries)}
          />
          <StatTile
            label="Published entries"
            value={coverageValue(coverage?.entries)}
          />
          <StatTile label="Shows" value={coverageValue(coverage?.shows)} />
          <StatTile label="Stories" value={coverageValue(coverage?.stories)} />
        </div>
        {coverageQuery.isError ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <p>Archive totals are temporarily unavailable. Search and reference links still work.</p>
            <button type="button" onClick={() => void coverageQuery.refetch()}
              className="min-h-11 rounded-xl border border-border px-3 font-semibold text-foreground">
              Retry archive totals
            </button>
          </div>
        ) : null}
      </Panel>

      <section className="mt-5 rounded-2xl border border-border bg-surface/60 p-3 sm:p-4">
        {presentation === "installed-app" ? (
          <SolarisSearchField value={query} onChange={setQuery}
            label="Search Reference" placeholder="Search published Solaris history…" />
        ) : (
          <div className="v3-directory-search" role="search">
            <Search size={18} aria-hidden="true" />
            <input type="search" aria-label="Search Reference"
              value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Search published Solaris history" autoComplete="off" />
            {query ? (
              <button type="button" className="v3-directory-search-clear"
                aria-label="Clear search" onClick={() => setQuery("")}>
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        )}

        {presentation === "installed-app" ? (
          <Sheet>
            <SheetTrigger asChild>
              <button type="button" className="v3-directory-sheet-trigger mt-3" aria-label="Filter Reference by topic">
                <SlidersHorizontal size={18} aria-hidden="true" />
                <span>{KIND_LABELS[kind]}</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" aria-label="Filter Reference by topic" className="max-h-[80dvh] overflow-y-auto">
              <h2 className="mb-3 text-lg font-bold">Reference topics</h2>
              <div className="v3-directory-sheet-options">
                {KINDS.map((value) => (
                  <SheetClose key={value} asChild>
                    <button type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>
                      <span className="inline-flex items-center gap-2">
                        {kind === value ? <Check size={16} aria-hidden="true" /> : null}
                        {KIND_LABELS[value]}
                      </span>
                    </button>
                  </SheetClose>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        ) : presentation === "mobile-web" ? (
          <label className="v3-directory-area-select mt-3 block">
            <span className="sr-only">Filter Reference</span>
            <select aria-label="Filter Reference" value={kind}
              onChange={(event) => setKind(event.target.value as Kind)}>
              {KINDS.map((value) => <option key={value} value={value}>{KIND_LABELS[value]}</option>)}
            </select>
          </label>
        ) : null}
      </section>

      {normalizedQuery.length === 0 ? (
        <section className="mt-5" aria-labelledby="reference-browse-heading">
          <div className="mb-3 border-b border-border/60 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
              Reference index
            </p>
            <h2
              id="reference-browse-heading"
              className="mt-1 font-sans text-xl font-bold"
              aria-live="polite"
            >
              {kind === "all" ? "Browse published Solaris" : `Browse ${KIND_LABELS[kind].toLowerCase()}`}
            </h2>
          </div>
          <div className={presentation === "mobile-web" ? "v3-directory-mobile-list" : presentation === "installed-app" ? "solaris-app-grouped-list" : "v3-directory-desktop-grid"}>
            {browseDestinations.map(({ label, description, href }) => (
              <Link
                key={href}
                to={href as any}
                className={presentation === "mobile-web" ? "v3-directory-mobile-row" : presentation === "installed-app" ? "solaris-app-list-row" : "v3-directory-desktop-card"}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </div>
                <span aria-hidden className="text-primary">
                  →
                </span>
              </Link>
            ))}
          </div>
          {browseDestinations.length === 0 ? (
            <p className="mt-3 py-5 text-sm text-muted-foreground" role="status">
              No standalone index exists for this topic. Search above to find published entries, songs and artists in their edition context.
            </p>
          ) : null}
        </section>
      ) : normalizedQuery.length < 2 ? (
        <div className="mt-5 rounded-2xl border border-border bg-surface p-7 text-center text-sm text-muted-foreground">
          Type at least two characters to search the published reference.
        </div>
      ) : normalizedQuery.length > MAX_REFERENCE_QUERY_LENGTH ? (
        <div className="mt-5 rounded-2xl border border-border bg-surface p-7 text-center text-sm text-muted-foreground" role="status">
          Search terms must be no longer than {MAX_REFERENCE_QUERY_LENGTH} characters.
        </div>
      ) : searchPending || referenceQuery.isLoading ? (
        <div className="mt-5 rounded-2xl border border-border bg-surface p-7 text-center text-sm text-muted-foreground">
          Searching the published reference…
        </div>
      ) : referenceQuery.isError ? (
        <Panel title="Reference search is temporarily unavailable">
          <p className="text-sm text-muted-foreground">
            Solaris could not load the bounded public search projection. No private archive data
            is used as a fallback.
          </p>
          <button
            type="button"
            onClick={() => void referenceQuery.refetch()}
            className="mt-3 min-h-10 rounded-xl border border-border bg-background px-3 text-sm font-semibold"
          >
            Try again
          </button>
        </Panel>
      ) : (
        <section className="mt-5" aria-live="polite">
          <div className="mb-3 flex items-end justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                Reference search
              </p>
              <h2 className="mt-1 font-display text-xl font-bold">
                Published matches
              </h2>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {filtered.length} shown · bounded search
            </span>
          </div>

          <div className={presentation === "mobile-web" ? "v3-directory-mobile-list" : presentation === "installed-app" ? "solaris-app-grouped-list" : "v3-directory-desktop-grid"}>
            {filtered.map((item) => (
              <Link
                key={item.id}
                to={item.href as any}
                className={presentation === "mobile-web" ? "v3-directory-mobile-row" : presentation === "installed-app" ? "solaris-app-list-row" : "v3-directory-desktop-card"}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
                    {RESULT_LABELS[item.kind]}
                  </p>
                  <p className="mt-1 line-clamp-2 break-words text-sm font-semibold">
                    {item.title}
                  </p>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                    {item.subtitle || "Published Solaris record"}
                  </p>
                </div>
                <span aria-hidden className="text-primary">
                  →
                </span>
              </Link>
            ))}
          </div>

          {!filtered.length ? (
            <div className="mt-3 rounded-2xl border border-border bg-surface p-7 text-center text-sm text-muted-foreground">
              No published record matches that search and filter.
            </div>
          ) : null}
        </section>
      )}

      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        Historical gaps are left as gaps. Draft entries, organizer notes, private ballots and
        unpublished results are never indexed here. Artist and song labels remain attached to
        their published Entry until Solaris has durable first-class Artist and Song identity.
      </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ReferenceDirectoryHeader({ presentation }: { presentation: V3DirectoryPresentation }) {
  if (presentation === "mobile-web") {
    return (
      <header className="v3-directory-mobile-header" data-directory-mobile-header="">
                <p className="v3-directory-eyebrow">SOLARIS KNOWLEDGE</p>
        <h1>Reference</h1>
        <p>Search published records and browse connected public history.</p>
      </header>
    );
  }
  if (presentation === "installed-app") {
    return (
      <header className="v3-directory-app-heading">
        <p className="v3-directory-eyebrow">SOLARIS KNOWLEDGE</p>
        <h1>Reference</h1>
        <p>Find published countries, shows, entries and edition history.</p>
      </header>
    );
  }
  return (
    <PageHeader
      eyebrow="Explore Solaris"
      title="Reference"
      description="A publication-safe knowledge base across editions, countries, published entries and shows."
      actions={<Link to="/countries" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold">Browse countries →</Link>}
    />
  );
}
