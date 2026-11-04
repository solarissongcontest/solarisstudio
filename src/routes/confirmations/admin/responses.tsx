import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Search, ShieldAlert, XCircle } from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { Input } from "@/components/ui/input";
import {
  loadConfirmationEditions,
  type ConfirmationEdition,
} from "@/integrations/confirmations/admin";
import { confirmationsSupabase } from "@/integrations/confirmations/client";
import {
  loadConfirmationResponsesPage,
  type ConfirmationProjectionCursor,
} from "@/integrations/confirmations/v3-projections";

export const Route = createFileRoute("/confirmations/admin/responses")({
  head: () => ({
    meta: [
      { title: "Delegation responses — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmationResponsesPage,
});

type Entry = {
  id: string;
  artist: string | null;
  song_title: string | null;
  song_url: string | null;
  review_status: string | null;
  review_reason?: string | null;
  reviewed_at?: string | null;
  current_version_id?: string | null;
  reviewed_version_id?: string | null;
  content_revision?: number | null;
  removed?: boolean | null;
  position?: number;
};

type ResponseRow = {
  id: string;
  country: string;
  instagram_username: string;
  participating: boolean;
  selection_method: string | null;
  entry_unknown: boolean;
  nf_entries_unknown: boolean;
  reviewed: boolean;
  locked: boolean;
  editing_allowed: boolean;
  review_version?: number;
  submitted_at: string;
  updated_at: string;
  internal_entries: Entry | null;
  national_finals: {
    id: string;
    nf_name: string | null;
    winning_entry_id: string | null;
    national_final_entries: Entry[];
  } | null;
  submission_rounds: { id: string; name: string; edition_id: string } | null;
  editions: { id: string; name: string; edition_number: number } | null;
};

type NextInLineRow = {
  id: string;
  edition_id: string;
  source_submission_id: string | null;
  country: string;
  participating: boolean;
  entry_unknown: boolean;
  selection_type: string;
  national_final_entry_id: string | null;
  artist: string | null;
  song_title: string | null;
  song_url: string | null;
  preview_start: string | null;
  preview_end: string | null;
  submitted_at: string;
  edition: { id: string; name: string; edition_number: number } | null;
};

type CardState = "review" | "issue" | "ready" | "neutral";

type ResponseFilter =
  | "all"
  | "participating"
  | "not_participating"
  | "internal"
  | "national_final"
  | "song_submitted"
  | "song_missing"
  | "unreviewed"
  | "accepted_overall"
  | "nf_accepted"
  | "internal_accepted"
  | "declined_overall"
  | "nf_declined"
  | "internal_declined";

const FILTERS: Array<{ value: ResponseFilter; label: string }> = [
  { value: "all", label: "All responses" },
  { value: "participating", label: "Participating" },
  { value: "not_participating", label: "Not participating" },
  { value: "internal", label: "Internal selection" },
  { value: "national_final", label: "National Final" },
  { value: "song_submitted", label: "Song submitted" },
  { value: "song_missing", label: "Song missing" },
  { value: "unreviewed", label: "Needs review" },
  { value: "accepted_overall", label: "Songs accepted overall" },
  { value: "nf_accepted", label: "NF songs accepted" },
  { value: "internal_accepted", label: "Internal songs accepted" },
  { value: "declined_overall", label: "Songs declined overall" },
  { value: "nf_declined", label: "NF songs declined" },
  { value: "internal_declined", label: "Internal songs declined" },
];

function activeNfEntries(row: ResponseRow) {
  return (row.national_finals?.national_final_entries ?? []).filter(
    (entry) => !entry.removed && entry.review_status !== "removed",
  );
}

function hasAcceptedInternal(row: ResponseRow) {
  return row.selection_method === "internal" && row.internal_entries?.review_status === "accepted";
}

function hasDeclinedInternal(row: ResponseRow) {
  return row.selection_method === "internal" && row.internal_entries?.review_status === "declined";
}

function hasAcceptedNf(row: ResponseRow) {
  return row.selection_method === "national_final" && activeNfEntries(row).some((entry) => entry.review_status === "accepted");
}

function hasDeclinedNf(row: ResponseRow) {
  return row.selection_method === "national_final" && activeNfEntries(row).some((entry) => entry.review_status === "declined");
}

function songSubmitted(row: ResponseRow) {
  if (!row.participating) return false;
  if (row.selection_method === "internal") return Boolean(row.internal_entries?.song_title);
  if (row.selection_method === "national_final") return activeNfEntries(row).length > 0;
  return false;
}

function responseCardState(row: ResponseRow): CardState {
  if (!row.participating) return "neutral";
  if (row.selection_method === "internal") {
    const entry = row.internal_entries;
    if (!entry?.song_title || row.entry_unknown) return "neutral";
    if (entry.review_status === "declined" || entry.review_status === "removed") return "issue";
    if (!entry.review_status || entry.review_status === "pending") return "review";
    return entry.review_status === "accepted" ? "ready" : "neutral";
  }
  if (row.selection_method === "national_final") {
    const entries = activeNfEntries(row);
    if (!entries.length || row.nf_entries_unknown) return "neutral";
    if (entries.some((entry) => entry.review_status === "declined")) return "issue";
    if (entries.some((entry) => !entry.review_status || entry.review_status === "pending")) return "review";
    return row.national_finals?.winning_entry_id ? "ready" : "neutral";
  }
  return "neutral";
}

function statePriority(state: CardState) {
  if (state === "review") return 0;
  if (state === "issue") return 1;
  if (state === "neutral") return 2;
  return 3;
}

function cardGlow(state: CardState) {
  if (state === "review") return "border-rose-400/65 bg-rose-400/[0.055] shadow-[0_0_18px_rgba(251,113,133,0.28),0_0_46px_rgba(244,63,94,0.14),inset_0_0_22px_rgba(244,63,94,0.045)]";
  if (state === "issue") return "border-amber-300/60 bg-amber-300/[0.05] shadow-[0_0_18px_rgba(252,211,77,0.24),0_0_46px_rgba(245,158,11,0.13),inset_0_0_22px_rgba(245,158,11,0.04)]";
  if (state === "ready") return "border-emerald-300/50 bg-emerald-300/[0.045] shadow-[0_0_18px_rgba(110,231,183,0.22),0_0_46px_rgba(16,185,129,0.12),inset_0_0_22px_rgba(16,185,129,0.035)]";
  return "";
}

function StateBadge({ state }: { state: CardState }) {
  if (state === "review") return <AdminStatus tone="blocked"><span className="inline-flex items-center gap-1"><CircleAlert className="size-3" /> Needs review</span></AdminStatus>;
  if (state === "issue") return <AdminStatus tone="attention"><span className="inline-flex items-center gap-1"><XCircle className="size-3" /> Needs fixing</span></AdminStatus>;
  if (state === "ready") return <AdminStatus tone="ready"><span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3" /> Ready</span></AdminStatus>;
  return <AdminStatus tone="neutral">Waiting</AdminStatus>;
}

function matchesFilter(row: ResponseRow, filter: ResponseFilter) {
  if (filter === "all") return true;
  if (filter === "participating") return row.participating;
  if (filter === "not_participating") return !row.participating;
  if (filter === "internal") return row.selection_method === "internal";
  if (filter === "national_final") return row.selection_method === "national_final";
  if (filter === "song_submitted") return songSubmitted(row);
  if (filter === "song_missing") return row.participating && !songSubmitted(row);
  if (filter === "unreviewed") return responseCardState(row) === "review";
  if (filter === "accepted_overall") return hasAcceptedInternal(row) || hasAcceptedNf(row);
  if (filter === "nf_accepted") return hasAcceptedNf(row);
  if (filter === "internal_accepted") return hasAcceptedInternal(row);
  if (filter === "declined_overall") return hasDeclinedInternal(row) || hasDeclinedNf(row);
  if (filter === "nf_declined") return hasDeclinedNf(row);
  if (filter === "internal_declined") return hasDeclinedInternal(row);
  return true;
}

function ConfirmationResponsesPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId } = useAdminContext();

  if (pathname.startsWith(`${Route.fullPath}/`)) {
    if (!editionId) {
      return (
        <div className="admin-page pb-5">
          <AdminCard>
            <AdminEmptyState
              icon={CircleAlert}
              title="Select an edition"
              description="Entry Review is edition-scoped operational work. Select the exact Organizer edition before opening a response detail."
            />
          </AdminCard>
        </div>
      );
    }
    return <Outlet />;
  }

  return <ConfirmationResponsesList />;
}

function ConfirmationResponsesList() {
  const { editionId: organizerEditionId, setEditionId: setOrganizerEditionId } = useAdminContext();
  const activeEditionRef = useRef(organizerEditionId);
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [nextRows, setNextRows] = useState<NextInLineRow[]>([]);
  const [loadingEditions, setLoadingEditions] = useState(true);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [loadingMoreResponses, setLoadingMoreResponses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResponseFilter>("all");
  const [mode, setMode] = useState<"confirmations" | "next_in_line">("confirmations");
  const [editionId, setEditionId] = useState(organizerEditionId);
  const [roundId, setRoundId] = useState("all");
  const [responseCursor, setResponseCursor] = useState<ConfirmationProjectionCursor | null>(null);
  const [responseTotalCount, setResponseTotalCount] = useState(0);
  const [responseStateVersion, setResponseStateVersion] = useState<string | null>(null);

  useEffect(() => {
    activeEditionRef.current = editionId;
  }, [editionId]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const editionRows = await loadConfirmationEditions();
        if (!alive) return;
        setEditions(editionRows);
        const selected = editionRows.find((edition) => edition.id === organizerEditionId)?.id ?? "";
        setEditionId(selected);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Editions could not be loaded.");
      } finally {
        if (alive) setLoadingEditions(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const nextEditionId = editions.find((edition) => edition.id === organizerEditionId)?.id ?? "";
    if (nextEditionId !== editionId) {
      setEditionId(nextEditionId);
      setRoundId("all");
      setMode("confirmations");
    }
  }, [editionId, editions, organizerEditionId]);

  useEffect(() => {
    let alive = true;
    setRows([]);
    setResponseCursor(null);
    setResponseTotalCount(0);
    setResponseStateVersion(null);
    setError(null);

    if (!editionId) {
      setLoadingResponses(false);
      return () => { alive = false; };
    }

    setLoadingResponses(true);
    void (async () => {
      try {
        const page = await loadConfirmationResponsesPage<ResponseRow>(editionId);
        if (!alive) return;
        setRows(page.rows);
        setResponseCursor(page.page.hasMore ? page.page.nextCursor : null);
        setResponseTotalCount(page.totalCount);
        setResponseStateVersion(page.stateVersion);
      } catch (caught) {
        if (!alive) return;
        setError(caught instanceof Error ? caught.message : "Responses could not be loaded.");
        setRows([]);
      } finally {
        if (alive) setLoadingResponses(false);
      }
    })();

    return () => { alive = false; };
  }, [editionId]);

  useEffect(() => {
    let alive = true;
    setNextRows([]);
    if (!editionId) return () => { alive = false; };

    void (async () => {
      const result = await confirmationsSupabase.rpc("admin_confirmation_next_in_line", {
        _edition_id: editionId,
      });
      if (!alive) return;
      if (result.error) {
        setError((current) => current ?? result.error.message);
      } else {
        setNextRows(Array.isArray(result.data) ? (result.data as unknown as NextInLineRow[]) : []);
      }
    })();

    return () => { alive = false; };
  }, [editionId]);

  async function loadMoreResponses() {
    if (!editionId || !responseCursor || loadingMoreResponses) return;
    const requestedEditionId = editionId;
    const requestedCursor = responseCursor;
    setLoadingMoreResponses(true);
    try {
      const page = await loadConfirmationResponsesPage<ResponseRow>(requestedEditionId, requestedCursor);
      if (activeEditionRef.current !== requestedEditionId) return;
      setRows((current) => {
        const byId = new Map(current.map((row) => [row.id, row]));
        page.rows.forEach((row) => byId.set(row.id, row));
        return [...byId.values()];
      });
      setResponseCursor(page.page.hasMore ? page.page.nextCursor : null);
      setResponseTotalCount(page.totalCount);
      setResponseStateVersion(page.stateVersion);
    } catch (caught) {
      if (activeEditionRef.current === requestedEditionId) {
        setError(caught instanceof Error ? caught.message : "More responses could not be loaded.");
      }
    } finally {
      if (activeEditionRef.current === requestedEditionId) setLoadingMoreResponses(false);
    }
  }

  const rounds = useMemo(() => {
    const map = new Map<string, { id: string; name: string; edition_id: string }>();
    rows.forEach((row) => {
      const round = row.submission_rounds;
      if (round?.edition_id === editionId) map.set(round.id, round);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [editionId, rows]);

  useEffect(() => {
    if (roundId !== "all" && !rounds.some((round) => round.id === roundId)) setRoundId("all");
  }, [roundId, rounds]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (row.editions?.id !== editionId) return false;
        if (roundId !== "all" && row.submission_rounds?.id !== roundId) return false;
        if (!matchesFilter(row, filter)) return false;
        if (!term) return true;
        const internal = row.internal_entries;
        const nfEntries = row.national_finals?.national_final_entries ?? [];
        return [
          row.country,
          row.instagram_username,
          row.selection_method ?? "",
          row.submission_rounds?.name ?? "",
          internal?.artist ?? "",
          internal?.song_title ?? "",
          row.national_finals?.nf_name ?? "",
          ...nfEntries.flatMap((entry) => [entry.artist ?? "", entry.song_title ?? ""]),
        ].join(" ").toLowerCase().includes(term);
      })
      .sort((a, b) => {
        const priority = statePriority(responseCardState(a)) - statePriority(responseCardState(b));
        return priority || new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
      });
  }, [editionId, filter, query, roundId, rows]);

  const filteredNext = useMemo(() => {
    const term = query.trim().toLowerCase();
    return nextRows.filter((row) => {
      if (row.edition_id !== editionId) return false;
      return !term || [row.country, row.artist ?? "", row.song_title ?? "", row.selection_type]
        .join(" ").toLowerCase().includes(term);
    });
  }, [editionId, nextRows, query]);

  const reviewCount = rows.filter((row) => responseCardState(row) === "review").length;
  const issueCount = rows.filter((row) => responseCardState(row) === "issue").length;
  const readyCount = rows.filter((row) => responseCardState(row) === "ready").length;
  const loading = loadingEditions || (Boolean(editionId) && loadingResponses);

  return (
    <div className="admin-page pb-5" data-v3-organizer-entry-review="">
      <AdminPageHeader
        eyebrow="Contest · Entry Review"
        title="Responses"
        description="Review confirmation and entry state for the exact edition selected in Solaris Organizer. The response queue is fetched through the bounded edition-scoped server projection; historical editions are never downloaded into this browser view."
        actions={<Link to="/confirmations/admin" className="admin-action-secondary">Delegations overview</Link>}
      />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button type="button" disabled={!editionId} onClick={() => setMode("confirmations")} className={mode === "confirmations" ? "admin-action-primary" : "admin-action-secondary"}>Confirmations</button>
        <button type="button" disabled={!editionId} onClick={() => { setMode("next_in_line"); setRoundId("all"); }} className={mode === "next_in_line" ? "admin-action-primary" : "admin-action-secondary"}>Next in Line</button>
      </div>

      {editionId && mode === "confirmations" ? (
        <>
          <div className="mb-2 grid grid-cols-3 gap-2">
            <Metric label="Review" value={reviewCount} tone="rose" />
            <Metric label="Problems" value={issueCount} tone="amber" />
            <Metric label="Ready" value={readyCount} tone="emerald" />
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Loaded {rows.length} of {responseTotalCount} response{responseTotalCount === 1 ? "" : "s"}
            {responseStateVersion ? ` · canonical state ${responseStateVersion.slice(-12)}` : ""}.
          </p>
        </>
      ) : null}

      <AdminCard className="mb-4 !p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_1.4fr]">
          <select
            value={editionId}
            onChange={(event) => {
              const nextEditionId = event.target.value;
              setRows([]);
              setNextRows([]);
              setEditionId(nextEditionId);
              setOrganizerEditionId(nextEditionId);
              setRoundId("all");
              setMode("confirmations");
            }}
            className="min-h-11 rounded-xl border border-white/[0.09] bg-background px-3 text-sm text-foreground [color-scheme:dark]"
          >
            <option value="">Select edition…</option>
            {editions.map((edition) => <option key={edition.id} value={edition.id}>SSC {edition.edition_number} · {edition.name}</option>)}
          </select>

          {mode === "confirmations" ? (
            <select disabled={!editionId} value={roundId} onChange={(event) => setRoundId(event.target.value)} className="min-h-11 rounded-xl border border-white/[0.09] bg-background px-3 text-sm text-foreground [color-scheme:dark] disabled:opacity-45">
              <option value="all">All loaded rounds</option>
              {rounds.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}
            </select>
          ) : <div className="hidden md:block" />}

          {mode === "confirmations" ? (
            <select disabled={!editionId} value={filter} onChange={(event) => setFilter(event.target.value as ResponseFilter)} className="min-h-11 rounded-xl border border-white/[0.09] bg-background px-3 text-sm text-foreground [color-scheme:dark] disabled:opacity-45">
              {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          ) : <div className="hidden md:block" />}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search confirmation responses" disabled={!editionId} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search country, username, artist or song…" className="min-h-11 pl-9" />
          </div>
        </div>
      </AdminCard>

      {loading ? (
        <AdminCard className="py-8 text-center text-sm text-muted-foreground">Loading exact-edition responses…</AdminCard>
      ) : error ? (
        <AdminCard className="mb-4 border-rose-200/20 bg-rose-200/[0.045]">
          <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-rose-200" /><div><p className="font-semibold">Responses could not be loaded</p><p className="mt-1 text-sm text-muted-foreground">{error}</p></div></div>
        </AdminCard>
      ) : !editionId ? (
        <AdminCard><AdminEmptyState icon={CircleAlert} title="Select an edition" description="Entry Review is edition-scoped. Solaris will not combine historical response queues or substitute a globally active or newest edition." /></AdminCard>
      ) : mode === "next_in_line" ? (
        filteredNext.length ? (
          <section className="grid gap-3 lg:grid-cols-2">
            {filteredNext.map((row) => (
              <AdminCard key={row.id} className="!p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="admin-section-label">{row.edition ? `SSC ${row.edition.edition_number}` : "Next in Line"}</p><h2 className="mt-1 text-lg font-bold">{row.country}</h2></div><AdminStatus tone={row.participating ? "ready" : "neutral"}>{row.participating ? "Would participate" : "Would not participate"}</AdminStatus></div>
                {row.participating ? <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.022] p-3 text-sm"><p className="font-semibold">{row.entry_unknown ? "Entry not known yet" : row.song_title ? `${row.artist || "Unknown artist"} — ${row.song_title}` : "Entry details not submitted"}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{row.selection_type.replaceAll("_", " ")}{row.preview_start ? ` · preview ${row.preview_start}${row.preview_end ? `–${row.preview_end}` : ""}` : ""}</p>{row.song_url ? <a href={row.song_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-sky-100/75 underline">Open song</a> : null}</div> : null}
              </AdminCard>
            ))}
          </section>
        ) : <AdminCard><AdminEmptyState title="No Next in Line responses" description="Nothing matches the selected edition or search." /></AdminCard>
      ) : filtered.length ? (
        <section className="grid gap-3 lg:grid-cols-2">
          {filtered.map((row) => {
            const state = responseCardState(row);
            const internal = row.internal_entries;
            const nf = row.national_finals;
            const activeEntries = activeNfEntries(row);
            const entrySummary = !row.participating
              ? "Not participating"
              : row.selection_method === "internal"
                ? internal?.song_title ? `${internal.artist || "Unknown artist"} — ${internal.song_title}` : "Internal entry not decided yet"
                : row.selection_method === "national_final"
                  ? `${nf?.nf_name || "National Final"} · ${activeEntries.length} ${activeEntries.length === 1 ? "entry" : "entries"}`
                  : "Selection method not submitted yet";
            return (
              <AdminCard key={row.id} className={`!p-4 transition-shadow ${cardGlow(state)}`}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="admin-section-label">{row.editions ? `SSC ${row.editions.edition_number}` : "SSC"} · {row.submission_rounds?.name ?? "Confirmation"}</p><h2 className="mt-1 truncate text-lg font-bold tracking-[-.02em]">{row.country}</h2><p className="mt-1 truncate text-xs text-muted-foreground">@{row.instagram_username.replace(/^@/, "")}</p></div><StateBadge state={state} /></div>
                <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.022] p-3"><p className="text-sm font-semibold leading-snug">{entrySummary}</p>{row.selection_method === "national_final" && activeEntries.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">{nf?.winning_entry_id ? "National Final winner selected" : activeEntries.every((entry) => entry.review_status === "accepted") ? "All songs reviewed · waiting for winner" : "National Final songs still need review"}</p> : null}</div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{new Date(row.submitted_at).toLocaleDateString()}</span><span>{row.locked ? "Locked" : row.editing_allowed ? "Editing allowed" : "Editing closed"}</span></div>
                <Link to="/confirmations/admin/responses/$id" params={{ id: row.id }} className={state === "review" || state === "issue" ? "admin-action-primary mt-4 w-full" : "admin-action-secondary mt-4 w-full"}>{state === "review" ? "Review response" : state === "issue" ? "Fix response" : "Open response"}</Link>
              </AdminCard>
            );
          })}
        </section>
      ) : <AdminCard><AdminEmptyState title={query ? "No matching responses" : "Nothing in this view"} description={query ? "Try another country, username, artist or song." : "No responses match the selected filters in the loaded page."} /></AdminCard>}

      {mode === "confirmations" && responseCursor ? (
        <div className="mt-4 flex justify-center">
          <button type="button" disabled={loadingMoreResponses} onClick={() => void loadMoreResponses()} className="admin-action-secondary">
            {loadingMoreResponses ? "Loading…" : `Load more · ${Math.max(0, responseTotalCount - rows.length)} remaining`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "rose" | "amber" | "emerald" }) {
  const className = tone === "rose"
    ? "border-rose-300/20 bg-rose-300/[0.035] text-rose-100/70"
    : tone === "amber"
      ? "border-amber-300/20 bg-amber-300/[0.035] text-amber-100/70"
      : "border-emerald-300/20 bg-emerald-300/[0.035] text-emerald-100/70";
  return <div className={`rounded-xl border p-3 text-center ${className}`}><p className="text-[10px] font-semibold uppercase tracking-wider">{label}</p><p className="mt-1 text-xl font-bold text-foreground">{value}</p></div>;
}
