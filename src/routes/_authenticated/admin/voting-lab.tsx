import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FlaskConical, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminDataView, type AdminDataColumn } from '@/components/admin/AdminDataView';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { useCountries, useParticipants } from '@/lib/data';
import { isStudio2FeatureEnabled } from '@/lib/studio2-feature-flags';
import {
  buildSyntheticVotingLabBallots,
  VOTING_LAB_SYNTHETIC_SCENARIOS,
  type VotingLabSyntheticScenario,
} from '@/lib/voting-lab-scenarios';
import {
  compareVotingSystems,
  type VotingLabConfig,
  type VotingLabSimulation,
} from '@/lib/voting-lab';

export const Route = createFileRoute('/_authenticated/admin/voting-lab')({
  head: () => ({
    meta: [
      { title: 'Voting Laboratory — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: VotingLabPage,
});

const CURRENT_SYSTEM: VotingLabConfig = {
  maxPerCountry: 10,
  ballotBudget: 20,
  minimumCountries: 5,
  invalidBallotPolicy: 'reject',
};

function VotingLabPage() {
  const { editionId } = useAdminContext();
  const participantsQuery = useParticipants(editionId ?? undefined);
  const countriesQuery = useCountries();
  const [scenario, setScenario] = useState<VotingLabSyntheticScenario>('balanced');
  const [ballotCount, setBallotCount] = useState(24);
  const [maxPerCountry, setMaxPerCountry] = useState(7);
  const [ballotBudget, setBallotBudget] = useState(20);
  const [minimumCountries, setMinimumCountries] = useState(5);
  const [invalidPolicy, setInvalidPolicy] = useState<'reject' | 'cap'>('cap');

  const featureQuery = useQuery({
    queryKey: ['studio2-feature', 'voting_lab'],
    queryFn: () => isStudio2FeatureEnabled('voting_lab'),
    staleTime: 30_000,
  });

  const entryIds = useMemo(
    () => [...new Set((participantsQuery.data ?? []).map((participant) => participant.country_id).filter((id): id is string => Boolean(id)))],
    [participantsQuery.data],
  );

  const displayMap = useMemo(
    () => new Map((countriesQuery.data ?? []).map((country) => [country.id, country.name])),
    [countriesQuery.data],
  );

  const syntheticBallots = useMemo(
    () => buildSyntheticVotingLabBallots(entryIds, scenario, ballotCount),
    [ballotCount, entryIds, scenario],
  );

  const customConfig = useMemo<VotingLabConfig>(() => ({
    maxPerCountry,
    ballotBudget,
    minimumCountries,
    invalidBallotPolicy: invalidPolicy,
  }), [ballotBudget, invalidPolicy, maxPerCountry, minimumCountries]);

  const comparison = useMemo(() => {
    if (!syntheticBallots.length) return null;
    try {
      return compareVotingSystems(syntheticBallots, {
        current: CURRENT_SYSTEM,
        experiment: customConfig,
      }) as Record<'current' | 'experiment', VotingLabSimulation>;
    } catch {
      return null;
    }
  }, [customConfig, syntheticBallots]);

  if (featureQuery.isLoading) {
    return (
      <AdminPage>
        <div className="mx-auto max-w-7xl space-y-4">
          <VotingLabPageHeader />
          <AdminCard><p className="py-10 text-center text-sm text-muted-foreground">Loading Voting Laboratory…</p></AdminCard>
        </div>
      </AdminPage>
    );
  }

  if (featureQuery.data !== true) {
    return (
      <AdminPage>
        <div className="mx-auto max-w-7xl space-y-4">
          <VotingLabPageHeader />
          <AdminEmptyState
            icon={FlaskConical}
            title="Voting Laboratory is disabled"
            description="Enable the Voting Lab rollout flag before running synthetic vote simulations."
          />
        </div>
      </AdminPage>
    );
  }

  if (!editionId) {
    return (
      <AdminPage>
        <div className="mx-auto max-w-7xl space-y-4">
          <VotingLabPageHeader />
          <AdminEmptyState
            icon={FlaskConical}
            title="Select an edition"
            description="Voting Laboratory uses only the exact selected Organizer edition as its entry pool. It will not load production ballots, an all-editions sample, or substitute another edition."
          />
        </div>
      </AdminPage>
    );
  }

  if (participantsQuery.isLoading || countriesQuery.isLoading) {
    return (
      <AdminPage>
        <div className="mx-auto max-w-7xl space-y-4">
          <VotingLabPageHeader />
          <AdminCard><p className="py-10 text-center text-sm text-muted-foreground">Loading the selected edition entry pool…</p></AdminCard>
        </div>
      </AdminPage>
    );
  }

  if (participantsQuery.error || countriesQuery.error) {
    return (
      <AdminPage>
        <div className="mx-auto max-w-7xl space-y-4">
          <VotingLabPageHeader />
          <AdminEmptyState
            icon={FlaskConical}
            title="Voting Lab entry pool unavailable"
            description={errorText(participantsQuery.error ?? countriesQuery.error)}
          />
        </div>
      </AdminPage>
    );
  }

  const current = comparison?.current ?? null;
  const experiment = comparison?.experiment ?? null;
  const movementRows = current && experiment ? comparisonRows(current, experiment) : [];
  const movementColumns = [
    {
      key: 'entry',
      header: 'Entry',
      primary: true,
      render: (row) => nameOf(row.countryId, displayMap),
    },
    {
      key: 'current-rank',
      header: 'Current rank',
      render: (row) => <span className="tabular-nums">{row.currentRank ?? '—'}</span>,
    },
    {
      key: 'experiment-rank',
      header: 'Experiment rank',
      render: (row) => <span className="tabular-nums">{row.experimentRank ?? '—'}</span>,
    },
    {
      key: 'current-points',
      header: 'Current points',
      align: 'right' as const,
      render: (row) => <span className="tabular-nums">{row.currentPoints}</span>,
    },
    {
      key: 'experiment-points',
      header: 'Experiment points',
      align: 'right' as const,
      render: (row) => <span className="tabular-nums">{row.experimentPoints}</span>,
    },
    {
      key: 'delta',
      header: 'Δ points',
      align: 'right' as const,
      render: (row) => (
        <AdminStatus tone={row.delta === 0 ? 'neutral' : row.delta > 0 ? 'ready' : 'attention'}>
          {row.delta > 0 ? '+' : ''}{row.delta}
        </AdminStatus>
      ),
    },
  ] satisfies readonly AdminDataColumn<(typeof movementRows)[number]>[];

  const selectedScenario = VOTING_LAB_SYNTHETIC_SCENARIOS.find((item) => item.id === scenario)!;

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <VotingLabPageHeader />

        <AdminCard strong>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-300/15 bg-emerald-300/10 text-emerald-200">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="font-semibold">Synthetic scenarios only</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Voting Lab uses the selected edition only to name the candidate entry pool. Every ballot is generated locally from deterministic synthetic scenarios. No submitted jury or televote ballot, voter identity, IP data, device data, VPN state or integrity metadata is queried or replayed, and nothing here can publish or finalize official results.
              </p>
            </div>
          </div>
        </AdminCard>

        {entryIds.length < 5 ? (
          <AdminCard>
            <AdminEmptyState
              icon={FlaskConical}
              title="At least five edition entries are required"
              description="Voting Lab needs five distinct participating countries to construct a valid synthetic 20-point ballot. Production ballots are never used as a fallback."
            />
          </AdminCard>
        ) : (
          <>
            <AdminCard>
              <AdminCardHeader
                eyebrow="Synthetic source"
                title={selectedScenario.label}
                description={selectedScenario.description}
              />
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_2fr] lg:items-end">
                <label className="space-y-1.5 text-sm">
                  <span className="font-semibold">Scenario</span>
                  <select
                    value={scenario}
                    onChange={(event) => setScenario(event.target.value as VotingLabSyntheticScenario)}
                    className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3"
                  >
                    {VOTING_LAB_SYNTHETIC_SCENARIOS.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <NumberControl
                  label="Synthetic ballots"
                  value={ballotCount}
                  min={5}
                  max={100}
                  onChange={setBallotCount}
                  help="Generated locally; no live votes are sampled."
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <SmallStat label="Synthetic ballots" value={`${syntheticBallots.length}`} />
                  <SmallStat label="Synthetic awards" value={`${syntheticBallots.reduce((sum, ballot) => sum + ballot.awards.length, 0)}`} />
                  <SmallStat label="Edition entries" value={`${entryIds.length}`} />
                </div>
              </div>
            </AdminCard>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <AdminCard strong>
                <AdminCardHeader eyebrow="Experiment" title="Alternative constraints" />
                <div className="mt-4 space-y-4">
                  <NumberControl
                    label="Maximum points to one entry"
                    value={maxPerCountry}
                    min={1}
                    max={20}
                    onChange={setMaxPerCountry}
                    help="Current system: 10. Lower values reduce how much one synthetic ballot can concentrate on one entry."
                  />
                  <NumberControl
                    label="Total ballot budget"
                    value={ballotBudget}
                    min={5}
                    max={50}
                    onChange={setBallotBudget}
                    help="Current system: exactly 20 points per ballot."
                  />
                  <NumberControl
                    label="Minimum supported entries"
                    value={minimumCountries}
                    min={1}
                    max={15}
                    onChange={setMinimumCountries}
                    help="Current system: at least 5 different entries."
                  />
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-semibold">If a synthetic ballot violates the experiment</span>
                    <select
                      value={invalidPolicy}
                      onChange={(event) => setInvalidPolicy(event.target.value as 'reject' | 'cap')}
                      className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3"
                    >
                      <option value="cap">Cap / trim where possible</option>
                      <option value="reject">Reject ballot</option>
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMaxPerCountry(10);
                        setBallotBudget(20);
                        setMinimumCountries(5);
                        setInvalidPolicy('reject');
                      }}
                      className="min-h-10 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 text-sm font-semibold hover:bg-white/[0.07]"
                    >
                      Current rules
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMaxPerCountry(7);
                        setBallotBudget(20);
                        setMinimumCountries(5);
                        setInvalidPolicy('cap');
                      }}
                      className="min-h-10 rounded-xl border border-sky-200/15 bg-sky-200/[0.07] px-3 text-sm font-semibold text-sky-100 hover:bg-sky-200/[0.11]"
                    >
                      Cap at 7
                    </button>
                  </div>
                </div>
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Impact" title="Current vs experiment" />
                {!current || !experiment ? (
                  <AdminEmptyState icon={SlidersHorizontal} title="No simulation yet" description="Choose a synthetic scenario with at least five edition entries." />
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <ComparisonMetric
                      label="Winner"
                      current={nameOf(current.winner, displayMap)}
                      experiment={nameOf(experiment.winner, displayMap)}
                      changed={current.winner !== experiment.winner}
                    />
                    <ComparisonMetric
                      label="Winning margin"
                      current={`${current.winningMargin} pts`}
                      experiment={`${experiment.winningMargin} pts`}
                      changed={current.winningMargin !== experiment.winningMargin}
                    />
                    <ComparisonMetric
                      label="Single-ballot winner impact"
                      current={`${current.maxSingleBallotWinnerImpact} pts`}
                      experiment={`${experiment.maxSingleBallotWinnerImpact} pts`}
                      changed={current.maxSingleBallotWinnerImpact !== experiment.maxSingleBallotWinnerImpact}
                    />
                    <ComparisonMetric
                      label="Vote concentration"
                      current={formatPercent(current.concentration)}
                      experiment={formatPercent(experiment.concentration)}
                      changed={Math.abs(current.concentration - experiment.concentration) > 0.0001}
                    />
                    <ComparisonMetric
                      label="Accepted ballots"
                      current={`${current.acceptedBallots}`}
                      experiment={`${experiment.acceptedBallots}`}
                      changed={current.acceptedBallots !== experiment.acceptedBallots}
                    />
                    <ComparisonMetric
                      label="Adjusted / rejected"
                      current={`${current.adjustedBallots.length} / ${current.rejectedBallots.length}`}
                      experiment={`${experiment.adjustedBallots.length} / ${experiment.rejectedBallots.length}`}
                      changed={current.adjustedBallots.length !== experiment.adjustedBallots.length || current.rejectedBallots.length !== experiment.rejectedBallots.length}
                    />
                  </div>
                )}
              </AdminCard>
            </div>

            {current && experiment ? (
              <AdminCard>
                <AdminCardHeader eyebrow="Standings" title="Synthetic result movement" />
                <AdminDataView
                  className="mt-4"
                  rows={movementRows}
                  columns={movementColumns}
                  rowKey={(row) => row.countryId}
                  ariaLabel="Synthetic voting system result movement"
                />
              </AdminCard>
            ) : null}

            <AdminCard>
              <AdminCardHeader eyebrow="Baseline" title="Current ballot contract" />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <RuleCard value="20" label="Total points" description="Each synthetic baseline ballot totals exactly 20 points." />
                <RuleCard value="5+" label="Different entries" description="A baseline ballot supports at least five different entries." />
                <RuleCard value="10" label="Per-entry maximum" description="One entry receives at most 10 points from one baseline ballot." />
              </div>
            </AdminCard>
          </>
        )}
      </div>
    </AdminPage>
  );
}

