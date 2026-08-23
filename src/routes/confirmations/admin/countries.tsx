import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Copy, ExternalLink, Flag, Trophy } from "lucide-react";
import { toast } from "sonner";

import {
  AdminActionItem,
  AdminCard,
  AdminEmptyState,
  AdminMoreMenu,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { loadConfirmationEditions, type ConfirmationEdition } from "@/integrations/confirmations/admin";
import { confirmationsSupabase } from "@/integrations/confirmations/client";
import {
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import { showPublishesResults } from "@/lib/publication";
import { computeCountryStats } from "@/lib/stats";

export const Route = createFileRoute("/confirmations/admin/countries")({
  head: () => ({
    meta: [
      { title: "Delegations by country — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CountriesPage,
});

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
  submitted_at: string;
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

type ContestRecord = {
  code: string;
  participations: number;
  wins: number;
  bestRank: number | null;
  allTimePoints: number;
  selectedResult: {
    rank: number | null;
    total: number;
    jury: number;
    televote: number;
  } | null;
};

function normalizeCountryName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function countryStatus(submission: ResponseRow) {
  if (!submission.participating) return "Not participating";

  if (submission.selection_method === "internal") {
    const entry = submission.internal_entries;
    if (!entry || submission.entry_unknown || !entry.song_title) return "Song needed";
    if (entry.review_status === "declined") return "Entry declined";
    if (entry.review_status === "accepted") return "Entry ready";
    return "Entry submitted";
  }

  if (submission.selection_method === "national_final") {
    const nf = submission.national_finals;
    const active = (nf?.national_final_entries ?? []).filter(
      (entry) => !entry.removed && entry.review_status !== "removed",
    );
    if (!active.length) return "NF entries needed";
    const declined = active.filter((entry) => entry.review_status === "declined").length;
    if (declined) return declined === 1 ? "1 NF entry declined" : `${declined} NF entries declined`;
    if (active.some((entry) => !entry.review_status || entry.review_status === "pending")) {
      return "NF review pending";
    }
    if (active.every((entry) => entry.review_status === "accepted")) {
      const winnerActive = Boolean(nf?.winning_entry_id) && active.some((entry) => entry.id === nf?.winning_entry_id);
      return winnerActive ? "NF complete" : "Choose NF winner";
    }
    return "NF incomplete";
  }

  return "Selection needed";
}

function statusTone(status: string) {
  if (["Entry ready", "NF complete"].includes(status)) return "ready" as const;
  if (status === "Not participating") return "neutral" as const;
  if (status.includes("declined") || status.includes("needed") || status.includes("Choose")) {
    return "attention" as const;
  }
  return "info" as const;
}

function responseLabel(submission: ResponseRow) {
  if (!submission.participating) return "Not participating";
  if (submission.selection_method === "internal") {
    return submission.internal_entries?.song_title ? "Song submitted" : "Awaiting song";
  }
  if (submission.selection_method === "national_final") {
    const active = (submission.national_finals?.national_final_entries ?? []).filter((entry) => !entry.removed);
    return active.length
      ? `${active.length} NF ${active.length === 1 ? "entry" : "entries"}`
      : "Awaiting NF entries";
  }
  return "Awaiting selection method";
}

function CountriesPage() {
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [editionId, setEditionId] = useState("");
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [copied, setCopied] = useState<"countries" | "status" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: canonicalCountries = [] } = useCountries();
  const { data: canonicalEditions = [] } = useEditions();
  const { data: shows = [] } = useAllShows();
  const { data: participants = [] } = useAllParticipants();
  const { data: results = [] } = useAllResults();

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const editionRows = await loadConfirmationEditions();
        const selected = editionRows.find((item) => item.status === "active")?.id ?? editionRows[0]?.id ?? "";
        const { data, error: loadError } = await confirmationsSupabase.rpc("admin_confirmation_responses");
        if (loadError) throw loadError;
        if (!alive) return;
        setEditions(editionRows);
        setEditionId(selected);
        setRows(Array.isArray(data) ? (data as unknown as ResponseRow[]) : []);
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

  const scopedRows = useMemo(
    () => rows.filter((row) => !editionId || row.editions?.id === editionId),
    [rows, editionId],
  );

  const countries = useMemo(() => {
    const map = new Map<string, ResponseRow[]>();
    for (const row of scopedRows) {
      const list = map.get(row.country) ?? [];
      list.push(row);
      map.set(row.country, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [scopedRows]);

  const selectedConfirmationEdition = editions.find((edition) => edition.id === editionId) ?? null;

  const publishedResults = useMemo(() => {
    const showById = new Map(shows.map((show) => [show.id, show]));
    return results.filter(
      (result) => Boolean(result.show_id) && showPublishesResults(showById.get(result.show_id ?? "")),
    );
  }, [results, shows]);

  const selectedCanonicalEdition = selectedConfirmationEdition
    ? canonicalEditions.find(
        (edition) => edition.edition_number === selectedConfirmationEdition.edition_number,
      ) ?? null
    : null;

  const selectedEditionResultsPublished = useMemo(() => {
    if (!selectedCanonicalEdition) return false;
    return shows.some(
      (show) =>
        show.edition_id === selectedCanonicalEdition.id && showPublishesResults(show),
    );
  }, [selectedCanonicalEdition, shows]);

  const contestRecords = useMemo(() => {
    const recordMap = new Map<string, ContestRecord>();
    if (!canonicalEditions.length) return recordMap;

    for (const country of canonicalCountries) {
      const stats = computeCountryStats(country.id, {
        editions: canonicalEditions,
        shows,
        participants,
        results: publishedResults,
        jury: [],
        televote: [],
      });
      const timeline = stats.timeline;
      const hasSelectedResult = Boolean(
        selectedCanonicalEdition &&
          publishedResults.some(
            (result) =>
              result.edition_id === selectedCanonicalEdition.id &&
              (result.country_id === country.id || result.contest_entity_id === country.id),
          ),
      );
      const selected = selectedConfirmationEdition && hasSelectedResult
        ? timeline.find((point) => point.editionNumber === selectedConfirmationEdition.edition_number) ?? null
        : null;
      const ranks = timeline
        .map((point) => point.rank)
        .filter((rank): rank is number => rank != null);

      recordMap.set(normalizeCountryName(country.name), {
        code: country.short_code,
        participations: stats.participations,
        wins: stats.wins,
        bestRank: ranks.length ? Math.min(...ranks) : null,
        allTimePoints: timeline.reduce((sum, point) => sum + point.total, 0),
        selectedResult: selected
          ? {
              rank: selected.rank,
              total: selected.total,
              jury: selected.jury,
              televote: selected.televote,
            }
          : null,
      });
    }

    return recordMap;
  }, [canonicalCountries, canonicalEditions, shows, participants, publishedResults, selectedCanonicalEdition, selectedConfirmationEdition]);

  const participatingStatuses = useMemo(
    () =>
      countries
        .map(([country, list]) => {
          const latest = list.find((row) => row.participating);
          return latest ? { country, submission: latest, status: countryStatus(latest) } : null;
        })
        .filter(Boolean) as Array<{ country: string; submission: ResponseRow; status: string }>,
    [countries],
  );

  async function copy(text: string, type: "countries" | "status") {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    toast.success(type === "countries" ? "Country list copied" : "Delegation status copied");
    window.setTimeout(() => setCopied((current) => (current === type ? null : current)), 1600);
  }

  return (
    <div className="admin-page pb-5">
      <AdminPageHeader
        eyebrow="Delegations"
        title="Countries"
        description="Current submission state plus real Solaris contest history, so the delegation view is useful without opening three archive tabs beside it."
        actions={
          <AdminMoreMenu
            label="Export delegation lists"
            title="Copy delegation data"
            description="Quick text exports for organizer use."
          >
            <div className="space-y-1">
              <AdminActionItem
                icon={copied === "countries" ? Check : Copy}
                title="Copy participating countries"
                description="Comma-separated list of countries currently participating."
                disabled={!participatingStatuses.length}
                onClick={() => void copy(participatingStatuses.map((item) => item.country).join(", "), "countries")}
              />
              <AdminActionItem
                icon={copied === "status" ? Check : Copy}
                title="Copy status list"
                description="One country per line with its current submission status."
                disabled={!participatingStatuses.length}
                onClick={() => void copy(participatingStatuses.map((item) => `${item.country} (${item.status})`).join("\n"), "status")}
              />
            </div>
          </AdminMoreMenu>
        }
      />

      <AdminCard className="mb-4 !p-3">
        <label className="block">
          <span className="admin-section-label">Edition</span>
          <select
            value={editionId}
            onChange={(event) => setEditionId(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-[#07111f] px-3 text-sm text-foreground outline-none"
          >
            {editions.map((edition) => (
              <option key={edition.id} value={edition.id}>
                {`SSC ${edition.edition_number} — ${edition.name}`}
              </option>
            ))}
          </select>
        </label>
      </AdminCard>

      {loading ? (
        <AdminCard className="py-8 text-center text-sm text-muted-foreground">Loading delegations…</AdminCard>
      ) : error ? (
        <AdminCard className="border-rose-200/20 bg-rose-200/[0.045] text-sm text-rose-100">{error}</AdminCard>
      ) : countries.length ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
            <span>{countries.length} responding countries</span>
            <span>{participatingStatuses.length} participating</span>
          </div>

          {countries.map(([country, list]) => {
            const latest = list[0]!;
            const latestParticipating = list.find((row) => row.participating) ?? latest;
            const status = countryStatus(latestParticipating);
            const record = contestRecords.get(normalizeCountryName(country)) ?? null;

            return (
              <AdminCard key={country} className="!p-0 overflow-hidden">
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035]">
                        <Flag className="size-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-bold tracking-[-.02em]">{country}</h2>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          @{latest.instagram_username.replace(/^@/, "")}
                        </p>
                      </div>
                    </div>
                  </div>
                  <AdminStatus tone={statusTone(status)}>{status}</AdminStatus>
                </div>

                {record ? (
                  <div className="border-t border-white/[0.07] bg-white/[0.018] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="admin-section-label">Contest record</p>
                      <Link to="/countries/$code" params={{ code: record.code }} target="_blank" className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-100 hover:underline">Full profile <ExternalLink className="size-3" /></Link>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{selectedConfirmationEdition ? `SSC ${selectedConfirmationEdition.edition_number}` : "Selected edition"}</p>
                        {record.selectedResult ? (
                          <p className="numeric mt-1 text-sm font-bold text-foreground">{record.selectedResult.rank != null ? `#${record.selectedResult.rank}` : "Rank pending"} · {record.selectedResult.total.toLocaleString()} pts</p>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {selectedEditionResultsPublished
                              ? "No official result is recorded for this edition."
                              : "Results have not been published for this edition yet."}
                          </p>
                        )}
                      </div>
                      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                        <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground"><Trophy className="size-3" /> All-time archive</p>
                        <p className="numeric mt-1 text-sm font-bold text-foreground">{record.participations} edition{record.participations === 1 ? "" : "s"} · {record.allTimePoints.toLocaleString()} pts</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Best {record.bestRank != null ? `#${record.bestRank}` : "—"} · {record.wins} win{record.wins === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-white/[0.07] bg-white/[0.018] px-4 py-2.5 text-[11px] text-muted-foreground">The country name does not exactly match a Solaris country, so historical results are left blank.</div>
                )}

                <div className="border-t border-white/[0.07] px-4">
                  {list.map((submission) => (
                    <Link
                      key={submission.id}
                      to="/confirmations/admin/responses/$id"
                      params={{ id: submission.id }}
                      className="admin-list-row"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {submission.submission_rounds?.name ?? "Confirmation"}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {responseLabel(submission)} · {new Date(submission.submitted_at).toLocaleDateString()}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </AdminCard>
            );
          })}
        </div>
      ) : (
        <AdminCard>
          <AdminEmptyState
            icon={Flag}
            title="No delegation responses yet"
            description="Responses for the selected edition will appear here as countries confirm participation."
            action={
              <Link to="/confirmations/admin/rounds" className="admin-action-secondary">
                Manage submission rounds
              </Link>
            }
          />
        </AdminCard>
      )}
    </div>
  );
}