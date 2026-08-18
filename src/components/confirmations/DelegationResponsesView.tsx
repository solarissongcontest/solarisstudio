import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Search, ShieldAlert } from "lucide-react";

import { AdminCard, AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { ConfirmationsAdminNav } from "@/components/confirmations/ConfirmationsAdminNav";
import { Input } from "@/components/ui/input";
import { confirmationsSupabase } from "@/integrations/confirmations/client";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  artist: string | null;
  song_title: string | null;
  review_status: string | null;
  removed?: boolean | null;
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
  submitted_at: string;
  updated_at: string;
  internal_entries: Entry | null;
  national_finals: {
    nf_name: string | null;
    winning_entry_id: string | null;
    national_final_entries: Entry[];
  } | null;
  submission_rounds: { name: string } | null;
  editions: { id: string; name: string; edition_number: number } | null;
};

type Filter = "all" | "review" | "participating" | "missing" | "not-participating";

function stateFor(row: ResponseRow) {
  if (!row.participating) return "not-participating";
  if (row.selection_method === "internal") {
    if (row.entry_unknown || !row.internal_entries?.song_title) return "missing";
    return row.internal_entries.review_status ?? "pending";
  }
  if (row.selection_method === "national_final") {
    const active = (row.national_finals?.national_final_entries ?? []).filter(
      (entry) => !entry.removed && entry.review_status !== "removed",
    );
    if (row.nf_entries_unknown || !active.length) return "missing";
    if (active.some((entry) => entry.review_status === "declined")) return "declined";
    if (active.every((entry) => entry.review_status === "accepted")) {
      return row.national_finals?.winning_entry_id ? "accepted" : "missing";
    }
    return "pending";
  }
  return "missing";
}

function toneFor(state: string): "ready" | "attention" | "danger" | "neutral" {
  if (state === "accepted") return "ready";
  if (state === "declined") return "danger";
  if (state === "missing" || state === "pending") return "attention";
  return "neutral";
}

function labelFor(state: string) {
  if (state === "accepted") return "Complete";
  if (state === "declined") return "Needs changes";
  if (state === "missing") return "Missing info";
  if (state === "pending") return "Pending review";
  if (state === "not-participating") return "Not participating";
  return state.replaceAll("-", " ");
}

function summaryFor(row: ResponseRow) {
  if (!row.participating) return "Country declined participation";
  if (row.selection_method === "internal") {
    if (row.entry_unknown || !row.internal_entries) return "Internal selection · song not submitted";
    return `${row.internal_entries.artist || "Artist TBC"} · ${row.internal_entries.song_title || "Song TBC"}`;
  }
  if (row.selection_method === "national_final") {
    const active = (row.national_finals?.national_final_entries ?? []).filter(
      (entry) => !entry.removed && entry.review_status !== "removed",
    );
    const name = row.national_finals?.nf_name || "National Final";
    if (!active.length) return `${name} · entries not submitted`;
    if (row.national_finals?.winning_entry_id) return `${name} · winner selected`;
    return `${name} · ${active.length} ${active.length === 1 ? "entry" : "entries"}`;
  }
  return "Selection method not confirmed";
}

