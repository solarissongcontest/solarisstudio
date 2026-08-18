import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Search, ShieldAlert } from "lucide-react";

import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { confirmationsSupabase } from "@/integrations/confirmations/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/confirmations/admin/responses")({
  head: () => ({
    meta: [
      { title: "Delegation Responses — Solaris Organizer" },
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

type ReviewFilter = "all" | "needs-review" | "reviewed";

function overallState(row: ResponseRow) {
  if (!row.participating) return "not-participating";

  if (row.selection_method === "internal") {
    return row.internal_entries?.review_status ?? (row.entry_unknown ? "missing" : "pending");
  }

  if (row.selection_method === "national_final") {
    const active = (row.national_finals?.national_final_entries ?? []).filter(
      (entry) => !entry.removed && entry.review_status !== "removed",
    );
    if (!active.length) return row.nf_entries_unknown ? "missing" : "pending";
    if (active.some((entry) => entry.review_status === "declined")) return "declined";
    if (active.every((entry) => entry.review_status === "accepted")) return "accepted";
    return "pending";
  }

  return "pending";
}

function ConfirmationResponsesPage() {
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("needs-review");

  useEffect(() => {
    let alive = true;

    void (async () => {
      const { data, error: loadError } = await confirmationsSupabase.rpc(
        "admin_confirmation_responses",
      );

      if (!alive) return;

      if (loadError) {
        setError(loadError.message);
        setRows([]);
      } else {
        setRows(Array.isArray(data) ? (data as unknown as ResponseRow[]) : []);
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const counts = useMemo(
    () => ({
      all: rows.length,
      reviewed: rows.filter((row) => row.reviewed).length,
      needsReview: rows.filter((row) => !row.reviewed).length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (reviewFilter === "needs-review" && row.reviewed) return false;
      if (reviewFilter === "reviewed" && !row.reviewed) return false;

      if (!term) return true;

      const internal = row.internal_entries;
      const nfEntries = row.national_finals?.national_final_entries ?? [];
      const text = [
        row.country,
        row.instagram_username,
        row.selection_method ?? "",
        row.submission_rounds?.name ?? "",
        row.editions?.name ?? "",
        internal?.artist ?? "",
        internal?.song_title ?? "",
        ...nfEntries.flatMap((entry) => [entry.artist ?? "", entry.song_title ?? ""]),
      ]
        .join(" ")
        .toLowerCase();
      return text.includes(term);
    });
  }, [query, reviewFilter, rows]);

  return (
    <div className="mx-auto max-w-4xl">
      <AdminPageHeader
        eyebrow="Delegations"
        title="Responses"
        description="A review queue for participation responses, entries and National Final information."
        actions={
          <Link to="/confirmations/admin" className="admin-action-secondary">
            Delegations home
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Metric label="Need review" value={counts.needsReview} tone={counts.needsReview ? "attention" : "ready"} />
        <Metric label="Reviewed" value={counts.reviewed} tone="ready" />
        <Metric label="Total" value={counts.all} tone="neutral" />
      </div>

      <AdminCard className="mb-4 !p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search country, username, artist or song…"
            className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] pl-9 pr-3 text-sm outline-none focus:border-sky-200/25"
          />
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-black/10 p-1">
          <FilterButton active={reviewFilter === "needs-review"} onClick={() => setReviewFilter("needs-review")}>
            Needs review
          </FilterButton>
          <FilterButton active={reviewFilter === "all"} onClick={() => setReviewFilter("all")}>
            All
          </FilterButton>
          <FilterButton active={reviewFilter === "reviewed"} onClick={() => setReviewFilter("reviewed")}>
            Reviewed
          </FilterButton>
        </div>
      </AdminCard>

      {loading ? (
        <AdminCard>
          <p className="py-6 text-center text-sm text-muted-foreground">Loading responses…</p>
        </AdminCard>
      ) : error ? (
        <AdminCard>
          <div className="flex items-start gap-3 rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-4 text-rose-100">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Responses could not be loaded</p>
              <p className="mt-1 text-xs leading-relaxed text-rose-100/75">{error}</p>
            </div>
          </div>
        </AdminCard>
      ) : filtered.length ? (
        <AdminCard className="!p-0 overflow-hidden">
          <div className="divide-y divide-white/[0.07]">
            {filtered.map((row) => (
              <ResponseRowCard key={row.id} row={row} />
            ))}
          </div>
        </AdminCard>
      ) : (
        <AdminCard>
          <AdminEmptyState
            icon={CheckCircle2}
            title={reviewFilter === "needs-review" ? "Review queue is clear" : "No matching responses"}
            description={
              reviewFilter === "needs-review"
                ? "Every currently loaded response has been reviewed."
                : "Try another search or review filter."
            }
          />
        </AdminCard>
      )}
    </div>
  );
}

function ResponseRowCard({ row }: { row: ResponseRow }) {
  const state = overallState(row);
  const entrySummary = getEntrySummary(row);

  return (
    <Link
      to="/confirmations/admin/responses/$id"
      params={{ id: row.id }}
      className="group flex min-w-0 items-start gap-3 p-3.5 transition hover:bg-white/[0.025] sm:p-4"
    >
      <span
        className={cn(
          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border text-xs font-bold",
          row.reviewed
            ? "border-emerald-200/12 bg-emerald-200/[0.055] text-emerald-100"
            : "border-amber-200/12 bg-amber-200/[0.055] text-amber-100",
        )}
      >
        {row.country.slice(0, 2).toUpperCase()}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{row.country}</span>
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              @{row.instagram_username.replace(/^@/, "")}
            </span>
          </span>
          <AdminStatus tone={stateTone(state)}>{stateLabel(state)}</AdminStatus>
        </span>

        <span className="mt-2 block truncate text-xs text-foreground/80">{entrySummary}</span>
        <span className="mt-1 block truncate text-[11px] text-muted-foreground">
          {row.editions ? `SSC ${row.editions.edition_number}` : "SSC"} · {row.submission_rounds?.name ?? "Confirmation"}
          {row.locked ? " · Locked" : row.editing_allowed ? " · Editing open" : ""}
        </span>
      </span>

      <span className="mt-2 flex shrink-0 items-center gap-1 text-[11px] font-semibold text-muted-foreground group-hover:text-foreground">
        {row.reviewed ? "Reviewed" : "Review"}
        <ChevronRight className="size-4" />
      </span>
    </Link>
  );
}

function getEntrySummary(row: ResponseRow) {
  if (!row.participating) return "Not participating";

  if (row.selection_method === "internal") {
    const entry = row.internal_entries;
    if (!entry) return row.entry_unknown ? "Internal entry not known yet" : "Internal selection pending";
    return [entry.artist, entry.song_title].filter(Boolean).join(" · ") || "Internal entry";
  }

  if (row.selection_method === "national_final") {
    const nf = row.national_finals;
    const active = (nf?.national_final_entries ?? []).filter((entry) => !entry.removed);
    return `${nf?.nf_name || "National Final"} · ${active.length} ${active.length === 1 ? "entry" : "entries"}`;
  }

  return "Selection method not set";
}

function stateTone(state: string): "ready" | "attention" | "blocked" | "info" | "neutral" {
  if (state === "accepted") return "ready";
  if (state === "declined") return "blocked";
  if (state === "missing") return "attention";
  if (state === "not-participating") return "neutral";
  return "info";
}

function stateLabel(state: string) {
  if (state === "not-participating") return "Not entering";
  return state.replaceAll("-", " ");
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ready" | "attention" | "neutral";
}) {
  return (
    <div className="admin-card min-w-0 px-2.5 py-3 text-center">
      <p className={cn(
        "numeric text-xl font-bold",
        tone === "ready" && "text-emerald-100",
        tone === "attention" && "text-amber-100",
      )}>
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-lg px-2 text-[11px] font-semibold transition",
        active ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
