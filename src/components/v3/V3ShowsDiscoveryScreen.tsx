import { Link } from "@tanstack/react-router";
import { ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import type { V3DirectoryPresentation } from "@/lib/v3-directory-presentation";
import "@/styles/v3-shows-directory.css";
import { useEffect, useMemo, useState } from "react";

import { AppEmptyState, AppSectionHeader } from "@/components/app/AppPrimitives";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { PublicDataState } from "@/components/public/PublicDataState";
import { editionLabel, useAllShows, useEditions } from "@/lib/data";
import { showPublishesResults } from "@/lib/publication";
import { publicBroadcastHref } from "@/lib/v3-public-broadcast-url";
import { usePublicLaunchAvailability } from "@/lib/public-launch-context";
import { matchesShowDirectorySearch, resolveShowDirectoryFacet } from "@/lib/v3-shows-directory-filters";
import { MAX_PUBLIC_DIRECTORY_QUERY_LENGTH, normalizePublicDirectoryUrlQuery } from "@/lib/v3-directory-url-search";
import { type ShowDirectoryUrlSearch } from "@/lib/v3-explore-browse-url";
import { formatEventDateTime } from "@/lib/public-time";
import { getV3ShowBrowsePage, V3_SHOW_BROWSE_PAGE_SIZE } from "@/lib/v3-show-browse-page";
import {
  buildShowDiscovery,
  type ShowDiscoveryItem,
  type ShowDiscoveryState,
} from "@/lib/v3-discovery-entities";

const STATE_ORDER: ShowDiscoveryState[] = [
  "live",
  "paused",
  "delayed",
  "preparing",
  "scheduled",
  "ended",
  "cancelled",
  "archived",
  "other",
];

export function V3ShowsDiscoveryScreen({
  presentation = "installed-app",
  urlSearch,
  onUrlSearchChange,
}: {
  presentation?: V3DirectoryPresentation;
  urlSearch?: ShowDirectoryUrlSearch;
  onUrlSearchChange?: (next: ShowDirectoryUrlSearch) => void;
}) {
  const { allowsReleased } = usePublicLaunchAvailability();
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const [search, setSearch] = useState(urlSearch?.q ?? "");
  const [editionId, setEditionId] = useState(urlSearch?.edition ?? "all");
  const [kind, setKind] = useState(urlSearch?.kind ?? "all");
  const [state, setState] = useState<ShowDiscoveryState | "all">(urlSearch?.state ?? "all");
  const changeSearch = (value: string) =>
    setSearch(value.slice(0, MAX_PUBLIC_DIRECTORY_QUERY_LENGTH));
  // Direct links and browser history restore only user-selected filters.
  useEffect(() => setSearch(urlSearch?.q ?? ""), [urlSearch?.q]);
  useEffect(() => setEditionId(urlSearch?.edition ?? "all"), [urlSearch?.edition]);
  useEffect(() => setKind(urlSearch?.kind ?? "all"), [urlSearch?.kind]);
  useEffect(() => setState(urlSearch?.state ?? "all"), [urlSearch?.state]);
  // Keyed pagination resets synchronously with any filter change, without a
  // render/effect cycle that could briefly reveal a stale historical window.
  const normalizedSearch = search.trim().toLowerCase();
  // The effective public facets are included below after the destination list resolves.
  const [browseWindowState, setBrowseWindowState] = useState({ key: "", page: 1 });

  const discovery = useMemo(
    () =>
      buildShowDiscovery({
        editions: editionsQuery.data ?? [],
        shows: showsQuery.data ?? [],
      }),
    [editionsQuery.data, showsQuery.data],
  );

  // Current-edition and archive are disjoint and together cover every
  // published Show; live/up-next/recent are previews of those same rows.
  const allItems = useMemo(
    () => [...discovery.currentEditionShows, ...discovery.archive].sort((left, right) => {
      const editionDifference =
        (right.edition.edition_number ?? -1) - (left.edition.edition_number ?? -1);
      return editionDifference || left.show.sort_order - right.show.sort_order;
    }),
    [discovery],
  );

  const kinds = useMemo(
    () => [...new Set(allItems.map((item) => item.show.kind).filter(Boolean))].sort(),
    [allItems],
  );
  const editions = useMemo(() => {
    const byId = new Map(allItems.map((item) => [item.edition.id, item.edition]));
    return [...byId.values()].sort(
      (left, right) => (right.edition_number ?? -1) - (left.edition_number ?? -1),
    );
  }, [allItems]);
  // An edition can disappear from public discovery during a publication change.
  // Keep the rendered facet and the actual query on the same permitted value.
  const effectiveEditionId = resolveShowDirectoryFacet(editionId, editions.map((edition) => edition.id));
  const effectiveKind = resolveShowDirectoryFacet(kind, kinds);
  const publicSourcesReady =
    editionsQuery.isSuccess && showsQuery.isSuccess &&
    !editionsQuery.isFetching && !showsQuery.isFetching &&
    !editionsQuery.isRefetchError && !showsQuery.isRefetchError;
  // Keep a deep-linked facet while public data loads; revoke it only after a
  // fresh published dataset proves the option is no longer available.
  useEffect(() => {
    if (!publicSourcesReady) return;
    if (editionId !== effectiveEditionId) setEditionId("all");
    if (kind !== effectiveKind) setKind("all");
  }, [publicSourcesReady, editionId, effectiveEditionId, kind, effectiveKind]);
  useEffect(() => {
    if (!publicSourcesReady || !urlSearch || !onUrlSearchChange) return;
    const next: ShowDirectoryUrlSearch = {
      q: normalizePublicDirectoryUrlQuery(search),
      edition: effectiveEditionId === "all" ? undefined : effectiveEditionId,
      kind: effectiveKind === "all" ? undefined : effectiveKind,
      state: state === "all" ? undefined : state,
    };
    if (next.q === urlSearch.q && next.edition === urlSearch.edition &&
      next.kind === urlSearch.kind && next.state === urlSearch.state) return;
    const timeoutId = window.setTimeout(() => onUrlSearchChange(next), 250);
    return () => window.clearTimeout(timeoutId);
  }, [publicSourcesReady, search, effectiveEditionId, effectiveKind, state,
      urlSearch?.q, urlSearch?.edition, urlSearch?.kind, urlSearch?.state, onUrlSearchChange]);
  const browseFilterKey = JSON.stringify([normalizedSearch, effectiveEditionId, effectiveKind, state]);
  const browseItems = useMemo(
    () =>
      allItems.filter(
        (item) =>
          matchesShowDirectorySearch(normalizedSearch, [
            item.show.name, editionLabel(item.edition),
            showKindLabel(item.show.kind), item.stateLabel,
          ]) &&
          (effectiveEditionId === "all" || item.edition.id === effectiveEditionId) &&
          (effectiveKind === "all" || item.show.kind === effectiveKind) &&
          (state === "all" || item.state === state),
      ),
    [allItems, effectiveEditionId, effectiveKind, state, normalizedSearch],
  );

  const browseWindow = useMemo(
    () => getV3ShowBrowsePage(
      browseItems,
      browseWindowState.key === browseFilterKey ? browseWindowState.page : 1,
    ),
    [browseItems, browseFilterKey, browseWindowState],
  );
  const activeFilterCount = Number(effectiveEditionId !== "all") + Number(effectiveKind !== "all") + Number(state !== "all");
  // Shared fields render in the app filter sheet or desktop/mobile-web filter row,
  // avoiding duplicate controls, translation drift and client bundle cost.
  const filterFields = [
    {
      label: "Edition", allLabel: "All editions", value: effectiveEditionId, onChange: setEditionId,
      options: editions.map((edition) => ({ value: edition.id, label: editionLabel(edition) })),
    },
    {
      label: "Show type", allLabel: "All show types", value: effectiveKind, onChange: setKind,
      options: kinds.map((value) => ({ value, label: showKindLabel(value) })),
    },
    {
      label: "State", allLabel: "All states", value: state,
      onChange: (value: string) => setState(value as ShowDiscoveryState | "all"),
      options: STATE_ORDER.map((value) => ({ value, label: stateFilterLabel(value) })),
    },
  ].map((field) => <ShowFilterSelect key={field.label} {...field} />);

  if (archiveIsLoading(editionsQuery, showsQuery)) {
    return <ArchiveDataLoading label="Loading show discovery…" />;
  }
  if (archiveHasError(editionsQuery, showsQuery)) {
    return (
      <PublicDataState
        kind="error"
        title="Show directory unavailable"
        description="Published show information could not be verified. No cached shows or results are exposed as a fallback."
        action={(
          <button
            type="button"
            className="min-h-11 rounded-lg border border-border bg-surface px-4 text-sm font-semibold"
            disabled={editionsQuery.isFetching || showsQuery.isFetching}
            onClick={() => {
              if (editionsQuery.isError) void editionsQuery.refetch();
              if (showsQuery.isError) void showsQuery.refetch();
            }}
          >
            {editionsQuery.isFetching || showsQuery.isFetching ? "Retrying…" : "Retry published shows"}
          </button>
        )}
      />
    );
  }

  if (!allItems.length) {
    return (
      <AppEmptyState
        title="No public shows yet"
        description="Published shows will appear here when their public pages become available."
        action={allowsReleased("/editions") ? (
          <Link to="/editions" className="solaris-app-empty-action">
            Browse editions
          </Link>
        ) : undefined}
      />
    );
  }

  return (
    <div className="v3-shows-directory space-y-8" data-show-directory-experience={presentation}>
      {[
        { id: "shows-live-now", eyebrow: "Live now", title: "On air",
          items: discovery.liveNow, emphasis: "live" as const },
        { id: "shows-up-next", eyebrow: "Up next", title: "Coming shows",
          items: discovery.upNext.slice(0, 4), emphasis: "normal" as const },
        { id: "shows-recent", eyebrow: "Recent", title: "Latest completed",
          items: discovery.recent, emphasis: "normal" as const },
        { id: "shows-current-edition", eyebrow: "Current edition",
          title: discovery.currentEdition ? editionLabel(discovery.currentEdition) : "",
          items: discovery.currentEditionShows, emphasis: "normal" as const },
      ].filter((collection) => collection.items.length > 0).map((collection) => (
        <ShowCollection key={collection.id} presentation={presentation} {...collection} />
      ))}

      <section id="shows-browse" aria-labelledby="shows-browse-title" className="scroll-mt-24">
        <h2 id="shows-browse-title" className="v3-shows-browse-heading">All public shows</h2>
        <div className={presentation === "installed-app"
          ? "v3-shows-filter-fields v3-shows-filter-fields--app"
          : "v3-shows-filter-fields grid gap-2 sm:grid-cols-3"}>
          {presentation === "installed-app" ? (
            <>
              <SolarisSearchField value={search} onChange={changeSearch}
                label="Search shows" placeholder="Search shows…" />
              <Sheet>
                <SheetTrigger asChild>
                  <button type="button" className="v3-shows-sheet-trigger"
                    aria-label={`Filter shows, ${activeFilterCount} active`}>
                    <SlidersHorizontal size={17} aria-hidden="true" />
                    <span>Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}</span>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" aria-label="Filter public shows"
                  className="max-h-[85dvh] overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                  <h2 className="mb-3 text-lg font-bold">Filter public shows</h2>
                  <div className="grid gap-3">
          {filterFields}
                  </div>
                  <SheetClose asChild>
                    <button type="button" className="mt-4 min-h-11 w-full rounded-xl border border-primary bg-primary/10 px-4 text-sm font-semibold">
                      Show {browseItems.length} matching shows
                    </button>
                  </SheetClose>
                </SheetContent>
              </Sheet>
            </>
          ) : (
            <>
              <div className="v3-directory-search" role="search">
                <Search size={18} aria-hidden="true" />
                <input type="search" value={search} onChange={(event) => changeSearch(event.target.value)}
                  aria-label="Search shows" placeholder="Search show name, edition or type…" />
                {search ? (
                  <button type="button" className="v3-directory-search-clear" aria-label="Clear search"
                    onClick={() => setSearch("")}><X size={16} aria-hidden="true" /></button>
                ) : null}
              </div>
          {filterFields}
            </>
          )}
        </div>
        <p className="v3-directory-results-count" role="status" aria-live="polite">
          Showing {browseWindow.visible.length} of {browseItems.length} matching shows · {allItems.length} published
        </p>
        {browseItems.length > 0 && (search.trim() || activeFilterCount) ? (
          <button type="button" className="v3-directory-clear-filters"
            onClick={() => {
              setSearch(""); setEditionId("all"); setKind("all"); setState("all");
            }}>Clear filters</button>
        ) : null}
        <div id="v3-shows-browse-results" className="v3-shows-browse-results">
          {browseWindow.visible.map((item) =>
            presentation === "mobile-web" ? (
              <ShowRow key={item.show.id} item={item} web />
            ) : presentation === "desktop-web" ? (
              <ShowCard key={item.show.id} item={item} />
            ) : (
              <ShowRow key={item.show.id} item={item} />
            ),
          )}
        </div>
        {browseWindow.hasMore ? (
          <button
            type="button"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-controls="v3-shows-browse-results"
            onClick={() => setBrowseWindowState((previous) => ({
              key: browseFilterKey,
              page: previous.key === browseFilterKey ? previous.page + 1 : 2,
            }))}
          >
            Show {Math.min(V3_SHOW_BROWSE_PAGE_SIZE, browseWindow.remaining)} more shows
          </button>
        ) : null}
        {!browseItems.length ? (
          <AppEmptyState
            className="mt-3"
            title="No shows match"
            description="Try a different edition, show type or state."
            action={
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setEditionId("all");
                  setKind("all");
                  setState("all");
                }}
                className="solaris-app-empty-action"
              >
                Clear filters
              </button>
            }
          />
        ) : null}
      </section>

      {discovery.archive.length > 0 ? (
        <section aria-labelledby="shows-archive-title">
          <AppSectionHeader
            eyebrow="Archive"
            title="Earlier editions"
            id="shows-archive-title"
          />
          <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
            Historical show pages stay locked to their published edition context.
          </p>
          <div className="v3-shows-editorial-list">
            {discovery.archive.slice(0, 8).map((item) =>
              presentation === "mobile-web"
                ? <ShowRow key={item.show.id} item={item} web />
                : <ShowRow key={item.show.id} item={item} compact />,
            )}
          </div>
          {discovery.archive.length > 8 ? (
            <a href="#shows-browse" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary">
              Browse the full show archive →
            </a>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function ShowFilterSelect({
  label, allLabel, value, onChange, options,
}: {
  label: string;
  allLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="text-xs font-semibold text-muted-foreground">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground">
        <option value="all">{allLabel}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ShowCollection({
  presentation,
  id,
  eyebrow,
  title,
  items,
  emphasis = "normal",
}: {
  presentation: V3DirectoryPresentation;
  id: string;
  eyebrow: string;
  title: string;
  items: ShowDiscoveryItem[];
  emphasis?: "normal" | "live";
}) {
  return (
    <section aria-labelledby={id}>
      <AppSectionHeader eyebrow={eyebrow} title={title} id={id} />
      <div className={presentation === "mobile-web" ? "v3-shows-web-list" : emphasis === "live" ? "v3-shows-live-list" : "v3-shows-editorial-list"}>
        {items.map((item) =>
          presentation === "mobile-web"
            ? <ShowRow key={item.show.id} item={item} web />
            : <ShowCard key={item.show.id} item={item} live={emphasis === "live"} />,
        )}
      </div>
    </section>
  );
}

function ShowCard({ item, live = false }: { item: ShowDiscoveryItem; live?: boolean }) {
  const broadcastHref = publicBroadcastHref(item.broadcastUrl);
  return (
    <div className={live ? "v3-shows-editorial-card v3-shows-editorial-card--live" : "v3-shows-editorial-card"}>
      <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ShowStateBadge item={item} />
            <span className="text-xs text-muted-foreground">{editionLabel(item.edition)}</span>
          </div>
          <Link
            to="/shows/$showId"
            params={{ showId: item.show.id }}
            className="mt-2 block text-base font-bold leading-tight"
          >
            {item.show.name}
          </Link>
          <p className="mt-1 text-xs capitalize text-muted-foreground">
            {showKindLabel(item.show.kind)}{item.scheduledStart ? ` · ${formatShowTime(item.scheduledStart)}` : ""}
          </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <Link
          to="/shows/$showId"
          params={{ showId: item.show.id }}
          className="inline-flex min-h-11 items-center font-semibold text-primary"
        >
          Open show →
        </Link>
        {showPublishesResults(item.show) ? (
          <span className="text-muted-foreground">Results published</span>
        ) : null}
        {broadcastHref ? (
          <a
            href={broadcastHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"
          >
            Broadcast <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}

function ShowRow({
  item, compact = false, web = false,
}: { item: ShowDiscoveryItem; compact?: boolean; web?: boolean }) {
  return (
    <Link to="/shows/$showId" params={{ showId: item.show.id }}
      className={web
        ? "v3-show-web-row flex min-h-20 items-center gap-3 border-b border-border py-3"
        : "v3-show-app-editorial-row flex min-h-16 items-center gap-3"}>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <ShowStateBadge item={item} />
          <span className={web ? "text-xs text-muted-foreground" : "truncate text-xs text-muted-foreground"}>
            {editionLabel(item.edition)}
          </span>
        </span>
        <strong className={web ? "mt-1.5 block text-sm font-semibold" : "mt-1 block truncate text-sm font-semibold"}>
          {item.show.name}
        </strong>
        {web || !compact ? (
          <span className={web ? "mt-1 block text-xs capitalize text-muted-foreground" : "mt-0.5 block text-xs capitalize text-muted-foreground"}>
            {showKindLabel(item.show.kind)}
            {item.scheduledStart ? ` · ${formatShowTime(item.scheduledStart)}` : ""}
            {web && showPublishesResults(item.show) ? " · Results published" : ""}
          </span>
        ) : null}
      </span>
      {web ? <ChevronRight size={20} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        : <span aria-hidden="true" className="inline-flex min-h-11 min-w-11 items-center justify-center text-primary">→</span>}
    </Link>
  );
}

function ShowStateBadge({ item }: { item: ShowDiscoveryItem }) {
  const urgent = item.state === "live" || item.state === "paused" || item.state === "delayed";
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${urgent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
    >
      {item.stateLabel}
    </span>
  );
}

function formatShowTime(value: string) {
  return Number.isFinite(Date.parse(value))
    ? formatEventDateTime(value, { locale: "en-GB" })
    : "Time TBA";
}

function stateFilterLabel(state: ShowDiscoveryState) {
  return state === "other" ? "Other" : state.charAt(0).toUpperCase() + state.slice(1);
}

function showKindLabel(kind: string) {
  if (kind === "semi-final") return "Semi-final";
  if (kind === "grand-final" || kind === "final") return "Grand Final";
  if (kind === "special") return "Special";
  return kind.replaceAll("-", " ");
}