function VotingLabPageHeader() {
  return (
    <AdminPageHeader
      eyebrow="Solaris Studio 2"
      title="Voting Laboratory"
      description="Run deterministic synthetic vote scenarios through alternative voting constraints without reading, changing, publishing or finalizing any official vote or result."
    />
  );
}

function NumberControl({ label, value, min, max, onChange, help }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  help: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-semibold">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value || min))))}
        className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3"
      />
      <span className="block text-xs leading-5 text-muted-foreground">{help}</span>
    </label>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function ComparisonMetric({ label, current, experiment, changed }: { label: string; current: string; experiment: string; changed: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        {changed ? <AdminStatus tone="attention">Changed</AdminStatus> : <AdminStatus tone="neutral">Same</AdminStatus>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Current</p><p className="mt-1 font-semibold">{current}</p></div>
        <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Experiment</p><p className="mt-1 font-semibold">{experiment}</p></div>
      </div>
    </div>
  );
}

function RuleCard({ value, label, description }: { value: string; label: string; description: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl border border-sky-200/15 bg-sky-200/[0.07] text-lg font-bold text-sky-100">{value}</span>
        <div><p className="font-semibold">{label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>
      </div>
    </div>
  );
}

function comparisonRows(current: VotingLabSimulation, experiment: VotingLabSimulation) {
  const currentMap = new Map(current.results.map((row) => [row.countryId, row]));
  const experimentMap = new Map(experiment.results.map((row) => [row.countryId, row]));
  const ids = new Set([...currentMap.keys(), ...experimentMap.keys()]);
  return [...ids].map((countryId) => {
    const currentRow = currentMap.get(countryId);
    const experimentRow = experimentMap.get(countryId);
    return {
      countryId,
      currentRank: currentRow?.rank ?? null,
      experimentRank: experimentRow?.rank ?? null,
      currentPoints: currentRow?.points ?? 0,
      experimentPoints: experimentRow?.points ?? 0,
      delta: (experimentRow?.points ?? 0) - (currentRow?.points ?? 0),
    };
  }).sort((a, b) => (a.experimentRank ?? Number.MAX_SAFE_INTEGER) - (b.experimentRank ?? Number.MAX_SAFE_INTEGER) || a.countryId.localeCompare(b.countryId));
}

function nameOf(id: string | null, displayMap: Map<string, string>) {
  if (!id) return '—';
  return displayMap.get(id) ?? id;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function errorText(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Voting Lab could not load the selected edition entry pool.';
}
