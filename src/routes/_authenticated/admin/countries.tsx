import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertTriangle, Flag, Search } from 'lucide-react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { useEditions } from '@/lib/data';
import {
  loadStudio2CountryCockpit,
  summarizeCountryCockpit,
} from '@/lib/studio2-country-cockpit';

export const Route = createFileRoute('/_authenticated/admin/countries')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
    state:
      search.state === 'ready' || search.state === 'attention_required' || search.state === 'blocked'
        ? search.state
        : 'all',
  }),
  head: () => ({
    meta: [
      { title: 'Country cockpit — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: CountriesCockpitPage,
});

function CountriesCockpitPage() {
  const { editionId } = useAdminContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const editionsQuery = useEditions();
  const editions = editionsQuery.data ?? [];
  const selectedEdition = editions.find((edition) => edition.id === editionId)
    ?? [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0]
    ?? null;
  const resolvedEditionId = selectedEdition?.id ?? '';

  const cockpitQuery = useQuery({
    queryKey: ['studio2-country-cockpit', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId),
    queryFn: () => loadStudio2CountryCockpit(resolvedEditionId),
    staleTime: 20_000,
  });

  const rows = cockpitQuery.data ?? [];
  const normalizedQuery = search.q.trim().toLocaleLowerCase();
  const filteredRows = rows.filter((row) => {
    if (search.state !== 'all' && row.operationalReadiness.state !== search.state) return false;
    if (!normalizedQuery) return true;
    return row.context.countryName.toLocaleLowerCase().includes(normalizedQuery);
  });
  const summary = summarizeCountryCockpit(rows);
  const error = editionsQuery.error ?? cockpitQuery.error;

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2 · Delegations"
          title="Country cockpit"
          description="A single readiness matrix for every participating delegation in the selected edition. Scores use the same country operational-readiness model as the HOD workspace."
          actions={
            <a href="/confirmations/admin" className="admin-action-secondary">
              Confirmation operations
            </a>
          }
        />

        {!selectedEdition && !editionsQuery.isLoading ? (
          <AdminCard>
            <AdminEmptyState
              icon={Flag}
              title="No edition selected"
              description="Select an edition before the country cockpit can build its readiness matrix."
            />
          </AdminCard>
        ) : cockpitQuery.isLoading || editionsQuery.isLoading ? (
          <AdminCard>
            <p className="py-12 text-center text-sm text-muted-foreground">Building delegation readiness…</p>
          </AdminCard>
        ) : error ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title="Country cockpit could not load"
              description={errorText(error)}
            />
          </AdminCard>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Delegations" value={summary.total} tone="neutral" />
              <Metric label="Ready" value={summary.ready} tone="ready" />
              <Metric label="Attention" value={summary.attention} tone="attention" />
              <Metric label="Blocked" value={summary.blocked} tone="blocked" />
              <Metric label="Ack outstanding" value={summary.outstandingAcknowledgements} tone={summary.outstandingAcknowledgements ? 'attention' : 'ready'} />
            </section>

            <AdminCard>
              <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search.q}
                    onChange={(event) => navigate({ search: (previous) => ({ ...previous, q: event.target.value }), replace: true })}
                    placeholder="Search country…"
                    className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] pl-10 pr-3 text-sm"
                  />
                </label>
                <select
                  value={search.state}
                  onChange={(event) => navigate({
                    search: (previous) => ({
                      ...previous,
                      state: event.target.value as 'all' | 'ready' | 'attention_required' | 'blocked',
                    }),
                    replace: true,
                  })}
                  className="min-h-11 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-sm"
                >
                  <option value="all">All readiness states</option>
                  <option value="ready">Ready</option>
                  <option value="attention_required">Attention required</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
            </AdminCard>

            <AdminCard>
              {filteredRows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        <th className="px-3 py-3">Country</th>
                        <th className="px-3 py-3">Readiness</th>
                        <th className="px-3 py-3">Confirmation</th>
                        <th className="px-3 py-3">Entry</th>
                        <th className="px-3 py-3">Media</th>
                        <th className="px-3 py-3">Jury</th>
                        <th className="px-3 py-3">Deadlines</th>
                        <th className="px-3 py-3">Notices</th>
                        <th className="px-3 py-3">Issues</th>
                        <th className="px-3 py-3 text-right">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => {
                        const signals = new Map(row.operationalReadiness.signals.map((signal) => [signal.id, signal]));
                        return (
                          <tr key={row.context.countryId} className="border-b border-white/[0.05] align-top last:border-0">
                            <td className="px-3 py-4">
                              <p className="font-semibold">{row.context.countryName}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{row.workflow.progress}% entry workflow</p>
                            </td>
                            <td className="px-3 py-4">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{row.operationalReadiness.score}%</span>
                                <ReadinessStatus state={row.operationalReadiness.state} />
                              </div>
                            </td>
                            <td className="px-3 py-4"><SignalStatus state={signals.get('participation')?.state} /></td>
                            <td className="px-3 py-4"><SignalStatus state={signals.get('entry-validity')?.state} /></td>
                            <td className="px-3 py-4"><SignalStatus state={signals.get('media')?.state} /></td>
                            <td className="px-3 py-4">
                              <SignalStatus state={signals.get('jury')?.state} />
                              <p className="mt-1 text-xs text-muted-foreground">{row.model.jury.assigned}/{row.model.jury.required}</p>
                            </td>
                            <td className="px-3 py-4">
                              <SignalStatus state={signals.get('deadlines')?.state} />
                              {row.operationalReadiness.overdueDeadlines.length ? (
                                <p className="mt-1 text-xs text-muted-foreground">{row.operationalReadiness.overdueDeadlines.length} overdue</p>
                              ) : null}
                            </td>
                            <td className="px-3 py-4">
                              <AdminStatus tone={row.model.outstandingAcknowledgements ? 'attention' : 'ready'}>
                                {row.model.outstandingAcknowledgements ? `${row.model.outstandingAcknowledgements} pending` : 'Clear'}
                              </AdminStatus>
                            </td>
                            <td className="px-3 py-4">
                              <AdminStatus tone={row.context.unresolvedOrganizerIssues ? 'attention' : 'ready'}>
                                {row.context.unresolvedOrganizerIssues || 'Clear'}
                              </AdminStatus>
                            </td>
                            <td className="px-3 py-4 text-right">
                              <Link
                                to="/admin/countries/$countryId"
                                params={{ countryId: row.context.countryId }}
                                className="admin-action-secondary"
                              >
                                Inspect
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <AdminEmptyState
                  icon={Search}
                  title="No delegations match these filters"
                  description="Change the country search or readiness filter."
                />
              )}
            </AdminCard>
          </>
        )}
      </div>
    </AdminPage>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'ready' | 'attention' | 'blocked' }) {
  return (
    <AdminCard>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-2xl font-bold">{value}</p>
        <AdminStatus tone={tone}>{tone === 'neutral' ? 'Total' : label}</AdminStatus>
      </div>
    </AdminCard>
  );
}

function ReadinessStatus({ state }: { state: 'ready' | 'attention_required' | 'blocked' }) {
  return (
    <AdminStatus tone={state === 'ready' ? 'ready' : state === 'blocked' ? 'blocked' : 'attention'}>
      {state === 'attention_required' ? 'Attention' : state}
    </AdminStatus>
  );
}

function SignalStatus({ state }: { state?: 'ready' | 'attention' | 'blocked' }) {
  if (!state) return <AdminStatus tone="neutral">Unknown</AdminStatus>;
  return <AdminStatus tone={state}>{state}</AdminStatus>;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'The country cockpit could not complete that request.';
}
