import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  classifyOrganizerEntryReview,
  deriveOrganizerResponseReviewState,
  hasCurrentOrganizerResponseReviewDecision,
  describeOrganizerNationalFinalQueue,
  hasOutdatedOrganizerResponseReview,
} from "@/lib/v3-organizer-entry-review-status";
import {
  loadConfirmationResponsesPage,
  type ConfirmationProjectionCursor,
} from "@/integrations/confirmations/v3-projections";
import {
  assertOrganizerResponsePageContinuity,
  assertOrganizerResponsePageDisjoint,
  safeOrganizerResponseSongUrl,
  assertOrganizerNextInLineRowsInScope,
  assertOrganizerResponseRowsInEdition,
} from "@/lib/v3-organizer-response-queue-guards";
import {
  buildOrganizerEntryReviewWorklist,
  matchesOrganizerEntryWorkFilter,
  matchesOrganizerEntryWorkSearch,
  type OrganizerEntryWorkFilter,
} from "@/lib/v3-organizer-entry-review-worklist";

type OrganizerResponsesView = "confirmations" | "entry_review" | "next_in_line";

export const Route = createFileRoute("/confirmations/admin/responses")({
  validateSearch: (search: Record<string, unknown>): { view: OrganizerResponsesView } => ({
    view: search.view === "entry_review" || search.view === "next_in_line"
      ? search.view
      : "confirmations",
  }),
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
  | "outdated_review"
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
  { value: "outdated_review", label: "Outdated review evidence" },
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
  return hasCurrentOrganizerResponseReviewDecision(row, "internal", "accepted");
}

function hasDeclinedInternal(row: ResponseRow) {
  return hasCurrentOrganizerResponseReviewDecision(row, "internal", "declined");
}

function hasAcceptedNf(row: ResponseRow) {
  return hasCurrentOrganizerResponseReviewDecision(row, "national_final", "accepted");
}

function hasDeclinedNf(row: ResponseRow) {
  return hasCurrentOrganizerResponseReviewDecision(row, "national_final", "declined");
}

function songSubmitted(row: ResponseRow) {
  if (!row.participating) return false;
  if (row.selection_method === "internal") return Boolean(row.internal_entries?.song_title);
  if (row.selection_method === "national_final") return activeNfEntries(row).length > 0;
  return false;
}

function responseCardState(row: ResponseRow): CardState {
  return deriveOrganizerResponseReviewState(row);
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
  if (filter === "outdated_review") return hasOutdatedOrganizerResponseReview(row);
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
  const { view: mode } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setMode = useCallback((view: OrganizerResponsesView) => {
    void navigate({ search: { view }, replace: true });
  }, [navigate]);
  const activeEditionRef = useRef(organizerEditionId);
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [nextRows, setNextRows] = useState<NextInLineRow[]>([]);
  const [loadingNextRows, setLoadingNextRows] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);
  const nextLoadGenerationRef = useRef(0);
  const [loadingEditions, setLoadingEditions] = useState(true);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [loadingMoreResponses, setLoadingMoreResponses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResponseFilter>("all");
  const [entryFilter, setEntryFilter] = useState<OrganizerEntryWorkFilter>("needs_review");
  const [responseReloadKey, setResponseReloadKey] = useState(0);
  const [nextReloadKey, setNextReloadKey] = useState(0);
  const responseLoadGenerationRef = useRef(0);
  const loadMoreInFlightRef = useRef(false);
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
  }, [editionId, editions, organizerEditionId, setMode]);

  useEffect(() => {
    let alive = true;
    const generation = ++responseLoadGenerationRef.current;
    loadMoreInFlightRef.current = false;
    setLoadingMoreResponses(false);
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
        if (!alive || generation !== responseLoadGenerationRef.current) return;
        if (page.page.hasMore && !page.page.nextCursor) {
          throw new Error("Confirmation projection returned an incomplete page cursor.");
        }
        setRows(assertOrganizerResponseRowsInEdition(page.rows, editionId));
        setResponseCursor(page.page.hasMore ? page.page.nextCursor : null);
        setResponseTotalCount(page.totalCount);
        setResponseStateVersion(page.stateVersion);
      } catch (caught) {
        if (!alive || generation !== responseLoadGenerationRef.current) return;
        setError(caught instanceof Error ? caught.message : "Responses could not be loaded.");
        setRows([]);
      } finally {
        if (alive && generation === responseLoadGenerationRef.current) setLoadingResponses(false);
      }
    })();

    return () => {
      alive = false;
      if (generation === responseLoadGenerationRef.current) responseLoadGenerationRef.current += 1;
    };
  }, [editionId, responseReloadKey]);

  useEffect(() => {
    let alive = true;
    const generation = ++nextLoadGenerationRef.current;
    setNextRows([]);
    setNextError(null);
    if (!editionId || mode !== "next_in_line") {
      setLoadingNextRows(false);
      return () => {
        alive = false;
        if (generation === nextLoadGenerationRef.current) nextLoadGenerationRef.current += 1;
      };
    }

    setLoadingNextRows(true);
    void (async () => {
      try {
        const result = await confirmationsSupabase.rpc("admin_confirmation_next_in_line", {
          _edition_id: editionId,
        });
        if (!alive || generation !== nextLoadGenerationRef.current ||
            activeEditionRef.current !== editionId) return;
        if (result.error) throw new Error(result.error.message);
        if (!Array.isArray(result.data)) {
          throw new Error("Next in Line returned an invalid response payload.");
        }
        setNextRows(assertOrganizerNextInLineRowsInScope(
          result.data as NextInLineRow[], editionId,
        ));
      } catch (caught) {
        if (!alive || generation !== nextLoadGenerationRef.current ||
            activeEditionRef.current !== editionId) return;
        setNextRows([]);
        setNextError(caught instanceof Error ? caught.message : "Next in Line could not be loaded.");
      } finally {
        if (alive && generation === nextLoadGenerationRef.current) setLoadingNextRows(false);
      }
    })();

    return () => {
      alive = false;
      if (generation === nextLoadGenerationRef.current) nextLoadGenerationRef.current += 1;
    };
  }, [editionId, mode, nextReloadKey]);

  async function loadMoreResponses() {
    if (!editionId || !responseCursor || loadingMoreResponses || loadMoreInFlightRef.current) return;
    const requestedEditionId = editionId;
    const requestedCursor = responseCursor;
    const requestedGeneration = responseLoadGenerationRef.current;
    const baseline = { stateVersion: responseStateVersion, totalCount: responseTotalCount };
    loadMoreInFlightRef.current = true;
    setLoadingMoreResponses(true);
    try {
      const page = await loadConfirmationResponsesPage<ResponseRow>(requestedEditionId, requestedCursor);
      if (activeEditionRef.current !== requestedEditionId ||
          requestedGeneration !== responseLoadGenerationRef.current) return;
      assertOrganizerResponsePageContinuity(baseline, page);
      const newRows = assertOrganizerResponseRowsInEdition(page.rows, requestedEditionId);
      if (page.page.hasMore && !page.page.nextCursor) {
        throw new Error("Confirmation projection returned an incomplete continuation cursor.");
      }
      if (page.page.hasMore && newRows.length === 0) {
        throw new Error("Confirmation response pagination returned an empty continuation page. Reload the current edition.");
      }
      assertOrganizerResponsePageDisjoint(rows, newRows);
      setRows((current) => [...current, ...newRows]);
      setResponseCursor(page.page.hasMore ? page.page.nextCursor : null);
      setResponseTotalCount(page.totalCount);
      setResponseStateVersion(page.stateVersion);
    } catch (caught) {
      if (activeEditionRef.current === requestedEditionId &&
          requestedGeneration === responseLoadGenerationRef.current) {
        setError(caught instanceof Error ? caught.message : "More responses could not be loaded.");
      }
    } finally {
      if (requestedGeneration === responseLoadGenerationRef.current) {
        loadMoreInFlightRef.current = false;
        setLoadingMoreResponses(false);
      }
    }
  }

  const scopedRows = useMemo(() =>
    editionId ? rows.filter((row) => row.editions?.id === editionId) : [],
    [rows, editionId],
  );

  const rounds = useMemo(() => {
    const map = new Map<string, { id: string; name: string; edition_id: string }>();
    scopedRows.forEach((row) => {
      const round = row.submission_rounds;
      if (round?.edition_id === editionId) map.set(round.id, round);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [editionId, scopedRows]);

  useEffect(() => {
    if (roundId !== "all" && !rounds.some((round) => round.id === roundId)) setRoundId("all");
  }, [roundId, rounds]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return scopedRows
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
  }, [editionId, filter, query, roundId, scopedRows]);

  function retryVisibleQueue() {
    if (mode === "next_in_line") setNextReloadKey((current) => current + 1);
    else setResponseReloadKey((current) => current + 1);
  }

  const filteredNext = useMemo(() => {
    const term = query.trim().toLowerCase();
    return nextRows.filter((row) => {
      if (row.edition_id !== editionId) return false;
      return !term || [row.country, row.artist ?? "", row.song_title ?? "", row.selection_type]
        .join(" ").toLowerCase().includes(term);
    });
  }, [editionId, nextRows, query]);

  const entryWorklist = useMemo(
    () => buildOrganizerEntryReviewWorklist(rows, editionId),
    [rows, editionId],
  );
  const scopedEntryWorklist = useMemo(
    () => entryWorklist.filter((item) => roundId === "all" || item.roundId === roundId),
    [entryWorklist, roundId],
  );
  const filteredEntryWorklist = useMemo(
    () => scopedEntryWorklist.filter((item) =>
      matchesOrganizerEntryWorkFilter(item, entryFilter) &&
      matchesOrganizerEntryWorkSearch(item, query)),
    [scopedEntryWorklist, entryFilter, query],
  );
  const entryNeedsReview = scopedEntryWorklist.filter((item) => item.status === "needs_review").length;
  const entryChangesRequired = scopedEntryWorklist.filter((item) => item.status === "changes_required").length;
  const entryAccepted = scopedEntryWorklist.filter((item) => item.status === "accepted").length;
  const entryAwaiting = scopedEntryWorklist.filter((item) => item.status === "awaiting_entry").length;
  const entryRevised = scopedEntryWorklist.filter((item) =>
    matchesOrganizerEntryWorkFilter(item, "revised")).length;

  const reviewCount = scopedRows.filter((row) => responseCardState(row) === "review").length;
  const issueCount = scopedRows.filter((row) => responseCardState(row) === "issue").length;
  const readyCount = scopedRows.filter((row) => responseCardState(row) === "ready").length;
  const outdatedCount = scopedRows.filter(hasOutdatedOrganizerResponseReview).length;
  const loading = loadingEditions || (Boolean(editionId) &&
    (mode === "next_in_line" ? loadingNextRows : loadingResponses));
  const visibleError = mode === "next_in_line" && editionId ? nextError : error;

  return (
    <div className="admin-page pb-5" data-v3-organizer-entry-review="">
      <AdminPageHeader
        eyebrow="Contest · Entry Review"
        title={mode === "entry_review" ? "Entry Review" : "Responses"}
        description={mode === "entry_review"
          ? "Review submitted Entries individually, separate from running order. This worklist uses only the loaded authorized edition-scoped Confirmation projection; review authority remains on the canonical server."
          : "Review confirmation and entry state for the exact edition selected in Solaris Organizer. The response queue is fetched through the bounded edition-scoped server projection. Next in Line is loaded separately only when opened; historical editions are never downloaded into this browser view."}
        actions={<Link to="/confirmations/admin" className="admin-action-secondary">Delegations overview</Link>}
      />

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Organizer review workspace">
        <button type="button" disabled={!editionId} onClick={() => setMode("confirmations")} aria-pressed={mode === "confirmations"} className={mode === "confirmations" ? "admin-action-primary" : "admin-action-secondary"}>Confirmations</button>
        <button type="button" disabled={!editionId} onClick={() => setMode("entry_review")} aria-pressed={mode === "entry_review"} className={mode === "entry_review" ? "admin-action-primary" : "admin-action-secondary"}>Entry Review</button>
        <button type="button" disabled={!editionId} onClick={() => { setMode("next_in_line"); setRoundId("all"); }} aria-pressed={mode === "next_in_line"} className={mode === "next_in_line" ? "admin-action-primary" : "admin-action-secondary"}>Next in Line</button>
      </div>

      {editionId && mode === "confirmations" ? (
        <>
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Review" value={reviewCount} tone="rose" />
            <Metric label="Problems" value={issueCount} tone="amber" />
            <Metric label="Ready" value={readyCount} tone="emerald" />
            <Metric label="Outdated" value={outdatedCount} tone="amber" />
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Counts reflect the loaded page: {rows.length} of {responseTotalCount} response{responseTotalCount === 1 ? "" : "s"}
            {responseStateVersion ? ` · canonical state ${responseStateVersion.slice(-12)}` : ""}.
          </p>
        </>
      ) : null}

      {editionId && mode === "entry_review" ? (
        <div className="mb-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Metric label="Needs review" value={entryNeedsReview} tone="rose" />
            <Metric label="Changes required" value={entryChangesRequired} tone="amber" />
            <Metric label="Accepted" value={entryAccepted} tone="emerald" />
            <Metric label="Awaiting Entry" value={entryAwaiting} tone="amber" />
            <Metric label="Revised to review" value={entryRevised} tone="rose" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Candidate counts reflect {rows.length} of {responseTotalCount} loaded Confirmation responses
            {roundId === "all" ? "" : " in the selected round"}.
            A prior review never accepts a newer immutable Entry version.
          </p>
        </div>
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

          {mode !== "next_in_line" ? (
            <select disabled={!editionId} value={roundId} onChange={(event) => setRoundId(event.target.value)} className="min-h-11 rounded-xl border border-white/[0.09] bg-background px-3 text-sm text-foreground [color-scheme:dark] disabled:opacity-45">
              <option value="all">All loaded rounds</option>
              {rounds.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}
            </select>
          ) : <div className="hidden md:block" />}

          {mode === "confirmations" ? (
            <select aria-label="Confirmation response filter" disabled={!editionId} value={filter} onChange={(event) => setFilter(event.target.value as ResponseFilter)} className="min-h-11 rounded-xl border border-white/[0.09] bg-background px-3 text-sm text-foreground [color-scheme:dark] disabled:opacity-45">
              {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          ) : mode === "entry_review" ? (
            <select aria-label="Entry Review status filter" disabled={!editionId} value={entryFilter} onChange={(event) => setEntryFilter(event.target.value as OrganizerEntryWorkFilter)} className="min-h-11 rounded-xl border border-white/[0.09] bg-background px-3 text-sm text-foreground [color-scheme:dark] disabled:opacity-45">
              <option value="needs_review">Needs review</option>
              <option value="revised">Revised / outdated review</option>
              <option value="changes_required">Changes required</option>
              <option value="accepted">Accepted current version</option>
              <option value="withdrawn">Withdrawn / removed</option>
              <option value="awaiting_entry">Awaiting Entry</option>
              <option value="all">All Entry states</option>
            </select>
          ) : <div className="hidden md:block" />}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label={mode === "entry_review" ? "Search entries by country artist or song" : "Search confirmation responses"} disabled={!editionId} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search country, username, artist or song…" className="min-h-11 pl-9" />
          </div>
        </div>
      </AdminCard>

      {loading ? (
        <AdminCard className="py-8 text-center text-sm text-muted-foreground">
          {mode === "next_in_line" ? "Loading Next in Line for the selected edition…" : "Loading exact-edition responses…"}
        </AdminCard>
      ) : visibleError ? (
        <AdminCard className="mb-4 border-rose-200/20 bg-rose-200/[0.045]">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-rose-200" />
            <div className="space-y-2">
              <p className="font-semibold">
                {mode === "next_in_line" ? "Next in Line could not be loaded safely" : "Responses could not be loaded safely"}
              </p>
              <p className="text-sm text-muted-foreground">{visibleError}</p>
              <button type="button" className="admin-action-secondary"
                onClick={retryVisibleQueue}>
                {mode === "next_in_line" ? "Retry Next in Line" : "Reload current edition"}
              </button>
            </div>
          </div>
        </AdminCard>
      ) : !editionId ? (
        <AdminCard><AdminEmptyState icon={CircleAlert} title="Select an edition" description="Entry Review is edition-scoped. Solaris will not combine historical response queues or substitute a globally active or newest edition." /></AdminCard>
      ) : mode === "next_in_line" ? (
        filteredNext.length ? (
          <section className="grid gap-3 lg:grid-cols-2">
            {filteredNext.map((row) => (
              <AdminCard key={row.id} className="!p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="admin-section-label">{row.edition ? `SSC ${row.edition.edition_number}` : "Next in Line"}</p><h2 className="mt-1 text-lg font-bold">{row.country}</h2></div><AdminStatus tone={row.participating ? "ready" : "neutral"}>{row.participating ? "Would participate" : "Would not participate"}</AdminStatus></div>
                {row.participating ? <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.022] p-3 text-sm"><p className="font-semibold">{row.entry_unknown ? "Entry not known yet" : row.song_title ? `${row.artist || "Unknown artist"} — ${row.song_title}` : "Entry details not submitted"}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{row.selection_type.replaceAll("_", " ")}{row.preview_start ? ` · preview ${row.preview_start}${row.preview_end ? `–${row.preview_end}` : ""}` : ""}</p><OrganizerNextInLineSongLink sourceUrl={row.song_url} /></div> : null}
              </AdminCard>
            ))}
          </section>
        ) : <AdminCard><AdminEmptyState title="No Next in Line responses" description="Nothing matches the selected edition or search." /></AdminCard>
      ) : mode === "entry_review" ? (
        filteredEntryWorklist.length ? (
          <section className="grid gap-3 lg:grid-cols-2" data-v3-organizer-entry-worklist="">
            {filteredEntryWorklist.map((item) => {
              const tone = item.status === "accepted" ? "ready"
                : item.status === "changes_required" || item.status === "awaiting_entry" ? "attention"
                  : item.status === "needs_review" ? "blocked" : "neutral";
              const label = item.status === "needs_review" ? "Needs review"
                : item.status === "changes_required" ? "Changes required"
                  : item.status === "accepted" ? "Accepted current version"
                    : item.status === "withdrawn" ? "Withdrawn" : "Awaiting Entry";
              return (
                <AdminCard key={item.key} className="!p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="admin-section-label">
                        {item.roundName} · {item.selection === "national_final" ? "National Final" : item.selection === "internal" ? "Internal selection" : "Selection undecided"}
                      </p>
                      <h2 className="mt-1 text-base font-bold">{item.country}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.nationalFinalName ? `${item.nationalFinalName} · ` : ""}
                        {item.username ? `@${item.username.replace(/^@/, "")}` : "Delegation response"}
                      </p>
                    </div>
                    <AdminStatus tone={tone}>{label}</AdminStatus>
                  </div>
                  <p className="mt-3 text-sm font-semibold">
                    {item.entryId
                      ? `${item.artist ?? "Unknown artist"} — ${item.songTitle ?? "Unknown song"}`
                      : "No current Entry submitted for review"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {item.revision ? <span>Revision {item.revision}</span> : null}
                    {item.outdatedReview ? <span className="text-amber-100">Previous review is outdated</span> : null}
                    {item.revised && item.status === "needs_review" ? <span className="text-amber-100">Revised content needs review</span> : null}
                    {item.storedWinner ? <span>Stored NF winner (not a separate approval)</span> : null}
                  </div>
                  {item.status === "changes_required" && item.note ? (
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                      Latest review note: {item.note}
                    </p>
                  ) : null}
                  <Link to="/confirmations/admin/responses/$id"
                    params={{ id: item.responseId }}
                    hash={item.entryId ? `entry-${item.entryId}` : undefined}
                    className={item.status === "needs_review" ? "admin-action-primary mt-4 w-full" : "admin-action-secondary mt-4 w-full"}
                  >
                    {item.status === "needs_review" ? "Review current Entry" : "Inspect response and history"}
                  </Link>
                </AdminCard>
              );
            })}
          </section>
        ) : (
          <AdminCard>
            <AdminEmptyState title="No matching Entries in loaded responses"
              description={responseCursor
                ? "No matching Entries are loaded yet. Load more response pages to continue reviewing this edition."
                : "Try another Entry status, country, artist or song. Awaiting and withdrawn records are available in their own filters."} />
          </AdminCard>
        )
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
                <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.022] p-3"><p className="text-sm font-semibold leading-snug">{entrySummary}</p>
                  {hasOutdatedOrganizerResponseReview(row) ? (
                    <p className="mt-1 text-xs text-amber-100">
                      Earlier review evidence is stale or lacks a current Entry-version binding.
                      Review the latest submission before counting it as accepted.
                    </p>
                  ) : null}{describeOrganizerNationalFinalQueue(row) ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {describeOrganizerNationalFinalQueue(row)}
                    </p>
                  ) : null}</div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{new Date(row.submitted_at).toLocaleDateString()}</span><span>{row.locked ? "Locked" : row.editing_allowed ? "Editing allowed" : "Editing closed"}</span></div>
                <Link to="/confirmations/admin/responses/$id" params={{ id: row.id }} className={state === "review" || state === "issue" ? "admin-action-primary mt-4 w-full" : "admin-action-secondary mt-4 w-full"}>{state === "review" ? "Review response" : state === "issue" ? "Fix response" : "Open response"}</Link>
              </AdminCard>
            );
          })}
        </section>
      ) : <AdminCard><AdminEmptyState title={query ? "No matching responses" : "Nothing in this view"} description={query ? "Try another country, username, artist or song." : "No responses match the selected filters in the loaded page."} /></AdminCard>}

      {mode !== "next_in_line" && responseCursor ? (
        <div className="mt-4 flex justify-center">
          <button type="button" disabled={loadingMoreResponses} onClick={() => void loadMoreResponses()} className="admin-action-secondary">
            {loadingMoreResponses ? "Loading…" : `Load more · ${Math.max(0, responseTotalCount - rows.length)} remaining`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function OrganizerNextInLineSongLink({ sourceUrl }: { sourceUrl: string | null }) {
  const href = safeOrganizerResponseSongUrl(sourceUrl);
  if (!href) {
    return sourceUrl?.trim() ? (
      <span className="mt-2 block text-xs text-amber-100">Song link needs inspection</span>
    ) : null;
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
      className="mt-2 inline-block text-xs text-sky-100/75 underline">
      Open song
    </a>
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
