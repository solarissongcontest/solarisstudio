import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import {
  ArchiveDataError,
  ArchiveDataLoading,
  archiveHasError,
  archiveIsLoading,
} from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import { editionLabel, useCountries, useEditions } from "@/lib/data";
import { useAllParticipants, useAllShows } from "@/lib/data-live";
import { buildPublicCountryArchive } from "@/lib/public-country-archive";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";

export const Route = createFileRoute("/encyclopedia/")({
  validateSearch: (search: Record<string, unknown>) => ({
    artist: typeof search.artist === "string" ? search.artist : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Encyclopedia — Solaris Studio" },
      {
        name: "description",
        content:
          "Published Solaris Song Contest history: editions, countries, entries, artists and shows.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://studio.solaris-song-contest.workers.dev/encyclopedia",
      },
    ],
  }),
  component: EncyclopediaPage,
});

type Kind = "all" | "edition" | "country" | "entry" | "artist" | "show";

type EncyclopediaItem = {
  id: string;
  kind: Exclude<Kind, "all">;
  title: string;
  subtitle: string;
  href: string;
  search: string;
  flag?: { code: string; color: string; image: string | null };
};

function EncyclopediaPage() {
  const search = Route.useSearch();
  const feature = useQuery({
    queryKey: ["studio2-feature", "public_encyclopedia"],
    queryFn: () => isStudio2FeatureEnabled("public_encyclopedia"),
    staleTime: 30_000,
  });
  const countriesQuery = useCountries();
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const participantsQuery = useAllParticipants();
  const [query, setQuery] = useState(search.artist ?? "");
  const [kind, setKind] = useState<Kind>("all");

  const publicArchive = useMemo(
    () =>
      buildPublicCountryArchive({
        editions: editionsQuery.data ?? [],
        shows: showsQuery.data ?? [],
        participants: participantsQuery.data ?? [],
        results: [],
        jury: [],
        televote: [],
      }),
    [editionsQuery.data, showsQuery.data, participantsQuery.data],
  );

  const items = useMemo<EncyclopediaItem[]>(() => {
    const countries = countriesQuery.data ?? [];
    const countryMap = new Map(countries.map((country) => [country.id, country]));
    const editionMap = new Map(
      publicArchive.editions.map((edition) => [edition.id, edition]),
    );
    const output: EncyclopediaItem[] = [];

    for (const edition of publicArchive.editions) {
      output.push({
        id: `edition:${edition.id}`,
        kind: "edition",
        title: editionLabel(edition),
        subtitle: [edition.name, edition.host_city].filter(Boolean).join(" · "),
        href: `/editions/${edition.slug}`,
        search: [edition.name, edition.edition_number, edition.year, edition.host_city]
          .filter(Boolean)
          .join(" "),
      });
    }

    for (const country of countries) {
      const hasPublicHistory = publicArchive.participants.some(
        (row) => row.country_id === country.id,
      );
      if (!hasPublicHistory) continue;
      output.push({
        id: `country:${country.id}`,
        kind: "country",
        title: country.name,
        subtitle: [country.region, country.short_code].filter(Boolean).join(" · "),
        href: `/countries/${country.short_code}`,
        search: [country.name, country.native_name, country.short_code, country.region]
          .filter(Boolean)
          .join(" "),
        flag: {
          code: country.short_code,
          color: country.accent_color,
          image: country.flag_image,
        },
      });
    }

    const seenEntry = new Set<string>();
    const artistCounts = new Map<string, { name: string; count: number }>();

    for (const participant of publicArchive.participants) {
      const country = countryMap.get(participant.country_id);
      const edition = editionMap.get(participant.edition_id);
      if (!country || !edition) continue;

      const entryKey = `${participant.edition_id}:${participant.country_id}`;
      if (!seenEntry.has(entryKey)) {
        seenEntry.add(entryKey);
        const title =
          [participant.artist, participant.song].filter(Boolean).join(" — ") ||
          `${country.name} entry`;
        output.push({
          id: `entry:${entryKey}`,
          kind: "entry",
          title,
          subtitle: `${country.name} · ${editionLabel(edition)}`,
          href: `/countries/${country.short_code}`,
          search: [
            title,
            country.name,
            country.short_code,
            edition.name,
            edition.edition_number,
          ].join(" "),
          flag: {
            code: country.short_code,
            color: country.accent_color,
            image: country.flag_image,
          },
        });
      }

      if (participant.artist) {
        const key = participant.artist.trim().toLocaleLowerCase();
        const current = artistCounts.get(key);
        artistCounts.set(key, {
          name: participant.artist.trim(),
          count: (current?.count ?? 0) + 1,
        });
      }
    }

    for (const [key, artist] of artistCounts) {
      output.push({
        id: `artist:${key}`,
        kind: "artist",
        title: artist.name,
        subtitle:
          artist.count === 1
            ? "1 published SSC entry"
            : `${artist.count} published SSC entries`,
        href: `/encyclopedia?artist=${encodeURIComponent(artist.name)}`,
        search: artist.name,
      });
    }

    for (const show of publicArchive.shows) {
      const edition = editionMap.get(show.edition_id);
      output.push({
        id: `show:${show.id}`,
        kind: "show",
        title: show.name,
        subtitle: edition ? editionLabel(edition) : "Published show",
        href: `/shows/${show.id}`,
        search: [show.name, show.kind, edition?.name, edition?.edition_number]
          .filter(Boolean)
          .join(" "),
      });
    }

    return output;
  }, [countriesQuery.data, publicArchive]);

  const filtered = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return items
      .filter((item) => kind === "all" || item.kind === kind)
      .filter((item) => {
        if (!terms.length) return true;
        const haystack =
          `${item.title} ${item.subtitle} ${item.search}`.toLocaleLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, 120);
  }, [items, kind, query]);

  const loading = archiveIsLoading(
    countriesQuery,
    editionsQuery,
    showsQuery,
    participantsQuery,
  );
  const error = archiveHasError(
    countriesQuery,
    editionsQuery,
    showsQuery,
    participantsQuery,
  );

  if (feature.isLoading || loading) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Explore Solaris"
          title="Encyclopedia"
          description="Published Solaris history, connected."
        />
        <ArchiveDataLoading label="Building the public historical index…" />
      </AppShell>
    );
  }

  if (feature.isError || feature.data !== true) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Explore Solaris"
          title="Encyclopedia"
          description="Published Solaris history, connected."
        />
        <Panel title="Encyclopedia is not enabled yet">
          <p className="text-sm text-muted-foreground">
            The product is installed but its rollout flag is still off while production
            verification finishes.
          </p>
        </Panel>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <ArchiveDataError />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Explore Solaris"
        title="Encyclopedia"
        description="A publication-safe reference across editions, countries, entries, artists and shows."
        actions={
          <Link
            to="/wiki"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
          >
            Country Wiki →
          </Link>
        }
      />

      <Panel
        title="Archive coverage"
        description="Only information already released on public Solaris surfaces is indexed here."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Editions" value={publicArchive.editions.length} />
          <StatTile
            label="Countries"
            value={
              new Set(publicArchive.participants.map((row) => row.country_id)).size
            }
          />
          <StatTile
            label="Published entries"
            value={
              new Set(
                publicArchive.participants.map(
                  (row) => `${row.edition_id}:${row.country_id}`,
                ),
              ).size
            }
          />
          <StatTile label="Shows" value={publicArchive.shows.length} />
        </div>
      </Panel>

      <section className="mt-5 rounded-2xl border border-border bg-surface/60 p-3 sm:p-4">
        <label className="relative block">
          <span className="sr-only">Search Encyclopedia</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search published Solaris history"
            className="min-h-11 w-full rounded-xl border border-border bg-background/50 pl-10 pr-3 text-sm outline-none focus:border-primary/60"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Filter Encyclopedia">
          {(["all", "edition", "country", "entry", "artist", "show"] as Kind[]).map(
            (value) => (
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
                {value === "all"
                  ? "All"
                  : value.charAt(0).toUpperCase() + value.slice(1) + "s"}
              </button>
            ),
          )}
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-3 flex items-end justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
              Reference index
            </p>
            <h2 className="mt-1 font-display text-xl font-bold">Published entities</h2>
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
              {item.flag ? (
                <FlagChip
                  code={item.flag.code}
                  color={item.flag.color}
                  image={item.flag.image}
                  size="md"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
                  {item.kind}
                </p>
                <p className="mt-1 truncate text-sm font-semibold">{item.title}</p>
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
            No published record matches those filters.
          </div>
        ) : null}
      </section>

      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        Historical gaps are left as gaps. Draft entries, organizer notes, private ballots and
        unpublished results are never indexed here.
      </p>
    </AppShell>
  );
}
