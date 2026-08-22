import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Calculator, Save, Vote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { VotingEditor } from "@/components/studio/VotingEditor";
import { supabase } from "@/integrations/supabase/client";
import {
  editionLabel,
  useEdition,
  useJuryVotes,
  useShows,
  useTelevotes,
} from "@/lib/data";
import { resolveVoting, type VotingConfig } from "@/lib/voting";

type VotingSearch = { show?: string };

type PendingSave = {
  showId: string;
  showName: string;
  config: VotingConfig;
};

type RankState = {
  id: string;
  countryId: string;
  jury: number;
  televote: number;
  total: number;
  oldRank: number | null;
  runningOrder: number | null;
};

export const Route = createFileRoute("/_authenticated/admin/voting-system/$slug")({
  head: () => ({ meta: [{ title: "Voting system — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (search: Record<string, unknown>): VotingSearch => ({ show: typeof search.show === "string" ? search.show : undefined }),
  component: VotingSystemWorkspace,
});

async function rerankExistingResults(showId: string, config: VotingConfig) {
  const [{ data: results, error: resultsError }, { data: participants, error: participantError }, { data: juryRows, error: juryError }] = await Promise.all([
    (supabase.from("results") as any)
      .select("id,country_id,jury_points,televote_points,total_points,final_rank")
      .eq("show_id", showId),
    (supabase.from("participants") as any)
      .select("country_id,running_order")
      .eq("show_id", showId),
    (supabase.from("jury_votes") as any)
      .select("receiving_country_id,receiving_entity_id,points")
      .eq("show_id", showId),
  ]);

  if (resultsError) throw resultsError;
  if (participantError) throw participantError;
  if (juryError) throw juryError;
  if (!results?.length) return;

  const runningOrder = new Map<string, number | null>(
    (participants ?? []).map((row: any) => [row.country_id, row.running_order == null ? null : Number(row.running_order)]),
  );

  const juryScale = [...new Set((config.juryPoints ?? []).map(Number).filter(Number.isFinite))].sort((a, b) => b - a);
  const pointCounts = new Map<string, Map<number, number>>();
  for (const vote of juryRows ?? []) {
    const countryId = vote.receiving_country_id ?? vote.receiving_entity_id;
    if (!countryId) continue;
    const bucket = pointCounts.get(countryId) ?? new Map<number, number>();
    const points = Number(vote.points ?? 0);
    bucket.set(points, (bucket.get(points) ?? 0) + 1);
    pointCounts.set(countryId, bucket);
  }

  const juryWeight = (config.weighting.jury ?? 50) / 50;
  const teleWeight = (config.weighting.televote ?? 50) / 50;

  const states: RankState[] = results.map((row: any) => {
    const jury = Number(row.jury_points ?? 0);
    const televote = Number(row.televote_points ?? 0);
    const total = config.weightedScoring
      ? Math.round(jury * juryWeight + televote * teleWeight)
      : jury + televote;
    return {
      id: row.id,
      countryId: row.country_id,
      jury,
      televote,
      total,
      oldRank: row.final_rank == null ? null : Number(row.final_rank),
      runningOrder: runningOrder.get(row.country_id) ?? null,
    };
  });

  const chain = config.tieBreak?.length ? config.tieBreak : ["televote", "twelves", "jury"];
  states.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;

    for (const rule of chain) {
      if (rule === "jury" && b.jury !== a.jury) return b.jury - a.jury;
      if (rule === "televote" && b.televote !== a.televote) return b.televote - a.televote;

      if (rule === "twelves") {
        const max = juryScale[0] ?? 12;
        const aCount = pointCounts.get(a.countryId)?.get(max) ?? 0;
        const bCount = pointCounts.get(b.countryId)?.get(max) ?? 0;
        if (bCount !== aCount) return bCount - aCount;
      }

      if (rule === "countback") {
        for (const score of juryScale) {
          const aCount = pointCounts.get(a.countryId)?.get(score) ?? 0;
          const bCount = pointCounts.get(b.countryId)?.get(score) ?? 0;
          if (bCount !== aCount) return bCount - aCount;
        }
      }

      if (rule === "runningOrder") {
        const aOrder = a.runningOrder ?? Number.MAX_SAFE_INTEGER;
        const bOrder = b.runningOrder ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return bOrder - aOrder;
      }
    }

    const aOld = a.oldRank ?? Number.MAX_SAFE_INTEGER;
    const bOld = b.oldRank ?? Number.MAX_SAFE_INTEGER;
    if (aOld !== bOld) return aOld - bOld;
    return a.countryId.localeCompare(b.countryId);
  });

  const updates = states.map((state, index) =>
    (supabase.from("results") as any)
      .update({
        total_points: state.total,
        final_rank: index + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", state.id),
  );

  const settled = await Promise.all(updates);
  const failed = settled.find((result: any) => result.error);
  if (failed?.error) throw failed.error;
}

function VotingSystemWorkspace() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const { data: edition, isLoading: loadingEdition } = useEdition(slug);
  const { data: shows = [], isLoading: loadingShows } = useShows(edition?.id);
  const orderedShows = useMemo(() => [...shows].sort((a, b) => a.sort_order - b.sort_order), [shows]);
  const selectedShow = orderedShows.find((show) => show.id === search.show) ?? orderedShows[0] ?? null;
  const { data: juryVotes = [] } = useJuryVotes(selectedShow?.id);
  const { data: televotes = [] } = useTelevotes(selectedShow?.id);
  const saved = useMemo(() => resolveVoting(selectedShow?.voting_config), [selectedShow?.voting_config]);
  const [draft, setDraft] = useState<VotingConfig>(saved);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(saved);
    setPendingSave(null);
  }, [saved, selectedShow?.id]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const hasRecordedVotes = juryVotes.length > 0 || televotes.length > 0;
  const totalWeight = draft.weighting.jury + draft.weighting.televote;

  async function persist(config: VotingConfig) {
    if (!selectedShow) return;
    setBusy(true);
    try {
      const { error } = await (supabase.from("shows") as any)
        .update({ voting_config: config, qualifier_count: config.qualifiers ?? null })
        .eq("id", selectedShow.id);
      if (error) throw error;

      // Saving calculation rules must immediately update already-calculated official ranks.
      // Previously the config changed, but results.final_rank stayed frozen from the old rules,
      // which made a jury-first tie-break still look televote-first until another result sync.
      if (hasRecordedVotes) await rerankExistingResults(selectedShow.id, config);

      toast.success(`${selectedShow.name} voting system saved and standings recalculated`);
      setPendingSave(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["shows"] }),
        qc.invalidateQueries({ queryKey: ["show"] }),
        qc.invalidateQueries({ queryKey: ["results"] }),
      ]);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Voting system could not be saved");
    } finally {
      setBusy(false);
    }
  }

  function requestSave() {
    if (!selectedShow || !dirty) return;
    if (hasRecordedVotes) {
      setPendingSave({ showId: selectedShow.id, showName: selectedShow.name, config: draft });
      return;
    }
    void persist(draft);
  }

  function resetDraft() {
    setDraft(saved);
    toast.info("Unsaved voting changes discarded");
  }

  if (loadingEdition || loadingShows) {
    return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading voting system…</p></AdminCard>;
  }

  if (!edition) {
    return <AdminCard><AdminEmptyState icon={Calculator} title="Edition not found" description="Choose another edition from the organizer workspace." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  }

  if (!orderedShows.length) {
    return <AdminPage><AdminPageHeader eyebrow={editionLabel(edition)} title="Voting system" description="Create a show before configuring how its result is calculated." /><AdminCard><AdminEmptyState icon={Vote} title="No shows yet" description="Voting rules belong to an individual show." action={<Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">Create show</Link>} /></AdminCard></AdminPage>;
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Voting system"
        description="Configure jury and televote scales, weighting, qualifiers and tie-break rules. Saving recalculates existing standings without changing ballot rows."
        actions={<button type="button" disabled={!dirty || busy} onClick={requestSave} className="admin-action-primary"><Save className="size-4" /> {busy ? "Saving…" : "Save rules"}</button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/admin/$slug" params={{ slug }} className="admin-action-quiet"><ArrowLeft className="size-4" /> Edition home</Link>
        <select
          value={selectedShow?.id ?? ""}
          onChange={(event) => void navigate({ search: { show: event.target.value || undefined } })}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
        >
          {orderedShows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}
        </select>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Metric label="Jury awards" value={juryVotes.length} />
        <Metric label="Televote rows" value={televotes.length} />
        <Metric label="Qualifiers" value={draft.qualifiers ?? 0} />
      </div>

      <AdminCard strong className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="admin-section-label">Current calculation</p>
            <p className="mt-2 text-base font-bold text-foreground">
              {draft.juryEnabled && draft.televoteEnabled ? `${draft.weighting.jury}% jury · ${draft.weighting.televote}% televote` : draft.juryEnabled ? "Jury only" : draft.televoteEnabled ? "Televote only" : "No vote source enabled"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {draft.weightedScoring ? "Weighted scoring is active, so the percentage split affects calculated rankings." : "The displayed split does not alter plain jury + televote totals unless weighted scoring is enabled."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {dirty ? <AdminStatus tone="attention">Unsaved</AdminStatus> : <AdminStatus tone="ready">Saved</AdminStatus>}
            {hasRecordedVotes ? <AdminStatus tone="info">Votes recorded</AdminStatus> : null}
          </div>
        </div>
        {totalWeight !== 100 ? <p className="mt-3 rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3 text-xs text-amber-100">The jury and televote display weights currently total {totalWeight}%. Saving is still possible, but a 100% total is easier to reason about.</p> : null}
      </AdminCard>

      {hasRecordedVotes ? (
        <AdminCard className="mb-4">
          <AdminCardHeader eyebrow="Protection" title="This show already has votes" description="Changing point scales, weighting, tie-breaks or qualification rules can change calculated standings. Saving requires confirmation; ballot rows themselves are not edited." />
        </AdminCard>
      ) : null}

      <AdminCard>
        <AdminCardHeader eyebrow={selectedShow?.name} title="Calculation rules" description="Changes stay as a draft until Save rules is pressed." />
        <VotingEditor voting={draft} onChange={setDraft} />
        <div className="mt-6 grid grid-cols-2 gap-2 border-t border-white/[0.07] pt-4">
          <button type="button" disabled={!dirty || busy} onClick={resetDraft} className="admin-action-secondary w-full">Discard changes</button>
          <button type="button" disabled={!dirty || busy} onClick={requestSave} className="admin-action-primary w-full"><Save className="size-4" /> Save rules</button>
        </div>
      </AdminCard>

      <AdminConfirmSheet
        open={!!pendingSave}
        onClose={() => !busy && setPendingSave(null)}
        onConfirm={() => pendingSave ? persist(pendingSave.config) : undefined}
        title="Change rules after votes exist?"
        description={<>This keeps every existing jury and televote row unchanged, then immediately recalculates totals and ranks with the new tie-break order.</>}
        confirmLabel="Save and recalculate"
        confirmationText={pendingSave?.showName}
        confirmationHint={pendingSave ? `Type ${pendingSave.showName} to confirm` : undefined}
        busy={busy}
      />
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}
