import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Layers3,
  LockKeyhole,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import {
  createMergedCombinedAggregation,
  deleteMergedCombinedAggregation,
  deleteMergedCombinedSource,
  getMergedCombinedAggregation,
  listMergedCombinedAggregations,
  recalculateMergedCombined,
  saveMergedCombinedSourceValues,
  setMergedCombinedParticipants,
  setMergedCombinedStatus,
  updateMergedCombinedAggregation,
  upsertMergedCombinedSource,
} from "@/integrations/televoting/combined.functions";
import type { SourceInputMode } from "@/integrations/televoting/combined-math";
import { getMergedRoundEntries } from "@/integrations/televoting/entries.functions";
import { getMergedTelevotingRounds } from "@/integrations/televoting/rounds.functions";

export const Route = createFileRoute("/televoting/admin/combined")({
  head: () => ({
    meta: [
      { title: "Combined Results — Solaris Operations" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CombinedResultsPage,
});

type SourceDraft = {
  id?: string | null;
  sourceType: string;
  inputMode: SourceInputMode;
  roundId: string;
  name: string;
  weight: string;
  enabled: boolean;
  correctionScope: "source" | "final";
  correctionTargetSourceId: string;
};

const SOURCE_TYPES = [
  ["round", "Website round"],
  ["instagram", "Instagram Stories"],
  ["external_televote", "External televote"],
  ["imported", "Imported result"],
  ["activity", "Activity points"],
  ["correction", "Correction"],
  ["other", "Other"],
] as const;

const INPUT_MODES: Array<[SourceInputMode, string]> = [
  ["raw_results", "Raw results"],
  ["converted_points", "Converted points"],
  ["activity_points", "Activity points"],
  ["correction", "Manual correction"],
];

function emptySource(): SourceDraft {
  return {
    id: null,
    sourceType: "round",
    inputMode: "raw_results",
    roundId: "",
    name: "Website voting",
    weight: "100",
    enabled: true,
    correctionScope: "final",
    correctionTargetSourceId: "",
  };
}

function CombinedResultsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const listFn = useServerFn(listMergedCombinedAggregations);
  const detailFn = useServerFn(getMergedCombinedAggregation);
  const createFn = useServerFn(createMergedCombinedAggregation);
  const updateFn = useServerFn(updateMergedCombinedAggregation);
  const participantFn = useServerFn(setMergedCombinedParticipants);
  const upsertSourceFn = useServerFn(upsertMergedCombinedSource);
  const deleteSourceFn = useServerFn(deleteMergedCombinedSource);
  const valuesFn = useServerFn(saveMergedCombinedSourceValues);
  const recalcFn = useServerFn(recalculateMergedCombined);
  const statusFn = useServerFn(setMergedCombinedStatus);
  const deleteFn = useServerFn(deleteMergedCombinedAggregation);
  const roundsFn = useServerFn(getMergedTelevotingRounds);
  const entriesFn = useServerFn(getMergedRoundEntries);

  const [selectedId, setSelectedId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("Grand Final combined televote");
  const [createPool, setCreatePool] = useState("1000");
  const [createExponent, setCreateExponent] = useState("1.33");

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ["merged-televoting-admin"],
    queryFn: () => getAdmin(),
  });

  useEffect(() => {
    if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" });
  }, [admin, adminLoading, navigate]);

  const { data: aggregations = [], isLoading: listLoading } = useQuery({
    queryKey: ["merged-combined-aggregations"],
    queryFn: () => listFn(),
    enabled: Boolean(admin),
  });

  useEffect(() => {
    if (!selectedId && aggregations.length) setSelectedId(aggregations[0]!.id);
  }, [aggregations, selectedId]);

  const { data: editionRounds = [] } = useQuery({
    queryKey: ["merged-televoting-rounds"],
    queryFn: () => roundsFn(),
    enabled: Boolean(admin),
  });

  const allRounds = useMemo(
    () => editionRounds.flatMap((edition) => edition.rounds.map((round) => ({ ...round, editionName: edition.name }))),
    [editionRounds],
  );

  const { data: detail, isLoading: detailLoading, error: detailError } = useQuery({
    queryKey: ["merged-combined-detail", selectedId],
    queryFn: () => detailFn({ data: { id: selectedId } }),
    enabled: Boolean(admin && selectedId),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["merged-combined-aggregations"] }),
      queryClient.invalidateQueries({ queryKey: ["merged-combined-detail", selectedId] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-audit"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          name: createName,
          totalPoints: Number(createPool),
          rankExponent: Number(createExponent),
        },
      }),
    onSuccess: async (result) => {
      setSelectedId(result.id);
      setCreateOpen(false);
      toast.success("Combined result created");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (adminLoading || listLoading) {
    return <section className="glass p-8 text-center text-sm text-muted-foreground">Loading Combined Results…</section>;
  }
  if (!admin) return null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 py-2">
      <header className="glass-strong p-5 sm:p-7">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-100/65">Televoting · Component pool</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-4xl uppercase leading-none sm:text-5xl">Combined Results</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Combine website rounds, Instagram, external televotes, activity points and corrections into one exact point pool. Every source is calculated independently before the finished component allocations are added together.
            </p>
          </div>
          <Button onClick={() => setCreateOpen((value) => !value)}>
            <Plus className="mr-2 h-4 w-4" /> New combined result
          </Button>
        </div>
      </header>

      {createOpen ? (
        <section className="glass p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
            <Field label="Name"><Input value={createName} onChange={(e) => setCreateName(e.target.value)} /></Field>
            <Field label="Total point pool"><Input type="number" min={1} value={createPool} onChange={(e) => setCreatePool(e.target.value)} /></Field>
            <Field label="Rank exponent"><Input type="number" step="0.01" min="0.01" value={createExponent} onChange={(e) => setCreateExponent(e.target.value)} /></Field>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Create</Button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="glass h-fit p-3 xl:sticky xl:top-24">
          <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Saved combined results</p>
          <div className="space-y-1">
            {aggregations.map((aggregation) => (
              <button
                key={aggregation.id}
                type="button"
                onClick={() => setSelectedId(aggregation.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selectedId === aggregation.id
                    ? "border-sky-200/15 bg-sky-200/[0.08]"
                    : "border-transparent hover:border-white/10 hover:bg-white/[0.035]"
                }`}
              >
                <p className="truncate text-sm font-semibold">{aggregation.name}</p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{aggregation.status}</span>
                  <span>v{aggregation.calculation_version}</span>
                  {aggregation.results_outdated ? <span className="text-amber-100">outdated</span> : null}
                </div>
              </button>
            ))}
            {!aggregations.length ? <p className="px-2 py-6 text-center text-xs text-muted-foreground">No combined results yet.</p> : null}
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          {detailLoading ? <section className="glass p-8 text-center text-sm text-muted-foreground">Loading workspace…</section> : null}
          {detailError ? <section className="glass border-red-300/20 p-5 text-sm text-red-100">{(detailError as Error).message}</section> : null}
          {detail ? (
            <CombinedWorkspace
              detail={detail}
              allRounds={allRounds}
              onRefresh={refresh}
              updateFn={updateFn}
              participantFn={participantFn}
              entriesFn={entriesFn}
              upsertSourceFn={upsertSourceFn}
              deleteSourceFn={deleteSourceFn}
              valuesFn={valuesFn}
              recalcFn={recalcFn}
              statusFn={statusFn}
              deleteFn={deleteFn}
              onDeleted={() => setSelectedId("")}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function CombinedWorkspace({
  detail,
  allRounds,
  onRefresh,
  updateFn,
  participantFn,
  entriesFn,
  upsertSourceFn,
  deleteSourceFn,
  valuesFn,
  recalcFn,
  statusFn,
  deleteFn,
  onDeleted,
}: any) {
  const aggregation = detail.aggregation;
  const [name, setName] = useState(aggregation.name);
  const [pool, setPool] = useState(String(aggregation.total_points_to_distribute));
  const [exponent, setExponent] = useState(String(aggregation.rank_exponent));
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>(emptySource());

  useEffect(() => {
    setName(aggregation.name);
    setPool(String(aggregation.total_points_to_distribute));
    setExponent(String(aggregation.rank_exponent));
  }, [aggregation.id, aggregation.name, aggregation.total_points_to_distribute, aggregation.rank_exponent]);

  const catalogMap = useMemo(() => new Map(detail.catalog.map((entry: any) => [entry.key, entry])), [detail.catalog]);
  const resolvedById = useMemo(() => new Map(detail.resolved.map((source: any) => [source.id, source])), [detail.resolved]);

  async function saveSettings() {
    try {
      await updateFn({ data: { id: aggregation.id, name, totalPoints: Number(pool), rankExponent: Number(exponent) } });
      toast.success("Combined settings saved");
      await onRefresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function syncParticipants() {
    try {
      const roundIds = [...new Set(detail.sources.map((source: any) => source.source_round_id).filter(Boolean))] as string[];
      if (!roundIds.length) throw new Error("Add at least one linked website round first");
      const entries = await Promise.all(roundIds.map((roundId) => entriesFn({ data: { roundId } })));
      const keys: string[] = [];
      for (const list of entries) {
        for (const entry of list) if (!keys.includes(entry.entry_key)) keys.push(entry.entry_key);
      }
      if (!keys.length) throw new Error("The linked rounds do not contain any entries");
      await participantFn({ data: { id: aggregation.id, participants: keys } });
      toast.success(`${keys.length} eligible entries synced from linked rounds`);
      await onRefresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function addSource() {
    try {
      await upsertSourceFn({
        data: {
          id: sourceDraft.id,
          aggregationId: aggregation.id,
          sourceType: sourceDraft.sourceType,
          inputMode: sourceDraft.inputMode,
          roundId: sourceDraft.roundId || null,
          name: sourceDraft.name,
          weight: Number(sourceDraft.weight),
          enabled: sourceDraft.enabled,
          displayOrder: detail.sources.length,
          correctionScope: sourceDraft.correctionScope,
          correctionTargetSourceId: sourceDraft.correctionTargetSourceId || null,
        },
      });
      setSourceDraft(emptySource());
      toast.success("Source added");
      await onRefresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function recalc() {
    try {
      const result = await recalcFn({ data: { id: aggregation.id } });
      toast.success(`Combined calculation v${result.version} stored`);
      await onRefresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function changeStatus(status: "draft" | "calculated" | "locked" | "published") {
    if (status === "published" && !window.confirm("Publish this combined result?")) return;
    try {
      await statusFn({ data: { id: aggregation.id, status } });
      toast.success(`Combined result ${status}`);
      await onRefresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <>
      <section className="glass p-4 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end">
          <Field label="Combined result name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Overall point pool"><Input type="number" value={pool} onChange={(e) => setPool(e.target.value)} /></Field>
          <Field label="Rank exponent"><Input type="number" step="0.01" value={exponent} onChange={(e) => setExponent(e.target.value)} /></Field>
          <Button onClick={saveSettings}><Save className="mr-2 h-4 w-4" /> Save</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span className="rounded-full border border-white/10 px-2 py-1">Status {aggregation.status}</span>
          <span className="rounded-full border border-white/10 px-2 py-1">Calculation v{aggregation.calculation_version}</span>
          {aggregation.results_outdated ? <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-amber-100">Recalculation required</span> : null}
        </div>
      </section>

      <section className="glass p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-3xl uppercase">Eligible entries</h2>
            <p className="mt-2 text-xs text-muted-foreground">Identity is the stable round entry key, so country and custom entries can coexist safely.</p>
          </div>
          <Button variant="outline" onClick={syncParticipants}><RefreshCw className="mr-2 h-4 w-4" /> Sync from linked rounds</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {detail.participants.map((key: string) => {
            const entry: any = catalogMap.get(key);
            return <span key={key} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs">{entry?.name ?? key}</span>;
          })}
          {!detail.participants.length ? <p className="text-sm text-muted-foreground">No eligible entries selected yet.</p> : null}
        </div>
      </section>

      <section className="glass p-4 sm:p-6">
        <div className="mb-5">
          <h2 className="font-display text-3xl uppercase">Components</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Enabled non-correction source weights must total exactly 100%. Website rounds can use raw totals or already-converted points without double conversion.</p>
        </div>

        <div className="space-y-3">
          {detail.sources.map((source: any) => (
            <SourceCard
              key={source.id}
              source={source}
              resolved={resolvedById.get(source.id)}
              participants={detail.participants}
              catalogMap={catalogMap}
              allRounds={allRounds}
              allSources={detail.sources}
              aggregationId={aggregation.id}
              upsertSourceFn={upsertSourceFn}
              deleteSourceFn={deleteSourceFn}
              valuesFn={valuesFn}
              onRefresh={onRefresh}
            />
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Add component</p>
          <SourceEditor draft={sourceDraft} setDraft={setSourceDraft} allRounds={allRounds} allSources={detail.sources} />
          <div className="mt-3 flex justify-end">
            <Button onClick={addSource}><Plus className="mr-2 h-4 w-4" /> Add source</Button>
          </div>
        </div>
      </section>

      <section className="glass p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-display text-3xl uppercase">Calculation preview</h2>
            <p className="mt-2 text-xs text-muted-foreground">Preview uses the same component-pool-v2 engine as the persisted calculation.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={recalc}><RefreshCw className="mr-2 h-4 w-4" /> Recalculate</Button>
            <Button variant="outline" onClick={() => changeStatus("locked")} disabled={aggregation.results_outdated || !aggregation.calculation_version}><LockKeyhole className="mr-2 h-4 w-4" /> Lock</Button>
            <Button variant="outline" onClick={() => changeStatus("published")} disabled={aggregation.results_outdated || !aggregation.calculation_version}><Send className="mr-2 h-4 w-4" /> Publish</Button>
          </div>
        </div>

        {detail.preview.errors.length ? (
          <div className="mb-4 rounded-2xl border border-red-300/20 bg-red-300/[0.06] p-4 text-xs text-red-100">
            {detail.preview.errors.map((error: string) => <p key={error}>• {error}</p>)}
          </div>
        ) : null}
        {detail.preview.warnings.length ? (
          <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-4 text-xs text-amber-100">
            {detail.preview.warnings.map((warning: string) => <p key={warning}>• {warning}</p>)}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-4">
          <Stat label="Source weights" value={`${Math.round(detail.preview.totalPercentage * 100) / 100}%`} />
          <Stat label="Pool" value={detail.preview.totalPoints} />
          <Stat label="Allocated" value={detail.preview.allocatedTotal} />
          <Stat label="Final total" value={detail.preview.finalTotal} />
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr><th className="px-4 py-3">Rank</th><th className="px-4 py-3">Entry</th><th className="px-4 py-3 text-right">Voting</th><th className="px-4 py-3 text-right">Activity</th><th className="px-4 py-3 text-right">Correction</th><th className="px-4 py-3 text-right">Final</th></tr>
            </thead>
            <tbody>
              {detail.preview.rows.map((row: any) => (
                <tr key={row.code} className="border-t border-white/10">
                  <td className="px-4 py-3 font-semibold">{row.finalRank}</td>
                  <td className="px-4 py-3">{(catalogMap.get(row.code) as any)?.name ?? row.code}</td>
                  <td className="px-4 py-3 text-right">{row.totalVotingPoints}</td>
                  <td className="px-4 py-3 text-right">{row.totalActivityPoints}</td>
                  <td className="px-4 py-3 text-right">{row.finalCorrection}</td>
                  <td className="px-4 py-3 text-right text-base font-semibold">{row.finalCombinedPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass flex flex-col gap-3 border-red-300/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-sm font-semibold">Delete combined result</p>
          <p className="mt-1 text-xs text-muted-foreground">Published combined results are protected from deletion.</p>
        </div>
        <Button
          variant="destructive"
          disabled={aggregation.status === "published"}
          onClick={async () => {
            if (!window.confirm(`Delete “${aggregation.name}” and its component data?`)) return;
            try {
              await deleteFn({ data: { id: aggregation.id } });
              toast.success("Combined result deleted");
              onDeleted();
              await onRefresh();
            } catch (error) {
              toast.error((error as Error).message);
            }
          }}
        ><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
      </section>
    </>
  );
}

function SourceCard({ source, resolved, participants, catalogMap, allRounds, allSources, aggregationId, upsertSourceFn, deleteSourceFn, valuesFn, onRefresh }: any) {
  const [draft, setDraft] = useState<SourceDraft>({
    id: source.id,
    sourceType: source.source_type,
    inputMode: source.input_mode ?? "raw_results",
    roundId: source.source_round_id ?? "",
    name: source.source_name,
    weight: String(source.percentage_weight ?? 0),
    enabled: Boolean(source.enabled),
    correctionScope: source.correction_scope ?? "final",
    correctionTargetSourceId: source.correction_target_source_id ?? "",
  });
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(participants.map((key: string) => [key, String(resolved?.values?.[key] ?? 0)])),
  );

  useEffect(() => {
    setValues(Object.fromEntries(participants.map((key: string) => [key, String(resolved?.values?.[key] ?? 0)])));
  }, [participants.join("|"), resolved]);

  async function saveSource() {
    try {
      await upsertSourceFn({ data: {
        id: source.id,
        aggregationId,
        sourceType: draft.sourceType,
        inputMode: draft.inputMode,
        roundId: draft.roundId || null,
        name: draft.name,
        weight: Number(draft.weight),
        enabled: draft.enabled,
        displayOrder: source.display_order,
        correctionScope: draft.correctionScope,
        correctionTargetSourceId: draft.correctionTargetSourceId || null,
      }});
      toast.success("Source saved");
      await onRefresh();
    } catch (error) { toast.error((error as Error).message); }
  }

  async function saveValues() {
    try {
      await valuesFn({ data: {
        aggregationId,
        sourceId: source.id,
        values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value) || 0])),
      }});
      toast.success("Source values saved");
      await onRefresh();
    } catch (error) { toast.error((error as Error).message); }
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <SourceEditor draft={draft} setDraft={setDraft} allRounds={allRounds} allSources={allSources} />
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={saveSource}><Save className="mr-1.5 h-3.5 w-3.5" /> Save source</Button>
        <Button variant="destructive" size="sm" onClick={async () => {
          if (!window.confirm(`Delete source “${source.source_name}”?`)) return;
          try { await deleteSourceFn({ data: { aggregationId, sourceId: source.id } }); toast.success("Source deleted"); await onRefresh(); }
          catch (error) { toast.error((error as Error).message); }
        }}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete</Button>
      </div>

      {!source.source_round_id && participants.length ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold">Manual source values</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Values use stable entry keys and can be raw, activity, converted or correction inputs.</p>
            </div>
            <Button size="sm" onClick={saveValues}>Save values</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {participants.map((key: string) => (
              <label key={key} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 p-2.5">
                <span className="min-w-0 flex-1 truncate text-xs">{catalogMap.get(key)?.name ?? key}</span>
                <Input className="h-8 w-24 text-right" type="number" value={values[key] ?? "0"} onChange={(e) => setValues((current) => ({ ...current, [key]: e.target.value }))} />
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function SourceEditor({ draft, setDraft, allRounds, allSources }: { draft: SourceDraft; setDraft: (next: SourceDraft) => void; allRounds: any[]; allSources: any[] }) {
  const correction = draft.inputMode === "correction" || draft.sourceType === "correction";
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
      <Field label="Source type"><select value={draft.sourceType} onChange={(e) => setDraft({ ...draft, sourceType: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{SOURCE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Input mode"><select value={draft.inputMode} onChange={(e) => setDraft({ ...draft, inputMode: e.target.value as SourceInputMode })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{INPUT_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Linked round"><select value={draft.roundId} onChange={(e) => setDraft({ ...draft, roundId: e.target.value })} disabled={correction} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Manual values</option>{allRounds.map((round) => <option key={round.id} value={round.id}>{round.editionName} · {round.name}</option>)}</select></Field>
      <Field label={correction ? "Correction scope" : "Weight %"}>
        {correction ? (
          <select value={draft.correctionScope} onChange={(e) => setDraft({ ...draft, correctionScope: e.target.value as "source" | "final" })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="final">Final result</option><option value="source">Specific source</option></select>
        ) : <Input type="number" min="0" max="100" step="0.1" value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: e.target.value })} />}
      </Field>
      <div className="flex items-end gap-3 pb-1">
        <Switch checked={draft.enabled} onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked })} />
        <span className="pb-1 text-xs text-muted-foreground">Enabled</span>
      </div>
      {correction && draft.correctionScope === "source" ? (
        <Field label="Correction target"><select value={draft.correctionTargetSourceId} onChange={(e) => setDraft({ ...draft, correctionTargetSourceId: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select source</option>{allSources.filter((source) => source.id !== draft.id && (source.input_mode ?? "raw_results") !== "correction").map((source) => <option key={source.id} value={source.id}>{source.source_name}</option>)}</select></Field>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>{children}</label>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>;
}
