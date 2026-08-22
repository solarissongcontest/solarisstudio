import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Search, ShieldAlert } from "lucide-react";

import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { Input } from "@/components/ui/input";
import { confirmationsSupabase } from "@/integrations/confirmations/client";

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

function StateBadge({ state }: { state: string }) {
  const tone =
    state === "accepted"
      ? "ready"
      : state === "declined"
        ? "blocked"
        : state === "missing"
          ? "attention"
          : state === "pending"
            ? "info"
            : "neutral";

  return <AdminStatus tone={tone}>{state.replaceAll("-", " ")}</AdminStatus>;
}

function ConfirmationResponsesPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // `responses/$id.tsx` is a child of this file route. Without an Outlet the
  // URL changes when an organiser taps Review response, but React has nowhere
  // to mount the detail screen, so the list appears to ignore the tap.
  if (pathname.startsWith(`${Route.fullPath}/`)) {
    return <Outlet />;
  }

  return <ConfirmationResponsesList />;
}

function ConfirmationResponsesList() {
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "review" | "incomplete">("all");

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

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return rows.filter((row) => {
      const state = overallState(row);
      if (filter === "review" && row.reviewed) return false;
      if (filter === "incomplete" && !["missing", "declined", "pending"].includes(state)) {
        return false;
      }

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
  }, [filter, query, rows]);

  const unreviewed = rows.filter((row) => !row.reviewed).length;
  const incomplete = rows.filter((row) => ["missing", "declined", "pending"].includes(overallState(row))).length;

  return (
    <div className="admin-page pb-5">
      <AdminPageHeader
        eyebrow="Delegations"
        title="Responses"
        description="Review confirmations and entry information. The list is designed for quick organizer triage on a phone."
        actions={
          <Link to="/confirmations/admin" className="admin-action-secondary">
            Delegations overview
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={filter === "all" ? "admin-action-primary !px-2" : "admin-action-secondary !px-2"}
        >
          All · {rows.length}
        </button>
        <button
          type="button"
          onClick={() => setFilter("review")}
          className={filter === "review" ? "admin-action-primary !px-2" : "admin-action-secondary !px-2"}
        >
          Review · {unreviewed}
        </button>
        <button
          type="button"
          onClick={() => setFilter("incomplete")}
          className={filter === "incomplete" ? "admin-action-primary !px-2" : "admin-action-secondary !px-2"}
        >
          Issues · {incomplete}
        </button>
      </div>

      <AdminCard className="mb-4 !p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search country, username, artist or song…"
            className="min-h-11 pl-9"
          />
        </div>
      </AdminCard>

      {loading ? (
        <AdminCard className="py-8 text-center text-sm text-muted-foreground">
          Loading responses…
        </AdminCard>
      ) : error ? (
        <AdminCard className="border-rose-200/20 bg-rose-200/[0.045]">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-rose-200" />
            <div>
              <p className="font-semibold">Responses could not be loaded</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        </AdminCard>
      ) : filtered.length ? (
        <section className="grid gap-3 lg:grid-cols-2">
          {filtered.map((row) => {
            const state = overallState(row);
            const internal = row.internal_entries;
            const nf = row.national_finals;
            const activeNfEntries = (nf?.national_final_entries ?? []).filter(
              (entry) => !entry.removed && entry.review_status !== "removed",
            );

            const entrySummary = !row.participating
              ? "Not participating"
              : row.selection_method === "internal"
                ? internal?.song_title
                  ? `${internal.artist || "Unknown artist"} — ${internal.song_title}`
                  : "Internal entry not submitted yet"
                : row.selection_method === "national_final"
                  ? `${nf?.nf_name || "National Final"} · ${activeNfEntries.length} ${activeNfEntries.length === 1 ? "entry" : "entries"}`
                  : "Selection method not submitted yet";

            return (
              <AdminCard key={row.id} className="!p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="admin-section-label">
                      {row.editions ? `SSC ${row.editions.edition_number}` : "SSC"} · {row.submission_rounds?.name ?? "Confirmation"}
                    </p>
                    <h2 className="mt-1 truncate text-lg font-bold tracking-[-.02em]">{row.country}</h2>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      @{row.instagram_username.replace(/^@/, "")}
                    </p>
                  </div>
                  <StateBadge state={state} />
                </div>

                <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.022] p-3">
                  <p className="text-sm font-semibold leading-snug">{entrySummary}</p>
                  {row.selection_method === "national_final" && activeNfEntries.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {nf?.winning_entry_id ? "Winning entry selected" : "Winner not selected yet"}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{new Date(row.submitted_at).toLocaleDateString()}</span>
                  {row.reviewed ? (
                    <span className="inline-flex items-center gap-1 text-emerald-200/80">
                      <CheckCircle2 className="size-3.5" /> Reviewed
                    </span>
                  ) : (
                    <AdminStatus tone="attention">Needs review</AdminStatus>
                  )}
                </div>

                <Link
                  to="/confirmations/admin/responses/$id"
                  params={{ id: row.id }}
                  className={row.reviewed ? "admin-action-secondary mt-4 w-full" : "admin-action-primary mt-4 w-full"}
                >
                  {row.reviewed ? "Open response" : "Review response"}
                </Link>
              </AdminCard>
            );
          })}
        </section>
      ) : (
        <AdminCard>
          <AdminEmptyState
            title={query ? "No matching responses" : "Nothing in this view"}
            description={
              query
                ? "Try another country, username, artist or song."
                : filter === "review"
                  ? "Every response has been reviewed."
                  : filter === "incomplete"
                    ? "No obvious submission issues are waiting here."
                    : "No confirmation responses have been submitted yet."
            }
          />
        </AdminCard>
      )}
    </div>
  );
}
