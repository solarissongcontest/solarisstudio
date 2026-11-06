import { Link } from "@tanstack/react-router";
import { ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import type { V3DirectoryPresentation } from "@/lib/v3-directory-presentation";
import "@/styles/v3-shows-directory.css";
import { useMemo, useState } from "react";

import { AppEmptyState, AppSectionHeader } from "@/components/app/AppPrimitives";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { editionLabel, useAllShows, useEditions } from "@/lib/data";
import { showPublishesResults } from "@/lib/publication";
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

export function V3ShowsDiscoveryScreen({ presentation = "installed-app" }: { presentation?: V3DirectoryPresentation }) {
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const [search, setSearch] = useState("");
  const [editionId, setEditionId] = useState("all");
  const [kind, setKind] = useState("all");
  const [state, setState] = useState<ShowDiscoveryState | "all">("all");
  // Keyed pagination resets synchronously with any filter change, without a
  // render/effect cycle that could briefly reveal a stale historical window.
  const browseFilterKey = JSON.stringify([search.trim(), editionId, kind, state]);
  const [browseWindowState, setBrowseWindowState] = useState({ key: "", page: 1 });

  const discovery = useMemo(
    () =>
      buildShowDiscovery({
        editions: editionsQuery.data ?? [],
        shows: showsQuery.data ?? [],
      }),
    [editionsQuery.data, showsQuery.data],
  );

  const allItems = useMemo(() => {
    const byId = new Map<string, ShowDiscoveryItem>();
    for (const item of [
      ...discovery.currentEditionShows,
      ...discovery.archive,
      ...discovery.liveNow,
      ...discovery.upNext,
      ...discovery.recent,
    ]) {
      byId.set(item.show.id, item);
    }
    return [...byId.values()].sort((left, right) => {
      const editionDifference =
        (right.edition.edition_number ?? -1) - (left.edition.edition_number ?? -1);
      return editionDifference || left.show.sort_order - right.show.sort_order;
    });
  }, [discovery]);

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
  const browseItems = useMemo(
    () =>
      allItems.filter(
        (item) =>
          (!search.trim() || [
            item.show.name, editionLabel(item.edition),
            showKindLabel(item.show.kind), item.stateLabel,
          ].join(" ").toLowerCase().includes(search.trim().toLowerCase())) &&
          (editionId === "all" || item.edition.id === editionId) &&
          (kind === "all" || item.show.kind === kind) &&
          (state === "all" || item.state === state),
      ),
    [allItems, editionId, kind, state, search],
  );

  const browseWindow = useMemo(
    () => getV3ShowBrowsePage(
      browseItems,
      browseWindowState.key === browseFilterKey ? browseWindowState.page : 1,
    ),
    [browseItems, browseFilterKey, browseWindowState],
  );
  const activeFilterCount = [editionId !== "all", kind !== "all", state !== "all"].filter(Boolean).length;
  // Shared fields render in the app filter sheet or desktop/mobile-web filter row,
  // avoiding duplicate controls, translation drift and client bundle cost.
  const filterFields = (
    <>
      <label className="text-xs font-semibold text-muted-foreground">
            Edition
            <select
              value={editionId}
              onChange={(event) => setEditionId(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
            >
              <option value="all">All editions</option>
              {editions.map((edition) => (
                <option key={edition.id} value={edition.id}>
                  {editionLabel(edition)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Show type
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
            >
              <option value="all">All show types</option>
              {kinds.map((value) => (
                <option key={value} value={value}>
                  {showKindLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            State
            <select
              value={state}
              onChange={(event) => setState(event.target.value as ShowDiscoveryState | "all")}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
            >
              <option value="all">All states</option>
              {STATE_ORDER.map((value) => (
                <option key={value} value={value}>
                  {stateFilterLabel(value)}
                </option>
              ))}
            </select>
          </label>
    </>
  );

  if (archiveIsLoading(editionsQuery, showsQuery)) {
    return <ArchiveDataLoading label="Loading show discovery…" />;
  }
  if (archiveHasError(editionsQuery, showsQuery)) {
    return <ArchiveDataError />;
  }

  if (!allItems.length) {
    return (
      <AppEmptyState
        title="No public shows yet"
        description="Published shows will appear here when their public pages become available."
        action={
          <Link to="/editions" className="solaris-app-empty-action">
            Browse editions
          </Link>
        }
      />
    );
  }

  return (
    <div className="v3-shows-directory space-y-8" data-show-directory-experience={presentation}>
      {discovery.liveNow.length > 0 ? (
        <ShowCollection
          presentation={presentation}
          id="shows-live-now"
          eyebrow="Live now"
          title="On air"
          items={discovery.liveNow}
          emphasis="live"
        />
      ) : null}

      {discovery.upNext.length > 0 ? (
        <ShowCollection
          presentation={presentation}
          id="shows-up-next"
          eyebrow="Up next"
          title="Coming shows"
          items={discovery.upNext.slice(0, 4)}
        />
      ) : null}

      {discovery.recent.length > 0 ? (
        <ShowCollection
          presentation={presentation}
          id="shows-recent"
          eyebrow="Recent"
          title="Latest completed"
          items={discovery.recent}
        />
      ) : null}

      {discovery.currentEdition && discovery.currentEditionShows.length > 0 ? (
        <ShowCollection
          presentation={presentation}
          id="shows-current-edition"
          eyebrow="Current edition"
          title={editionLabel(discovery.currentEdition)}
          items={discovery.currentEditionShows}
        />
      ) : null}

      <section id="shows-browse" aria-labelledby="shows-browse-title" className="scroll-mt-24">
        <h2 id="shows-browse-title" className="v3-shows-browse-heading">All public shows</h2>
        <div className={presentation === "installed-app"
          ? "v3-shows-filter-fields v3-shows-filter-fields--app"
          : "v3-shows-filter-fields grid gap-2 sm:grid-cols-3"}>
          {presentation === "installed-app" ? (
            <>
              <SolarisSearchField value={search} onChange={setSearch}
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
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
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
        <div id="v3-shows-browse-results" className="v3-shows-browse-results">
          {browseWindow.visible.map((item) =>
            presentation === "mobile-web" ? (
              <ShowWebRow key={item.show.id} item={item} />
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
          <div className="space-y-2">
            {discovery.archive.slice(0, 8).map((item) =>
              presentation === "mobile-web"
                ? <ShowWebRow key={item.show.id} item={item} />
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
      <div className={presentation === "mobile-web" ? "v3-shows-web-list" : emphasis === "live" ? "grid gap-3" : "grid gap-2 sm:grid-cols-2"}>
        {items.map((item) =>
          presentation === "mobile-web"
            ? <ShowWebRow key={item.show.id} item={item} />
            : <ShowCard key={item.show.id} item={item} live={emphasis === "live"} />,
        )}
      </div>
    </section>
  );
}

function ShowWebRow({ item }: { item: ShowDiscoveryItem }) {
  return (
    <Link
      to="/shows/$showId"
      params={{ showId: item.show.id }}
      className="v3-show-web-row flex min-h-20 items-center gap-3 border-b border-border py-3"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <ShowStateBadge item={item} />
          <span className="text-xs text-muted-foreground">{editionLabel(item.edition)}</span>
        </span>
        <strong className="mt-1.5 block text-sm font-semibold">{item.show.name}</strong>
        <span className="mt-1 block text-xs capitalize text-muted-foreground">
          {showKindLabel(item.show.kind)}
          {item.scheduledStart ? ` · ${formatShowTime(item.scheduledStart)}` : ""}
          {showPublishesResults(item.show) ? " · Results published" : ""}
        </span>
      </span>
      <ChevronRight size={20} className="shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

function ShowCard({ item, live = false }: { item: ShowDiscoveryItem; live?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${live ? "border-primary/45 bg-primary/5" : "border-border bg-surface"}`}>
      <div className="flex items-start justify-between gap-3">
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
        {item.broadcastUrl ? (
          <a
            href={item.broadcastUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"
          >
            Broadcast <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}

function ShowRow({ item, compact = false }: { item: ShowDiscoveryItem; compact?: boolean }) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <ShowStateBadge item={item} />
          <span className="truncate text-xs text-muted-foreground">{editionLabel(item.edition)}</span>
        </div>
        <Link
          to="/shows/$showId"
          params={{ showId: item.show.id }}
          className="mt-1 block truncate text-sm font-semibold"
        >
          {item.show.name}
        </Link>
        {!compact ? (
          <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
            {showKindLabel(item.show.kind)}{item.scheduledStart ? ` · ${formatShowTime(item.scheduledStart)}` : ""}
          </span>
        ) : null}
      </div>
      <Link
        to="/shows/$showId"
        params={{ showId: item.show.id }}
        aria-label={`Open ${item.show.name}`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center text-primary"
      >
        →
      </Link>
    </div>
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
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time TBA";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Helsinki",
    timeZoneName: "short",
  }).format(date);
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
