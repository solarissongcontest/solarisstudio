import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Trophy } from 'lucide-react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { useContestEntities, useCountries, useResults, useShows } from '@/lib/data';
import { displayFromEntity } from '@/lib/entities';
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

function ResultsRevealPage() {
  const { editionId } = useAdminContext();
  const showsQuery = useShows(editionId ?? undefined);
  const countriesQuery = useCountries();
  const entitiesQuery = useContestEntities(editionId ?? undefined);
  const shows = showsQuery.data ?? [];
  const [showId, setShowId] = useState('');
  const [strategy, setStrategy] = useState<RevealStrategy>('jury_order');

  const featureQuery = useQuery({
    queryKey: ['studio2-feature', 'results_replay'],
    queryFn: () => isStudio2FeatureEnabled('results_replay'),
    staleTime: 30_000,
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

  useEffect(() => {
    if (model.recommendedStrategy) setStrategy(model.recommendedStrategy);
  }, [model.recommendedStrategy, showId]);

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
  const selectedShow = shows.find((show) => show.id === showId) ?? null;

  if (featureQuery.isLoading) {
    return <AdminPage><p className="text-sm text-muted-foreground">Loading Results Reveal Director…</p></AdminPage>;
  }

  if (featureQuery.data !== true) {
    return (
      <AdminPage>
        <AdminEmptyState
          icon={Sparkles}
          title="Results Reveal Director is disabled"
          description="Enable the Results Replay rollout flag before using reveal simulations."
        />
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2"
          title="Results Reveal Director"
          description="Compare reveal orders against the actual jury and televote result rows and see exactly when the winner becomes mathematically certain. Dramatic television, but with arithmetic supervising it."
        />

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
                onChange={(event) => setStrategy(event.target.value as RevealStrategy)}
                className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3"
              >
                {(Object.keys(STRATEGY_LABELS) as RevealStrategy[]).map((key) => (
                  <option key={key} value={key}>{STRATEGY_LABELS[key]}</option>
                ))}
              </select>
            </label>
          </div>
          {selectedShow ? <p className="mt-3 text-xs text-muted-foreground">{selectedShow.kind} · {rows.length} result row(s)</p> : null}
        </AdminCard>

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
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Final winner" value={nameOf(simulation.finalWinner, displayMap)} tone="ready" />
              <Metric label="Winner certain" value={simulation.certaintyStep == null ? 'Never early' : `Step ${simulation.certaintyStep}`} />
              <Metric label="Suspense" value={`${Math.round(simulation.suspenseRatio * 100)}%`} tone={simulation.suspenseRatio >= 0.8 ? 'ready' : 'attention'} />
              <Metric label="Reveals" value={`${simulation.steps.length}`} />
            </section>

            <AdminCard>
              <AdminCardHeader eyebrow="Strategy comparison" title="Which order keeps the result alive longest?" />
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {(Object.keys(model.simulations) as RevealStrategy[]).map((key) => {
                  const value = model.simulations[key];
                  const recommended = key === model.recommendedStrategy;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStrategy(key)}
                      className="rounded-xl border border-white/[0.08] bg-black/10 p-4 text-left transition hover:bg-white/[0.04]"
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
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[780px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                    <tr><th className="pb-3">Step</th><th className="pb-3">Country</th><th className="pb-3">Televote</th><th className="pb-3">Leader after reveal</th><th className="pb-3">Leader total</th><th className="pb-3">Certainty</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.07]">
                    {simulation.steps.map((step) => (
                      <tr key={`${step.step}-${step.countryId}`}>
                        <td className="py-3 text-muted-foreground">{step.step}</td>
                        <td className="py-3 font-semibold">{nameOf(step.countryId, displayMap)}</td>
                        <td className="py-3 tabular-nums">+{step.revealedPoints}</td>
                        <td className="py-3">{nameOf(step.leaderCountryId, displayMap)}</td>
                        <td className="py-3 tabular-nums">{step.leaderPoints}</td>
                        <td className="py-3">
                          {step.winnerCertain
                            ? <AdminStatus tone="attention">{nameOf(step.mathematicallyCertainCountryId, displayMap)} certain</AdminStatus>
                            : <AdminStatus tone="info">Open</AdminStatus>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
      </div>
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
