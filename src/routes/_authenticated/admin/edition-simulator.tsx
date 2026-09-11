import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, Clock3, FlaskConical, RotateCcw, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { getControlRoomModel } from '@/lib/control-room.functions';
import {
  EDITION_STATES,
  SUBSYSTEM_STATES,
  canTransitionEdition,
  getEditionTransition,
  type EditionState,
  type EditionSubsystem,
  type SubsystemState,
} from '@/lib/edition-state';
import {
  applySimulationAction,
  createEditionSimulation,
  type EditionSimulationState,
  type SimulationAction,
} from '@/lib/edition-simulator';
import { isStudio2FeatureEnabled } from '@/lib/studio2-feature-flags';

export const Route = createFileRoute('/_authenticated/admin/edition-simulator')({
  head: () => ({
    meta: [
      { title: 'Edition Simulator — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: EditionSimulatorPage,
});

const SUBSYSTEMS: EditionSubsystem[] = [
  'confirmations',
  'submissions',
  'juryVoting',
  'televoting',
  'results',
  'predictions',
];

function EditionSimulatorPage() {
  const { editionId } = useAdminContext();
  const getControlRoom = useServerFn(getControlRoomModel);
  const [simulation, setSimulation] = useState<EditionSimulationState | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  const featureQuery = useQuery({
    queryKey: ['studio2-feature', 'edition_simulator'],
    queryFn: () => isStudio2FeatureEnabled('edition_simulator'),
    staleTime: 30_000,
  });

  const controlRoomQuery = useQuery({
    queryKey: ['studio2-simulator-source', editionId ?? 'none'],
    enabled: featureQuery.data === true && Boolean(editionId),
    queryFn: () => getControlRoom({ data: { editionId: editionId! } }),
  });

  const resetSimulation = () => {
    const model = controlRoomQuery.data;
    if (!model) return;
    setSimulation(createEditionSimulation({
      startsAt: new Date().toISOString(),
      runtime: {
        edition: model.editionState,
        subsystems: model.subsystems,
      },
    }));
    setSimulationError(null);
  };

  useEffect(() => {
    if (controlRoomQuery.data) {
      setSimulation(createEditionSimulation({
        startsAt: new Date().toISOString(),
        runtime: {
          edition: controlRoomQuery.data.editionState,
          subsystems: controlRoomQuery.data.subsystems,
        },
      }));
      setSimulationError(null);
    }
  }, [controlRoomQuery.data]);

  const transitions = useMemo(() => {
    if (!simulation) return [];
    return EDITION_STATES
      .filter((state) => canTransitionEdition(simulation.runtime.edition, state))
      .map((state) => getEditionTransition(simulation.runtime.edition, state))
      .filter((transition): transition is NonNullable<typeof transition> => transition !== null);
  }, [simulation]);

  const dispatch = (action: SimulationAction) => {
    if (!simulation) return;
    try {
      setSimulation(applySimulationAction(simulation, action));
      setSimulationError(null);
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : 'Simulation action failed.');
    }
  };

  if (featureQuery.isLoading) {
    return <AdminPage><p className="text-sm text-muted-foreground">Loading Edition Simulator…</p></AdminPage>;
  }

  if (featureQuery.data !== true) {
    return (
      <AdminPage>
        <AdminEmptyState
          icon={FlaskConical}
          title="Edition Simulator is disabled"
          description="Enable the Edition Simulator rollout flag before rehearsing edition operations."
        />
      </AdminPage>
    );
  }

  if (!editionId) {
    return (
      <AdminPage>
        <AdminEmptyState icon={FlaskConical} title="Select an edition" description="Edition Simulator starts from the currently selected Organizer edition." />
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2"
          title="Edition Simulator"
          description="Clone the current Control Room lifecycle into an in-memory rehearsal, then test transitions, subsystem states, incidents and recovery without touching production."
        />

        <AdminCard strong>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-300/15 bg-emerald-300/10 text-emerald-200">
                <FlaskConical className="size-5" />
              </span>
              <div>
                <p className="font-semibold">Nothing here writes production state</p>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  The simulator starts from the Control Room read model, then uses only the pure in-memory simulation engine. Reloading or resetting discards every simulated transition and incident.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={resetSimulation}
              disabled={!controlRoomQuery.data}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 text-sm font-semibold hover:bg-white/[0.07] disabled:opacity-40"
            >
              <RotateCcw className="size-4" /> Reset from Control Room
            </button>
          </div>
        </AdminCard>

        {controlRoomQuery.isLoading ? (
          <AdminCard><p className="py-10 text-center text-sm text-muted-foreground">Cloning Control Room state…</p></AdminCard>
        ) : controlRoomQuery.error ? (
          <AdminCard><AdminEmptyState icon={FlaskConical} title="Simulator source unavailable" description={errorText(controlRoomQuery.error)} /></AdminCard>
        ) : simulation ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Edition state" value={humanize(simulation.runtime.edition)} />
              <Metric label="Simulation clock" value={formatClock(simulation.clock)} />
              <Metric label="Active incidents" value={`${simulation.incidents.filter((incident) => incident.active).length}`} tone={simulation.incidents.some((incident) => incident.active) ? 'attention' : 'ready'} />
              <Metric label="Actions rehearsed" value={`${simulation.log.length}`} />
            </section>

            {simulationError ? (
              <div className="rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-100">{simulationError}</div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              <AdminCard strong>
                <AdminCardHeader eyebrow="Lifecycle" title="Edition transitions" />
                <p className="mt-2 text-sm text-muted-foreground">Only transitions allowed by the real Edition State Engine are offered.</p>
                <div className="mt-4 space-y-2">
                  {transitions.length ? transitions.map((transition) => (
                    <button
                      key={`${transition.from}-${transition.to}`}
                      type="button"
                      onClick={() => dispatch({ type: 'transition_edition', to: transition.to })}
                      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/10 px-3 text-left hover:bg-white/[0.04]"
                    >
                      <span>
                        <span className="block text-sm font-semibold">{humanize(transition.from)} → {humanize(transition.to)}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">Rehearse this lifecycle change.</span>
                      </span>
                      <AdminStatus tone={riskTone(transition.risk)}>{transition.risk}</AdminStatus>
                    </button>
                  )) : (
                    <AdminEmptyState icon={ShieldAlert} title="No legal transition" description="This simulated edition state has no onward transition." />
                  )}
                </div>
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Clock" title="Advance simulation time" />
                <p className="mt-2 text-sm text-muted-foreground">Advance the rehearsal clock without waiting in the real world, a rare victory over linear time.</p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[60, 300, 900, 3600].map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      onClick={() => dispatch({ type: 'advance_time', seconds })}
                      className="min-h-11 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-sm font-semibold hover:bg-white/[0.07]"
                    >
                      +{formatDuration(seconds)}
                    </button>
                  ))}
                </div>
              </AdminCard>
            </div>

            <AdminCard>
              <AdminCardHeader eyebrow="Subsystems" title="Operational state rehearsal" />
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {SUBSYSTEMS.map((subsystem) => (
                  <label key={subsystem} className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{humanize(subsystem)}</span>
                    <select
                      value={simulation.runtime.subsystems[subsystem]}
                      onChange={(event) => dispatch({ type: 'set_subsystem', subsystem, state: event.target.value as SubsystemState })}
                      className="mt-2 min-h-10 w-full rounded-lg border border-white/[0.08] bg-background px-3 text-sm"
                    >
                      {SUBSYSTEM_STATES.map((state) => <option key={state} value={state}>{humanize(state)}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </AdminCard>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <AdminCard strong>
                <AdminCardHeader eyebrow="Incident drill" title="Inject failure scenarios" />
                <div className="mt-4 space-y-2">
                  <ScenarioButton
                    title="Televoting outage"
                    severity="sev1"
                    onClick={() => dispatch({ type: 'create_incident', id: `televote-outage-${simulation.log.length}`, title: 'Televoting outage', severity: 'sev1' })}
                  />
                  <ScenarioButton
                    title="Broadcast graphics failure"
                    severity="sev2"
                    onClick={() => dispatch({ type: 'create_incident', id: `graphics-failure-${simulation.log.length}`, title: 'Broadcast graphics failure', severity: 'sev2' })}
                  />
                  <ScenarioButton
                    title="Delegation data issue"
                    severity="sev3"
                    onClick={() => dispatch({ type: 'create_incident', id: `delegation-data-${simulation.log.length}`, title: 'Delegation data issue', severity: 'sev3' })}
                  />
                </div>

                {simulation.incidents.some((incident) => incident.active) ? (
                  <div className="mt-5 space-y-2 border-t border-white/[0.07] pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Active simulated incidents</p>
                    {simulation.incidents.filter((incident) => incident.active).map((incident) => (
                      <div key={incident.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-3">
                        <div>
                          <p className="text-sm font-semibold">{incident.title}</p>
                          <p className="mt-1 text-xs uppercase text-muted-foreground">{incident.severity}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => dispatch({ type: 'resolve_incident', id: incident.id })}
                          className="min-h-9 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 text-xs font-semibold text-emerald-100"
                        >
                          Resolve
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Replay log" title="Simulation history" />
                <div className="mt-4 max-h-[480px] space-y-2 overflow-y-auto">
                  {simulation.log.length ? [...simulation.log].reverse().map((entry) => (
                    <div key={entry.index} className="grid grid-cols-[70px_1fr] gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-3">
                      <span className="text-xs tabular-nums text-muted-foreground">{formatClock(entry.at)}</span>
                      <div>
                        <p className="text-sm font-semibold">{entry.summary}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{entry.action.type.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                  )) : (
                    <AdminEmptyState icon={Clock3} title="No simulated actions yet" description="Transitions, time changes and incident drills will appear here." />
                  )}
                </div>
              </AdminCard>
            </div>
          </>
        ) : null}
      </div>
    </AdminPage>
  );
}

function ScenarioButton({ title, severity, onClick }: { title: string; severity: 'sev1' | 'sev2' | 'sev3'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/10 px-3 text-left hover:bg-white/[0.04]">
      <span className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4" /> {title}</span>
      <AdminStatus tone={severity === 'sev1' ? 'blocked' : 'attention'}>{severity}</AdminStatus>
    </button>
  );
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'ready' | 'attention' }) {
  return (
    <AdminCard>
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xl font-bold">{value}</p>
        {tone !== 'neutral' ? <AdminStatus tone={tone}>{tone}</AdminStatus> : null}
      </div>
    </AdminCard>
  );
}

function riskTone(risk: 'normal' | 'elevated' | 'critical'): 'ready' | 'attention' | 'blocked' {
  if (risk === 'critical') return 'blocked';
  if (risk === 'elevated') return 'attention';
  return 'ready';
}

function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split('_')
    .join(' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function formatClock(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(seconds: number) {
  if (seconds >= 3600) return `${seconds / 3600}h`;
  return `${Math.round(seconds / 60)}m`;
}

function errorText(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'The current Control Room state could not be loaded.';
}
