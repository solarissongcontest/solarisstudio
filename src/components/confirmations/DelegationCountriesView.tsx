import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Filter, Flag, Search, ShieldAlert } from "lucide-react";

import {
  AdminCard,
  AdminEmptyState,
  AdminMoreMenu,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { ConfirmationsAdminNav } from "@/components/confirmations/ConfirmationsAdminNav";
import { Input } from "@/components/ui/input";
import { loadConfirmationEditions, type ConfirmationEdition } from "@/integrations/confirmations/admin";
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
  reviewed?: boolean;
  submitted_at: string;
  updated_at?: string;
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

type DirectoryFilter = "all" | "attention" | "participating" | "not-participating";

type Delegation = {
  country: string;
  rows: ResponseRow[];
  latest: ResponseRow;
  participatingResponse: ResponseRow | null;
  status: string;
  tone: "ready" | "attention" | "danger" | "neutral";
  needsAttention: boolean;
};

function delegationStatus(row: ResponseRow | null) {
  if (!row) return { label: "Not participating", tone: "neutral" as const, attention: false };
  if (!row.participating) return { label: "Not participating", tone: "neutral" as const, attention: false };

  if (row.selection_method === "internal") {
    const entry = row.internal_entries;
    if (!entry || row.entry_unknown || !entry.song_title) {
      return { label: "Song missing", tone: "attention" as const, attention: true };
    }
    if (entry.review_status === "declined") {
      return { label: "Entry needs changes", tone: "danger" as const, attention: true };
    }
    if (entry.review_status === "accepted") {
      return { label: "Entry complete", tone: "ready" as const, attention: false };
    }
    return { label: "Entry pending review", tone: "attention" as const, attention: true };
  }

  if (row.selection_method === "national_final") {
    const nf = row.national_finals;
    const active = (nf?.national_final_entries ?? []).filter(
      (entry) => !entry.removed && entry.review_status !== "removed",
    );
    if (row.nf_entries_unknown || !active.length) {
      return { label: "NF entries missing", tone: "attention" as const, attention: true };
    }
    if (active.some((entry) => entry.review_status === "declined")) {
      return { label: "NF needs changes", tone: "danger" as const, attention: true };
    }
    if (active.some((entry) => !entry.review_status || entry.review_status === "pending")) {
      return { label: "NF pending review", tone: "attention" as const, attention: true };
    }
    if (!nf?.winning_entry_id) {
      return { label: "Winner not selected", tone: "attention" as const, attention: true };
    }
    return { label: "NF complete", tone: "ready" as const, attention: false };
  }

  return { label: "Selection method missing", tone: "attention" as const, attention: true };
}

function detailText(row: ResponseRow | null) {
  if (!row) return "No participating response";
  if (!row.participating) return "Country declined participation";
  if (row.selection_method === "internal") {
    if (!row.internal_entries?.song_title) return "Internal selection · song TBC";
    return `${row.internal_entries.artist || "Artist TBC"} · ${row.internal_entries.song_title}`;
  }
  if (row.selection_method === "national_final") {
    const active = (row.national_finals?.national_final_entries ?? []).filter((entry) => !entry.removed);
    const name = row.national_finals?.nf_name || "National Final";
    return `${name} · ${active.length} ${active.length === 1 ? "entry" : "entries"}`;
  }
  return "Selection method TBC";
}

export function DelegationCountriesView() {
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [editionId, setEditionId] = useState("");
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [copied, setCopied] = useState<"countries" | "status" | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [editionRows, responseResult] = await Promise.all([
          loadConfirmationEditions(),
          confirmationsSupabase.rpc("admin_confirmation_responses"),
        ]);
        if (responseResult.error) throw responseResult.error;
        if (!alive) return;
        setEditions(editionRows);
        setEditionId(editionRows.find((item) => item.status === "active")?.id ?? editionRows[0]?.id ?? "");
        setRows(Array.isArray(responseResult.data) ? (responseResult.data as unknown as ResponseRow[]) : []);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load delegations.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const delegations = useMemo<Delegation[]>(() => {
    const scoped = rows.filter((row) => !editionId || row.editions?.id === editionId);
    const map = new Map<string, ResponseRow[]>();
    scoped.forEach((row) => {
      const existing = map.get(row.country) ?? [];
      existing.push(row);
      map.set(row.country, existing);
    });

    return [...map.entries()]
      .map(([country, countryRows]) => {
        const ordered = [...countryRows].sort(
          (a, b) => new Date(b.updated_at ?? b.submitted_at).getTime() - new Date(a.updated_at ?? a.submitted_at).getTime(),
        );
        const latest = ordered[0]!;
        const participatingResponse = ordered.find((row) => row.participating) ?? null;
        const state = delegationStatus(participatingResponse ?? latest);
        return {
          country,
          rows: ordered,
          latest,
          participatingResponse,
          status: state.label,
          tone: state.tone,
          needsAttention: state.attention || Boolean(participatingResponse && participatingResponse.reviewed === false),
        };
      })
      .sort((a, b) => {
        if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
        return a.country.localeCompare(b.country);
      });
  }, [editionId, rows]);

  const counts = useMemo(
    () => ({
      all: delegations.length,
      attention: delegations.filter((item) => item.needsAttention).length,
      participating: delegations.filter((item) => Boolean(item.participatingResponse)).length,
      notParticipating: delegations.filter((item) => !item.participatingResponse).length,
    }),
    [delegations],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return delegations.filter((item) => {
      if (filter === "attention" && !item.needsAttention) return false;
      if (filter === "participating" && !item.participatingResponse) return false;
      if (filter === "not-participating" && item.participatingResponse) return false;
      if (!term) return true;
      return [item.country, item.latest.instagram_username, item.status, detailText(item.participatingResponse)]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [delegations, filter, query]);

  async function copy(text: string, type: "countries" | "status") {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    window.setTimeout(() => setCopied((current) => (current === type ? null : current)), 1600);
  }

  const activeEdition = editions.find((edition) => edition.id === editionId) ?? null;

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow="Delegations"
        title="Countries"
        description="One status row per delegation. Countries that need organizer attention rise to the top automatically."
        actions={<AdminStatus tone={counts.attention ? "attention" : "ready"}>{counts.attention} need attention</AdminStatus>}
      />
      <ConfirmationsAdminNav current="/confirmations/admin/countries" />

      <AdminCard className="mb-4 !p-3">
        <div className="flex items-center gap-2">
          <select value={editionId} onChange={(event) => setEditionId(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-sm font-semibold outline-none focus:border-sky-200/25">
            {editions.map((edition) => <option key={edition.id} value={edition.id}>{`SSC ${edition.edition_number} · ${edition.name}`}</option>)}
          </select>
          <AdminMoreMenu label="Country directory actions" title="Country directory" description={activeEdition ? `SSC ${activeEdition.edition_number} export and support actions.` : "Directory actions"}>
            <div className="divide-y divide-white/[0.07]">
              <button type="button" className="admin-action-row" disabled={!counts.participating} onClick={() => void copy(delegations.filter((item) => item.participatingResponse).map((item) => item.country).join(", "), "countries")}>
                <span className="admin-action-row-icon">{copied === "countries" ? <Check className="size-4" /> : <Copy className="size-4" />}</span>
                <span className="min-w-0 flex-1 text-left"><span className="block text-sm font-semibold">{copied === "countries" ? "Countries copied" : "Copy participating countries"}</span><span className="mt-1 block text-xs text-muted-foreground">Comma-separated list for organizer use.</span></span>
              </button>
              <button type="button" className="admin-action-row" disabled={!counts.participating} onClick={() => void copy(delegations.filter((item) => item.participatingResponse).map((item) => `${item.country} (${item.status})`).join("\n"), "status")}>
                <span className="admin-action-row-icon">{copied === "status" ? <Check className="size-4" /> : <Copy className="size-4" />}</span>
                <span className="min-w-0 flex-1 text-left"><span className="block text-sm font-semibold">{copied === "status" ? "Status list copied" : "Copy status list"}</span><span className="mt-1 block text-xs text-muted-foreground">Country plus current delegation status.</span></span>
              </button>
            </div>
          </AdminMoreMenu>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search delegation…" className="min-h-11 pl-9" />
        </div>

        <div className="scroll-slim mt-3 flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={counts.all} />
          <FilterChip active={filter === "attention"} onClick={() => setFilter("attention")} label="Needs attention" count={counts.attention} />
          <FilterChip active={filter === "participating"} onClick={() => setFilter("participating")} label="Participating" count={counts.participating} />
          <FilterChip active={filter === "not-participating"} onClick={() => setFilter("not-participating")} label="Not taking part" count={counts.notParticipating} />
        </div>
      </AdminCard>

      {loading ? (
        <AdminCard className="py-10 text-center text-sm text-muted-foreground">Loading delegations…</AdminCard>
      ) : error ? (
        <AdminCard className="border-rose-200/15 bg-rose-200/[0.045]">
          <div className="flex items-start gap-3 text-rose-100"><ShieldAlert className="mt-0.5 size-5 shrink-0" /><div><p className="text-sm font-semibold">Delegations could not be loaded</p><p className="mt-1 text-xs text-rose-100/70">{error}</p></div></div>
        </AdminCard>
      ) : filtered.length ? (
        <section className="space-y-2">
          {filtered.map((item) => {
            const response = item.participatingResponse ?? item.latest;
            return (
              <Link key={item.country} to="/confirmations/admin/responses/$id" params={{ id: response.id }} className="admin-card block p-4 transition hover:border-white/[0.12] hover:bg-white/[0.035]">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2"><Flag className="size-4 shrink-0 text-muted-foreground" /><h2 className="truncate text-base font-bold">{item.country}</h2>{item.needsAttention ? <span className="size-2 shrink-0 rounded-full bg-amber-200" /> : null}</div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">@{item.latest.instagram_username.replace(/^@/, "")} · {item.rows.length} response{item.rows.length === 1 ? "" : "s"}</p>
                  </div>
                  <AdminStatus tone={item.tone}>{item.status}</AdminStatus>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-foreground/80">{detailText(item.participatingResponse)}</p>
              </Link>
            );
          })}
        </section>
      ) : (
        <AdminCard><AdminEmptyState icon={Filter} title="No delegations in this view" description="Try another filter or search term." /></AdminCard>
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
