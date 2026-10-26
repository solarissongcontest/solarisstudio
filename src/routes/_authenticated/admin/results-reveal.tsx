import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Trophy } from 'lucide-react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminDataView, type AdminDataColumn } from '@/components/admin/AdminDataView';
import { MetricStrip, ObjectPage } from '@/components/admin/AdminWorkspacePrimitives';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { useContestEntities, useCountries, useResults, useShows } from '@/lib/data';
import { displayFromEntity } from '@/lib/entities';
import {
  advanceReveal,
  availableRevealTransitions,
  configureRevealPlan,
  isRevealArmable,
  loadRevealDirectorSnapshot,
  revealStateLabel,
  transitionReveal,
  type RevealDirectorRow,
  type RevealLifecycleState,
} from '@/lib/results-reveal-lifecycle';
import { buildResultsRevealModel, type RevealStrategy } from '@/lib/results-reveal-model';
import { isStudio2FeatureEnabled } from '@/lib/studio2-feature-flags';

export const Route = createFileRoute('/_authenticated/admin/results-reveal')({
  head: () => ({
    meta: [
      { title: 'Results Reveal Director — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ResultsRevealPage,
});

const STRATEGY_LABELS: Record<RevealStrategy, string> = {
  jury_order: 'Jury order',
  final_rank_reverse: 'Reverse final rank',
  televote_ascending: 'Televote ascending',
};

function ResultsRevealHeader() {
  return (
    <AdminPageHeader
      eyebrow="Live · Reveal"
      title="Results Reveal Director"
      description="Plan, rehearse, arm and operate a reveal against one locked canonical result version. Armed freezes the sequence; editing requires an explicit disarm."
    />
  );
}

function sequencesEqual(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function toneForRevealState(state: RevealLifecycleState) {
  if (state === 'complete') return 'ready' as const;
  if (state === 'live') return 'attention' as const;
  if (state === 'armed') return 'info' as const;
  return 'neutral' as const;
}

function LifecycleControl({
  runtime,
  strategy,
  proposedSequence,
  busy,
  error,
  disarmReason,
  onDisarmReasonChange,
  onAction,
}: {
  runtime: RevealDirectorRow;
  strategy: RevealStrategy;
  proposedSequence: string[];
  busy: boolean;
  error: string | null;
  disarmReason: string;
  onDisarmReasonChange: (value: string) => void;
  onAction: (action: RevealAction) => void;
}) {
  const planDirty = runtime.strategy !== strategy || !sequencesEqual(runtime.sequence, proposedSequence);
  const armable = isRevealArmable(runtime) && !planDirty;
  const transitions = availableRevealTransitions(runtime.state);

  return (
    <AdminCard strong>
      <AdminCardHeader
        eyebrow="Governed lifecycle"
        title={`${revealStateLabel(runtime.state)} · v${runtime.version}`}
        description={
          runtime.state === 'armed'
            ? `Sequence locked to result version ${runtime.lockedResultVersion ?? '—'}. Disarm before changing the plan.`
            : runtime.state === 'live'
              ? `Live reveal progress ${runtime.currentStep}/${runtime.totalSteps}. Each advance is server-authoritative and receipted.`
              : runtime.state === 'complete'
                ? `Reveal complete at ${runtime.currentStep}/${runtime.totalSteps}. Publication remains a separate Results/Publication authority.`
                : `Plan is editable. Arming requires the current result version to already be locked and reveal-ready.`
        }
        action={<AdminStatus tone={toneForRevealState(runtime.state)}>{revealStateLabel(runtime.state)}</AdminStatus>}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Result authority</p>
          <p className="mt-1 text-sm font-semibold">
            v{runtime.calculationVersion || '—'} · reveal ready {runtime.revealReadyVersion ?? '—'}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Locked result</p>
          <p className="mt-1 text-sm font-semibold">{runtime.lockedResultVersion ?? 'Not armed'}</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Sequence</p>
          <p className="mt-1 text-sm font-semibold">{runtime.sequence.length} saved step(s)</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Execution</p>
          <p className="mt-1 text-sm font-semibold">{runtime.currentStep}/{runtime.totalSteps}</p>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {runtime.canManagePlan && runtime.state !== 'armed' && runtime.state !== 'live' && runtime.state !== 'complete' ? (
          <button
            type="button"
            disabled={busy || !planDirty || proposedSequence.length === 0}
            onClick={() => onAction({ kind: 'save-plan' })}
            className="min-h-11 rounded-xl border border-white/[0.10] bg-white/[0.06] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {planDirty ? 'Save reveal plan' : 'Plan saved'}
          </button>
        ) : null}

        {runtime.canControl && transitions.includes('planning') ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction({ kind: 'transition', to: 'planning' })}
            className="min-h-11 rounded-xl border border-white/[0.10] px-4 text-sm font-semibold disabled:opacity-40"
          >
            Return to planning
          </button>
        ) : null}

        {runtime.canControl && transitions.includes('rehearsal') && runtime.state !== 'armed' ? (
          <button
            type="button"
            disabled={busy || planDirty}
            onClick={() => onAction({ kind: 'transition', to: 'rehearsal' })}
            className="min-h-11 rounded-xl border border-white/[0.10] px-4 text-sm font-semibold disabled:opacity-40"
          >
            Enter rehearsal
          </button>
        ) : null}

        {runtime.canControl && transitions.includes('armed') ? (
          <button
            type="button"
            disabled={busy || !armable}
            onClick={() => onAction({ kind: 'transition', to: 'armed' })}
            className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:cursor-not-allowed disabled:opacity-40"
          >
            Arm locked sequence
          </button>
        ) : null}

        {runtime.state === 'armed' && runtime.canControl ? (
          <>
            <label className="min-w-[240px] flex-1">
              <span className="sr-only">Disarm reason</span>
              <input
                value={disarmReason}
                onChange={(event) => onDisarmReasonChange(event.target.value)}
                placeholder="Reason required to disarm"
                className="min-h-11 w-full rounded-xl border border-white/[0.10] bg-background px-3 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={busy || disarmReason.trim().length < 3}
              onClick={() => onAction({ kind: 'transition', to: 'rehearsal', reason: disarmReason })}
              className="min-h-11 rounded-xl border border-white/[0.10] px-4 text-sm font-semibold disabled:opacity-40"
            >
              Disarm to rehearsal
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction({ kind: 'transition', to: 'live' })}
              className="min-h-11 rounded-xl bg-destructive px-4 text-sm font-bold text-destructive-foreground disabled:opacity-40"
            >
              Start live reveal
            </button>
          </>
        ) : null}

        {runtime.state === 'live' && runtime.canControl ? (
          <>
            <button
              type="button"
              disabled={busy || runtime.currentStep >= runtime.totalSteps}
              onClick={() => onAction({ kind: 'advance' })}
              className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:opacity-40"
            >
              Advance next reveal
            </button>
            <button
              type="button"
              disabled={busy || runtime.currentStep !== runtime.totalSteps}
              onClick={() => onAction({ kind: 'transition', to: 'complete' })}
              className="min-h-11 rounded-xl border border-white/[0.10] px-4 text-sm font-semibold disabled:opacity-40"
            >
              Complete reveal
            </button>
          </>
        ) : null}
      </div>

      {planDirty && runtime.state !== 'armed' && runtime.state !== 'live' && runtime.state !== 'complete' ? (
        <p className="mt-3 text-xs text-muted-foreground">Save this exact sequence before arming. The server revalidates it against the canonical result identities.</p>
      ) : null}
      {!planDirty && runtime.state !== 'armed' && runtime.state !== 'live' && runtime.state !== 'complete' && !armable ? (
        <p className="mt-3 text-xs text-muted-foreground">Arming stays unavailable until Results marks the current locked calculation version reveal-ready.</p>
      ) : null}
    </AdminCard>
  );
}

type RevealAction =
  | { kind: 'save-plan' }
  | { kind: 'transition'; to: RevealLifecycleState; reason?: string }
  | { kind: 'advance' };

function ResultsRevealPage() {
  const { editionId } = useAdminContext();
  const queryClient = useQueryClient();
  const showsQuery = useShows(editionId ?? undefined);
  const countriesQuery = useCountries();
  const entitiesQuery = useContestEntities(editionId ?? undefined);
  const shows = showsQuery.data ?? [];
  const [showId, setShowId] = useState('');
  const [strategy, setStrategy] = useState<RevealStrategy>('jury_order');
  const [disarmReason, setDisarmReason] = useState('');

  const featureQuery = useQuery({
    queryKey: ['studio2-feature', 'results_replay', editionId ?? 'unscoped'],
    enabled: Boolean(editionId),
    queryFn: () => isStudio2FeatureEnabled('results_replay', editionId!),
    staleTime: 30_000,
  });

  const lifecycleQuery = useQuery({
    queryKey: ['reveal-director', editionId ?? 'unscoped'],
    enabled: Boolean(editionId && featureQuery.data === true),
    queryFn: () => loadRevealDirectorSnapshot(editionId!),
  });

  useEffect(() => {
    if (!shows.length) {
      if (showId) setShowId('');
      return;
    }
    if (!showId || !shows.some((show) => show.id === showId)) setShowId(shows[0]!.id);
  }, [showId, shows]);

  const resultsQuery = useResults(showId || undefined);
  const rows = resultsQuery.data ?? [];
  const model = useMemo(() => buildResultsRevealModel(rows), [rows]);
  const runtime = (lifecycleQuery.data ?? []).find((item) => item.showId === showId) ?? null;

  useEffect(() => {
    if (runtime?.sequence.length) {
      setStrategy(runtime.strategy);
      return;
    }
    if (model.recommendedStrategy) setStrategy(model.recommendedStrategy);
  }, [model.recommendedStrategy, runtime?.showId, runtime?.strategy, runtime?.sequence.length, showId]);

  const countryMap = useMemo(
    () => new Map((countriesQuery.data ?? []).map((country) => [country.id, country])),
    [countriesQuery.data],
  );
  const displayMap = useMemo(() => {
    const map = new Map<string, { name: string; shortCode: string }>();
    for (const country of countriesQuery.data ?? []) {
      map.set(country.id, { name: country.name, shortCode: country.short_code });
    }
    for (const entity of entitiesQuery.data ?? []) {
      const display = displayFromEntity(entity, countryMap);
      map.set(display.id, { name: display.name, shortCode: display.short_code });
    }
    return map;
  }, [countriesQuery.data, entitiesQuery.data, countryMap]);

  const simulation = model.simulations[strategy];
  const revealOrder = model.strategies[strategy];
  const proposedSequence = revealOrder.map((award) => award.countryId);
  const selectedShow = shows.find((show) => show.id === showId) ?? null;

  const mutation = useMutation({
    mutationFn: async (action: RevealAction) => {
      if (!runtime) throw new Error('Reload Reveal Director before operating this show.');
      if (action.kind === 'save-plan') {
        return configureRevealPlan({
          showId: runtime.showId,
          strategy,
          sequence: proposedSequence,
          expectedVersion: runtime.version,
        });
      }
      if (action.kind === 'advance') {
        return advanceReveal({
          showId: runtime.showId,
          expectedVersion: runtime.version,
        });
      }
      return transitionReveal({
        showId: runtime.showId,
        to: action.to,
        reason: action.reason,
        expectedVersion: runtime.version,
      });
    },
    onSuccess: async (result) => {
      if (result.state !== 'armed') setDisarmReason('');
      await queryClient.invalidateQueries({ queryKey: ['reveal-director', editionId ?? 'unscoped'] });
    },
  });

  const mutationError = mutation.error
    ? mutation.error instanceof Error
      ? mutation.error.message
      : 'Reveal operation failed. Reload the authoritative state before retrying.'
    : null;

  const revealColumns = [
    {
      key: 'step',
      header: 'Step',
      render: (step) => <span className="tabular-nums">{step.step}</span>,
    },
    {
      key: 'country',
      header: 'Country',
      primary: true,
      render: (step) => nameOf(step.countryId, displayMap),
    },
    {
      key: 'televote',
      header: 'Televote',
      align: 'right' as const,
      render: (step) => <span className="tabular-nums">+{step.revealedPoints}</span>,
    },
    {
      key: 'leader',
      header: 'Leader after reveal',
      render: (step) => nameOf(step.leaderCountryId, displayMap),
    },
    {
      key: 'leader-total',
      header: 'Leader total',
      align: 'right' as const,
      render: (step) => <span className="tabular-nums">{step.leaderPoints}</span>,
    },
    {
      key: 'certainty',
      header: 'Certainty',
      render: (step) => step.winnerCertain
        ? <AdminStatus tone="attention">{nameOf(step.mathematicallyCertainCountryId, displayMap)} certain</AdminStatus>
        : <AdminStatus tone="info">Open</AdminStatus>,
    },
  ] satisfies readonly AdminDataColumn<(typeof simulation.steps)[number]>[];

  if (!editionId) {
    return (
      <AdminPage>
        <ResultsRevealHeader />
        <AdminCard>
          <AdminEmptyState
            icon={Trophy}
            title="Choose an edition"
            description="Select the edition in the Organizer toolbar before planning a reveal. Solaris will not infer another edition or load an unscoped Results Replay flag."
          />
        </AdminCard>
      </AdminPage>
    );
  }

  if (featureQuery.isLoading) {
    return (
      <AdminPage>
        <ResultsRevealHeader />
        <AdminCard>
          <p className="py-10 text-center text-sm text-muted-foreground">Loading Results Reveal Director…</p>
        </AdminCard>
      </AdminPage>
    );
  }

  if (featureQuery.data !== true) {
    return (
      <AdminPage>
        <ResultsRevealHeader />
        <AdminCard>
          <AdminEmptyState
            icon={Sparkles}
            title="Results Reveal Director is disabled"
            description="Enable the Results Replay rollout flag before using reveal operations."
          />
        </AdminCard>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <ObjectPage className="max-w-7xl">
        <ResultsRevealHeader />

        <AdminCard strong>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-semibold">Show</span>
              <select
                value={showId}
                onChange={(event) => setShowId(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3"
              >
                {shows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-semibold">Reveal strategy</span>
              <select
                value={strategy}
                disabled={runtime?.state === 'armed' || runtime?.state === 'live' || runtime?.state === 'complete'}
                onChange={(event) => setStrategy(event.target.value as RevealStrategy)}
                className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3 disabled:opacity-50"
              >
                {(Object.keys(STRATEGY_LABELS) as RevealStrategy[]).map((key) => (
                  <option key={key} value={key}>{STRATEGY_LABELS[key]}</option>
                ))}
              </select>
            </label>
          </div>
          {selectedShow ? <p className="mt-3 text-xs text-muted-foreground">{selectedShow.kind} · {rows.length} result row(s)</p> : null}
        </AdminCard>

        {lifecycleQuery.isLoading ? (
          <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading governed reveal state…</p></AdminCard>
        ) : lifecycleQuery.error ? (
          <AdminCard><AdminEmptyState icon={Trophy} title="Reveal lifecycle unavailable" description="The canonical Reveal Director state could not be loaded. No production action is available until it reconciles." /></AdminCard>
        ) : runtime ? (
          <LifecycleControl
            runtime={runtime}
            strategy={strategy}
            proposedSequence={proposedSequence}
            busy={mutation.isPending}
            error={mutationError}
            disarmReason={disarmReason}
            onDisarmReasonChange={setDisarmReason}
            onAction={(action) => mutation.mutate(action)}
          />
        ) : selectedShow ? (
          <AdminCard><AdminEmptyState icon={Trophy} title="Reveal runtime missing" description="This show has no canonical reveal runtime. Production controls remain unavailable until the server state is repaired." /></AdminCard>
        ) : null}

        {showsQuery.isLoading || resultsQuery.isLoading ? (
          <AdminCard><p className="py-10 text-center text-sm text-muted-foreground">Loading reveal data…</p></AdminCard>
        ) : showsQuery.error || resultsQuery.error ? (
          <AdminCard><AdminEmptyState icon={Trophy} title="Results unavailable" description="The selected show's result rows could not be loaded." /></AdminCard>
        ) : !shows.length ? (
          <AdminCard><AdminEmptyState icon={Trophy} title="No shows in this edition" description="Create a show before planning its results reveal." /></AdminCard>
        ) : !rows.length ? (
          <AdminCard><AdminEmptyState icon={Trophy} title="No result rows yet" description="Reveal simulations become available once jury and televote result rows exist for this show." /></AdminCard>
        ) : (
          <>
            <MetricStrip>
              <Metric label="Final winner" value={nameOf(simulation.finalWinner, displayMap)} tone="ready" />
              <Metric label="Winner certain" value={simulation.certaintyStep == null ? 'Never early' : `Step ${simulation.certaintyStep}`} />
              <Metric label="Suspense" value={`${Math.round(simulation.suspenseRatio * 100)}%`} tone={simulation.suspenseRatio >= 0.8 ? 'ready' : 'attention'} />
              <Metric label="Reveals" value={`${simulation.steps.length}`} />
            </MetricStrip>

            <AdminCard>
              <AdminCardHeader eyebrow="Strategy comparison" title="Which order keeps the result alive longest?" />
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {(Object.keys(model.simulations) as RevealStrategy[]).map((key) => {
                  const value = model.simulations[key];
                  const recommended = key === model.recommendedStrategy;
                  const locked = runtime?.state === 'armed' || runtime?.state === 'live' || runtime?.state === 'complete';
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={locked}
                      onClick={() => setStrategy(key)}
                      className="rounded-xl border border-white/[0.08] bg-black/10 p-4 text-left transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{STRATEGY_LABELS[key]}</p>
                        {recommended ? <AdminStatus tone="ready">Recommended</AdminStatus> : null}
                      </div>
                      <p className="mt-3 text-2xl font-bold">{Math.round(value.suspenseRatio * 100)}%</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Winner certain {value.certaintyStep == null ? 'only at the end' : `at reveal ${value.certaintyStep} of ${value.steps.length}`}.
                      </p>
                    </button>
                  );
                })}
              </div>
            </AdminCard>

            <AdminCard>
              <AdminCardHeader eyebrow="Reveal sequence" title={STRATEGY_LABELS[strategy]} />
              <AdminDataView
                className="mt-4"
                rows={simulation.steps}
                columns={revealColumns}
                rowKey={(step) => `${step.step}-${step.countryId}`}
                ariaLabel="Results reveal sequence"
              />
            </AdminCard>

            <AdminCard>
              <AdminCardHeader eyebrow="Input" title="Jury base + televote awards" />
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {revealOrder.map((award) => {
                  const base = model.baseScores.find((row) => row.countryId === award.countryId)?.points ?? 0;
                  return (
                    <div key={award.countryId} className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
                      <p className="text-sm font-semibold">{nameOf(award.countryId, displayMap)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Jury {base} · Televote {award.points} · Total {base + award.points}</p>
                    </div>
                  );
                })}
              </div>
            </AdminCard>
          </>
        )}
      </ObjectPage>
    </AdminPage>
  );
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'ready' | 'attention' }) {
  return (
    <AdminCard>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="truncate text-xl font-bold">{value}</p>
        {tone !== 'neutral' ? <AdminStatus tone={tone}>{tone}</AdminStatus> : null}
      </div>
    </AdminCard>
  );
}

function nameOf(id: string | null, displayMap: Map<string, { name: string }>) {
  if (!id) return '—';
  return displayMap.get(id)?.name ?? id;
}
