import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

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
const RESULT_KINDS = new Set<ResultKind>([
  "edition",
  "country",
  "entry",
  "show",
]);
const BROWSE_DESTINATIONS = [
  ["Editions", "Browse every published Solaris edition.", "/editions"],
  [
    "Countries",
    "Open canonical country profiles and participation history.",
    "/countries",
  ],
  ["Shows", "Find published shows and their edition context.", "/shows"],
  ["Stories", "Continue into published Solaris editorial history.", "/stories"],
] as const;

function parseSearchRows(value: unknown): ReferenceItem[] {
  if (!Array.isArray(value)) throw new Error("Invalid public search projection");

  const seen = new Set<string>();
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid public search row");
    }

    const row = raw as Record<string, unknown>;
    if (!RESULT_KINDS.has(row.result_type as ResultKind)) return [];

    const id = typeof row.result_id === "string" ? row.result_id.trim() : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const href = typeof row.href === "string" ? row.href.trim() : "";

    if (!id || !title || !href.startsWith("/") || href.startsWith("//")) {
      throw new Error("Invalid public Reference result");
    }
    if (seen.has(id)) return [];
    seen.add(id);

    return [
      {
        id,
        kind: row.result_type as ResultKind,
        title,
        subtitle: typeof row.subtitle === "string" ? row.subtitle : "",
        href,
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
  const search = Route.useSearch();
  const [query, setQuery] = useState(search.artist ?? "");
  const [kind, setKind] = useState<Kind>("all");
  const normalizedQuery = query.trim();

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
      normalizedQuery.toLocaleLowerCase(),
    ],
    enabled: feature.data === true && normalizedQuery.length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "solaris_public_search",
        {
          search_query: normalizedQuery,
          result_limit: 50,
        },
      );
      if (error) throw error;
      return parseSearchRows(data);
    },
  });

  const filtered = useMemo(
    () =>
      kind === "all"
        ? referenceQuery.data ?? []
        : (referenceQuery.data ?? []).filter((item) => item.kind === kind),
    [kind, referenceQuery.data],
  );

  if (feature.isLoading) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Explore Solaris"
          title="Reference"
          description="Published Solaris history, connected."
        />
        <ArchiveDataLoading label="Opening the public reference…" />
      </AppShell>
    );
  }

  if (feature.isError || feature.data !== true) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Explore Solaris"
          title="Reference"
          description="Published Solaris history, connected."
        />
        <Panel title="Reference is not enabled yet">
          <p className="text-sm text-muted-foreground">
            The product is installed but its rollout flag is still off while production
            verification finishes.
          </p>
        </Panel>
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
      <PageHeader
        eyebrow="Explore Solaris"
        title="Reference"
        description="A publication-safe reference across editions, countries, published entries and shows."
        actions={
          <Link
            to="/countries"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
          >
            Browse countries →
          </Link>
        }
      />

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
          <p className="mt-3 text-xs text-muted-foreground">
            Archive totals are temporarily unavailable. Search and reference links still work.
          </p>
        ) : null}
      </Panel>

      <section className="mt-5 rounded-2xl border border-border bg-surface/60 p-3 sm:p-4">
        <label className="relative block">
          <span className="sr-only">Search Reference</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search published Solaris history"
            autoComplete="off"
            className="min-h-11 w-full rounded-xl border border-border bg-background/50 pl-10 pr-3 text-sm outline-none focus:border-primary/60"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Filter Reference">
          {KINDS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              aria-pressed={kind === value}
              className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${
                kind === value
                  ? "bg-primary/12 text-primary"
                  : "bg-background/45 text-muted-foreground"
              }`}
            >
              {KIND_LABELS[value]}
            </button>
          ))}
        </div>
      </section>

      {normalizedQuery.length === 0 ? (
        <section className="mt-5" aria-labelledby="reference-browse-heading">
          <div className="mb-3 border-b border-border/60 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
              Reference index
            </p>
            <h2
              id="reference-browse-heading"
              className="mt-1 font-display text-xl font-bold"
            >
              Browse published Solaris
            </h2>
          </div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {BROWSE_DESTINATIONS.map(([label, description, href]) => (
              <Link
                key={href}
                to={href as any}
                className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-primary/35"
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
        </section>
      ) : normalizedQuery.length < 2 ? (
        <div className="mt-5 rounded-2xl border border-border bg-surface p-7 text-center text-sm text-muted-foreground">
          Type at least two characters to search the published reference.
        </div>
      ) : referenceQuery.isLoading ? (
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
              {filtered.length}
            </span>
          </div>

          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => (
              <Link
                key={item.id}
                to={item.href as any}
                className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-primary/35"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
                    {RESULT_LABELS[item.kind]}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
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
    </AppShell>
  );
}
