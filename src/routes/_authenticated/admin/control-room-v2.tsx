import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, CheckCircle2, RadioTower, ShieldAlert, Vote } from 'lucide-react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { getControlRoomModel } from '@/lib/control-room.functions';

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
  const getModel = useServerFn(getControlRoomModel);
  const { data: model, isLoading, error } = useQuery({
    queryKey: ['control-room-v2', editionId ?? 'none'],
    enabled: Boolean(editionId),
    queryFn: () => getModel({ data: { editionId: editionId ?? undefined } }),
    refetchInterval: 20_000,
  });

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl">
        <AdminPageHeader
          eyebrow="Experimental operations"
          title="Live Control Room v2"
          description="Read-only preview of the new contest-state, health and live-action model. Nothing on this page changes voting or edition state yet."
        />

        {!editionId ? (
          <AdminCard>
            <AdminEmptyState
              icon={RadioTower}
              title="Choose an edition"
              description="The Control Room follows the edition selected in Solaris Organizer."
            />
          </AdminCard>
        ) : isLoading ? (
          <AdminCard>
            <p className="py-10 text-center text-sm text-muted-foreground">Loading operational state…</p>
          </AdminCard>
        ) : error || !model ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title="Control Room data unavailable"
              description={String((error as Error | null)?.message ?? 'The operational model could not be loaded.')}
            />
          </AdminCard>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <AdminCard strong>
                <AdminCardHeader eyebrow="Edition state" title={humanize(model.editionState)} />
                <AdminStatus tone={model.overallHealth === 'healthy' ? 'ready' : model.overallHealth === 'critical' ? 'blocked' : 'attention'}>
                  {model.overallHealth === 'healthy' ? 'Healthy' : model.overallHealth === 'critical' ? 'Critical' : 'Needs attention'}
                </AdminStatus>
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Televoting" title={humanize(model.subsystems.televoting)} />
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Vote className="size-4" />
                  {model.ballots.completion == null
                    ? 'Ballot completion not connected yet'
                    : `${model.ballots.received}/${model.ballots.expected} ballots · ${model.ballots.completion}%`}
                </div>
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Operational issues" title={`${model.issues.total + model.issues.incidents}`} />
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  {model.overallHealth === 'critical' ? <ShieldAlert className="size-4" /> : <CheckCircle2 className="size-4" />}
                  {model.issues.critical + model.issues.criticalIncidents} critical
                </div>
              </AdminCard>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
              <AdminCard>
                <AdminCardHeader
                  eyebrow="Next operational actions"
                  title={model.actions.length ? `${model.actions.length} available` : 'No live actions at this stage'}
                  description="These controls are intentionally preview-only until state persistence and approval logging are deployed."
                />
                <div className="space-y-2">
                  {model.actions.map((action) => (
                    <div key={action.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{action.label}</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.description}</p>
                        </div>
                        <AdminStatus tone={action.risk === 'critical' ? 'blocked' : action.risk === 'elevated' ? 'attention' : 'info'}>
                          {action.risk}
                        </AdminStatus>
                      </div>
                    </div>
                  ))}
                </div>
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Subsystem state" title="Contest lifecycle" />
                <div className="space-y-2">
                  {Object.entries(model.subsystems).map(([name, state]) => (
                    <div key={name} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-3 py-2">
                      <span className="text-sm text-muted-foreground">{humanize(name)}</span>
                      <AdminStatus tone={state === 'open' ? 'ready' : state === 'locked' ? 'info' : 'neutral'}>
                        {humanize(state)}
                      </AdminStatus>
                    </div>
                  ))}
                </div>
              </AdminCard>
            </div>
          </>
        )}
      </div>
    </AdminPage>
  );
}

function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
