import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Sparkles, Trash2, Trophy } from "lucide-react";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { useAdminContext } from "@/components/admin/AdminContext";
import { editionLabel, useEditions, useIsOrganizer, useShows } from "@/lib/data";
import { type PredictionRound, useDeletePredictionRound } from "@/lib/prediction-data";
import { useOrganizerPredictionRoundsForShows } from "@/lib/v3-organizer-prediction-data";
import {
  previewPredictionRoundSave,
  previewPredictionScore,
  useApplyReviewedPredictionRound,
  useApplyReviewedPredictionScore,
  type PredictionRoundSaveReview,
  type PredictionScoreReview,
} from "@/lib/v3-organizer-prediction-operations";
import type { PredictionType } from "@/lib/predictions";

export const Route = createFileRoute("/_authenticated/admin/predictions")({
  head: () => ({ meta: [{ title: "Prediction rounds — Solaris Organizer" }, { name: "robots", content: "noindex" }] }),
  component: PredictionRoundAdmin,
});

const AVAILABLE_TYPES: Array<{ value: PredictionType; label: string }> = [
  { value: "winner", label: "Winner" },
  { value: "top_three", label: "Ordered top three" },
  { value: "qualifier", label: "Qualifiers" },
  { value: "jury_winner", label: "Jury winner" },
  { value: "televote_winner", label: "Televote winner" },
];

type FormState = {
  showId: string;
  opensAt: string;
  locksAt: string;
  status: PredictionRound["status"];
  predictionTypes: PredictionType[];
  consensusMinimum: number;
};

type PendingSaveReview = {
  editionId: string;
  editionLabel: string;
  showId: string;
  showName: string;
  existingRoundId: string | null;
  beforeStatus: PredictionRound["status"] | null;
  operation: PredictionRoundSaveReview;
};

type PendingScoreReview = {
  editionId: string;
  editionLabel: string;
  showId: string;
  showName: string;
  roundId: string;
  roundStatus: PredictionRound["status"];
  locksAt: string;
  operation: PredictionScoreReview;
};

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultForm(): FormState {
  const now = new Date();
  const lock = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    showId: "",
    opensAt: localInputValue(now),
    locksAt: localInputValue(lock),
    status: "draft",
    predictionTypes: ["winner", "top_three", "jury_winner", "televote_winner"],
    consensusMinimum: 5,
  };
}

