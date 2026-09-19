import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Command as CommandIcon, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type { AccountAccess } from "@/lib/country-account";
import { buildCanonicalFanRecords } from "@/lib/canonical-fan-records";
import {
  editionLabel,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import {
  dedupePublicSearchResults,
  matchesPublicSearch,
  navigationSearchResults,
  type PublicSearchResult,
} from "@/lib/public-search";
import { readPublicRecents } from "@/lib/public-recents";
import { searchGovernanceLibrary } from "@/lib/public-library-governance";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import { loadPublicStorylines } from "@/lib/studio2-storytelling";
import { trackPublicUxEvent } from "@/lib/public-ux-events";
import { cn } from "@/lib/utils";

export function PublicCommandPalette({
  compact = false,
  access,
}: {
  compact?: boolean;
  access?: AccountAccess;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!wasOpen.current && open) {
      trackPublicUxEvent("search_opened", {
        target: "public-command-palette",
        metadata: { source: "global_search" },
      });
    }
    if (wasOpen.current && !open) {
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground",
          compact && "size-10 min-h-10 px-0",
        )}
        aria-label="Search Solaris Studio"
      >
        <Search className="size-3.5" aria-hidden="true" />
        {!compact ? <span>Search</span> : null}
        {!compact ? (
          <kbd className="ml-1 hidden rounded bg-black/15 px-1.5 py-0.5 text-[9px] text-muted-foreground xl:inline">
            ⌘K
          </kbd>
        ) : null}
      </button>

      {open ? <PublicPaletteDialog open={open} setOpen={setOpen} access={access} /> : null}
    </>
  );
}

