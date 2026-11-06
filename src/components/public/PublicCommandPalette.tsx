import { useQuery } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { Command as CommandIcon, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { DialogClose } from "@/components/ui/dialog";
import {
  clearAppSearchReturn,
  readAppSearchState,
  readPendingAppSearchRestore,
  rememberAppSearchQuery,
  rememberAppSearchReturn,
} from "@/lib/app-search-state";
import type { AccountAccess } from "@/lib/country-account";
import { buildCanonicalFanRecords } from "@/lib/canonical-fan-records";
import { usePublicSearchParticipants } from "@/lib/public-participants";
import { publicSearchPublicationScope, publicSearchRowsForPublishedShows } from "@/lib/public-search-published-scope";
import { resolveCurrentPublicEdition } from "@/lib/current-contest-state";
import { canSuggestDelegationSearchActions } from "@/lib/public-search-action-visibility";
import {
  editionLabel,
  useAllJuryVotes,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
  type Country,
  type Edition,
} from "@/lib/data";
import {
  dedupePublicSearchResults,
  matchesPublicSearch,
  navigationSearchResults,
  type PublicSearchResult,
} from "@/lib/public-search";
import { isRecentShowPublic } from "@/lib/public-recent-show-publication";
import { readPublicRecents } from "@/lib/public-recents";
import { visibleRecentShowDestinations } from "@/lib/v3-show-public-discovery";
import { runAppViewTransition } from "@/lib/app-view-transitions";
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
  const { isAppMode } = useSolarisApp();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const [restoreQuery, setRestoreQuery] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setRestoreQuery(null);
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!isAppMode) return;
    const restore = readPendingAppSearchRestore(pathname);
    if (!restore) return;

    setRestoreQuery(restore.query);
    setOpen(true);
    clearAppSearchReturn();
  }, [isAppMode, pathname]);

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
        onClick={() => {
          setRestoreQuery(null);
          setOpen(true);
        }}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground",
          compact && "size-11 min-h-11 px-0",
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

      {open ? (
        <PublicPaletteDialog
          open={open}
          setOpen={setOpen}
          access={access}
          appMode={isAppMode}
          originPath={pathname}
          initialQuery={restoreQuery}
        />
      ) : null}
    </>
  );
}

type PublicPaletteDialogProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  access?: AccountAccess;
  appMode: boolean;
  originPath: string;
  initialQuery: string | null;
};

function PublicPaletteDialog(props: PublicPaletteDialogProps) {
  if (props.appMode) return <AppPublicPaletteDialog {...props} />;
  return <WebPublicPaletteDialog {...props} />;
}

type AppSearchRow = {
  result_id: string;
  result_type: string;
  title: string;
  subtitle: string | null;
  href: string;
  keywords: string | null;
  sort_rank: number;
};

function appSearchGroup(type: string) {
  if (type === "country") return "Countries";
  if (type === "wiki") return "Wiki";
  if (type === "edition") return "Editions";
  if (type === "show") return "Shows";
  if (type === "entry") return "Entries";
  return "Solaris";
}


