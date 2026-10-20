import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminCard, AdminCardHeader, AdminConfirmSheet, AdminStatus } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { useEdition, useShows, type Participant, type Show } from "@/lib/data";
import { isHeatShow, isSecondChanceShow, isSemiShow } from "@/lib/edition-progression";
import { reportSupabaseError } from "@/lib/errors";
import { heatProgressionOutcome, heatQualifierCutoff, type HeatProgressionOutcome } from "@/lib/heat-progression";

type RawProgressionResult = {
  show_id: string;
  country_id: string | null;
  contest_entity_id: string | null;
  final_rank: number | null;
};

type ProgressionParticipant = Participant & {
  country_id: string | null;
  running_order_allocation?: string | null;
};

type ProgressionInsertRow = {
  edition_id: string;
  show_id: string;
  country_id: string | null;
  contest_entity_id: string | null;
  running_order: null;
  running_order_allocation: null;
  semi_final: string;
  artist: string | null;
  song: string | null;
};

type ProgressionCandidate = {
  key: string;
  label: string;
  sourceShowId: string;
  sourceShowName: string;
  finalRank: number;
  row: ProgressionInsertRow;
};

type ProgressionSourceReview = {
  id: string;
  name: string;
  kind: string;
  qualifierCutoff: number;
};

type SyncBusy = "second-chance" | "semi" | null;

type PendingProgressionReview = {
  editionId: string;
  outcome: HeatProgressionOutcome;
  busyKey: Exclude<SyncBusy, null>;
  target: {
    id: string;
    name: string;
    kind: string;
  };
  sources: ProgressionSourceReview[];
  candidates: ProgressionCandidate[];
  alreadyPresent: number;
  unusable: number;
};

const EMPTY_SHOWS: Show[] = [];
const EMPTY_PARTICIPANTS: Participant[] = [];

function resultIdentityKey(row: Pick<RawProgressionResult, "country_id" | "contest_entity_id">) {
  if (row.country_id) return `c:${row.country_id}`;
  if (row.contest_entity_id) return `e:${row.contest_entity_id}`;
  return null;
}

/**
 * `useParticipants` canonicalises custom edition entities by exposing their
 * entity id through country_id. Detect that shape so progression syncing can
 * still compare it with raw Supabase rows, where custom country_id is null.
 */
function participantIdentityKey(participant: ProgressionParticipant) {
  if (participant.contest_entity_id && participant.country_id === participant.contest_entity_id) {
    return `e:${participant.contest_entity_id}`;
  }
  if (participant.country_id) return `c:${participant.country_id}`;
  if (participant.contest_entity_id) return `e:${participant.contest_entity_id}`;
  return null;
}

function participantCountryIdForInsert(participant: ProgressionParticipant) {
  if (participant.contest_entity_id && participant.country_id === participant.contest_entity_id) return null;
  return participant.country_id;
}

function sourceReview(show: Show): ProgressionSourceReview {
  return {
    id: show.id,
    name: show.name,
    kind: show.kind,
    qualifierCutoff: heatQualifierCutoff(show),
  };
}

