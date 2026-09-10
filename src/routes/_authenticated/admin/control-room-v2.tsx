import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, RadioTower, ShieldAlert } from 'lucide-react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { EDITION_STATES, getEditionTransition, type EditionState } from '@/lib/edition-state';
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  canTransitionIncident,
  type IncidentSeverity,
  type IncidentStatus,
} from '@/lib/incident-command';
import { studio2ControlRoom } from '@/lib/studio2-control-room';

export const Route = createFileRoute('/_authenticated/admin/control-room-v2')({
  head: () => ({
    meta: [
      { title: 'Control Room v2 — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ControlRoomV2,
});

function ControlRoomV2() {
  const { editionId } = useAdminContext();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [secondApprover, setSecondApprover] = useState('');
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState<IncidentSeverity>('sev3');

  const snapshotQuery = useQuery({
    queryKey: ['studio2-control-room', editionId ?? 'none'],
    enabled: Boolean(editionId),
    queryFn: () => studio2ControlRoom.loadSnapshot(editionId!),
    refetchInterval: 15_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['studio2-control-room', editionId ?? 'none'] });
  };

  const transitionEdition = useMutation({
    mutationFn: (to: EditionState) => {
      if (!editionId) throw new Error('Choose an edition before changing its state.');
      return studio2ControlRoom.transitionEdition({
        editionId,
        to,
        reason: reason.trim() || null,
        secondApproverUserId: secondApprover.trim() || null,
      });
    },
    onSuccess: async () => {
      setReason('');
      setSecondApprover('');
      await refresh();
    },
  });

  const createIncident = useMutation({
    mutationFn: () => {
      if (!editionId) throw new Error('Choose an edition before creating an incident.');
      return studio2ControlRoom.createIncident({
        editionId,
        title: incidentTitle.trim(),
        severity: incidentSeverity,
      });
    },
    onSuccess: async () => {
      setIncidentTitle('');
      setIncidentSeverity('sev3');
      await refresh();
    },
  });

  const transitionIncident = useMutation({
    mutationFn: ({ id, to }: { id: string; to: IncidentStatus }) =>
      studio2ControlRoom.transitionIncident(id, to),
    onSuccess: refresh,
  });

  const submitIncident = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!incidentTitle.trim()) return;
    createIncident.mutate();
  };

  const snapshot = snapshotQuery.data;
  const currentState = snapshot?.runtime.runtime.edition;
  const transitions = currentState
    ? EDITION_STATES.map((to) => getEditionTransition(currentState, to)).filter(
        (transition): transition is NonNullable<typeof transition> => transition !== null,
      )
    : [];
  const commandError = transitionEdition.error ?? createIncident.error ?? transitionIncident.error;

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl">
        <AdminPageHeader
          eyebrow="Solaris Studio 2"
          title="Live Control Room v2"
          description="Persisted contest lifecycle, incident command and event history. State-changing commands are server-validated, permission-checked and written to the operational event stream."
        />

        {!editionId ? (
          <AdminCard>
            <AdminEmptyState
              icon={RadioTower}
              title="Choose an edition"
              description="The Control Room follows the edition selected in Solaris Organizer."
            />
          </AdminCard>
        ) : snapshotQuery.isLoading ? (
          <AdminCard>
            <p className="py-10 text-center text-sm text-muted-foreground">Loading persisted operational state…</p>
          </AdminCard>
        ) : snapshotQuery.error || !snapshot ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title="Control Room data unavailable"
              description={errorMessage(
                snapshotQuery.error,
                'The Studio 2 persistence migrations may not be deployed for this environment yet.',
              )}
            />
          </AdminCard>
        ) : (
          <div className="space-y-4">
            {commandError ? (
              <div className="rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-100">
                {errorMessage(commandError, 'The Control Room command failed.')}
              </div>
            ) : null}

            {snapshot.incidentSummary.crisisMode ? (
              <div className="flex items-start gap-3 rounded-2xl border border-red-300/30 bg-red-300/10 p-4 text-red-50">
                <ShieldAlert className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-semibold">Crisis mode required</p>
                  <p className="mt-1 text-sm text-red-100/80">
                    At least one active SEV-1 incident exists. Resolve or downgrade the incident only after the underlying failure is controlled.
                  </p>
                </div>
              </div>
            ) : null}

            <section className="grid gap-4 md:grid-cols-3">
              <AdminCard strong>
                <AdminCardHeader eyebrow="Edition state" title={humanize(snapshot.runtime.runtime.edition)} />
                <div className="mt-3 flex items-center gap-2">
                  <AdminStatus tone="info">Version {snapshot.runtime.version}</AdminStatus>
                  <span className="text-xs text-muted-foreground">
                    Updated {formatTimestamp(snapshot.runtime.updatedAt)}
                  </span>
                </div>
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Active incidents" title={`${snapshot.incidentSummary.activeCount}`} />
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  {snapshot.incidentSummary.criticalCount ? (
                    <ShieldAlert className="size-4" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {snapshot.incidentSummary.criticalCount} SEV-1
                </div>
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Operational history" title={`${snapshot.recentEvents.length} recent events`} />
                <p className="mt-3 text-sm text-muted-foreground">
                  Canonical state, incident, voting and communications events for this edition.
                </p>
              </AdminCard>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
              <AdminCard>
                <AdminCardHeader
                  eyebrow="Edition command"
                  title={transitions.length ? 'Available state transitions' : 'No further transitions'}
                  description="Elevated transitions require a reason. Critical rollbacks also require a second authorized approver."
                />

                {transitions.length ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-xs font-semibold text-muted-foreground">
                        Reason for rollback / exception
                        <textarea
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          rows={3}
                          maxLength={500}
                          className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                          placeholder="Required for elevated and critical transitions"
                        />
                      </label>
                      <label className="text-xs font-semibold text-muted-foreground">
                        Second approver user ID
                        <input
                          value={secondApprover}
                          onChange={(event) => setSecondApprover(event.target.value)}
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                          placeholder="Required only for critical rollback"
                        />
                      </label>
                    </div>

                    <div className="space-y-2">
                      {transitions.map((transition) => {
                        const missingReason = transition.risk !== 'normal' && !reason.trim();
                        const missingApprover = transition.risk === 'critical' && !secondApprover.trim();
                        return (
                          <div
                            key={transition.to}
                            className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-foreground">
                                  {humanize(transition.from)} → {humanize(transition.to)}
                                </p>
                                <AdminStatus tone={riskTone(transition.risk)}>{transition.risk}</AdminStatus>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {transition.risk === 'normal'
                                  ? 'Normal lifecycle progression.'
                                  : transition.risk === 'elevated'
                                    ? 'Rollback or exceptional transition. A reason is mandatory.'
                                    : 'Critical rollback. A reason and independent second approval are mandatory.'}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={transitionEdition.isPending || missingReason || missingApprover}
                              onClick={() => transitionEdition.mutate(transition.to)}
                              className="min-h-10 shrink-0 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground disabled:opacity-45"
                            >
                              {transitionEdition.isPending ? 'Applying…' : `Move to ${humanize(transition.to)}`}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">This edition has reached a terminal lifecycle state.</p>
                )}
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Subsystems" title="Lifecycle-derived state" />
                <div className="space-y-2">
                  {Object.entries(snapshot.runtime.runtime.subsystems).map(([name, state]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-3 py-2"
                    >
                      <span className="text-sm text-muted-foreground">{humanize(name)}</span>
                      <AdminStatus tone={state === 'open' ? 'ready' : state === 'locked' ? 'info' : 'neutral'}>
                        {humanize(state)}
                      </AdminStatus>
                    </div>
                  ))}
                </div>
              </AdminCard>
            </section>

            <section className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
              <AdminCard>
                <AdminCardHeader
                  eyebrow="Incident command"
                  title="Active operational incidents"
                  description="SEV-1 automatically puts Control Room into crisis mode."
                />

                <form onSubmit={submitIncident} className="mb-4 grid gap-2 sm:grid-cols-[1fr_110px_auto]">
                  <input
                    value={incidentTitle}
                    onChange={(event) => setIncidentTitle(event.target.value)}
                    maxLength={200}
                    placeholder="Describe the operational incident"
                    className="min-h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                  />
                  <select
                    value={incidentSeverity}
                    onChange={(event) => setIncidentSeverity(event.target.value as IncidentSeverity)}
                    className="min-h-10 rounded-xl border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {INCIDENT_SEVERITIES.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={!incidentTitle.trim() || createIncident.isPending}
                    className="min-h-10 rounded-xl border border-border bg-surface px-3 text-xs font-semibold disabled:opacity-45"
                  >
                    {createIncident.isPending ? 'Creating…' : 'Create incident'}
                  </button>
                </form>

                {snapshot.incidents.length ? (
                  <div className="space-y-2">
                    {snapshot.incidents.map((incident) => {
                      const nextStatuses = INCIDENT_STATUSES.filter((status) =>
                        canTransitionIncident(incident.status, status),
                      );
                      return (
                        <div key={incident.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold">{incident.title}</p>
                              <AdminStatus tone={incident.severity === 'sev1' ? 'blocked' : 'attention'}>
                                {incident.severity.toUpperCase()}
                              </AdminStatus>
                            </div>
                            <AdminStatus tone="neutral">{humanize(incident.status)}</AdminStatus>
                          </div>
                          {nextStatuses.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {nextStatuses.map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  disabled={transitionIncident.isPending}
                                  onClick={() => transitionIncident.mutate({ id: incident.id, to: status })}
                                  className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-45"
                                >
                                  {humanize(status)}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No active incidents.</p>
                )}
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Event stream" title="Recent operational history" />
                {snapshot.recentEvents.length ? (
                  <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
                    {snapshot.recentEvents.map((event) => (
                      <div key={event.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{humanize(event.type)}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {event.entityType ? `${humanize(event.entityType)} · ` : ''}
                              {formatTimestamp(event.occurredAt)}
                            </p>
                          </div>
                          {event.actorUserId ? <AdminStatus tone="info">actor recorded</AdminStatus> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No Studio 2 events recorded for this edition yet.</p>
                )}
              </AdminCard>
            </section>
          </div>
        )}
      </div>
    </AdminPage>
  );
}

function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function riskTone(risk: 'normal' | 'elevated' | 'critical') {
  return risk === 'critical' ? ('blocked' as const) : risk === 'elevated' ? ('attention' as const) : ('info' as const);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
