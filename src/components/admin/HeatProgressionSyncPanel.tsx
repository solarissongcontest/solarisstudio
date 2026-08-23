import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminCard, AdminCardHeader, AdminStatus } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { useEdition, useParticipants, useShows, type Participant, type Show } from "@/lib/data";
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

type SyncBusy = "second-chance" | "semi" | null;

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

export function HeatProgressionSyncPanel({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const { data: edition } = useEdition(slug);
  const { data: shows = [] } = useShows(edition?.id);
  const { data: participants = [] } = useParticipants(edition?.id);

  const orderedShows = useMemo(() => [...shows].sort((a, b) => a.sort_order - b.sort_order), [shows]);
  const heatShows = useMemo(() => orderedShows.filter((show) => isHeatShow(show)), [orderedShows]);
  const secondChanceShows = useMemo(() => orderedShows.filter((show) => isSecondChanceShow(show)), [orderedShows]);
  const semiShows = useMemo(() => orderedShows.filter((show) => isSemiShow(show)), [orderedShows]);

  const [secondChanceId, setSecondChanceId] = useState("");
  const [semiId, setSemiId] = useState("");
  const [semiHeatIds, setSemiHeatIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<SyncBusy>(null);

  useEffect(() => {
    if (!secondChanceShows.some((show) => show.id === secondChanceId)) {
      setSecondChanceId(secondChanceShows[0]?.id ?? "");
    }
  }, [secondChanceId, secondChanceShows]);

  useEffect(() => {
    if (!semiShows.some((show) => show.id === semiId)) {
      setSemiId(semiShows[0]?.id ?? "");
    }
  }, [semiId, semiShows]);

  useEffect(() => {
    const valid = new Set(heatShows.map((show) => show.id));
    setSemiHeatIds((current) => current.filter((id) => valid.has(id)));
  }, [heatShows]);

  if (!edition || !heatShows.length) return null;

  const lifecycleParticipants = participants as ProgressionParticipant[];
  const missingCutoffShows = heatShows.filter((show) => heatQualifierCutoff(show) <= 0);

  async function syncHeatOutcome(
    outcome: HeatProgressionOutcome,
    targetShow: Show | undefined,
    sourceShows: Show[],
    busyKey: Exclude<SyncBusy, null>,
  ) {
    if (!edition || !targetShow) return;
    if (!sourceShows.length) {
      toast.message("Choose at least one heat to sync");
      return;
    }

    const missingCutoffs = sourceShows.filter((show) => heatQualifierCutoff(show) <= 0);
    if (missingCutoffs.length) {
      toast.error(`Set the qualifier count first for ${missingCutoffs.map((show) => show.name).join(", ")}`);
      return;
    }

    setBusy(busyKey);
    try {
      const sourceIds = sourceShows.map((show) => show.id);
      const showById = new Map(sourceShows.map((show) => [show.id, show]));
      const { data, error } = await (supabase.from("results") as any)
        .select("show_id,country_id,contest_entity_id,final_rank")
        .eq("edition_id", edition.id)
        .in("show_id", sourceIds)
        .not("final_rank", "is", null);
      if (error) throw error;

      const desired = new Map<string, RawProgressionResult>();
      for (const raw of (data ?? []) as RawProgressionResult[]) {
        const sourceShow = showById.get(raw.show_id);
        if (!sourceShow || heatProgressionOutcome(sourceShow, Number(raw.final_rank)) !== outcome) continue;
        const key = resultIdentityKey(raw);
        if (key && !desired.has(key)) desired.set(key, raw);
      }

      if (!desired.size) {
        toast.message(outcome === "nq" ? "No ranked heat NQs are available to sync" : "No ranked heat qualifiers are available to sync");
        return;
      }

      const targetKeys = new Set<string>();
      const sourceByShowAndIdentity = new Map<string, ProgressionParticipant>();
      const sourceByIdentity = new Map<string, ProgressionParticipant>();

      for (const participant of lifecycleParticipants) {
        const key = participantIdentityKey(participant);
        if (!key) continue;
        if (participant.show_id === targetShow.id) targetKeys.add(key);
        sourceByIdentity.set(key, participant);
        if (participant.show_id) sourceByShowAndIdentity.set(`${participant.show_id}:${key}`, participant);
      }

      let alreadyPresent = 0;
      let unusable = 0;
      const rows: Record<string, unknown>[] = [];

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

        rows.push({
          edition_id: edition.id,
          show_id: targetShow.id,
          country_id: countryId,
          contest_entity_id: contestEntityId,
          running_order: null,
          running_order_allocation: null,
          semi_final: targetShow.kind,
          artist: source?.artist ?? null,
          song: source?.song ?? null,
        });
      }

      if (rows.length) {
        const { error: insertError } = await (supabase.from("participants") as any).insert(rows);
        if (insertError) throw insertError;
      }

      await qc.invalidateQueries({ queryKey: ["participants"] });

      const routeLabel = outcome === "nq" ? "heat NQ" : "heat qualifier";
      if (!rows.length && alreadyPresent) {
        toast.message(`All ${desired.size} ${routeLabel}${desired.size === 1 ? " is" : "s are"} already in ${targetShow.name}`);
      } else {
        const extras = [
          alreadyPresent ? `${alreadyPresent} already there` : null,
          unusable ? `${unusable} skipped without an identity` : null,
        ].filter(Boolean);
        toast.success(`Synced ${rows.length} ${routeLabel}${rows.length === 1 ? "" : "s"} to ${targetShow.name}${extras.length ? ` · ${extras.join(" · ")}` : ""}`);
      }
    } catch (caught) {
      toast.error(reportSupabaseError(caught, "Heat progression could not be synced."));
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
    <AdminCard strong>
      <AdminCardHeader
        eyebrow="Progression"
        title="Sync heat outcomes"
        description="Use the official heat ranks and each heat's qualifier count to add missing entries to the next stage. Syncing is repeat-safe and never removes entries you added manually."
        action={<AdminStatus tone={missingCutoffShows.length ? "attention" : "ready"}>{missingCutoffShows.length ? `${missingCutoffShows.length} heat${missingCutoffShows.length === 1 ? "" : "s"} need rules` : `${heatShows.length} heat${heatShows.length === 1 ? "" : "s"} ready`}</AdminStatus>}
      />

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
          <p className="text-sm font-bold text-foreground">Heat NQs → Second Chance</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Adds every ranked heat entry below its heat's qualifier cutoff.</p>

          {secondChanceShows.length > 1 ? (
            <select value={secondChanceId} onChange={(event) => setSecondChanceId(event.target.value)} className="mt-3 min-h-10 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30">
              {secondChanceShows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}
            </select>
          ) : null}

          {!secondChanceTarget ? <p className="mt-3 text-xs text-amber-100">Create a Second Chance show first.</p> : null}
          <button
            type="button"
            disabled={!!busy || !secondChanceTarget || !!missingCutoffShows.length}
            onClick={() => void syncHeatOutcome("nq", secondChanceTarget, heatShows, "second-chance")}
            className="admin-action-primary mt-3 w-full"
          >
            <RefreshCw className={`size-4 ${busy === "second-chance" ? "animate-spin" : ""}`} />
            {busy === "second-chance" ? "Syncing…" : "Sync heat NQs"}
            <ArrowRight className="size-4" />
          </button>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
          <p className="text-sm font-bold text-foreground">Heat qualifiers → Semi-final</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Adds every ranked entry inside the selected heat qualifier cutoff.</p>

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
            onClick={() => void syncHeatOutcome("qualifier", semiTarget, semiSourceShows, "semi")}
            className="admin-action-primary mt-3 w-full"
          >
            <RefreshCw className={`size-4 ${busy === "semi" ? "animate-spin" : ""}`} />
            {busy === "semi" ? "Syncing…" : "Sync heat qualifiers"}
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </AdminCard>
  );
}