export function DelegationResponsesView() {
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error: loadError } = await confirmationsSupabase.rpc("admin_confirmation_responses");
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
      review: rows.filter((row) => !row.reviewed).length,
      participating: rows.filter((row) => row.participating).length,
      missing: rows.filter((row) => stateFor(row) === "missing").length,
      notParticipating: rows.filter((row) => !row.participating).length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (filter === "review" && row.reviewed) return false;
        if (filter === "participating" && !row.participating) return false;
        if (filter === "missing" && stateFor(row) !== "missing") return false;
        if (filter === "not-participating" && row.participating) return false;
        return true;
      })
      .filter((row) => {
        if (!term) return true;
        const entries = row.national_finals?.national_final_entries ?? [];
        return [
          row.country,
          row.instagram_username,
          row.selection_method ?? "",
          row.submission_rounds?.name ?? "",
          row.editions?.name ?? "",
          row.internal_entries?.artist ?? "",
          row.internal_entries?.song_title ?? "",
          ...entries.flatMap((entry) => [entry.artist ?? "", entry.song_title ?? ""]),
        ].join(" ").toLowerCase().includes(term);
      })
      .sort((a, b) => {
        if (a.reviewed !== b.reviewed) return a.reviewed ? 1 : -1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [filter, query, rows]);

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow="Delegations"
        title="Responses"
        description="Review participation and entry information. Unreviewed and incomplete responses stay easy to find on a phone."
        actions={<AdminStatus tone={counts.review ? "attention" : "ready"}>{counts.review} to review</AdminStatus>}
      />
      <ConfirmationsAdminNav current="/confirmations/admin/responses" />

      <AdminCard className="mb-4 !p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search country, artist or song…" className="min-h-11 pl-9" />
        </div>
        <div className="scroll-slim mt-3 flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={counts.all} />
          <FilterChip active={filter === "review"} onClick={() => setFilter("review")} label="Needs review" count={counts.review} />
          <FilterChip active={filter === "missing"} onClick={() => setFilter("missing")} label="Missing info" count={counts.missing} />
          <FilterChip active={filter === "participating"} onClick={() => setFilter("participating")} label="Participating" count={counts.participating} />
          <FilterChip active={filter === "not-participating"} onClick={() => setFilter("not-participating")} label="Not taking part" count={counts.notParticipating} />
        </div>
      </AdminCard>

      {loading ? (
        <AdminCard className="py-10 text-center text-sm text-muted-foreground">Loading responses…</AdminCard>
      ) : error ? (
        <AdminCard className="border-rose-200/15 bg-rose-200/[0.045]">
          <div className="flex items-start gap-3 text-rose-100">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" />
            <div><p className="text-sm font-semibold">Responses could not be loaded</p><p className="mt-1 text-xs text-rose-100/70">{error}</p></div>
          </div>
        </AdminCard>
      ) : filtered.length ? (
        <section className="space-y-2">
          {filtered.map((row) => {
            const state = stateFor(row);
            return (
              <Link key={row.id} to="/confirmations/admin/responses/$id" params={{ id: row.id }} className="admin-card block p-4 transition hover:border-white/[0.12] hover:bg-white/[0.035]">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-base font-bold tracking-[-.015em]">{row.country}</h2>
                      {!row.reviewed ? <span className="size-2 shrink-0 rounded-full bg-amber-200" aria-label="Needs review" /> : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{row.editions ? `SSC ${row.editions.edition_number}` : "SSC"} · {row.submission_rounds?.name ?? "Confirmation"}</p>
                  </div>
                  <AdminStatus tone={toneFor(state)}>{labelFor(state)}</AdminStatus>
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-foreground/80">{summaryFor(row)}</p>
                <div className="mt-3 flex min-w-0 items-center justify-between gap-3 border-t border-white/[0.06] pt-3 text-[11px] text-muted-foreground">
                  <span className="min-w-0 truncate">@{row.instagram_username.replace(/^@/, "")}</span>
                  <span className="inline-flex shrink-0 items-center gap-1.5">
                    {row.reviewed ? <CheckCircle2 className="size-3.5 text-emerald-200" /> : <Clock3 className="size-3.5 text-amber-200" />}
                    {formatRelative(row.updated_at)}
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
      ) : (
        <AdminCard><AdminEmptyState icon={Search} title="No matching responses" description="Try another search or remove a filter." /></AdminCard>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button type="button" onClick={onClick} className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition", active ? "border-sky-200/15 bg-sky-200/[0.09] text-sky-100" : "border-white/[0.07] bg-white/[0.02] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground") }>
      {label}<span className="numeric text-[10px] opacity-70">{count}</span>
    </button>
  );
}

function formatRelative(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Updated";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