function PublicPaletteDialog({
  open,
  setOpen,
  access,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  access?: AccountAccess;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { data: countries = [] } = useCountries();
  const { data: editions = [] } = useEditions();
  const { data: shows = [] } = useAllShows();
  const { data: participants = [] } = useAllParticipants();
  const { data: results = [] } = useAllResults();
  const { data: jury = [] } = useAllJuryVotes();
  const storiesQuery = useQuery({
    queryKey: ["public-command-palette-stories"],
    queryFn: () => loadPublicStorylines(40),
    staleTime: 5 * 60 * 1000,
  });

  const editionById = useMemo(
    () => new Map(editions.map((edition) => [edition.id, edition])),
    [editions],
  );
  const countryById = useMemo(
    () => new Map(countries.map((country) => [country.id, country])),
    [countries],
  );
  const searchableEntries = useMemo(() => {
    const byEditionCountry = new Map<string, (typeof participants)[number]>();
    for (const participant of participants) {
      if (!participant.artist && !participant.song) continue;
      const key = `${participant.edition_id}:${participant.country_id}`;
      const existing = byEditionCountry.get(key);
      if (!existing || (existing.show_id && !participant.show_id)) {
        byEditionCountry.set(key, participant);
      }
    }
    return [...byEditionCountry.values()];
  }, [participants]);
  const scorechartShows = useMemo(
    () =>
      shows.filter(
        (show) =>
          isShowPublic(show) &&
          Boolean(resolveShowPublication(show).detailed_voting),
      ),
    [shows],
  );
  const records = useMemo(
    () =>
      buildCanonicalFanRecords({
        countries,
        editions,
        shows,
        participants,
        results,
        jury,
      }),
    [countries, editions, jury, participants, results, shows],
  );
  const normalized = query.trim();

  const actionResults = useMemo<PublicSearchResult[]>(() => {
    const currentEdition =
      editions.find(
        (edition) =>
          !["complete", "completed", "finished"].includes(
            String(edition.status ?? "").toLowerCase(),
          ),
      ) ??
      editions[0] ??
      null;
    const myCountry = access?.countryId
      ? countries.find((country) => country.id === access.countryId) ?? null
      : null;

    return [
      ...(currentEdition
        ? [
            {
              id: "action:current-edition",
              label: "Open current edition",
              description: `${editionLabel(currentEdition)} · ${currentEdition.name}`,
              href: `/editions/${currentEdition.slug}`,
              group: "Actions",
              keywords: "current edition contest now",
            },
          ]
        : []),
      {
        id: "action:confirmation",
        label: "Continue confirmation",
        description: "Open the current country confirmation workflow.",
        href: "/confirmations",
        group: "Actions",
        keywords: "confirmation participate country entry",
      },
      ...(myCountry
        ? [
            {
              id: "action:my-country",
              label: "Open my country",
              description: `${myCountry.name} · public country page`,
              href: `/countries/${myCountry.short_code}`,
              group: "Actions",
              keywords: "my country delegation profile",
            },
          ]
        : []),
      {
        id: "action:latest-results",
        label: "Go to latest results",
        description: "Open the latest published result and result tools.",
        href: "/results",
        group: "Actions",
        keywords: "latest result scoreboard ranking",
      },
      {
        id: "action:compare",
        label: "Compare countries",
        description: "Open the side-by-side country comparison tool.",
        href: "/compare",
        group: "Actions",
        keywords: "compare versus countries",
      },
    ];
  }, [access?.countryId, countries, editions]);

  const searchResults = useMemo(() => {
    if (!normalized) return [] as PublicSearchResult[];

    const results: PublicSearchResult[] = [
      ...actionResults.filter((item) =>
        matchesPublicSearch(
          normalized,
          item.label,
          item.description,
          item.keywords,
        ),
      ),
      ...navigationSearchResults(normalized),
      ...countries
        .filter((country) =>
          matchesPublicSearch(
            normalized,
            country.name,
            country.native_name,
            country.short_code,
            country.region,
          ),
        )
        .flatMap((country) => [
          {
            id: `country:${country.id}`,
            label: country.name,
            description: `${country.short_code} · Country profile and SSC history`,
            href: `/countries/${country.short_code}`,
            group: "Countries",
          },
          {
            id: `wiki:${country.id}`,
            label: `${country.name} in the Wiki`,
            description: "Detailed country article",
            href: `/wiki/${country.short_code}`,
            group: "Wiki",
          },
        ]),
      ...editions
        .filter((edition) =>
          matchesPublicSearch(
            normalized,
            edition.name,
            edition.edition_number,
            edition.year,
            edition.host_city,
            edition.slug,
          ),
        )
        .map((edition) => ({
          id: `edition:${edition.id}`,
          label: `${editionLabel(edition)} · ${edition.name}`,
          description: [edition.host_city, edition.year].filter(Boolean).join(" · "),
          href: `/editions/${edition.slug}`,
          group: "Editions",
        })),
      ...shows
        .filter((show) => {
          const edition = editionById.get(show.edition_id);
          return matchesPublicSearch(
            normalized,
            show.name,
            show.kind,
            edition?.name,
            edition?.edition_number,
          );
        })
        .map((show) => {
          const edition = editionById.get(show.edition_id);
          return {
            id: `show:${show.id}`,
            label: show.name,
            description: edition ? editionLabel(edition) : "SSC show",
            href: `/shows/${show.id}`,
            group: "Shows",
          };
        }),
      ...(storiesQuery.data ?? [])
        .filter((story) =>
          matchesPublicSearch(
            normalized,
            story.title,
            story.subtitle,
            story.editionName,
            story.editionNumber,
          ),
        )
        .map((story) => ({
          id: `story:${story.editionSlug}`,
          label: story.title,
          description: `${story.editionName} · published story`,
          href: `/stories/${story.editionSlug}`,
          group: "Stories",
        })),      ...searchableEntries
        .filter((entry) => {
          const country = countryById.get(entry.country_id);
          const edition = editionById.get(entry.edition_id);
          return matchesPublicSearch(
            normalized,
            entry.artist,
            entry.song,
            country?.name,
            country?.short_code,
            edition?.name,
            edition?.edition_number,
          );
        })
        .map((entry) => {
          const country = countryById.get(entry.country_id);
          const edition = editionById.get(entry.edition_id);
          return {
            id: `entry:${entry.edition_id}:${entry.country_id}`,
            label: [entry.artist, entry.song].filter(Boolean).join(" — ") || "SSC entry",
            description: [
              country?.name,
              edition ? editionLabel(edition) : null,
            ]
              .filter(Boolean)
              .join(" · "),
            href: country ? `/countries/${country.short_code}` : "/editions",
            group: "Entries",
            keywords: "entry song artist participant",
          };
        }),
      ...scorechartShows
        .filter((show) => {
          const edition = editionById.get(show.edition_id);
          return matchesPublicSearch(
            normalized,
            show.name,
            show.kind,
            edition?.name,
            edition?.edition_number,
            "scorechart",
            "detailed voting",
            "jury matrix",
          );
        })
        .map((show) => {
          const edition = editionById.get(show.edition_id);
          return {
            id: `scorechart:${show.id}`,
            label: `${show.name} scorechart`,
            description: edition
              ? `${editionLabel(edition)} · detailed voting matrix`
              : "Detailed voting matrix",
            href: `/shows/${show.id}`,
            group: "Scorecharts",
            keywords: "scorechart detailed jury voting matrix",
          };
        }),
      ...records
        .filter((record) =>
          matchesPublicSearch(
            normalized,
            record.label,
            record.value,
            record.explanation,
            ...record.holders.flatMap((holder) => [
              holder.countryName,
              holder.shortCode,
              holder.artist,
              holder.song,
              holder.editionLabel,
            ]),
          ),
        )
        .slice(0, 12)
        .map((record) => ({
          id: `record:${record.id}`,
          label: record.label,
          description: `${record.value} · ${record.explanation}`,
          href: "/records",
          group: "Records",
          keywords: "record all-time archive statistic",
        })),

      ...searchGovernanceLibrary(normalized).slice(0, 16).map((item) => ({
        id: `governance:${item.to}:${item.title}`,
        label: item.title,
        description: item.description,
        href: item.to,
        group: item.group,
      })),
    ];

    return dedupePublicSearchResults(results).slice(0, 50);
  }, [
    actionResults,
    countries,
    countryById,
    editionById,
    editions,
    normalized,
    records,
    scorechartShows,
    searchableEntries,
    shows,
    storiesQuery.data,
  ]);

  const recentResults = useMemo(
    () =>
      readPublicRecents().map((item) => ({
        id: `recent:${item.path}`,
        label: item.label,
        description: "Recently visited",
        href: item.path,
        group: "Recent",
      })),
    [],
  );

  const grouped = useMemo(() => {
    const source = normalized ? searchResults : [...recentResults, ...actionResults];
    const map = new Map<string, PublicSearchResult[]>();
    for (const item of source) {
      const values = map.get(item.group) ?? [];
      values.push(item);
      map.set(item.group, values);
    }
    return [...map.entries()];
  }, [actionResults, normalized, recentResults, searchResults]);

  useEffect(() => {
    if (normalized.length < 2) return;

    const timer = window.setTimeout(() => {
      const metadata = {
        source: "global_search",
        query_length: normalized.length,
        result_count: searchResults.length,
      } as const;
      trackPublicUxEvent("search_submitted", {
        target: "public-command-palette",
        metadata,
      });
      if (!searchResults.length) {
        trackPublicUxEvent("search_no_results", {
          target: "public-command-palette",
          metadata,
        });
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [normalized, searchResults.length]);

  const openResult = (result: PublicSearchResult) => {
    trackPublicUxEvent("search_result_clicked", {
      target: result.href,
      metadata: {
        source: result.group === "Actions" ? "action" : normalized ? "search" : "recent",
        group: result.group,
        query_length: normalized.length,
        result_count: normalized ? searchResults.length : recentResults.length,
      },
    });
    setOpen(false);
    void router.navigate({ to: result.href as any });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false}>
        <CommandInput
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Search Solaris Studio…"
          aria-label="Search Solaris Studio"
        />
        <CommandList className="max-h-[min(68dvh,34rem)]">
          <CommandEmpty>
            {normalized
              ? "Nothing in Solaris Studio matches that search."
              : "Start typing to search Solaris Studio."}
          </CommandEmpty>

          {grouped.map(([group, items], groupIndex) => (
            <div key={group}>
              {groupIndex ? <CommandSeparator /> : null}
              <CommandGroup heading={group}>
                {items.slice(0, group === "Recent" ? 8 : 12).map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.label} ${item.description} ${item.href}`}
                    onSelect={() => openResult(item)}
                    className="min-h-12 rounded-xl px-3 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{item.label}</span>
                      {item.description ? (
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          ))}

          {!normalized && !recentResults.length ? (
            <CommandGroup heading="Start here">
              {navigationSearchResults("")
                .filter((item) =>
                  ["/explore", "/participate", "/results", "/guide", "/rules"].includes(item.href),
                )
                .map((item) => (
                  <CommandItem key={item.id} onSelect={() => openResult(item)}>
                    <CommandIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span>{item.label}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