function candidateFingerprint(candidates: ProgressionCandidate[]) {
  return JSON.stringify(
    candidates
      .map((candidate) => ({
        key: candidate.key,
        sourceShowId: candidate.sourceShowId,
        finalRank: candidate.finalRank,
        row: candidate.row,
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  );
}

function sameReviewedSource(before: ProgressionSourceReview, live: Show) {
  return (
    before.id === live.id &&
    before.name === live.name &&
    before.kind === live.kind &&
    before.qualifierCutoff === heatQualifierCutoff(live)
  );
}

export function HeatProgressionSyncPanel({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const { editionId: organizerEditionId } = useAdminContext();
  const { data: edition } = useEdition(slug);
  const scopedEditionId = edition && organizerEditionId === edition.id ? edition.id : undefined;
  const { data: showsData } = useShows(scopedEditionId);
  const shows = showsData ?? EMPTY_SHOWS;

  const orderedShows = useMemo(() => [...shows].sort((a, b) => a.sort_order - b.sort_order), [shows]);
  const heatShows = useMemo(() => orderedShows.filter((show) => isHeatShow(show)), [orderedShows]);
  const secondChanceShows = useMemo(() => orderedShows.filter((show) => isSecondChanceShow(show)), [orderedShows]);
  const semiShows = useMemo(() => orderedShows.filter((show) => isSemiShow(show)), [orderedShows]);

  const [secondChanceId, setSecondChanceId] = useState("");
  const [semiId, setSemiId] = useState("");
  const [semiHeatIds, setSemiHeatIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<SyncBusy>(null);
  const [pendingReview, setPendingReview] = useState<PendingProgressionReview | null>(null);

  useEffect(() => {
    if (!secondChanceShows.some((show) => show.id === secondChanceId)) {
      const next = secondChanceShows[0]?.id ?? "";
      if (next !== secondChanceId) setSecondChanceId(next);
    }
  }, [secondChanceId, secondChanceShows]);

  useEffect(() => {
    if (!semiShows.some((show) => show.id === semiId)) {
      const next = semiShows[0]?.id ?? "";
      if (next !== semiId) setSemiId(next);
    }
  }, [semiId, semiShows]);

  useEffect(() => {
    const valid = new Set(heatShows.map((show) => show.id));
    setSemiHeatIds((current) => {
      const next = current.filter((id) => valid.has(id));
      const unchanged =
        next.length === current.length && next.every((id, index) => id === current[index]);
      return unchanged ? current : next;
    });
  }, [heatShows]);

  useEffect(() => {
    setPendingReview(null);
  }, [organizerEditionId, edition?.id]);

  if (!edition || organizerEditionId !== edition.id || !heatShows.length) return null;

  const missingCutoffShows = heatShows.filter((show) => heatQualifierCutoff(show) <= 0);

  async function buildProgressionReview(
    outcome: HeatProgressionOutcome,
    targetShow: Show,
    sourceShows: Show[],
    busyKey: Exclude<SyncBusy, null>,
  ): Promise<PendingProgressionReview> {
    if (!edition || organizerEditionId !== edition.id) {
      throw Object.assign(new Error("Edition context changed before progression review. Reload the edition before retrying."), { status: 409 });
    }
    if (targetShow.edition_id !== edition.id || sourceShows.some((show) => show.edition_id !== edition.id)) {
      throw Object.assign(new Error("A reviewed progression show no longer belongs to the selected edition."), { status: 409 });
    }
    if (!sourceShows.length) {
      throw Object.assign(new Error("Choose at least one heat to sync."), { status: 400 });
    }

    const missingCutoffs = sourceShows.filter((show) => heatQualifierCutoff(show) <= 0);
    if (missingCutoffs.length) {
      throw Object.assign(
        new Error(`Set the qualifier count first for ${missingCutoffs.map((show) => show.name).join(", ")}.`),
        { status: 409 },
      );
    }

    const sourceIds = sourceShows.map((show) => show.id);
    const [resultsResponse, participantsResponse] = await Promise.all([
      (supabase.from("results") as any)
        .select("show_id,country_id,contest_entity_id,final_rank")
        .eq("edition_id", edition.id)
        .in("show_id", sourceIds)
        .not("final_rank", "is", null),
      (supabase.from("participants") as any)
        .select("id,edition_id,show_id,country_id,contest_entity_id,artist,song,running_order,running_order_allocation,semi_final")
        .eq("edition_id", edition.id),
    ]);
    if (resultsResponse.error) throw resultsResponse.error;
    if (participantsResponse.error) throw participantsResponse.error;

    const liveParticipants = (participantsResponse.data ?? EMPTY_PARTICIPANTS) as ProgressionParticipant[];
    const showById = new Map(sourceShows.map((show) => [show.id, show]));
    const desired = new Map<string, RawProgressionResult>();
    for (const raw of (resultsResponse.data ?? []) as RawProgressionResult[]) {
      const sourceShow = showById.get(raw.show_id);
      if (!sourceShow || heatProgressionOutcome(sourceShow, Number(raw.final_rank)) !== outcome) continue;
      const key = resultIdentityKey(raw);
      if (key && !desired.has(key)) desired.set(key, raw);
    }

    const targetKeys = new Set<string>();
    const sourceByShowAndIdentity = new Map<string, ProgressionParticipant>();
    const sourceByIdentity = new Map<string, ProgressionParticipant>();
    for (const participant of liveParticipants) {
      const key = participantIdentityKey(participant);
      if (!key) continue;
      if (participant.show_id === targetShow.id) targetKeys.add(key);
      sourceByIdentity.set(key, participant);
      if (participant.show_id) sourceByShowAndIdentity.set(`${participant.show_id}:${key}`, participant);
    }

    let alreadyPresent = 0;
    let unusable = 0;
    const candidates: ProgressionCandidate[] = [];

    for (const [key, result] of desired) {
      if (targetKeys.has(key)) {
        alreadyPresent += 1;
        continue;
      }

      const source = sourceByShowAndIdentity.get(`${result.show_id}:${key}`) ?? sourceByIdentity.get(key);
      const countryId = source ? participantCountryIdForInsert(source) : result.country_id;
      const contestEntityId = source?.contest_entity_id ?? result.contest_entity_id;
      if (!countryId && !contestEntityId) {
        unusable += 1;
        continue;
      }

      const sourceShow = showById.get(result.show_id)!;
      candidates.push({
        key,
        label: [source?.artist, source?.song].filter(Boolean).join(" · ") || key,
        sourceShowId: sourceShow.id,
        sourceShowName: sourceShow.name,
        finalRank: Number(result.final_rank),
        row: {
          edition_id: edition.id,
          show_id: targetShow.id,
          country_id: countryId,
          contest_entity_id: contestEntityId,
          running_order: null,
          running_order_allocation: null,
          semi_final: targetShow.kind,
          artist: source?.artist ?? null,
          song: source?.song ?? null,
        },
      });
    }

    return {
      editionId: edition.id,
      outcome,
      busyKey,
      target: { id: targetShow.id, name: targetShow.name, kind: targetShow.kind },
      sources: sourceShows.map(sourceReview),
      candidates,
      alreadyPresent,
      unusable,
    };
  }

  async function requestHeatOutcomeSync(
    outcome: HeatProgressionOutcome,
    targetShow: Show | undefined,
    sourceShows: Show[],
    busyKey: Exclude<SyncBusy, null>,
  ) {
    if (!targetShow || busy) return;
    setBusy(busyKey);
    try {
      const review = await buildProgressionReview(outcome, targetShow, sourceShows, busyKey);
      const routeLabel = outcome === "nq" ? "heat NQ" : "heat qualifier";
      if (!review.candidates.length) {
        if (review.alreadyPresent) {
          toast.message(`All ${review.alreadyPresent} ${routeLabel}${review.alreadyPresent === 1 ? " is" : "s are"} already in ${review.target.name}`);
        } else {
          toast.message(outcome === "nq" ? "No ranked heat NQs are available to sync" : "No ranked heat qualifiers are available to sync");
        }
        return;
      }
      setPendingReview(review);
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Heat progression preview could not be prepared."));
    } finally {
      setBusy(null);
    }
  }

  async function applyProgressionReview() {
    const review = pendingReview;
    if (!review || busy) return;
    if (!edition || organizerEditionId !== review.editionId || edition.id !== review.editionId) {
      setPendingReview(null);
      toast.error("Edition context changed while this progression review was open. Nothing was applied.");
      return;
    }

    setBusy(review.busyKey);
    try {
      const showIds = [review.target.id, ...review.sources.map((source) => source.id)];
      const { data: liveShowRows, error: showError } = await (supabase.from("shows") as any)
        .select("*")
        .eq("edition_id", review.editionId)
        .in("id", showIds);
      if (showError) throw showError;

      const liveShows = (liveShowRows ?? []) as Show[];
      const liveById = new Map(liveShows.map((show) => [show.id, show]));
      const liveTarget = liveById.get(review.target.id);
      if (!liveTarget || liveTarget.name !== review.target.name || liveTarget.kind !== review.target.kind) {
        throw Object.assign(new Error("The target show changed while this review was open. Reopen progression sync and review the current state."), { status: 409 });
      }

      const liveSources: Show[] = [];
      for (const source of review.sources) {
        const liveSource = liveById.get(source.id);
        if (!liveSource || !sameReviewedSource(source, liveSource)) {
          throw Object.assign(new Error(`${source.name} or its qualifier rule changed while this review was open. Reopen progression sync.`), { status: 409 });
        }
        liveSources.push(liveSource);
      }

      const liveReview = await buildProgressionReview(review.outcome, liveTarget, liveSources, review.busyKey);
      if (
        candidateFingerprint(liveReview.candidates) !== candidateFingerprint(review.candidates) ||
        liveReview.alreadyPresent !== review.alreadyPresent ||
        liveReview.unusable !== review.unusable
      ) {
        throw Object.assign(
          new Error("Official heat results or target-show membership changed while this review was open. Nothing was applied. Review the new candidate set before syncing."),
          { status: 409 },
        );
      }

      const rows = review.candidates.map((candidate) => candidate.row);
      const { error: insertError } = await (supabase.from("participants") as any).insert(rows);
      if (insertError) throw insertError;

      await qc.invalidateQueries({ queryKey: ["participants"] });
      setPendingReview(null);

      const routeLabel = review.outcome === "nq" ? "heat NQ" : "heat qualifier";
      const extras = [
        review.alreadyPresent ? `${review.alreadyPresent} already there` : null,
        review.unusable ? `${review.unusable} skipped without an identity` : null,
      ].filter(Boolean);
      toast.success(`Synced ${rows.length} reviewed ${routeLabel}${rows.length === 1 ? "" : "s"} to ${review.target.name}${extras.length ? ` · ${extras.join(" · ")}` : ""}`);
    } catch (caught) {
      setPendingReview(null);
      await qc.invalidateQueries({ queryKey: ["participants"] });
      toast.error(reportSupabaseError(caught, "Heat progression was not confirmed. Refresh canonical state before retrying."));
    } finally {
      setBusy(null);
    }
  }

  const secondChanceTarget = secondChanceShows.find((show) => show.id === secondChanceId);
  const semiTarget = semiShows.find((show) => show.id === semiId);
  const semiSourceShows = semiShows.length <= 1
    ? heatShows
    : heatShows.filter((show) => semiHeatIds.includes(show.id));

  function toggleSemiHeat(showId: string) {
    setSemiHeatIds((current) => current.includes(showId) ? current.filter((id) => id !== showId) : [...current, showId]);
  }

  return (
    <>
      <AdminCard strong>
        <AdminCardHeader
          eyebrow="Progression"
          title="Sync heat outcomes"
          description="Preview the official heat ranks and qualifier rules, then review the exact missing entries before adding them to the next stage. Syncing never removes entries you added manually."
          action={<AdminStatus tone={missingCutoffShows.length ? "attention" : "ready"}>{missingCutoffShows.length ? `${missingCutoffShows.length} heat${missingCutoffShows.length === 1 ? "" : "s"} need rules` : `${heatShows.length} heat${heatShows.length === 1 ? "" : "s"} ready`}</AdminStatus>}
        />

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
            <p className="text-sm font-bold text-foreground">Heat NQs → Second Chance</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Previews every ranked heat entry below its heat's qualifier cutoff before anything is added.</p>

            {secondChanceShows.length > 1 ? (
              <select value={secondChanceId} onChange={(event) => setSecondChanceId(event.target.value)} className="mt-3 min-h-10 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30">
                {secondChanceShows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}
              </select>
            ) : null}

            {!secondChanceTarget ? <p className="mt-3 text-xs text-amber-100">Create a Second Chance show first.</p> : null}
            <button
              type="button"
              disabled={!!busy || !secondChanceTarget || !!missingCutoffShows.length}
              onClick={() => void requestHeatOutcomeSync("nq", secondChanceTarget, heatShows, "second-chance")}
              className="admin-action-primary mt-3 w-full"
            >
              <RefreshCw className={`size-4 ${busy === "second-chance" ? "animate-spin" : ""}`} />
              {busy === "second-chance" ? "Preparing review…" : "Review heat NQs"}
              <ArrowRight className="size-4" />
            </button>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
            <p className="text-sm font-bold text-foreground">Heat qualifiers → Semi-final</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Previews every ranked entry inside the selected heat qualifier cutoff before anything is added.</p>

            {semiShows.length > 1 ? (
              <>
                <select value={semiId} onChange={(event) => setSemiId(event.target.value)} className="mt-3 min-h-10 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30">
                  {semiShows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}
                </select>
                <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/10 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Heats feeding this semi-final</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {heatShows.map((show) => (
                      <label key={show.id} className="flex min-w-0 items-center gap-2 text-xs text-foreground">
                        <input type="checkbox" checked={semiHeatIds.includes(show.id)} onChange={() => toggleSemiHeat(show.id)} className="size-4 accent-current" />
                        <span className="truncate">{show.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {!semiTarget ? <p className="mt-3 text-xs text-amber-100">Create a Semi-final show first.</p> : null}
            {semiShows.length > 1 && !semiSourceShows.length ? <p className="mt-3 text-xs text-amber-100">Choose which heat or heats feed the selected semi-final.</p> : null}
            <button
              type="button"
              disabled={!!busy || !semiTarget || !semiSourceShows.length || semiSourceShows.some((show) => heatQualifierCutoff(show) <= 0)}
              onClick={() => void requestHeatOutcomeSync("qualifier", semiTarget, semiSourceShows, "semi")}
              className="admin-action-primary mt-3 w-full"
            >
              <RefreshCw className={`size-4 ${busy === "semi" ? "animate-spin" : ""}`} />
              {busy === "semi" ? "Preparing review…" : "Review heat qualifiers"}
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </AdminCard>

      <AdminConfirmSheet
        open={!!pendingReview}
        onClose={() => !busy && setPendingReview(null)}
        onConfirm={applyProgressionReview}
        title={pendingReview ? `Review progression into ${pendingReview.target.name}` : "Review heat progression"}
        description={pendingReview ? (
          <div className="space-y-3 text-left">
            <p>
              This will add <strong>{pendingReview.candidates.length}</strong> missing {pendingReview.outcome === "nq" ? "heat NQ" : "heat qualifier"}{pendingReview.candidates.length === 1 ? "" : "s"} to <strong>{pendingReview.target.name}</strong> in the selected edition.
            </p>
            <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Reviewed source rules</p>
              {pendingReview.sources.map((source) => (
                <p key={source.id} className="mt-1">{source.name}: top {source.qualifierCutoff} qualify</p>
              ))}
            </div>
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-white/[0.08] bg-black/10 p-3">
              {pendingReview.candidates.map((candidate) => (
                <div key={candidate.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate font-medium text-foreground">{candidate.label}</span>
                  <span className="shrink-0 text-muted-foreground">{candidate.sourceShowName} · #{candidate.finalRank}</span>
                </div>
              ))}
            </div>
            {pendingReview.alreadyPresent || pendingReview.unusable ? (
              <p className="text-xs text-muted-foreground">
                {pendingReview.alreadyPresent ? `${pendingReview.alreadyPresent} already present. ` : ""}
                {pendingReview.unusable ? `${pendingReview.unusable} skipped because no stable identity is available.` : ""}
              </p>
            ) : null}
            <p>Immediately before apply, Solaris re-reads the source shows, qualifier rules, official ranks and target membership. Any change invalidates this review instead of silently applying a different candidate set.</p>
            <p className="text-amber-100/90"><strong>Compatibility boundary:</strong> this still uses the existing participant insert rather than a canonical versioned progression command/receipt. A concurrent change after final revalidation can still make the insert fail, so refresh canonical state before retrying an uncertain outcome.</p>
          </div>
        ) : undefined}
        confirmLabel="Add reviewed entries"
        confirmationText={pendingReview?.target.name}
        confirmationHint={pendingReview ? `Type ${pendingReview.target.name} to confirm` : undefined}
        busy={!!busy}
      />
    </>
  );
}
