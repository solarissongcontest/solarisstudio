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
import { editionLabel, useAllShows, useEditions, useIsOrganizer } from "@/lib/data";
import {
  type PredictionRound,
  useDeletePredictionRound,
  usePredictionRounds,
  useSavePredictionRound,
  useScorePredictionRound,
} from "@/lib/prediction-data";
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
  const { data: shows = [] } = useAllShows();
  const { data: editions = [] } = useEditions();
  const { data: roundData, isLoading } = usePredictionRounds(undefined, true);
  const saveRound = useSavePredictionRound();
  const deleteRound = useDeletePredictionRound();
  const scoreRound = useScorePredictionRound();
  const [form, setForm] = useState<FormState>(() => defaultForm());
  const [message, setMessage] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const activeEdition = useMemo(() => {
    const ordered = [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1));
    return ordered.find((edition) => edition.id === editionId) ?? ordered[0] ?? null;
  }, [editions, editionId]);

  const sortedShows = useMemo(
    () => shows.filter((show) => show.edition_id === activeEdition?.id).sort((a, b) => a.sort_order - b.sort_order),
    [shows, activeEdition?.id],
  );

  const roundByShow = useMemo(() => new Map((roundData?.rounds ?? []).map((round) => [round.show_id, round])), [roundData]);
  const selectedShow = sortedShows.find((show) => show.id === form.showId) ?? null;
  const selectedRound = form.showId ? roundByShow.get(form.showId) ?? null : null;

  useEffect(() => {
    if (!sortedShows.length) {
      if (form.showId) setForm((current) => ({ ...current, showId: "" }));
      return;
    }
    if (!sortedShows.some((show) => show.id === form.showId)) setForm((current) => ({ ...current, showId: sortedShows[0].id }));
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

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (!form.showId || !form.predictionTypes.length) {
      setMessage("Choose a show and at least one prediction type.");
      return;
    }
    if (new Date(form.opensAt).getTime() >= new Date(form.locksAt).getTime()) {
      setMessage("The lock time must be after the opening time.");
      return;
    }
    if (form.predictionTypes.includes("qualifier") && !selectedShow?.qualifier_count) {
      setMessage("This show has no qualifier count, so qualifier predictions cannot be enabled.");
      return;
    }
    try {
      await saveRound.mutateAsync({
        show_id: form.showId,
        opens_at: new Date(form.opensAt).toISOString(),
        locks_at: new Date(form.locksAt).toISOString(),
        status: form.status,
        prediction_types: form.predictionTypes,
        consensus_minimum: form.consensusMinimum,
      });
      setMessage("Prediction round saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prediction round could not be saved.");
    }
  };

  const remove = async () => {
    if (!selectedRound) return;
    setMessage(null);
    try {
      await deleteRound.mutateAsync(selectedRound.id);
      setMessage("Draft prediction round deleted.");
      setDeleteOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A round with saved entries cannot be deleted; cancel it instead.");
    }
  };

  const score = async () => {
    if (!selectedRound) return;
    setMessage(null);
    try {
      const count = await scoreRound.mutateAsync(selectedRound.id);
      setMessage(`${count} prediction${count === 1 ? "" : "s"} scored.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The round could not be scored.");
    }
  };

  const configured = sortedShows.filter((show) => roundByShow.has(show.id)).length;
  const open = sortedShows.filter((show) => roundByShow.get(show.id)?.status === "open").length;

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
      ) : isLoading ? (
        <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading prediction rounds…</p></AdminCard>
      ) : roundData?.schemaReady === false ? (
        <AdminCard><AdminEmptyState icon={Sparkles} title="Prediction storage unavailable" description="Prediction rounds are temporarily unavailable. Existing contest data is unaffected." /></AdminCard>
      ) : !activeEdition ? (
        <AdminCard><AdminEmptyState icon={Trophy} title="No edition selected" description="Choose an edition before configuring prediction rounds." action={<Link to="/admin" className="admin-action-primary">Manage editions</Link>} /></AdminCard>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Shows" value={sortedShows.length} />
            <Metric label="Configured" value={configured} />
            <Metric label="Open" value={open} />
          </div>

          <AdminCard>
            <AdminCardHeader eyebrow="Show" title={selectedShow?.name ?? "Choose a show"} description={selectedRound ? `Prediction round · ${humanize(selectedRound.status)}` : "No prediction round exists for this show yet."} action={selectedRound ? <AdminStatus tone={selectedRound.status === "open" ? "ready" : selectedRound.status === "cancelled" ? "blocked" : selectedRound.status === "scored" ? "info" : "neutral"}>{humanize(selectedRound.status)}</AdminStatus> : <AdminStatus tone="neutral">Not configured</AdminStatus>} />
            <select value={form.showId} onChange={(event) => { setMessage(null); setForm((current) => ({ ...current, showId: event.target.value })); }} className="min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30">
              {sortedShows.map((show) => <option key={show.id} value={show.id}>{show.name}{roundByShow.get(show.id) ? ` · ${humanize(roundByShow.get(show.id)!.status)}` : " · no round"}</option>)}
            </select>
          </AdminCard>

          {!sortedShows.length ? (
            <AdminCard><AdminEmptyState icon={Sparkles} title="No shows yet" description="Create a contest show before opening Prediction Arena." action={<Link to="/admin/shows/$slug" params={{ slug: activeEdition.slug }} className="admin-action-primary">Create shows</Link>} /></AdminCard>
          ) : (
            <AdminCard>
              <AdminCardHeader eyebrow={selectedRound ? "Edit" : "Create"} title="Prediction setup" description="The round stays attached to the selected contest show." />
              <form onSubmit={save} className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className="admin-section-label">Opens</span><input type="datetime-local" value={form.opensAt} onChange={(event) => setForm((current) => ({ ...current, opensAt: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30" required /></label>
                  <label className="block"><span className="admin-section-label">Locks</span><input type="datetime-local" value={form.locksAt} onChange={(event) => setForm((current) => ({ ...current, locksAt: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30" required /></label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className="admin-section-label">Status</span><select value={form.status} disabled={selectedRound?.status === "scoring" || selectedRound?.status === "scored"} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PredictionRound["status"] }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"><option value="draft">Draft</option><option value="open">Open</option><option value="locked">Locked</option><option value="scoring">Scoring</option><option value="scored">Scored</option><option value="cancelled">Cancelled</option></select></label>
                  <label className="block"><span className="admin-section-label">Consensus minimum</span><input type="number" min={3} max={100} value={form.consensusMinimum} onChange={(event) => setForm((current) => ({ ...current, consensusMinimum: Number(event.target.value) }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30" /></label>
                </div>

                <div><p className="admin-section-label mb-2">Prediction types</p><div className="grid gap-2 sm:grid-cols-2">{AVAILABLE_TYPES.map((type) => { const unavailable = type.value === "qualifier" && !selectedShow?.qualifier_count; return <label key={type.value} className="flex min-h-12 items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3"><input type="checkbox" checked={form.predictionTypes.includes(type.value)} disabled={unavailable} onChange={() => toggleType(type.value)} /><span className="text-sm font-medium text-foreground">{type.label}</span></label>; })}</div></div>

                <div className="admin-sticky-actions"><button type="submit" disabled={saveRound.isPending || !selectedShow} className="admin-action-primary w-full">{saveRound.isPending ? "Saving…" : "Save prediction round"}</button></div>
              </form>

              {selectedRound ? <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.07] pt-4 sm:flex-row"><button type="button" onClick={() => void score()} disabled={scoreRound.isPending || Date.now() < new Date(selectedRound.locks_at).getTime()} className="admin-action-secondary flex-1">{scoreRound.isPending ? "Scoring…" : "Score from public result"}</button>{selectedRound.status === "draft" ? <button type="button" onClick={() => setDeleteOpen(true)} disabled={deleteRound.isPending} className="admin-action-danger"><Trash2 className="size-4" /> Delete draft</button> : null}</div> : null}
            </AdminCard>
          )}
        </>
      )}

      <AdminConfirmSheet open={deleteOpen} onClose={() => !deleteRound.isPending && setDeleteOpen(false)} onConfirm={remove} title={`Delete ${selectedShow?.name ?? "prediction"} draft?`} description="This removes the draft prediction round. A round with saved player entries cannot be deleted and must be cancelled instead." confirmLabel="Delete draft" busy={deleteRound.isPending} danger />
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
