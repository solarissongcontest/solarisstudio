import { useQuery } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { Command as CommandIcon, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
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
import { supabase } from "@/integrations/supabase/client";
import {
  clearAppSearchReturn,
  readAppSearchState,
  readPendingAppSearchRestore,
  rememberAppSearchQuery,
  rememberAppSearchReturn,
} from "@/lib/app-search-state";
import { runAppViewTransition } from "@/lib/app-view-transitions";
import type { AccountAccess } from "@/lib/country-account";
import { searchGovernanceLibrary } from "@/lib/public-library-governance";
import { readPublicRecents } from "@/lib/public-recents";
import {
  dedupePublicSearchResults,
  matchesPublicSearch,
  navigationSearchResults,
  type PublicSearchResult,
} from "@/lib/public-search";
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

function searchActions(access?: AccountAccess): PublicSearchResult[] {
  return [
    {
      id: "action:explore",
      label: "Explore Solaris",
      description: "Browse countries, editions, shows and stories.",
      href: "/explore",
      group: "Actions",
      keywords: "explore countries editions shows stories current edition",
    },
    {
      id: "action:participate",
      label: "Participate",
      description: "Open confirmations, jury voting and public voting.",
      href: "/participate",
      group: "Actions",
      keywords: "participate tasks confirmation country entry jury televote voting",
    },
    {
      id: "action:results",
      label: "Results",
      description: "Open published results and score tools.",
      href: "/results",
      group: "Actions",
      keywords: "latest results scoreboard ranking scorechart",
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
    ...(access?.userId
      ? [
          {
            id: "action:me",
            label: "Open Me",
            description: "Open your Solaris identity, history and account.",
            href: "/me",
            group: "Actions",
            keywords: "me account identity history country delegation profile",
          } satisfies PublicSearchResult,
        ]
      : []),
  ];
}

function useRemotePublicSearch(normalized: string) {
  return useQuery({
    queryKey: ["solaris-public-search", normalized.toLowerCase()],
    enabled: normalized.length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("solaris_public_search", {
        search_query: normalized,
        result_limit: 30,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as AppSearchRow[];
    },
  });
}

function usePublicSearchResults(normalized: string, access?: AccountAccess) {
  const remote = useRemotePublicSearch(normalized);
  const stories = useQuery({
    queryKey: ["public-command-palette-stories"],
    enabled: normalized.length >= 2,
    queryFn: () => loadPublicStorylines(40),
    staleTime: 5 * 60 * 1000,
  });
  const actionResults = useMemo(() => searchActions(access), [access?.userId]);

  const searchResults = useMemo<PublicSearchResult[]>(() => {
    if (!normalized) return [];

    const remoteResults = (remote.data ?? []).map((item) => ({
      id: item.result_id,
      label: item.title,
      description: item.subtitle ?? "",
      href: item.href,
      group: appSearchGroup(item.result_type),
      keywords: item.keywords ?? undefined,
    }));

    const storyResults = (stories.data ?? [])
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
      }));

    const localResults: PublicSearchResult[] = [
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

    return dedupePublicSearchResults([
      ...localResults,
      ...remoteResults,
      ...storyResults,
    ]).slice(0, 50);
  }, [actionResults, normalized, remote.data, stories.data]);

  const recentResults = useMemo<PublicSearchResult[]>(
    () =>
      readPublicRecents().slice(0, 8).map((item) => ({
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

  return {
    actionResults,
    grouped,
    isFetching: remote.isFetching || stories.isFetching,
    recentResults,
    searchResults,
  };
}

function useSearchTelemetry(
  normalized: string,
  searchResults: PublicSearchResult[],
  isFetching: boolean,
) {
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
      if (!isFetching && !searchResults.length) {
        trackPublicUxEvent("search_no_results", {
          target: "public-command-palette",
          metadata,
        });
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [isFetching, normalized, searchResults.length]);
}

function AppPublicPaletteDialog({
  open,
  setOpen,
  access,
  originPath,
  initialQuery,
}: PublicPaletteDialogProps) {
  const router = useRouter();
  const initialSearchState = useMemo(() => readAppSearchState(), []);
  const [query, setQuery] = useState(() => initialQuery ?? initialSearchState.lastQuery);
  const normalized = query.trim();
  const {
    grouped,
    isFetching,
    recentResults,
    searchResults,
  } = usePublicSearchResults(normalized, access);

  useSearchTelemetry(normalized, searchResults, isFetching);

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
          {isFetching
            ? "Searching Solaris…"
            : normalized.length === 1
              ? "Type one more character to search."
              : normalized
                ? "Nothing in Solaris Studio matches that search."
                : "Start typing to search Solaris Studio."}
        </CommandEmpty>

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

        <SearchGroups grouped={grouped} openResult={openResult} />
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
  const [query, setQuery] = useState("");
  const normalized = query.trim();
  const {
    grouped,
    isFetching,
    recentResults,
    searchResults,
  } = usePublicSearchResults(normalized, access);

  useSearchTelemetry(normalized, searchResults, isFetching);

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
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      shouldFilter={false}
    >
      <CommandInput
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Search Solaris Studio…"
        aria-label="Search Solaris Studio"
      />
      <CommandList className="max-h-[min(68dvh,34rem)]">
        <CommandEmpty>
          {isFetching
            ? "Searching Solaris…"
            : normalized.length === 1
              ? "Type one more character to search."
              : normalized
                ? "Nothing in Solaris Studio matches that search."
                : "Start typing to search Solaris Studio."}
        </CommandEmpty>

        <SearchGroups grouped={grouped} openResult={openResult} />

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
    </CommandDialog>
  );
}

function SearchGroups({
  grouped,
  openResult,
}: {
  grouped: Array<[string, PublicSearchResult[]]>;
  openResult: (result: PublicSearchResult) => void;
}) {
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