// Recent labels live in shared-device localStorage and may outlive publication.
// Verify only the at-most-eight remembered Show IDs against live publication
// state; never fetch the entire Show/Results/Jury archive just to open Search.
const RECENT_SHOW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function publicRecentShowIds(recents: readonly { path: string }[]): string[] {
  const ids = new Set<string>();
  for (const recent of recents) {
    const match = /^\/shows\/([^/?#]+)\/?$/i.exec(recent.path);
    if (!match) continue;
    try {
      const id = decodeURIComponent(match[1]);
      if (RECENT_SHOW_ID.test(id)) ids.add(id.toLowerCase());
    } catch {
      // A malformed local URL must not trigger a database request.
    }
  }
  return [...ids].sort();
}

function usePublicationSafeRecents() {
  const recents = useMemo(() => readPublicRecents(), []);
  const showIds = useMemo(() => publicRecentShowIds(recents), [recents]);
  const showVisibility = useQuery({
    queryKey: ["public-command-palette-recent-show-visibility", showIds],
    enabled: showIds.length > 0,
    // A cached answer is not authorization after an Organizer unpublishes a Show.
    // The palette mounts anew at each open; hold stored labels until fresh reads finish.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("shows")
        .select("id,edition_id,published,publication_config")
        .in("id", showIds);
      if (error) throw error;
      const publicRows = (rows ?? []).filter(isRecentShowPublic);
      if (!publicRows.length) return [];
      const editionIds = [...new Set(publicRows.map((show) => show.edition_id))];
      const { data: editions, error: editionError } = await supabase
        .from("editions")
        .select("id,published")
        .in("id", editionIds);
      if (editionError) throw editionError;
      const publishedEditionIds = new Set(
        (editions ?? [])
          .filter((edition) => edition.published === true)
          .map((edition) => edition.id),
      );
      return publicRows
        .filter((show) => publishedEditionIds.has(show.edition_id))
        .map((show) => ({ id: show.id }));
    },
  });
  return useMemo(
    () =>
      visibleRecentShowDestinations(
        recents,
        showVisibility.isSuccess &&
          showVisibility.isFetchedAfterMount &&
          !showVisibility.isFetching
          ? showVisibility.data
          : [],
      ),
    [recents, showVisibility.isSuccess, showVisibility.isFetchedAfterMount, showVisibility.isFetching, showVisibility.data],
  );
}

function AppPublicPaletteDialog({
  open,
  setOpen,
  originPath,
  initialQuery,
}: PublicPaletteDialogProps) {
  const router = useRouter();
  const initialSearchState = useMemo(() => readAppSearchState(), []);
  const [query, setQuery] = useState(() => initialQuery ?? initialSearchState.lastQuery);
  const normalized = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState(normalized);

  useEffect(() => {
    if (normalized.length < 2) {
      setDebouncedQuery("");
      return;
    }
    const timer = window.setTimeout(() => setDebouncedQuery(normalized), 300);
    return () => window.clearTimeout(timer);
  }, [normalized]);

  // Local navigation matches render immediately; stale remote rows cannot
  // appear under a newer query while waiting for the bounded RPC.
  const awaitingRemote = normalized.length >= 2 && debouncedQuery !== normalized;
  const remote = useQuery({
    queryKey: ["solaris-public-app-search", debouncedQuery.toLowerCase()],
    enabled: normalized.length >= 2 && !awaitingRemote,
    staleTime: 60_000,
    // A failed search must be recoverable without automatically repeating
    // hosted read traffic. Explicit Retry remains under the visitor's control.
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("solaris_public_search", {
        search_query: debouncedQuery,
        result_limit: 30,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as AppSearchRow[];
    },
  });

  const actionResults = useMemo<PublicSearchResult[]>(
    () => [
      {
        id: "action:participate",
        label: "Participate",
        description: "Open confirmations, jury voting and public voting.",
        href: "/participate",
        group: "Actions",
        keywords: "participate tasks confirmations jury televote voting",
      },
      {
        id: "action:results",
        label: "Results",
        description: "Open published results and score tools.",
        href: "/results",
        group: "Actions",
        keywords: "results scoreboard ranking scorechart",
      },
      {
        id: "action:explore",
        label: "Explore Solaris",
        description: "Browse countries, editions, shows and stories.",
        href: "/explore",
        group: "Actions",
        keywords: "explore countries editions shows stories",
      },
      {
        id: "action:site-directory",
        label: "All Solaris pages",
        description: "Browse the complete public site directory.",
        href: "/site-directory",
        group: "Actions",
        keywords: "all pages site directory sitemap browse",
      },
    ],
    [],
  );

  const visibleRecents = usePublicationSafeRecents();
  const recentResults = useMemo<PublicSearchResult[]>(
    () =>
      visibleRecents.slice(0, 8).map((item) => ({
        id: `recent:${item.path}`,
        label: item.label,
        description: "Recently visited",
        href: item.path,
        group: "Recent",
      })),
    [visibleRecents],
  );

  const searchResults = useMemo<PublicSearchResult[]>(() => {
    if (!normalized) return [];

    const remoteResults = (awaitingRemote || remote.isError ? [] : remote.data ?? []).map((item) => ({
      id: item.result_id,
      label: item.title,
      description: item.subtitle ?? "",
      href: item.href,
      group: appSearchGroup(item.result_type),
      keywords: item.keywords ?? undefined,
    }));

    const local = [
      ...actionResults.filter((item) =>
        matchesPublicSearch(normalized, item.label, item.description, item.keywords),
      ),
      ...navigationSearchResults(normalized),
      ...searchGovernanceLibrary(normalized).slice(0, 16).map((item) => ({
        id: `governance:${item.to}:${item.title}`,
        label: item.title,
        description: item.description,
        href: item.to,
        group: item.group,
      })),
    ];

    return dedupePublicSearchResults([...local, ...remoteResults]).slice(0, 50);
  }, [actionResults, normalized, awaitingRemote, remote.data, remote.isError]);

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
      if (!awaitingRemote && !remote.isFetching && !remote.isError && !searchResults.length) {
        trackPublicUxEvent("search_no_results", {
          target: "public-command-palette",
          metadata,
        });
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [normalized, awaitingRemote, remote.isFetching, remote.isError, searchResults.length]);

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
    if (normalized.length >= 2) rememberAppSearchQuery(normalized);
    rememberAppSearchReturn(originPath, normalized, result.href);
    setOpen(false);
    void runAppViewTransition("push", () =>
      router.navigate({ to: result.href as any }),
    );
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      contentClassName="solaris-app-search-dialog"
      contentLayout="fullscreen"
      commandClassName="solaris-app-search-command"
      showCloseButton={false}
      shouldFilter={false}
    >
      <div className="solaris-app-global-search-header">
        <SolarisSearchField
          autoFocus
          value={query}
          onChange={setQuery}
          placeholder="Search Solaris Studio…"
          label="Search Solaris Studio"
          className="solaris-app-command-search-shell"
        />
        <DialogClose asChild>
          <button
            type="button"
            className="solaris-app-global-search-close"
            aria-label="Close search"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </DialogClose>
      </div>
      <CommandList className="solaris-app-search-list">
        <CommandEmpty>
          {!awaitingRemote && remote.isError && normalized.length >= 2
            ? "Published content search is unavailable; local matches may still be shown."
             : awaitingRemote || remote.isFetching
              ? "Searching Solaris…"
              : normalized.length === 1
                ? "Type one more character to search."
                : normalized
                  ? "Nothing in Solaris Studio matches that search."
                  : "Start typing to search Solaris Studio."}
        </CommandEmpty>

        {(awaitingRemote || remote.isFetching) && normalized.length >= 2 ? (
          <p role="status" aria-live="polite" className="px-4 py-2 text-xs text-muted-foreground">
            Searching published Solaris content…
          </p>
        ) : null}

        {remote.isError && normalized.length >= 2 ? (
          <div role="alert" className="mx-3 my-2 rounded-xl border border-border/70 bg-surface/75 p-3">
            <p className="text-sm font-semibold">Published search could not load</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Local navigation matches are still available. Retry to search published countries, editions, shows and entries.
            </p>
            <button
              type="button"
              onClick={() => void remote.refetch()}
              className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Retry published search
            </button>
          </div>
        ) : null}

        {!normalized && initialSearchState.recentQueries.length ? (
          <CommandGroup heading="Recent searches">
            {initialSearchState.recentQueries.map((recentQuery) => (
              <CommandItem
                key={recentQuery}
                onSelect={() => setQuery(recentQuery)}
                className="min-h-12 rounded-xl px-3 py-2"
              >
                <Search className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="truncate text-sm font-semibold">{recentQuery}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {renderSearchGroups(grouped, openResult)}
      </CommandList>
    </CommandDialog>
  );
}

function WebPublicPaletteDialog({
  open,
  setOpen,
  access,
}: PublicPaletteDialogProps) {
  const router = useRouter();
  const webSearchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const { data: countries = [] } = useCountries();
  const { data: editions = [] } = useEditions();
  const normalized = query.trim();

  const actionResults = useMemo<PublicSearchResult[]>(() => {
    // Reuse published contest selection; an unpublished edition or a locally
    // guessed lifecycle must never become a Search shortcut.
    const currentEdition = resolveCurrentPublicEdition(editions);
    const canOpenDelegation = canSuggestDelegationSearchActions(access);
    const myCountry = canOpenDelegation
      ? countries.find((country) => country.id === access!.countryId) ?? null
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
      ...(canOpenDelegation
        ? [{
            id: "action:confirmation",
            label: "Continue confirmation",
            description: "Open your country confirmation workflow.",
            href: "/confirmations",
            group: "Actions",
            keywords: "confirmation participate country entry",
          }]
        : []),
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
      {
        id: "action:site-directory",
        label: "All Solaris pages",
        description: "Browse the complete public site directory.",
        href: "/site-directory",
        group: "Actions",
        keywords: "all pages site directory sitemap browse",
      },
    ];
  }, [access, countries, editions]);

  const visibleRecents = usePublicationSafeRecents();
  const recentResults = useMemo<PublicSearchResult[]>(
    () =>
      visibleRecents.map((item) => ({
        id: `recent:${item.path}`,
        label: item.label,
        description: "Recently visited",
        href: item.path,
        group: "Recent",
      })),
    [visibleRecents],
  );

  const openIdleResult = (result: PublicSearchResult) => {
    trackPublicUxEvent("search_result_clicked", {
      target: result.href,
      metadata: {
        source: result.group === "Actions" ? "action" : "recent",
        group: result.group,
        query_length: 0,
        result_count: recentResults.length,
      },
    });
    setOpen(false);
    void router.navigate({ to: result.href as any });
  };

  const idleGroups = useMemo(() => {
    const map = new Map<string, PublicSearchResult[]>();
    for (const item of [...recentResults, ...actionResults]) {
      const values = map.get(item.group) ?? [];
      values.push(item);
      map.set(item.group, values);
    }
    return [...map.entries()];
  }, [actionResults, recentResults]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <div className="relative">
        <CommandInput
          ref={webSearchInputRef}
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Search Solaris Studio…"
          aria-label="Search Solaris Studio"
          className={query ? "pr-12" : undefined}
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              webSearchInputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {normalized.length >= 2 ? (
        <WebSearchArchiveResults
          normalized={normalized}
          countries={countries}
          editions={editions}
          actionResults={actionResults}
          setOpen={setOpen}
        />
      ) : normalized ? (
        <CommandList className="max-h-[min(68dvh,34rem)]">
          <CommandEmpty>Type one more character to search published Solaris content.</CommandEmpty>
        </CommandList>
      ) : (
        <CommandList className="max-h-[min(68dvh,34rem)]">
          <CommandEmpty>Start typing to search Solaris Studio.</CommandEmpty>
          {renderSearchGroups(idleGroups, openIdleResult)}
          {!recentResults.length ? (
            <CommandGroup heading="Start here">
              {navigationSearchResults("")
                .filter((item) =>
                  ["/explore", "/participate", "/results", "/guide", "/rules"].includes(item.href),
                )
                .map((item) => (
                  <CommandItem key={item.id} onSelect={() => openIdleResult(item)}>
                    <CommandIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span>{item.label}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      )}
    </CommandDialog>
  );
}

function WebSearchArchiveResults({
  normalized,
  countries,
  editions,
  actionResults,
  setOpen,
}: {
  normalized: string;
  countries: Country[];
  editions: Edition[];
  actionResults: PublicSearchResult[];
  setOpen: (open: boolean) => void;
}) {
  const router = useRouter();
  const showsQuery = useAllShows();
  const participantsQuery = usePublicSearchParticipants();
  const resultsQuery = useAllResults();
  const juryQuery = useAllJuryVotes();
  // A failed refetch may retain old cached rows. Never promote those rows to
  // new public Search suggestions until the publication source is healthy.
  const shows = showsQuery.isError ? [] : showsQuery.data ?? [];
  const participants = participantsQuery.isError ? [] : participantsQuery.data ?? [];
  const results = resultsQuery.isError ? [] : resultsQuery.data ?? [];
  const jury = juryQuery.isError ? [] : juryQuery.data ?? [];
  const storiesQuery = useQuery({
    queryKey: ["public-command-palette-stories"],
    queryFn: () => loadPublicStorylines(40),
    staleTime: 5 * 60 * 1000,
  });

  // The same published-data projection must apply to anonymous visitors and
  // signed-in delegation users, even when their database read scope differs.
  const {
    publicEditions,
    publicEditionIds,
    publicShows,
    publishedResultShowIds,
    detailedVotingShowIds,
  } = useMemo(
    () => publicSearchPublicationScope(editions, shows),
    [editions, shows],
  );
  const visibleResults = useMemo(
    () => publicSearchRowsForPublishedShows(results, publishedResultShowIds),
    [results, publishedResultShowIds],
  );
  const visibleJury = useMemo(
    () => publicSearchRowsForPublishedShows(jury, detailedVotingShowIds),
    [jury, detailedVotingShowIds],
  );

  const editionById = useMemo(
    () => new Map(publicEditions.map((edition) => [edition.id, edition])),
    [publicEditions],
  );
  const countryById = useMemo(
    () => new Map(countries.map((country) => [country.id, country])),
    [countries],
  );
  const searchableEntries = useMemo(() => {
    const byEditionCountry = new Map<string, (typeof participants)[number]>();
    for (const participant of participants) {
      if (!publicEditionIds.has(participant.edition_id)) continue;
      if (!participant.artist && !participant.song) continue;
      const key = `${participant.edition_id}:${participant.country_id}`;
      const existing = byEditionCountry.get(key);
      if (!existing || (existing.show_id && !participant.show_id)) {
        byEditionCountry.set(key, participant);
      }
    }
    return [...byEditionCountry.values()];
  }, [participants, publicEditionIds]);
  const scorechartShows = useMemo(
    () =>
      publicShows.filter(
        (show) => Boolean(resolveShowPublication(show).detailed_voting),
      ),
    [publicShows],
  );
  const records = useMemo(
    () =>
      buildCanonicalFanRecords({
        countries,
        editions: publicEditions,
        shows: publicShows,
        participants,
        results: visibleResults,
        jury: visibleJury,
      }),
    [countries, publicEditions, visibleJury, participants, visibleResults, publicShows],
  );

  const searchResults = useMemo(() => {
    const values: PublicSearchResult[] = [
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
      ...publicEditions
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
      ...publicShows
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
        })),
      ...searchableEntries
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

    return dedupePublicSearchResults(values).slice(0, 50);
  }, [
    actionResults,
    countries,
    countryById,
    editionById,
    publicEditions,
    normalized,
    records,
    scorechartShows,
    searchableEntries,
    publicShows,
    storiesQuery.data,
  ]);

  const isFetching =
    showsQuery.isFetching ||
    participantsQuery.isFetching ||
    resultsQuery.isFetching ||
    juryQuery.isFetching ||
    storiesQuery.isFetching;
  const hasArchiveError =
    showsQuery.isError ||
    participantsQuery.isError ||
    resultsQuery.isError ||
    juryQuery.isError ||
    storiesQuery.isError;

  useEffect(() => {
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
      if (!isFetching && !hasArchiveError && !searchResults.length) {
        trackPublicUxEvent("search_no_results", {
          target: "public-command-palette",
          metadata,
        });
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [isFetching, hasArchiveError, normalized, searchResults.length]);

  const openResult = (result: PublicSearchResult) => {
    trackPublicUxEvent("search_result_clicked", {
      target: result.href,
      metadata: {
        source: result.group === "Actions" ? "action" : "search",
        group: result.group,
        query_length: normalized.length,
        result_count: searchResults.length,
      },
    });
    setOpen(false);
    void router.navigate({ to: result.href as any });
  };

  const grouped = useMemo(() => {
    const map = new Map<string, PublicSearchResult[]>();
    for (const item of searchResults) {
      const values = map.get(item.group) ?? [];
      values.push(item);
      map.set(item.group, values);
    }
    return [...map.entries()];
  }, [searchResults]);

  return (
    <CommandList className="max-h-[min(68dvh,34rem)]">
      <CommandEmpty>
        {isFetching
          ? "Searching Solaris…"
          : hasArchiveError
            ? "Published Search is temporarily incomplete. Retry the unavailable sources."
            : "Nothing in Solaris Studio matches that search."}
      </CommandEmpty>
      {hasArchiveError ? (
        <div role="alert" className="mx-3 my-2 rounded-xl border border-border/70 bg-surface/75 p-3">
          <p className="text-sm font-semibold">Some published content could not be verified</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Available public results are shown below. Hidden or unverified records are not included.
          </p>
          <button
            type="button"
            onClick={() => {
              if (showsQuery.isError) void showsQuery.refetch();
              if (participantsQuery.isError) void participantsQuery.refetch();
              if (resultsQuery.isError) void resultsQuery.refetch();
              if (juryQuery.isError) void juryQuery.refetch();
              if (storiesQuery.isError) void storiesQuery.refetch();
            }}
            className="mt-3 min-h-11 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-surface-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Retry unavailable sources
          </button>
        </div>
      ) : null}
      {renderSearchGroups(grouped, openResult)}
    </CommandList>
  );
}

function renderSearchGroups(
  grouped: Array<[string, PublicSearchResult[]]>,
  openResult: (result: PublicSearchResult) => void,
) {
  return grouped.map(([group, items], groupIndex) => (
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
  ));
}
