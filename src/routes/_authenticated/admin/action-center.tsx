import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useMemo } from 'react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { useEditions, useParticipants, useShows } from '@/lib/data';
import { buildStudio2ActionCenter, type Studio2ActionItem, type Studio2ActionLane } from '@/lib/studio2-action-center';
import { loadStudio2CountryCockpit } from '@/lib/studio2-country-cockpit';
import { studio2ControlRoom } from '@/lib/studio2-control-room';
import { isStudio2FeatureEnabled } from '@/lib/studio2-feature-flags';

export const Route = createFileRoute('/_authenticated/admin/action-center')({
  head: () => ({
    meta: [
      { title: 'Action Center — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ActionCenterPage,
});

function ActionCenterPage() {
  const { editionId } = useAdminContext();
  const editionsQuery = useEditions();
  const editions = editionsQuery.data ?? [];
  const selectedEdition = editions.find((edition) => edition.id === editionId)
    ?? [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0]
    ?? null;
  const resolvedEditionId = selectedEdition?.id ?? '';

  const participantsQuery = useParticipants(resolvedEditionId || undefined);
  const showsQuery = useShows(resolvedEditionId || undefined);

  const featureQuery = useQuery({
    queryKey: ['studio2-action-center-flags', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId),
    queryFn: async () => {
      const [controlRoom, rundown] = await Promise.all([
        isStudio2FeatureEnabled('live_control_room', resolvedEditionId),
        isStudio2FeatureEnabled('broadcast_rundown', resolvedEditionId),
      ]);
      return { controlRoom, rundown };
    },
    staleTime: 30_000,
  });

  const snapshotQuery = useQuery({
    queryKey: ['studio2-action-center-snapshot', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId) && featureQuery.data?.controlRoom === true,
    queryFn: () => studio2ControlRoom.loadSnapshot(resolvedEditionId, 20),
    refetchInterval: 15_000,
  });

  const approvalsQuery = useQuery({
    queryKey: ['studio2-action-center-approvals', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId) && featureQuery.data?.controlRoom === true,
    queryFn: () => studio2ControlRoom.listTransitionApprovals(resolvedEditionId),
    refetchInterval: 15_000,
  });

  const countryCockpitQuery = useQuery({
    queryKey: ['studio2-action-center-country-readiness', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId),
    queryFn: () => loadStudio2CountryCockpit(resolvedEditionId),
    refetchInterval: 30_000,
  });

  const model = useMemo(() => {
    if (!snapshotQuery.data) return null;
    return buildStudio2ActionCenter({
      runtime: snapshotQuery.data.runtime,
      incidents: snapshotQuery.data.incidents,
      approvals: approvalsQuery.data ?? [],
      participants: participantsQuery.data ?? [],
      shows: showsQuery.data ?? [],
      recentEvents: snapshotQuery.data.recentEvents,
      editionSlug: selectedEdition?.slug ?? null,
      broadcastRundownEnabled: featureQuery.data?.rundown === true,
      countryReadiness: (countryCockpitQuery.data ?? []).map((row) => ({
        countryId: row.context.countryId,
        countryName: row.context.countryName,
        readiness: row.operationalReadiness,
      })),
    });
  }, [
    approvalsQuery.data,
    countryCockpitQuery.data,
    featureQuery.data?.rundown,
    participantsQuery.data,
    selectedEdition?.slug,
    showsQuery.data,
    snapshotQuery.data,
  ]);

  const loading = editionsQuery.isLoading
    || featureQuery.isLoading
    || snapshotQuery.isLoading
    || participantsQuery.isLoading
    || showsQuery.isLoading
    || approvalsQuery.isLoading
    || countryCockpitQuery.isLoading;
  const error = editionsQuery.error
    || featureQuery.error
    || snapshotQuery.error
    || participantsQuery.error
    || showsQuery.error
    || approvalsQuery.error
    || countryCockpitQuery.error;

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2 · Operations"
          title="Action Center"
          description="One operational queue for the selected edition: urgent incidents, delegation readiness, approvals, contest data, broadcast preparation, lifecycle options and recent Studio 2 activity."
          actions={
            <a href="/admin/control-room" className="admin-action-secondary">
              Open Control Room
            </a>
          }
        />

        {!selectedEdition && !editionsQuery.isLoading ? (
          <AdminCard>
            <AdminEmptyState
              icon={BellRing}
              title="No edition selected"
              description="Create or select an edition before Action Center can build an operational queue."
            />
          </AdminCard>
        ) : featureQuery.data && !featureQuery.data.controlRoom ? (
          <AdminCard>
            <AdminEmptyState
              icon={ShieldAlert}
              title="Live Control Room is disabled"
              description="Action Center depends on the persisted Studio 2 runtime and event stream. Enable Live Control Room from Feature Rollout first."
            />
          </AdminCard>
        ) : loading ? (
          <AdminCard>
            <p className="py-12 text-center text-sm text-muted-foreground">Building the operational queue…</p>
          </AdminCard>
        ) : error ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title="Action Center could not load"
              description={errorText(error)}
            />
          </AdminCard>
        ) : model && snapshotQuery.data ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Critical" value={model.counts.critical} tone={model.counts.critical ? 'blocked' : 'ready'} />
              <Metric label="Needs attention" value={model.counts.attention} tone={model.counts.attention ? 'attention' : 'ready'} />
              <Metric label="Upcoming" value={model.counts.upcoming} tone="info" />
              <Metric label="Active incidents" value={snapshotQuery.data.incidentSummary.activeCount} tone={snapshotQuery.data.incidentSummary.criticalCount ? 'blocked' : snapshotQuery.data.incidentSummary.activeCount ? 'attention' : 'ready'} />
              <Metric label="Edition state" value={humanize(snapshotQuery.data.runtime.runtime.edition)} tone="neutral" text />
            </section>

            {model.counts.critical === 0 && model.counts.attention === 0 ? (
              <AdminCard strong>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-300/15 bg-emerald-300/10 text-emerald-200">
                    <CheckCircle2 className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold">No active blocker needs organizer attention</p>
                    <p className="mt-1 text-sm text-muted-foreground">The current Action Center checks found no critical incident, blocked delegation, actionable approval, paused subsystem, incomplete canonical entry or missing broadcast rundown.</p>
                  </div>
                </div>
              </AdminCard>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              <ActionLaneCard
                lane="critical"
                title="Critical"
                description="Contest-critical work that should be handled before routine operations."
                items={model.critical}
              />
              <ActionLaneCard
                lane="attention"
                title="Needs attention"
                description="Operational issues, delegation readiness, approvals and incomplete data that need an organizer decision."
                items={model.attention}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <ActionLaneCard
                lane="upcoming"
                title="Upcoming"
                description="Legal forward lifecycle options from the current persisted edition state."
                items={model.upcoming}
              />
              <ActionLaneCard
                lane="recent"
                title="Recent activity"
                description="Latest canonical Studio 2 events for this edition."
                items={model.recent}
              />
            </div>
          </>
        ) : null}
      </div>
    </AdminPage>
  );
}

function ActionLaneCard({ lane, title, description, items }: {
  lane: Studio2ActionLane;
  title: string;
  description: string;
  items: Studio2ActionItem[];
}) {
  const Icon = laneIcon(lane);
  return (
    <AdminCard strong={lane === 'critical'}>
      <AdminCardHeader
        eyebrow={lane === 'recent' ? 'Event stream' : 'Action queue'}
        title={title}
        description={description}
        action={<AdminStatus tone={laneTone(lane)}>{items.length}</AdminStatus>}
      />
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className="group flex min-h-16 items-start gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-3 transition-colors hover:bg-white/[0.04]"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{item.title}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                {item.occurredAt ? <span className="mt-1 block text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{formatWhen(item.occurredAt)}</span> : null}
              </span>
              <ArrowRight className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </a>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-8 text-center text-sm text-muted-foreground">
          {lane === 'recent' ? 'No recent Studio 2 events.' : 'Nothing in this queue.'}
        </div>
      )}
    </AdminCard>
  );
}

function Metric({ label, value, tone, text = false }: {
  label: string;
  value: number | string;
  tone: 'ready' | 'attention' | 'blocked' | 'info' | 'neutral';
  text?: boolean;
}) {
  return (
    <AdminCard>
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className={text ? 'text-lg font-bold' : 'text-2xl font-bold tabular-nums'}>{value}</p>
        <AdminStatus tone={tone}>{tone === 'ready' ? 'Clear' : tone === 'blocked' ? 'Critical' : tone === 'attention' ? 'Review' : tone === 'info' ? 'Info' : 'State'}</AdminStatus>
      </div>
    </AdminCard>
  );
}

function laneIcon(lane: Studio2ActionLane) {
  if (lane === 'critical') return ShieldAlert;
  if (lane === 'attention') return AlertTriangle;
  if (lane === 'upcoming') return Clock3;
  return Sparkles;
}

function laneTone(lane: Studio2ActionLane): 'blocked' | 'attention' | 'info' | 'neutral' {
  if (lane === 'critical') return 'blocked';
  if (lane === 'attention') return 'attention';
  if (lane === 'upcoming') return 'info';
  return 'neutral';
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());
}

function formatWhen(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function errorText(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Action Center could not load its operational sources.';
}
