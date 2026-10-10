import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router';
import { AlertTriangle, Flag, Search } from 'lucide-react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminDataView, type AdminDataColumn } from '@/components/admin/AdminDataView';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { useEditions } from '@/lib/data';
import {
  loadStudio2CountryCockpit,
  summarizeCountryCockpit,
} from '@/lib/studio2-country-cockpit';

type CountryReadinessFilter = 'ready' | 'attention_required' | 'blocked';
type CountriesSearch = {
  q?: string;
  state?: 'all' | CountryReadinessFilter;
};

export const Route = createFileRoute('/_authenticated/admin/countries')({
  validateSearch: (search: Record<string, unknown>): CountriesSearch => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    state:
      search.state === 'ready' || search.state === 'attention_required' || search.state === 'blocked'
        ? search.state
        : search.state === 'all'
          ? 'all'
          : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Country cockpit — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: CountriesRoute,
});

function CountriesRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname.startsWith('/admin/countries/')) return <Outlet />;
  return <CountriesCockpitPage />;
}

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
  const queryValue = search.q ?? '';
  const stateFilter = search.state ?? 'all';
  const normalizedQuery = queryValue.trim().toLocaleLowerCase();
  const filteredRows = rows.filter((row) => {
    if (stateFilter !== 'all' && row.operationalReadiness.state !== stateFilter) return false;
    if (!normalizedQuery) return true;
    return row.context.countryName.toLocaleLowerCase().includes(normalizedQuery);
  });
  const summary = summarizeCountryCockpit(rows);
  const error = editionsQuery.error ?? cockpitQuery.error;
  const countryColumns = [
    {
      key: 'country',
      header: 'Country',
      primary: true,
      render: (row) => (
        <div>
          <p>{row.context.countryName}</p>
          <p className="mt-1 text-xs font-normal text-muted-foreground">{row.workflow.progress}% entry workflow</p>
        </div>
      ),
    },
    {
      key: 'readiness',
      header: 'Readiness',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{row.operationalReadiness.score}%</span>
          <ReadinessStatus state={row.operationalReadiness.state} />
        </div>
      ),
    },
    {
      key: 'confirmation',
      header: 'Confirmation',
      render: (row) => <SignalStatus state={row.operationalReadiness.signals.find((signal) => signal.id === 'participation')?.state} />,
    },
    {
      key: 'entry',
      header: 'Entry',
      render: (row) => <SignalStatus state={row.operationalReadiness.signals.find((signal) => signal.id === 'entry-validity')?.state} />,
    },
    {
      key: 'media',
      header: 'Media',
      render: (row) => <SignalStatus state={row.operationalReadiness.signals.find((signal) => signal.id === 'media')?.state} />,
    },
    {
      key: 'jury',
      header: 'Jury',
      render: (row) => (
        <div>
          <SignalStatus state={row.operationalReadiness.signals.find((signal) => signal.id === 'jury')?.state} />
          <p className="mt-1 text-xs text-muted-foreground">{row.model.jury.assigned}/{row.model.jury.required}</p>
        </div>
      ),
    },
    {
      key: 'deadlines',
      header: 'Deadlines',
      render: (row) => (
        <div>
          <SignalStatus state={row.operationalReadiness.signals.find((signal) => signal.id === 'deadlines')?.state} />
          {row.operationalReadiness.overdueDeadlines.length ? (
            <p className="mt-1 text-xs text-muted-foreground">{row.operationalReadiness.overdueDeadlines.length} overdue</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'notices',
      header: 'Notices',
      render: (row) => (
        <AdminStatus tone={row.model.outstandingAcknowledgements ? 'attention' : 'ready'}>
          {row.model.outstandingAcknowledgements ? `${row.model.outstandingAcknowledgements} pending` : 'Clear'}
        </AdminStatus>
      ),
    },
    {
      key: 'issues',
      header: 'Issues',
      render: (row) => (
        <AdminStatus tone={row.context.unresolvedOrganizerIssues ? 'attention' : 'ready'}>
          {row.context.unresolvedOrganizerIssues || 'Clear'}
        </AdminStatus>
      ),
    },
    {
      key: 'open',
      header: 'Open',
      align: 'right' as const,
      render: (row) => (
        <Link
          to="/admin/countries/$countryId"
          params={{ countryId: row.context.countryId }}
          search={{ tab: 'overview' }}
          className="admin-action-secondary"
        >
          Inspect
        </Link>
      ),
    },
  ] satisfies readonly AdminDataColumn<(typeof filteredRows)[number]>[];

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2 · Delegations"
          title="Country cockpit"
          description="A single readiness matrix for every participating delegation in the selected edition. Scores use the same country operational-readiness model as the HOD workspace."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/flag-audit" className="admin-action-secondary">Flag QA</Link>
              <Link to="/confirmations/admin" className="admin-action-secondary">Confirmation operations</Link>
            </div>
          }
        />

        <AdminCard>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="admin-section-label">Delegation workflows</p>
              <h2 className="mt-1 text-base font-bold">Country work should be one click away</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Confirmations are a core delegation workflow, not a hidden specialist page.
              </p>
            </div>
            <Link to="/confirmations/admin" className="admin-action-primary">
              Open confirmations
            </Link>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Link to="/confirmations/admin" className="admin-action-secondary justify-start">Overview</Link>
            <Link to="/confirmations/admin/requirements" className="admin-action-secondary justify-start">Requirements</Link>
            <Link to="/confirmations/admin/responses" className="admin-action-secondary justify-start">Responses</Link>
            <Link to="/admin/next-in-line" className="admin-action-secondary justify-start">Next in Line</Link>
            <Link to="/confirmations/admin/rounds" className="admin-action-secondary justify-start">Rounds</Link>
            <Link to="/confirmations/admin/calendar" className="admin-action-secondary justify-start">Schedule</Link>
            <Link to="/confirmations/admin/recovery-codes" className="admin-action-secondary justify-start">Access</Link>
          </div>
          <details className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.018] p-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">More delegation tools</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Link to="/admin/submission-versions" className="admin-action-secondary justify-start">Submission history</Link>
              <Link to="/confirmations/admin/editions" className="admin-action-secondary justify-start">Edition links</Link>
              <Link to="/confirmations/admin/sync" className="admin-action-secondary justify-start">Sync health</Link>
              <Link to="/confirmations/admin/settings" className="admin-action-secondary justify-start">Settings</Link>
            </div>
          </details>
        </AdminCard>

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
                  <span className="sr-only">Search countries</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={queryValue}
                    onChange={(event) => navigate({ search: (previous) => ({ ...previous, q: event.target.value }), replace: true })}
                    placeholder="Search country…"
                    className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] pl-10 pr-3 text-sm"
                  />
                </label>
                <select
                  aria-label="Filter countries by readiness"
                  value={stateFilter}
                  onChange={(event) => navigate({
                    search: (previous) => ({
                      ...previous,
                      state: event.target.value as 'all' | CountryReadinessFilter,
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
                <AdminDataView
                  rows={filteredRows}
                  columns={countryColumns}
                  rowKey={(row) => row.context.countryId}
                  ariaLabel="Delegation readiness matrix"
                />
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
