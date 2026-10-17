import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { confirmationsSupabase } from "@/integrations/confirmations/client";
import { syncConfirmationSubmissionToSolaris } from "@/integrations/confirmations/sync-submission.functions";
import {
  addCountriesToShow,
  getSolarisEditionSyncTargets,
  type SolarisSyncTargets,
} from "@/lib/admin-lineup.functions";

type Entry = {
  id: string;
  artist: string | null;
  song_title: string | null;
  song_url: string | null;
  review_status: string | null;
  removed?: boolean | null;
};

type ResponseRow = {
  id: string;
  country: string;
  participating: boolean;
  selection_method: string | null;
  reveal_date_type: string | null;
  reveal_exact_date: string | null;
  reveal_approximate_text: string | null;
  nf_result_date_type: string | null;
  nf_result_exact_date: string | null;
  nf_result_approximate_text: string | null;
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

type RoundOption = {
  id: string;
  name: string;
  editionId: string;
  editionNumber: number;
  editionName: string;
  count: number;
};

export const Route = createFileRoute("/confirmations/admin/sync")({
  head: () => ({ meta: [{ title: "Sync to Solaris — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: ConfirmationSyncPage,
});

function ConfirmationSyncPage() {
  const { editionId: organizerEditionId } = useAdminContext();
  const syncSubmission = useServerFn(syncConfirmationSubmissionToSolaris);
  const getTargets = useServerFn(getSolarisEditionSyncTargets);
  const addToShow = useServerFn(addCountriesToShow);
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roundId, setRoundId] = useState("");
  const [targets, setTargets] = useState<SolarisSyncTargets | null>(null);
  const [showId, setShowId] = useState("");

  useEffect(() => {
    let alive = true;
    setError(null);
    setTargets(null);
    setShowId("");
    setRoundId("");

    if (!organizerEditionId) {
      setRows([]);
      setLoading(false);
      return () => { alive = false; };
    }

    setLoading(true);
    void (async () => {
      const { data, error: loadError } = await confirmationsSupabase.rpc("admin_confirmation_responses");
      if (!alive) return;
      if (loadError) {
        setError(loadError.message);
        setRows([]);
      } else {
        const responseRows = Array.isArray(data) ? (data as unknown as ResponseRow[]) : [];
        setRows(responseRows.filter((row) => row.editions?.id === organizerEditionId));
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [organizerEditionId]);

  const rounds = useMemo<RoundOption[]>(() => {
    if (!organizerEditionId) return [];
    const map = new Map<string, RoundOption>();
    for (const row of rows) {
      if (!row.submission_rounds || !row.editions || row.editions.id !== organizerEditionId) continue;
      const existing = map.get(row.submission_rounds.id);
      if (existing) existing.count += row.participating ? 1 : 0;
      else map.set(row.submission_rounds.id, {
        id: row.submission_rounds.id,
        name: row.submission_rounds.name,
        editionId: row.editions.id,
        editionNumber: row.editions.edition_number,
        editionName: row.editions.name,
        count: row.participating ? 1 : 0,
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [organizerEditionId, rows]);

  useEffect(() => {
    if (!rounds.some((round) => round.id === roundId)) {
      setRoundId(rounds[0]?.id ?? "");
    }
  }, [roundId, rounds]);

  const selectedRound = rounds.find((round) => round.id === roundId) ?? null;
  const selectedRows = useMemo(
    () => rows.filter((row) => row.participating && row.submission_rounds?.id === roundId && row.editions?.id === organizerEditionId),
    [organizerEditionId, roundId, rows],
  );

  useEffect(() => {
    let alive = true;
    if (!organizerEditionId || !selectedRound || selectedRound.editionId !== organizerEditionId) {
      setTargets(null);
      setShowId("");
      return () => { alive = false; };
    }
    void (async () => {
      try {
        const result = await getTargets({ data: { editionNumber: selectedRound.editionNumber } });
        if (!alive) return;
        if (result.editionId !== organizerEditionId) {
          throw Object.assign(
            new Error("Edition context changed before Solaris sync targets were resolved. Nothing was selected."),
            { status: 409 },
          );
        }
        setTargets(result);
        const preferred = /pre[- ]?confirm/i.test(selectedRound.name)
          ? result.shows.find((show) => show.kind === "grand-final" || show.kind === "final")
          : null;
        setShowId(preferred?.id ?? result.shows[0]?.id ?? "");
      } catch (caught) {
        if (alive) {
          setTargets(null);
          setShowId("");
          setError(caught instanceof Error ? caught.message : "Could not load Solaris shows.");
        }
      }
    })();
    return () => { alive = false; };
  }, [getTargets, organizerEditionId, selectedRound]);

  async function runSync() {
    if (!organizerEditionId || !selectedRound || !targets || !showId || !selectedRows.length) return;
    if (selectedRound.editionId !== organizerEditionId || targets.editionId !== organizerEditionId) {
      const message = "Edition context changed before the line-up sync. Refresh the selected edition and review the target again; nothing was applied.";
      setError(message);
      toast.error(message);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const countryIds: string[] = [];
      const failures: string[] = [];

      for (const row of selectedRows) {
        if (row.editions?.id !== organizerEditionId) {
          failures.push(`${row.country}: response no longer belongs to the selected Organizer edition`);
          continue;
        }
        try {
          const result = await syncSubmission({ data: { submissionId: row.id } });
          if (result.ok && result.countryId) countryIds.push(result.countryId);
          else failures.push(`${row.country}: ${result.message ?? "sync needs attention"}`);
        } catch (caught) {
          failures.push(`${row.country}: ${caught instanceof Error ? caught.message : "sync failed"}`);
        }
      }

      if (!countryIds.length) throw new Error(failures[0] ?? "No countries could be synced.");
      const showResult = await addToShow({ data: { editionId: organizerEditionId, showId, countryIds } });
      toast.success(
        `${countryIds.length} countries synced · ${showResult.added} added to ${showResult.showName}${showResult.refreshed ? ` · ${showResult.refreshed} refreshed` : ""}`,
      );
      if (failures.length) setError(`${failures.length} response${failures.length === 1 ? "" : "s"} need attention: ${failures.join(" | ")}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Round sync failed.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page pb-5">
      <AdminPageHeader
        eyebrow="Confirmations → Solaris"
        title="Sync line-ups"
        description="Import a confirmation wave from the exact Organizer edition and place those same canonical entries into one of that edition's shows."
        actions={<Link to="/confirmations/admin" className="admin-action-secondary"><ArrowLeft className="size-4" /> Delegations</Link>}
      />

      {!organizerEditionId ? (
        <AdminCard>
          <AdminEmptyState
            title="Select an edition"
            description="Line-up sync is edition-scoped operational work. Select the exact Organizer edition first; Solaris will not choose the newest confirmation round or another edition automatically."
          />
        </AdminCard>
      ) : loading ? <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading confirmation rounds…</p></AdminCard>
      : error && !rows.length ? <AdminCard><AdminEmptyState title="Sync data unavailable" description={error} /></AdminCard>
      : !rounds.length ? <AdminCard><AdminEmptyState title="No confirmation rounds to sync" description="There are no submitted participating delegations in the selected Organizer edition yet." /></AdminCard>
      : (
        <>
          <AdminCard strong className="mb-4">
            <AdminCardHeader
              eyebrow="One-click import"
              title={selectedRound ? `${selectedRound.name} → ${targets?.shows.find((show) => show.id === showId)?.name ?? "choose a show"}` : "Choose a round"}
              description="The country is synced once at edition level. The selected show receives the same entry, but its song stays hidden until the HOD publishes it or its exact reveal time arrives."
              action={<AdminStatus tone={selectedRows.length ? "ready" : "neutral"}>{selectedRows.length} countries</AdminStatus>}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="admin-section-label">Confirmation round</span>
                <select value={roundId} onChange={(event) => setRoundId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground">
                  {rounds.map((round) => <option key={round.id} value={round.id}>SSC {round.editionNumber} · {round.name} · {round.count}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="admin-section-label">Add to show</span>
                <select value={showId} onChange={(event) => setShowId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground" disabled={!targets?.shows.length}>
                  {(targets?.shows ?? []).map((show) => <option key={show.id} value={show.id}>{show.name} · {show.kind.replaceAll("-", " ")}</option>)}
                </select>
              </label>
            </div>

            <button type="button" disabled={busy || !showId || !selectedRows.length} onClick={() => void runSync()} className="admin-action-primary mt-4 w-full">
              <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
              {busy ? "Syncing countries and entries…" : `Sync ${selectedRows.length} to ${targets?.shows.find((show) => show.id === showId)?.name ?? "show"}`}
            </button>
          </AdminCard>

          <AdminCard className="mb-4">
            <AdminCardHeader eyebrow="What comes across" title="One entry, every show" description="Solaris keeps one country participation and one canonical song per edition. Show line-ups only reference that same entry." />
            <div className="grid gap-2 sm:grid-cols-3 text-xs text-muted-foreground">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><strong className="block text-foreground">Country</strong>Participation and country identity</div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><strong className="block text-foreground">Entry</strong>Artist, song and reveal state stay linked</div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><strong className="block text-foreground">Listening</strong>Valid confirmation YouTube links fill the YouTube listening link automatically</div>
            </div>
          </AdminCard>

          {targets?.editionSlug ? (
            <Link to="/admin/lineup-sync/$slug" params={{ slug: targets.editionSlug }} className="admin-action-secondary w-full">
              Open one-click show manager <ArrowRight className="size-4" />
            </Link>
          ) : null}

          {error ? <div className="mt-4 rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-3 text-xs leading-relaxed text-amber-100">{error}</div> : null}
        </>
      )}
    </div>
  );
}
