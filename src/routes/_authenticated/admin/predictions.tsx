import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
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
  head: () => ({ meta: [{ title: "Prediction rounds — Solaris Studio" }] }),
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
  const { data: isOrganizer } = useIsOrganizer();
  const { data: shows } = useAllShows();
  const { data: editions } = useEditions();
  const { data: roundData, isLoading } = usePredictionRounds(undefined, true);
  const saveRound = useSavePredictionRound();
  const deleteRound = useDeletePredictionRound();
  const scoreRound = useScorePredictionRound();
  const [form, setForm] = useState<FormState>(() => defaultForm());
  const [message, setMessage] = useState<string | null>(null);

  const editionMap = useMemo(
    () => new Map((editions ?? []).map((edition) => [edition.id, edition])),
    [editions],
  );
  const sortedShows = useMemo(
    () =>
      [...(shows ?? [])].sort((a, b) => {
        const editionA = editionMap.get(a.edition_id)?.edition_number ?? -1;
        const editionB = editionMap.get(b.edition_id)?.edition_number ?? -1;
        return editionB - editionA || a.sort_order - b.sort_order;
      }),
    [editionMap, shows],
  );
  const roundByShow = useMemo(
    () => new Map((roundData?.rounds ?? []).map((round) => [round.show_id, round])),
    [roundData],
  );
  const selectedShow = sortedShows.find((show) => show.id === form.showId) ?? null;
  const selectedRound = form.showId ? roundByShow.get(form.showId) ?? null : null;

  useEffect(() => {
    if (!form.showId && sortedShows.length) {
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

  const chooseShow = (showId: string) => {
    setMessage(null);
    setForm((current) => ({ ...current, showId }));
  };

  const toggleType = (type: PredictionType) => {
    setForm((current) => {
      const enabled = current.predictionTypes.includes(type);
      let predictionTypes = enabled
        ? current.predictionTypes.filter((item) => item !== type)
        : [...current.predictionTypes, type];
      if (type === "top_three" && !enabled && !predictionTypes.includes("winner")) {
        predictionTypes = ["winner", ...predictionTypes];
      }
      if (type === "winner" && enabled && predictionTypes.includes("top_three")) {
        predictionTypes = predictionTypes.filter((item) => item !== "top_three");
      }
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
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "A round with saved entries cannot be deleted; cancel it instead.",
      );
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

  return (
    <AppShell>
      <PageHeader
        eyebrow="Organizer studio"
        title="Prediction rounds"
        description="Open, lock and score Prediction Arena rounds. Database time—not the viewer's device—enforces every deadline."
        actions={
          <Link to="/admin" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
            ← Studio
          </Link>
        }
      />

      {isOrganizer === false ? (
        <Panel title="Organizer access required">
          <p className="text-sm text-muted-foreground">
            Your account can use fan features, but it cannot configure contest prediction rounds.
          </p>
        </Panel>
      ) : isLoading ? (
        <Panel>
          <p className="text-sm text-muted-foreground">Loading prediction rounds…</p>
        </Panel>
      ) : roundData?.schemaReady === false ? (
        <Panel title="Prediction database setup is required">
          <p className="text-sm text-muted-foreground">
            Apply the supplied Solaris SQL in Lovable's Supabase project before creating a round.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[.7fr_1.3fr]">
          <Panel title="Shows">
            <div className="space-y-2">
              {sortedShows.map((show) => {
                const edition = editionMap.get(show.edition_id);
                const round = roundByShow.get(show.id);
                return (
                  <button
                    key={show.id}
                    type="button"
                    onClick={() => chooseShow(show.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left ${
                      form.showId === show.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-surface"
                    }`}
                  >
                    <p className="truncate text-sm font-semibold">{show.name}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {edition ? editionLabel(edition) : "Edition"} · {round?.status ?? "No round"}
                    </p>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel
            title={selectedRound ? "Edit prediction round" : "Create prediction round"}
            description={selectedShow?.name}
          >
            <form onSubmit={save} className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Opens
                  </span>
                  <input
                    type="datetime-local"
                    value={form.opensAt}
                    onChange={(event) => setForm((current) => ({ ...current, opensAt: event.target.value }))}
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                    required
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Locks
                  </span>
                  <input
                    type="datetime-local"
                    value={form.locksAt}
                    onChange={(event) => setForm((current) => ({ ...current, locksAt: event.target.value }))}
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                    required
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Status
                  </span>
                  <select
                    value={form.status}
                    disabled={selectedRound?.status === "scoring" || selectedRound?.status === "scored"}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as PredictionRound["status"],
                      }))
                    }
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="open">Open</option>
                    <option value="locked">Locked</option>
                    <option value="scoring">Scoring</option>
                    <option value="scored">Scored</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Consensus minimum
                  </span>
                  <input
                    type="number"
                    min={3}
                    max={100}
                    value={form.consensusMinimum}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        consensusMinimum: Number(event.target.value),
                      }))
                    }
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                  />
                </label>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Prediction types
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {AVAILABLE_TYPES.map((type) => {
                    const unavailable = type.value === "qualifier" && !selectedShow?.qualifier_count;
                    return (
                      <label key={type.value} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-3">
                        <input
                          type="checkbox"
                          checked={form.predictionTypes.includes(type.value)}
                          disabled={unavailable}
                          onChange={() => toggleType(type.value)}
                        />
                        <span className="text-sm font-medium">{type.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={saveRound.isPending}
                className="min-h-12 w-full rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {saveRound.isPending ? "Saving…" : "Save prediction round"}
              </button>
            </form>

            {selectedRound && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
                <button
                  type="button"
                  onClick={score}
                  disabled={scoreRound.isPending || Date.now() < new Date(selectedRound.locks_at).getTime()}
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {scoreRound.isPending ? "Scoring…" : "Score from public result"}
                </button>
                {selectedRound.status === "draft" && (
                  <button
                    type="button"
                    onClick={remove}
                    disabled={deleteRound.isPending}
                    className="rounded-xl border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive"
                  >
                    Delete draft
                  </button>
                )}
              </div>
            )}

            {message && (
              <p className="mt-4 rounded-xl bg-surface px-3 py-2 text-sm text-muted-foreground">
                {message}
              </p>
            )}
          </Panel>
        </div>
      )}
    </AppShell>
  );
}
