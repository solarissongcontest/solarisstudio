import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, ExternalLink, Flag } from 'lucide-react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { useCountries, useEditions } from '@/lib/data';
import { loadStudio2HodWorkspace } from '@/lib/studio2-hod-workspace';

const TABS = [
  'overview',
  'entry',
  'eligibility',
  'assets',
  'communications',
  'voting',
  'workflows',
  'incidents',
  'audit',
] as const;
type CountryTab = (typeof TABS)[number];

export const Route = createFileRoute('/_authenticated/admin/countries/$countryId')({
  validateSearch: (search: Record<string, unknown>): { tab: CountryTab } => ({
    tab: TABS.includes(search.tab as CountryTab) ? (search.tab as CountryTab) : 'overview',
  }),
  head: () => ({
    meta: [
      { title: 'Country detail — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: CountryDetailPage,
});

function CountryDetailPage() {
  const { countryId } = Route.useParams();
  const { tab } = Route.useSearch();
  const { editionId } = useAdminContext();
  const editionsQuery = useEditions();
  const countriesQuery = useCountries();
  const editions = editionsQuery.data ?? [];
  const selectedEdition = editions.find((edition) => edition.id === editionId)
    ?? [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0]
    ?? null;
  const country = (countriesQuery.data ?? []).find((candidate) => candidate.id === countryId) ?? null;
  const resolvedEditionId = selectedEdition?.id ?? '';

  const workspaceQuery = useQuery({
    queryKey: ['studio2-country-detail', resolvedEditionId || 'none', countryId],
    enabled: Boolean(resolvedEditionId && countryId),
    queryFn: () => loadStudio2HodWorkspace(resolvedEditionId, countryId),
    staleTime: 20_000,
  });

  const snapshot = workspaceQuery.data;
  const error = editionsQuery.error ?? countriesQuery.error ?? workspaceQuery.error;

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2 · Delegations"
          title={country ? `${country.name} country cockpit` : 'Country cockpit'}
          description="Organizer inspection of one delegation. Specialist tools remain authoritative; this page composes their operational state without impersonating the country account."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/countries" className="admin-action-secondary">
                <ArrowLeft className="size-4" />
                All countries
              </Link>
              <Link
                to="/country-hub/hod"
                search={{ country: countryId }}
                className="admin-action-secondary"
              >
                HOD inspection
                <ExternalLink className="size-4" />
              </Link>
            </div>
          }
        />

        <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2" aria-label="Country cockpit sections">
          {TABS.map((item) => (
            <Link
              key={item}
              to="/admin/countries/$countryId"
              params={{ countryId }}
              search={{ tab: item }}
              className={tab === item ? 'admin-action-primary whitespace-nowrap' : 'admin-action-secondary whitespace-nowrap'}
            >
              {tabLabel(item)}
            </Link>
          ))}
        </nav>

        {!selectedEdition && !editionsQuery.isLoading ? (
          <AdminCard>
            <AdminEmptyState icon={Flag} title="No edition selected" description="Select an edition before inspecting a delegation." />
          </AdminCard>
        ) : workspaceQuery.isLoading || editionsQuery.isLoading || countriesQuery.isLoading ? (
          <AdminCard>
            <p className="py-12 text-center text-sm text-muted-foreground">Loading country operations…</p>
          </AdminCard>
        ) : error ? (
          <AdminCard>
            <AdminEmptyState icon={AlertTriangle} title="Country detail could not load" description={errorText(error)} />
          </AdminCard>
        ) : !country || !snapshot ? (
          <AdminCard>
            <AdminEmptyState icon={Flag} title="Country not found" description="The selected country is not available in this organizer context." />
          </AdminCard>
        ) : (
          <CountryTabContent tab={tab} snapshot={snapshot} editionSlug={selectedEdition?.slug ?? ''} />
        )}
      </div>
    </AdminPage>
  );
}

function CountryTabContent({
  tab,
  snapshot,
  editionSlug,
}: {
  tab: CountryTab;
  snapshot: Awaited<ReturnType<typeof loadStudio2HodWorkspace>>;
  editionSlug: string;
}) {
  if (tab === 'overview') {
    return (
      <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Readiness" value={`${snapshot.operationalReadiness.score}%`} tone={readinessTone(snapshot.operationalReadiness.state)} />
          <Metric label="Confirmation" value={snapshot.context.confirmationComplete ? 'Complete' : 'Required'} tone={snapshot.context.confirmationComplete ? 'ready' : 'blocked'} />
          <Metric label="Entry workflow" value={`${snapshot.workflow.progress}%`} tone={snapshot.workflow.complete ? 'ready' : snapshot.workflow.blockedCount ? 'blocked' : 'attention'} />
          <Metric label="HOD jury" value={snapshot.model.jury.complete ? 'HOD assigned' : 'HOD missing'} tone={snapshot.model.jury.complete ? 'ready' : 'attention'} />
        </section>
        <AdminCard>
          <h2 className="text-base font-semibold">Operational signals</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.operationalReadiness.signals.map((signal) => (
              <div key={signal.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{signal.label}</p>
                  <AdminStatus tone={signal.state}>{signal.state}</AdminStatus>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{signal.message}</p>
              </div>
            ))}
          </div>
        </AdminCard>
      </>
    );
  }

  if (tab === 'entry') {
    return (
      <AdminCard>
        <SectionHeading title="Entry" href="/confirmations/admin/countries" action="Open confirmation operations" />
        {snapshot.context.entry ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Info label="Artist" value={snapshot.context.entry.artist ?? 'Missing'} />
            <Info label="Song" value={snapshot.context.entry.songTitle ?? 'Missing'} />
            <Info label="Status" value={snapshot.context.entry.status ?? 'Unknown'} />
            <Info label="Source" value={snapshot.context.entry.source ?? 'Unknown'} />
            <Info label="Updated" value={formatDate(snapshot.context.entry.updatedAt)} />
            <Info label="Publication" value={snapshot.context.publicationStatus ?? 'Unknown'} />
          </div>
        ) : <p className="mt-4 text-sm text-muted-foreground">No canonical entry is linked to this delegation.</p>}
      </AdminCard>
    );
  }

  if (tab === 'eligibility') {
    return (
      <AdminCard>
        <SectionHeading title="Eligibility" href="/admin/workflows" action="Open workflow operations" />
        <div className="mt-4 space-y-2">
          {snapshot.eligibility.checks.map((check) => (
            <div key={check.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{check.label}</p>
                <AdminStatus tone={check.level === 'pass' ? 'ready' : check.level === 'blocked' ? 'blocked' : 'attention'}>{check.level}</AdminStatus>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{check.message}</p>
            </div>
          ))}
        </div>
      </AdminCard>
    );
  }

  if (tab === 'assets') {
    const mediaSignal = snapshot.operationalReadiness.signals.find((signal) => signal.id === 'media');
    return (
      <AdminCard>
        <SectionHeading title="Assets" href={editionSlug ? `/admin/${editionSlug}` : '/admin'} action="Open contest workspace" />
        <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">Required entry media</p>
            <AdminStatus tone={mediaSignal?.state ?? 'neutral'}>{mediaSignal?.state ?? 'unknown'}</AdminStatus>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{mediaSignal?.message ?? 'Media state is unavailable.'}</p>
          {snapshot.context.entry?.songUrl ? <p className="mt-2 break-all text-xs text-muted-foreground">{snapshot.context.entry.songUrl}</p> : null}
        </div>
      </AdminCard>
    );
  }

  if (tab === 'communications') {
    return (
      <AdminCard>
        <SectionHeading title="Communications" href="/admin/communications" action="Open Communications" />
        <p className="mt-4 text-sm text-muted-foreground">{snapshot.context.notices.length} published notice{snapshot.context.notices.length === 1 ? '' : 's'} visible in this context; {snapshot.model.outstandingAcknowledgements} acknowledgement{snapshot.model.outstandingAcknowledgements === 1 ? '' : 's'} outstanding.</p>
      </AdminCard>
    );
  }

  if (tab === 'voting') {
    return (
      <AdminCard>
        <SectionHeading title="Voting" href={editionSlug ? `/admin/jury/${editionSlug}` : '/televoting/admin'} action="Open voting operations" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Info label="Jury identity" value={snapshot.model.jury.complete ? 'HOD assigned' : 'HOD missing'} />
          <Info label="Jury model" value="Head of Delegation · sole jury" />
          <Info label="Ballot" value={snapshot.model.jury.ballotSubmitted ? 'Submitted' : 'Pending'} />
        </div>
      </AdminCard>
    );
  }

  if (tab === 'workflows') {
    return (
      <AdminCard>
        <SectionHeading title="Workflows" href="/admin/workflows" action="Open Workflows" />
        <div className="mt-4 space-y-2">
          {snapshot.workflow.tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div>
                <p className="font-semibold">{task.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{task.blockers.length ? `${task.blockers.length} prerequisite blocker${task.blockers.length === 1 ? '' : 's'}` : 'No dependency blockers'}</p>
              </div>
              <AdminStatus tone={task.effectiveStatus === 'completed' ? 'ready' : task.effectiveStatus === 'blocked' ? 'blocked' : 'attention'}>{task.effectiveStatus}</AdminStatus>
            </div>
          ))}
        </div>
      </AdminCard>
    );
  }

  if (tab === 'incidents') {
    return (
      <AdminCard>
        <SectionHeading title="Incidents" href="/admin/incidents" action="Open Incident Command" />
        <p className="mt-4 text-sm text-muted-foreground">{snapshot.context.unresolvedOrganizerIssues} unresolved delegation/publication incident{snapshot.context.unresolvedOrganizerIssues === 1 ? '' : 's'} currently affect the selected edition.</p>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <SectionHeading title="Audit & review history" href="/admin/system" action="Open admin audit" />
      {snapshot.context.reviewHistory.length ? (
        <div className="mt-4 space-y-2">
          {snapshot.context.reviewHistory.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{[item.artist, item.songTitle].filter(Boolean).join(' · ') || 'Submission review'}</p>
                <AdminStatus tone={item.action === 'accepted' ? 'ready' : item.action === 'declined' || item.action === 'removed' ? 'blocked' : 'attention'}>{item.action}</AdminStatus>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(item.createdAt)} · {item.targetType.replace(/_/g, ' ')}</p>
              {item.reason ? <p className="mt-2 text-xs text-muted-foreground">{item.reason}</p> : null}
            </div>
          ))}
        </div>
      ) : <p className="mt-4 text-sm text-muted-foreground">No canonical submission review history is recorded for this country and edition.</p>}
    </AdminCard>
  );
}

function SectionHeading({ title, href, action }: { title: string; href: string; action: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <a href={href} className="admin-action-secondary">{action}<ExternalLink className="size-4" /></a>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'neutral' | 'ready' | 'attention' | 'blocked' }) {
  return (
    <AdminCard>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-xl font-bold">{value}</p>
        <AdminStatus tone={tone}>{tone}</AdminStatus>
      </div>
    </AdminCard>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function readinessTone(state: 'ready' | 'attention_required' | 'blocked') {
  return state === 'ready' ? 'ready' as const : state === 'blocked' ? 'blocked' as const : 'attention' as const;
}

function tabLabel(tab: CountryTab) {
  return tab === 'communications' ? 'Comms' : tab.charAt(0).toUpperCase() + tab.slice(1);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'The country detail cockpit could not complete that request.';
}