function PredictionRoundAdmin() {
  const { editionId } = useAdminContext();
  const { data: isOrganizer } = useIsOrganizer();
  const { data: editions = [], isLoading: editionsLoading } = useEditions();
  const activeEdition = useMemo(
    () => editions.find((edition) => edition.id === editionId) ?? null,
    [editions, editionId],
  );
  const { data: shows = [], isLoading: showsLoading } = useShows(activeEdition?.id);
  const sortedShows = useMemo(
    () => [...shows].sort((a, b) => a.sort_order - b.sort_order),
    [shows],
  );
  const showIds = useMemo(() => sortedShows.map((show) => show.id), [sortedShows]);
  const { data: roundData, isLoading: roundsLoading } = useOrganizerPredictionRoundsForShows(showIds, true);
  const applyRound = useApplyReviewedPredictionRound();
  const deleteRound = useDeletePredictionRound();
  const applyScore = useApplyReviewedPredictionScore();
  const [form, setForm] = useState<FormState>(() => defaultForm());
  const [message, setMessage] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [pendingSaveReview, setPendingSaveReview] = useState<PendingSaveReview | null>(null);
  const [pendingScoreReview, setPendingScoreReview] = useState<PendingScoreReview | null>(null);

  const roundByShow = useMemo(
    () => new Map((roundData?.rounds ?? []).map((round) => [round.show_id, round])),
    [roundData],
  );
  const selectedShow = sortedShows.find((show) => show.id === form.showId) ?? null;
  const selectedRound = form.showId ? roundByShow.get(form.showId) ?? null : null;

  useEffect(() => {
    setForm(defaultForm());
    setDeleteOpen(false);
    setPendingSaveReview(null);
    setPendingScoreReview(null);
    setMessage(null);
  }, [activeEdition?.id]);

  useEffect(() => {
    if (!sortedShows.length) {
      if (form.showId) setForm((current) => ({ ...current, showId: "" }));
      return;
    }
    if (!sortedShows.some((show) => show.id === form.showId)) {
      setForm((current) => ({ ...current, showId: sortedShows[0].id }));
    }
  }, [form.showId, sortedShows]);

  useEffect(() => {
    if (!form.showId) return;
    const existing = roundByShow.get(form.showId);
    if (!existing) {
      setForm((current) => ({ ...defaultForm(), showId: current.showId }));
      return;
    }
    setForm({
      showId: existing.show_id,
      opensAt: localInputValue(new Date(existing.opens_at)),
      locksAt: localInputValue(new Date(existing.locks_at)),
      status: existing.status,
      predictionTypes: existing.prediction_types,
      consensusMinimum: existing.consensus_minimum,
    });
  }, [form.showId, roundByShow]);

  const toggleType = (type: PredictionType) => {
    setForm((current) => {
      const enabled = current.predictionTypes.includes(type);
      let predictionTypes = enabled ? current.predictionTypes.filter((item) => item !== type) : [...current.predictionTypes, type];
      if (type === "top_three" && !enabled && !predictionTypes.includes("winner")) predictionTypes = ["winner", ...predictionTypes];
      if (type === "winner" && enabled && predictionTypes.includes("top_three")) predictionTypes = predictionTypes.filter((item) => item !== "top_three");
      return { ...current, predictionTypes };
    });
  };

  function assertExactSelection() {
    if (!editionId || !activeEdition || activeEdition.id !== editionId) {
      return "Edition context changed before the Prediction Arena command. Select the exact Organizer edition and review the change again.";
    }
    if (!selectedShow || selectedShow.edition_id !== activeEdition.id) {
      return "The selected show no longer belongs to the active Organizer edition. Refresh the selection before continuing.";
    }
    if (selectedRound && selectedRound.show_id !== selectedShow.id) {
      return "The selected prediction round no longer matches the visible show. Refresh before continuing.";
    }
    return null;
  }

  const reviewSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const scopeError = assertExactSelection();
    if (scopeError) {
      setMessage(scopeError);
      return;
    }
    if (!activeEdition || !selectedShow || !form.showId || !form.predictionTypes.length) {
      setMessage("Choose a show and at least one prediction type.");
      return;
    }
    if (new Date(form.opensAt).getTime() >= new Date(form.locksAt).getTime()) {
      setMessage("The lock time must be after the opening time.");
      return;
    }
    if (form.predictionTypes.includes("qualifier") && !selectedShow.qualifier_count) {
      setMessage("This show has no qualifier count, so qualifier predictions cannot be enabled.");
      return;
    }

    setReviewBusy(true);
    try {
      const preview = await previewPredictionRoundSave(form.showId);
      const operationId = crypto.randomUUID();
      setPendingSaveReview({
        editionId: activeEdition.id,
        editionLabel: editionLabel(activeEdition),
        showId: selectedShow.id,
        showName: selectedShow.name,
        existingRoundId: selectedRound?.id ?? null,
        beforeStatus: selectedRound?.status ?? null,
        operation: {
          show_id: form.showId,
          opens_at: new Date(form.opensAt).toISOString(),
          locks_at: new Date(form.locksAt).toISOString(),
          status: form.status,
          prediction_types: [...form.predictionTypes],
          consensus_minimum: form.consensusMinimum,
          expectedRoundVersion: preview.roundVersion,
          operationId,
          idempotencyKey: `prediction-round-save:${operationId}`,
        },
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prediction round review could not be prepared.");
    } finally {
      setReviewBusy(false);
    }
  };

  const applySaveReview = async () => {
    if (!pendingSaveReview) return;
    setMessage(null);
    const scopeError = assertExactSelection();
    if (
      scopeError ||
      editionId !== pendingSaveReview.editionId ||
      selectedShow?.id !== pendingSaveReview.showId ||
      (selectedRound?.id ?? null) !== pendingSaveReview.existingRoundId
    ) {
      setPendingSaveReview(null);
      setMessage(scopeError ?? "Prediction round scope changed while this review was open. Nothing was applied.");
      return;
    }

    try {
      await applyRound.mutateAsync(pendingSaveReview.operation);
      setPendingSaveReview(null);
      setMessage("Reviewed prediction round change applied.");
    } catch (error) {
      setPendingSaveReview(null);
      setMessage(error instanceof Error ? error.message : "Prediction round could not be saved. Refresh and review the current state before retrying.");
    }
  };

  const remove = async () => {
    if (!selectedRound) return;
    setMessage(null);
    const scopeError = assertExactSelection();
    if (scopeError) {
      setDeleteOpen(false);
      setMessage(scopeError);
      return;
    }
    try {
      await deleteRound.mutateAsync(selectedRound.id);
      setMessage("Draft prediction round deleted.");
      setDeleteOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A round with saved entries cannot be deleted; cancel it instead.");
    }
  };

  const reviewScore = async () => {
    if (!selectedRound || !activeEdition || !selectedShow) return;
    setMessage(null);
    const scopeError = assertExactSelection();
    if (scopeError) {
      setMessage(scopeError);
      return;
    }

    setReviewBusy(true);
    try {
      const preview = await previewPredictionScore(selectedRound.id);
      const operationId = crypto.randomUUID();
      setPendingScoreReview({
        editionId: activeEdition.id,
        editionLabel: editionLabel(activeEdition),
        showId: selectedShow.id,
        showName: selectedShow.name,
        roundId: selectedRound.id,
        roundStatus: selectedRound.status,
        locksAt: selectedRound.locks_at,
        operation: {
          roundId: selectedRound.id,
          expectedScoreRevision: preview.scoreRevision,
          operationId,
          idempotencyKey: `prediction-score:${operationId}`,
        },
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prediction scoring review could not be prepared.");
    } finally {
      setReviewBusy(false);
    }
  };

  const applyScoreReview = async () => {
    if (!pendingScoreReview) return;
    setMessage(null);
    const scopeError = assertExactSelection();
    if (
      scopeError ||
      editionId !== pendingScoreReview.editionId ||
      selectedShow?.id !== pendingScoreReview.showId ||
      selectedRound?.id !== pendingScoreReview.roundId ||
      selectedRound.status !== pendingScoreReview.roundStatus ||
      selectedRound.locks_at !== pendingScoreReview.locksAt
    ) {
      setPendingScoreReview(null);
      setMessage(scopeError ?? "Prediction scoring scope changed while this review was open. Nothing was applied.");
      return;
    }

    try {
      const count = await applyScore.mutateAsync(pendingScoreReview.operation);
      setPendingScoreReview(null);
      setMessage(`${count} prediction${count === 1 ? "" : "s"} scored.`);
    } catch (error) {
      setPendingScoreReview(null);
      setMessage(error instanceof Error ? error.message : "The round could not be scored. Refresh and review the current scoring revision before retrying.");
    }
  };

  const configured = sortedShows.filter((show) => roundByShow.has(show.id)).length;
  const open = sortedShows.filter((show) => roundByShow.get(show.id)?.status === "open").length;
  const loading = editionsLoading || Boolean(activeEdition && (showsLoading || roundsLoading));

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Engagement"
        title="Prediction rounds"
        description={activeEdition ? `Configure Prediction Arena for ${editionLabel(activeEdition)}. Pick a show, set the window and choose what people can predict.` : "Choose an edition before configuring Prediction Arena."}
        actions={<Link to="/admin/more" className="admin-action-secondary"><ArrowLeft className="size-4" /> More</Link>}
      />

      {message ? <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-3 text-sm text-foreground">{message}</div> : null}

      {isOrganizer === false ? (
        <AdminCard><AdminEmptyState icon={Sparkles} title="Organizer access required" description="This account can use fan features but cannot configure contest prediction rounds." /></AdminCard>
      ) : loading ? (
        <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading prediction rounds…</p></AdminCard>
      ) : !activeEdition ? (
        <AdminCard><AdminEmptyState icon={Trophy} title="No edition selected" description="Choose the exact Organizer edition before configuring prediction rounds. Solaris will not substitute the newest or globally active edition." action={<Link to="/admin/editions" className="admin-action-primary">Manage editions</Link>} /></AdminCard>
      ) : roundData?.schemaReady === false ? (
        <AdminCard><AdminEmptyState icon={Sparkles} title="Prediction storage unavailable" description="Prediction rounds are temporarily unavailable. Existing contest data is unaffected." /></AdminCard>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Shows" value={sortedShows.length} />
            <Metric label="Configured" value={configured} />
            <Metric label="Open" value={open} />
          </div>

          <AdminCard>
            <AdminCardHeader eyebrow="Show" title={selectedShow?.name ?? "Choose a show"} description={selectedRound ? `Prediction round · ${humanize(selectedRound.status)}` : "No prediction round exists for this show yet."} action={selectedRound ? <AdminStatus tone={selectedRound.status === "open" ? "ready" : selectedRound.status === "cancelled" ? "blocked" : selectedRound.status === "scored" ? "info" : "neutral"}>{humanize(selectedRound.status)}</AdminStatus> : <AdminStatus tone="neutral">Not configured</AdminStatus>} />
            <select value={form.showId} onChange={(event) => { setMessage(null); setPendingSaveReview(null); setPendingScoreReview(null); setForm((current) => ({ ...current, showId: event.target.value })); }} className="min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30">
              {sortedShows.map((show) => <option key={show.id} value={show.id}>{show.name}{roundByShow.get(show.id) ? ` · ${humanize(roundByShow.get(show.id)!.status)}` : " · no round"}</option>)}
            </select>
          </AdminCard>

          {!sortedShows.length ? (
            <AdminCard><AdminEmptyState icon={Sparkles} title="No shows yet" description="Create a contest show before opening Prediction Arena." action={<Link to="/admin/shows/$slug" params={{ slug: activeEdition.slug }} className="admin-action-primary">Create shows</Link>} /></AdminCard>
          ) : (
            <AdminCard>
              <AdminCardHeader eyebrow={selectedRound ? "Edit" : "Create"} title="Prediction setup" description="The round stays attached to the selected contest show." />
              <form onSubmit={reviewSave} className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className="admin-section-label">Opens</span><input type="datetime-local" value={form.opensAt} onChange={(event) => setForm((current) => ({ ...current, opensAt: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30" required /></label>
                  <label className="block"><span className="admin-section-label">Locks</span><input type="datetime-local" value={form.locksAt} onChange={(event) => setForm((current) => ({ ...current, locksAt: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30" required /></label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className="admin-section-label">Status</span><select value={form.status} disabled={selectedRound?.status === "scoring" || selectedRound?.status === "scored"} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PredictionRound["status"] }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"><option value="draft">Draft</option><option value="open">Open</option><option value="locked">Locked</option><option value="scoring">Scoring</option><option value="scored">Scored</option><option value="cancelled">Cancelled</option></select></label>
                  <label className="block"><span className="admin-section-label">Consensus minimum</span><input type="number" min={3} max={100} value={form.consensusMinimum} onChange={(event) => setForm((current) => ({ ...current, consensusMinimum: Number(event.target.value) }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30" /></label>
                </div>

                <div><p className="admin-section-label mb-2">Prediction types</p><div className="grid gap-2 sm:grid-cols-2">{AVAILABLE_TYPES.map((type) => { const unavailable = type.value === "qualifier" && !selectedShow?.qualifier_count; return <label key={type.value} className="flex min-h-12 items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3"><input type="checkbox" checked={form.predictionTypes.includes(type.value)} disabled={unavailable} onChange={() => toggleType(type.value)} /><span className="text-sm font-medium text-foreground">{type.label}</span></label>; })}</div></div>

                <div className="admin-sticky-actions"><button type="submit" disabled={reviewBusy || applyRound.isPending || !selectedShow} className="admin-action-primary w-full">{reviewBusy ? "Preparing review…" : "Review prediction round"}</button></div>
              </form>

              {selectedRound ? <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.07] pt-4 sm:flex-row"><button type="button" onClick={() => void reviewScore()} disabled={reviewBusy || applyScore.isPending || Date.now() < new Date(selectedRound.locks_at).getTime()} className="admin-action-secondary flex-1">{reviewBusy ? "Preparing review…" : applyScore.isPending ? "Scoring…" : "Review scoring"}</button>{selectedRound.status === "draft" ? <button type="button" onClick={() => setDeleteOpen(true)} disabled={deleteRound.isPending} className="admin-action-danger"><Trash2 className="size-4" /> Delete draft</button> : null}</div> : null}
            </AdminCard>
          )}
        </>
      )}

      <AdminConfirmSheet
        open={Boolean(pendingSaveReview)}
        onClose={() => !applyRound.isPending && setPendingSaveReview(null)}
        onConfirm={applySaveReview}
        title={pendingSaveReview?.existingRoundId ? "Apply prediction round change?" : "Create prediction round?"}
        description={pendingSaveReview ? <div className="space-y-3 text-sm leading-6"><p>Review the exact Prediction Arena configuration for <strong className="text-foreground">{pendingSaveReview.showName}</strong> in {pendingSaveReview.editionLabel}.</p><div className="grid gap-2 sm:grid-cols-2"><ReviewFact label="Status" value={`${pendingSaveReview.beforeStatus ? humanize(pendingSaveReview.beforeStatus) : "No round"} → ${humanize(pendingSaveReview.operation.status)}`} /><ReviewFact label="System revision" value={`v${pendingSaveReview.operation.expectedRoundVersion}`} /><ReviewFact label="Opens" value={new Date(pendingSaveReview.operation.opens_at).toLocaleString()} /><ReviewFact label="Locks" value={new Date(pendingSaveReview.operation.locks_at).toLocaleString()} /><ReviewFact label="Prediction types" value={pendingSaveReview.operation.prediction_types.map(humanize).join(", ")} /><ReviewFact label="Consensus minimum" value={String(pendingSaveReview.operation.consensus_minimum)} /></div><p className="text-xs text-muted-foreground">The exact preview revision and one idempotency identity are frozen in this review. Apply sends that reviewed revision directly to the canonical <code>studio2_save_prediction_round</code> command, so an intervening round change conflicts instead of being silently overwritten.</p></div> : "Review the exact prediction round configuration."}
        confirmLabel={pendingSaveReview?.existingRoundId ? "Apply reviewed change" : "Create reviewed round"}
        confirmationText={pendingSaveReview?.showName}
        confirmationHint={pendingSaveReview ? `Type ${pendingSaveReview.showName} to confirm this Prediction Arena change` : undefined}
        busy={applyRound.isPending}
        danger={pendingSaveReview?.operation.status === "open" || pendingSaveReview?.operation.status === "cancelled"}
      />

      <AdminConfirmSheet
        open={Boolean(pendingScoreReview)}
        onClose={() => !applyScore.isPending && setPendingScoreReview(null)}
        onConfirm={applyScoreReview}
        title="Score this prediction round?"
        description={pendingScoreReview ? <div className="space-y-3 text-sm leading-6"><p>This materializes Prediction Arena scores for <strong className="text-foreground">{pendingScoreReview.showName}</strong> in {pendingScoreReview.editionLabel} from the public result authority.</p><div className="grid gap-2 sm:grid-cols-2"><ReviewFact label="Round status" value={humanize(pendingScoreReview.roundStatus)} /><ReviewFact label="Locked" value={new Date(pendingScoreReview.locksAt).toLocaleString()} /><ReviewFact label="Score revision" value={`v${pendingScoreReview.operation.expectedScoreRevision}`} /><ReviewFact label="Round ID" value={pendingScoreReview.roundId} /></div><p className="text-xs text-muted-foreground">The reviewed score revision and idempotency identity are sent unchanged to <code>studio2_score_prediction_round</code>. If scoring inputs changed after review, the canonical operation must reject the stale revision rather than scoring a different state than the one reviewed here.</p></div> : "Review the exact scoring operation."}
        confirmLabel="Score reviewed round"
        confirmationText={pendingScoreReview?.showName}
        confirmationHint={pendingScoreReview ? `Type ${pendingScoreReview.showName} to confirm scoring` : undefined}
        busy={applyScore.isPending}
        danger
      />

      <AdminConfirmSheet open={deleteOpen} onClose={() => !deleteRound.isPending && setDeleteOpen(false)} onConfirm={remove} title={`Delete ${selectedShow?.name ?? "prediction"} draft?`} description="This removes the draft prediction round. A round with saved player entries cannot be deleted and must be cancelled instead." confirmLabel="Delete draft" busy={deleteRound.isPending} danger />
    </AdminPage>
  );
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p></div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}