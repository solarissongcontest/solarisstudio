import { AdminCard, AdminCardHeader, AdminStatus } from '@/components/admin/AdminUI';
import {
  simulationDomainTransitions,
  type EntryReviewSimulationState,
  type LiveSimulationState,
  type ProgressionSimulationState,
  type PublicationSimulationState,
  type SimulationDomain,
} from '@/lib/edition-simulation-domains';
import type { EditionSimulationState, SimulationAction } from '@/lib/edition-simulator';

type Props = {
  simulation: EditionSimulationState;
  dispatch: (action: SimulationAction) => void;
};

export function EditionSimulationDomainsPanel({ simulation, dispatch }: Props) {
  const progression = simulation.domains.progression;

  return (
    <AdminCard strong>
      <AdminCardHeader
        eyebrow="Canonical rehearsal domains"
        title="Entries, publication, progression and live state"
        description="These states exist only inside this rehearsal. Transitions are validated by the shared simulator rather than being invented by this screen."
      />
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <DomainCard
          label="Entry review"
          state={simulation.domains.entries.state}
          blockers={simulation.domains.entries.blockers.filter((blocker) => blocker.active).length}
          nextStates={simulationDomainTransitions('entries', simulation.domains.entries.state)}
          onTransition={(to) => dispatch({ type: 'transition_entries', to: to as EntryReviewSimulationState })}
        />
        <DomainCard
          label="Publication"
          state={simulation.domains.publication.state}
          blockers={simulation.domains.publication.blockers.filter((blocker) => blocker.active).length}
          nextStates={simulationDomainTransitions('publication', simulation.domains.publication.state)}
          onTransition={(to) => dispatch({ type: 'transition_publication', to: to as PublicationSimulationState })}
          blockerControls={
            <BlockerControls
              domain="publication"
              active={simulation.domains.publication.blockers.some((blocker) => blocker.id === 'rehearsal-publication-blocker' && blocker.active)}
              dispatch={dispatch}
              label="Result/publication dependency"
              id="rehearsal-publication-blocker"
            />
          }
        />
        <DomainCard
          label="Progression"
          state={progression.state}
          blockers={progression.blockers.filter((blocker) => blocker.active).length}
          nextStates={simulationDomainTransitions('progression', progression.state)}
          onTransition={(to) => dispatch({ type: 'transition_progression', to: to as ProgressionSimulationState })}
          detail={`${progression.qualifiersApplied}/${progression.qualifiersExpected} qualifiers applied`}
          blockerControls={
            <div className="space-y-2">
              <BlockerControls
                domain="progression"
                active={progression.blockers.some((blocker) => blocker.id === 'rehearsal-progression-blocker' && blocker.active)}
                dispatch={dispatch}
                label="Qualification dependency"
                id="rehearsal-progression-blocker"
              />
              <div className="grid grid-cols-3 gap-2">
                <SmallButton onClick={() => dispatch({ type: 'set_progression_counts', qualifiersExpected: 10, qualifiersApplied: 0 })}>
                  Seed 0/10
                </SmallButton>
                <SmallButton
                  disabled={progression.qualifiersExpected === 0 || progression.qualifiersApplied >= progression.qualifiersExpected}
                  onClick={() => dispatch({
                    type: 'set_progression_counts',
                    qualifiersExpected: progression.qualifiersExpected,
                    qualifiersApplied: Math.min(progression.qualifiersExpected, progression.qualifiersApplied + 1),
                  })}
                >
                  Apply +1
                </SmallButton>
                <SmallButton
                  disabled={progression.qualifiersExpected === 0}
                  onClick={() => dispatch({
                    type: 'set_progression_counts',
                    qualifiersExpected: progression.qualifiersExpected,
                    qualifiersApplied: progression.qualifiersExpected,
                  })}
                >
                  Apply all
                </SmallButton>
              </div>
            </div>
          }
        />
        <DomainCard
          label="Live operation"
          state={simulation.domains.live.state}
          blockers={simulation.domains.live.blockers.filter((blocker) => blocker.active).length}
          nextStates={simulationDomainTransitions('live', simulation.domains.live.state)}
          onTransition={(to) => dispatch({ type: 'transition_live', to: to as LiveSimulationState })}
          blockerControls={
            <BlockerControls
              domain="live"
              active={simulation.domains.live.blockers.some((blocker) => blocker.id === 'rehearsal-live-blocker' && blocker.active)}
              dispatch={dispatch}
              label="Production readiness blocker"
              id="rehearsal-live-blocker"
            />
          }
        />
      </div>
    </AdminCard>
  );
}

function DomainCard({
  label,
  state,
  blockers,
  nextStates,
  onTransition,
  detail,
  blockerControls,
}: {
  label: string;
  state: string;
  blockers: number;
  nextStates: readonly string[];
  onTransition: (state: string) => void;
  detail?: string;
  blockerControls?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-base font-bold">{humanize(state)}</p>
          {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
        </div>
        <AdminStatus tone={blockers ? 'attention' : 'ready'}>
          {blockers ? `${blockers} blocker${blockers === 1 ? '' : 's'}` : 'clear'}
        </AdminStatus>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {nextStates.length ? nextStates.map((next) => (
          <button
            key={next}
            type="button"
            onClick={() => onTransition(next)}
            className="min-h-9 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-xs font-semibold hover:bg-white/[0.07]"
          >
            → {humanize(next)}
          </button>
        )) : (
          <span className="text-xs text-muted-foreground">No onward transition from this rehearsal state.</span>
        )}
      </div>
      {blockerControls ? <div className="mt-3 border-t border-white/[0.07] pt-3">{blockerControls}</div> : null}
    </div>
  );
}

function BlockerControls({
  domain,
  active,
  dispatch,
  id,
  label,
}: {
  domain: Exclude<SimulationDomain, 'entries'>;
  active: boolean;
  dispatch: (action: SimulationAction) => void;
  id: string;
  label: string;
}) {
  return (
    <SmallButton
      onClick={() => dispatch({
        type: 'set_domain_blocker',
        domain,
        id,
        label,
        active: !active,
      })}
    >
      {active ? 'Clear rehearsal blocker' : 'Inject rehearsal blocker'}
    </SmallButton>
  );
}

function SmallButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-9 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs font-semibold hover:bg-white/[0.07] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split('_')
    .join(' ')
    .replace(/^./, (character) => character.toUpperCase());
}
