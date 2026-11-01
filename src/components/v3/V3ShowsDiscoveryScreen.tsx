import { Link } from "@tanstack/react-router";
import { ChevronRight, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";

import { AppEmptyState, AppSectionHeader } from "@/components/app/AppPrimitives";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { editionLabel, useAllShows, useEditions } from "@/lib/data";
import { showPublishesResults } from "@/lib/publication";
import { buildShowDiscovery, type ShowDiscoveryItem, type ShowDiscoveryState } from "@/lib/v3-discovery-entities";

const STATE_ORDER: ShowDiscoveryState[] = ["live", "paused", "delayed", "preparing", "scheduled", "ended", "cancelled", "other"];

export function V3ShowsDiscoveryScreen() {
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const [editionId, setEditionId] = useState("all");
  const [kind, setKind] = useState("all");
  const [state, setState] = useState<ShowDiscoveryState | "all">("all");

  const discovery = useMemo(() => buildShowDiscovery({ editions: editionsQuery.data ?? [], shows: showsQuery.data ?? [] }), [editionsQuery.data, showsQuery.data]);
  const allItems = useMemo(() => {
    const byId = new Map<string, ShowDiscoveryItem>();
    for (const item of [...discovery.currentEditionShows, ...discovery.archive, ...discovery.liveNow, ...discovery.upNext, ...discovery.recent]) byId.set(item.show.id, item);
    return [...byId.values()].sort((left, right) => {
      const editionDifference = (right.edition.edition_number ?? -1) - (left.edition.edition_number ?? -1);
      return editionDifference || left.show.sort_order - right.show.sort_order;
    });
  }, [discovery]);
  const kinds = useMemo(() => [...new Set(allItems.map((item) => item.show.kind).filter(Boolean))].sort(), [allItems]);
  const editions = useMemo(() => [...new Map(allItems.map((item) => [item.edition.id, item.edition])).values()].sort((left, right) => (right.edition_number ?? -1) - (left.edition_number ?? -1)), [allItems]);
  const browseItems = useMemo(() => allItems.filter((item) => (editionId === "all" || item.edition.id === editionId) && (kind === "all" || item.show.kind === kind) && (state === "all" || item.state === state)), [allItems, editionId, kind, state]);

  if (archiveIsLoading(editionsQuery, showsQuery)) return <ArchiveDataLoading label="Loading show discovery…" />;
  if (archiveHasError(editionsQuery, showsQuery)) return <ArchiveDataError />;
  if (!allItems.length) {
    return <AppEmptyState title="No public shows yet" description="Published shows will appear here when their public pages become available." action={<Link to="/editions" className="solaris-app-empty-action">Browse editions</Link>} />;
  }

  return (
    <div className="space-y-8" data-v3-shows-directory="">
      {discovery.liveNow.length > 0 ? <ShowCollection id="shows-live-now" eyebrow="Live now" title="On air" items={discovery.liveNow} emphasis="live" /> : null}
      {discovery.upNext.length > 0 ? <ShowCollection id="shows-up-next" eyebrow="Up next" title="Coming shows" items={discovery.upNext.slice(0, 4)} /> : null}
      {discovery.recent.length > 0 ? <ShowCollection id="shows-recent" eyebrow="Recent" title="Recently completed" items={discovery.recent} /> : null}
      {discovery.currentEdition && discovery.currentEditionShows.length > 0 ? <ShowCollection id="shows-current-edition" eyebrow="Current edition" title={editionLabel(discovery.currentEdition)} items={discovery.currentEditionShows} /> : null}

      <section id="shows-browse" aria-labelledby="shows-browse-title" className="scroll-mt-24">
        <AppSectionHeader eyebrow="Browse" title="All public shows" id="shows-browse-title" />
        <div className="grid gap-2 sm:grid-cols-3" data-v3-shows-filters="">
          <Filter label="Edition" value={editionId} onChange={setEditionId} options={[{ value: "all", label: "All editions" }, ...editions.map((edition) => ({ value: edition.id, label: editionLabel(edition) }))]} />
          <Filter label="Show type" value={kind} onChange={setKind} options={[{ value: "all", label: "All show types" }, ...kinds.map((value) => ({ value, label: showKindLabel(value) }))]} />
          <label className="text-xs font-semibold text-muted-foreground">State<select value={state} onChange={(event) => setState(event.target.value as ShowDiscoveryState | "all")} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"><option value="all">All states</option>{STATE_ORDER.map((value) => <option key={value} value={value}>{stateFilterLabel(value)}</option>)}</select></label>
        </div>
        <div className="mt-4 divide-y divide-border/60 border-y border-border/70">
          {browseItems.map((item) => <ShowRow key={item.show.id} item={item} />)}
        </div>
        {!browseItems.length ? <AppEmptyState className="mt-3" title="No shows match" description="Try a different edition, show type or state." action={<button type="button" onClick={() => { setEditionId("all"); setKind("all"); setState("all"); }} className="solaris-app-empty-action">Clear filters</button>} /> : null}
      </section>

      {discovery.archive.length > 0 ? (
        <section aria-labelledby="shows-archive-title">
          <AppSectionHeader eyebrow="Archive" title="Earlier editions" id="shows-archive-title" />
          <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Historical show pages stay locked to their published edition context.</p>
          <div className="divide-y divide-border/60 border-y border-border/70">{discovery.archive.slice(0, 8).map((item) => <ShowRow key={item.show.id} item={item} compact />)}</div>
          {discovery.archive.length > 8 ? <a href="#shows-browse" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary">Browse the full show archive →</a> : null}
        </section>
      ) : null}
    </div>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <label className="text-xs font-semibold text-muted-foreground">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function ShowCollection({ id, eyebrow, title, items, emphasis = "normal" }: { id: string; eyebrow: string; title: string; items: ShowDiscoveryItem[]; emphasis?: "normal" | "live" }) {
  return (
    <section aria-labelledby={id}>
      <AppSectionHeader eyebrow={eyebrow} title={title} id={id} />
      <div className={`divide-y divide-border/60 border-y ${emphasis === "live" ? "border-primary/30" : "border-border/70"}`}>
        {items.map((item) => <ShowRow key={item.show.id} item={item} live={emphasis === "live"} />)}
      </div>
    </section>
  );
}

function ShowRow({ item, compact = false, live = false }: { item: ShowDiscoveryItem; compact?: boolean; live?: boolean }) {
  return (
    <div className={`flex min-h-16 items-center gap-3 py-3 ${live ? "border-l-2 border-primary pl-3" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><ShowStateBadge item={item} /><span className="truncate text-xs text-muted-foreground">{editionLabel(item.edition)}</span></div>
        <Link to="/shows/$showId" params={{ showId: item.show.id }} className="mt-1 block truncate text-sm font-semibold">{item.show.name}</Link>
        {!compact ? <span className="mt-0.5 block text-xs capitalize text-muted-foreground">{showKindLabel(item.show.kind)}{item.scheduledStart ? ` · ${formatShowTime(item.scheduledStart)}` : ""}{showPublishesResults(item.show) ? " · results published" : ""}</span> : null}
      </div>
      {item.broadcastUrl ? <a href={item.broadcastUrl} target="_blank" rel="noreferrer" aria-label={`Open ${item.show.name} broadcast`} className="grid min-h-11 min-w-11 place-items-center text-primary"><ExternalLink className="size-4" aria-hidden="true" /></a> : null}
      <Link to="/shows/$showId" params={{ showId: item.show.id }} aria-label={`Open ${item.show.name}`} className="grid min-h-11 min-w-11 place-items-center text-primary"><ChevronRight className="size-4" aria-hidden="true" /></Link>
    </div>
  );
}

function ShowStateBadge({ item }: { item: ShowDiscoveryItem }) {
  const urgent = item.state === "live" || item.state === "paused" || item.state === "delayed";
  return <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${urgent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{item.stateLabel}</span>;
}

function formatShowTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time TBA";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki", timeZoneName: "short" }).format(date);
}

function stateFilterLabel(state: ShowDiscoveryState) { return state === "other" ? "Other" : state.charAt(0).toUpperCase() + state.slice(1); }
function showKindLabel(kind: string) { if (kind === "semi-final") return "Semi-final"; if (kind === "grand-final" || kind === "final") return "Grand Final"; if (kind === "special") return "Special"; return kind.replaceAll("-", " "); }
