import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Command,
  Plus,
  Search,
  ShieldAlert,
  Siren,
  UserRoundCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from '@/components/admin/AdminUI';
import { selectOrganizerEdition } from '@/lib/admin-edition-selection';
import { useEditions } from '@/lib/data';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  type IncidentCategory,
  type IncidentSeverity,
  type IncidentStatus,
} from '@/lib/incident-command';
import {
  availableIncidentTransitions,
  buildIncidentCommandModel,
  filterStudio2Incidents,
  incidentSeverityLabel,
  incidentTimeline,
} from '@/lib/studio2-incidents';
import { isStudio2FeatureEnabled } from '@/lib/studio2-feature-flags';
import { studio2Persistence, type Studio2IncidentRecord } from '@/lib/studio2-persistence';
import { supabase } from '@/integrations/supabase/client';

const STATUS_SET = new Set<string>(INCIDENT_STATUSES);
const SEVERITY_SET = new Set<string>(INCIDENT_SEVERITIES);
const CATEGORY_SET = new Set<string>(INCIDENT_CATEGORIES);

type IncidentSearch = {
  status?: IncidentStatus | 'active';
  severity?: IncidentSeverity;
  category?: IncidentCategory;
  ack?: 'yes' | 'no';
  q?: string;
  incident?: string;
};

type IncidentCreateCommand = {
  editionId: string;
  editionLabel: string;
  title: string;
  severity: IncidentSeverity;
  category: IncidentCategory;
  description: string;
  affectedSystems: string[];
};

type PendingIncidentReview = {
  kind: 'crisis' | 'severity' | 'transition' | 'resolve';
  value?: string;
};

export const Route = createFileRoute('/_authenticated/admin/incidents')({
  head: () => ({ meta: [{ title: 'Incident Command — Solaris Organizer' }, { name: 'robots', content: 'noindex' }] }),
  validateSearch: (search: Record<string, unknown>): IncidentSearch => ({
    status: typeof search.status === 'string' && (search.status === 'active' || STATUS_SET.has(search.status))
      ? search.status as IncidentStatus | 'active'
      : undefined,
    severity: typeof search.severity === 'string' && SEVERITY_SET.has(search.severity)
      ? search.severity as IncidentSeverity
      : undefined,
    category: typeof search.category === 'string' && CATEGORY_SET.has(search.category)
      ? search.category as IncidentCategory
      : undefined,
    ack: search.ack === 'yes' || search.ack === 'no' ? search.ack : undefined,
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    incident: typeof search.incident === 'string' && search.incident ? search.incident : undefined,
  }),
  component: IncidentCommandRoute,
});

function IncidentCommandRoute() {
  const { editionId } = useAdminContext();
  return <IncidentCommandPage key={editionId || 'unscoped'} />;
}

function IncidentCommandPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const { editionId, editionLabel } = useAdminContext();
  const editionsQuery = useEditions();
  const editions = editionsQuery.data ?? [];
  const edition = selectOrganizerEdition(editions, editionId);
  const resolvedEditionId = edition?.id ?? '';
  const resolvedEditionLabel = editionLabel ?? edition?.name ?? 'Selected edition';

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('sev3');
  const [category, setCategory] = useState<IncidentCategory>('technical');
  const [description, setDescription] = useState('');
  const [systems, setSystems] = useState('');
  const [pendingCreateReview, setPendingCreateReview] = useState<IncidentCreateCommand | null>(null);

  const featureQuery = useQuery({
    queryKey: ['studio2-incident-command-flag', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId),
    queryFn: () => isStudio2FeatureEnabled('incident_command', resolvedEditionId),
    staleTime: 30_000,
  });

  const incidentsQuery = useQuery({
    queryKey: ['studio2-incidents-full', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId) && featureQuery.data === true,
    queryFn: () => studio2Persistence.listIncidents(resolvedEditionId),
    refetchInterval: 60_000,
  });

  const eventsQuery = useQuery({
    queryKey: ['studio2-incident-events', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId) && featureQuery.data === true,
    queryFn: () => studio2Persistence.listEditionEvents(resolvedEditionId, 200),
    refetchInterval: 60_000,
  });

  const invalidate = async () => {
    if (!resolvedEditionId) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['studio2-incidents-full', resolvedEditionId] }),
      qc.invalidateQueries({ queryKey: ['studio2-incident-events', resolvedEditionId] }),
      qc.invalidateQueries({ queryKey: ['studio2-control-room', resolvedEditionId] }),
    ]);
  };

  const createIncident = useMutation({
    mutationFn: (command: IncidentCreateCommand) => {
      if (
        !editionId ||
        !resolvedEditionId ||
        command.editionId !== editionId ||
        command.editionId !== resolvedEditionId
      ) {
        throw Object.assign(
          new Error('Edition context changed before the incident was opened. Reload Incident Command before retrying.'),
          { status: 409 },
        );
      }
      return studio2Persistence.createIncidentFull({
        editionId: command.editionId,
        title: command.title,
        severity: command.severity,
        category: command.category,
        description: command.description,
        affectedSystems: command.affectedSystems,
      });
    },
    onSuccess: async (incident) => {
      setPendingCreateReview(null);
      setTitle(''); setDescription(''); setSystems(''); setSeverity('sev3'); setCategory('technical'); setCreateOpen(false);
      await invalidate();
      void navigate({ search: { ...search, incident: incident.id }, replace: true });
    },
    onError: () => setPendingCreateReview(null),
  });

  const openIncident = () => {
    if (!resolvedEditionId || !editionId || !title.trim()) return;
    const command: IncidentCreateCommand = {
      editionId: resolvedEditionId,
      editionLabel: resolvedEditionLabel,
      title: title.trim(),
      severity,
      category,
      description: description.trim(),
      affectedSystems: parseSystems(systems),
    };
    if (severity === 'sev1') {
      setPendingCreateReview(command);
      return;
    }
    createIncident.mutate(command);
  };

  const model = useMemo(() => buildIncidentCommandModel(incidentsQuery.data ?? []), [incidentsQuery.data]);
  const filtered = useMemo(() => filterStudio2Incidents(model.incidents, {
    status: search.status,
    severity: search.severity,
    category: search.category,
    acknowledged: search.ack,
    q: search.q,
  }), [model.incidents, search]);
  const selected = model.incidents.find((incident) => incident.id === search.incident) ?? null;

  const patchSearch = (patch: Partial<IncidentSearch>) => void navigate({ search: { ...search, ...patch }, replace: true });
  const clearFilters = () => void navigate({ search: search.incident ? { incident: search.incident } : {}, replace: true });
  const loading = editionsQuery.isLoading || featureQuery.isLoading || incidentsQuery.isLoading || eventsQuery.isLoading;
  const error = editionsQuery.error || featureQuery.error || incidentsQuery.error || eventsQuery.error;

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2 · Operations"
          title="Incident Command"
          description="Open, acknowledge, command, escalate, document, resolve and reopen operational incidents with a persisted timeline and capability-checked server commands."
          actions={<button type="button" disabled={!edition} onClick={() => setCreateOpen((value) => !value)} className="admin-action-primary disabled:opacity-50"><Plus className="size-4" /> Open incident</button>}
        />

        {model.metrics.crisis > 0 ? (
          <div className="rounded-2xl border border-rose-300/30 bg-rose-300/[0.08] p-4 shadow-[0_0_40px_rgba(244,63,94,0.08)]">
            <div className="flex items-start gap-3">
              <Siren className="mt-0.5 size-6 shrink-0 text-rose-200" />
              <div>
                <p className="font-bold text-rose-50">Crisis mode active</p>
                <p className="mt-1 text-sm text-rose-100/75">At least one unresolved SEV-1 incident or explicitly declared crisis requires continuous organizer attention.</p>
              </div>
            </div>
          </div>
        ) : null}

        {!edition && !editionsQuery.isLoading ? (
          <AdminCard><AdminEmptyState icon={Command} title="Choose an edition" description="Select the edition in the Organizer toolbar before opening Incident Command. Solaris will not substitute the newest or globally active edition." /></AdminCard>
        ) : featureQuery.data === false ? (
          <AdminCard><AdminEmptyState icon={ShieldAlert} title="Incident Command is disabled" description="Enable Incident Command in Feature Rollout for this edition." /></AdminCard>
        ) : loading ? (
          <AdminCard><p className="py-12 text-center text-sm text-muted-foreground">Loading incident command state…</p></AdminCard>
        ) : error ? (
          <AdminCard><AdminEmptyState icon={AlertTriangle} title="Incident Command could not load" description={errorText(error)} /></AdminCard>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Active" value={model.metrics.active} tone={model.metrics.active ? 'info' : 'ready'} />
              <Metric label="SEV-1" value={model.metrics.critical} tone={model.metrics.critical ? 'blocked' : 'ready'} />
              <Metric label="Unacknowledged" value={model.metrics.unacknowledged} tone={model.metrics.unacknowledged ? 'attention' : 'ready'} />
              <Metric label="Crisis" value={model.metrics.crisis} tone={model.metrics.crisis ? 'blocked' : 'ready'} />
              <Metric label="Resolved" value={model.metrics.resolved} tone="ready" />
            </section>

            {createOpen ? (
              <AdminCard strong>
                <AdminCardHeader eyebrow="Open incident" title="Create operational incident" description="Use SEV-1 only for incidents that justify a persistent crisis warning in Control Room." />
                <div className="grid gap-3 lg:grid-cols-2">
                  <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input" placeholder="Concise incident title" /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Severity"><select value={severity} onChange={(e) => setSeverity(e.target.value as IncidentSeverity)} className="admin-input">{INCIDENT_SEVERITIES.map((item) => <option key={item} value={item}>{incidentSeverityLabel(item)}</option>)}</select></Field>
                    <Field label="Category"><select value={category} onChange={(e) => setCategory(e.target.value as IncidentCategory)} className="admin-input">{INCIDENT_CATEGORIES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</select></Field>
                  </div>
                  <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="admin-input min-h-24" placeholder="What happened, impact, and known scope" /></Field>
                  <Field label="Affected systems"><input value={systems} onChange={(e) => setSystems(e.target.value)} className="admin-input" placeholder="televote, results, broadcast" /><p className="mt-1 text-[11px] text-muted-foreground">Comma-separated operational systems.</p></Field>
                </div>
                {createIncident.error ? <p className="mt-3 text-sm text-rose-200">{errorText(createIncident.error)}</p> : null}
                <div className="mt-4 flex gap-2">
                  <button type="button" disabled={!title.trim() || createIncident.isPending} onClick={openIncident} className="admin-action-primary disabled:opacity-50">{severity === 'sev1' ? 'Review SEV-1 incident' : 'Open incident'}</button>
                  <button type="button" onClick={() => setCreateOpen(false)} className="admin-action-secondary">Cancel</button>
                </div>
              </AdminCard>
            ) : null}

            <AdminCard>
              <AdminCardHeader eyebrow="Command filters" title="Find incidents" action={hasFilters(search) ? <button type="button" onClick={clearFilters} className="admin-action-secondary !min-h-9 !px-3">Clear</button> : undefined} />
              <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
                <label className="relative block"><span className="sr-only">Search incidents</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search.q ?? ''} onChange={(e) => patchSearch({ q: e.target.value || undefined })} className="admin-input pl-9" placeholder="Search title, system, commander…" /></label>
                <FilterSelect label="Status" value={search.status ?? 'active'} onChange={(value) => patchSearch({ status: value === 'all' ? undefined : value as IncidentStatus | 'active' })} options={[['active', 'Active'], ...INCIDENT_STATUSES.map((item) => [item, humanize(item)] as [string, string]), ['all', 'All']]} />
                <FilterSelect label="Severity" value={search.severity ?? 'all'} onChange={(value) => patchSearch({ severity: value === 'all' ? undefined : value as IncidentSeverity })} options={[['all', 'All severities'], ...INCIDENT_SEVERITIES.map((item) => [item, incidentSeverityLabel(item)] as [string, string])]} />
                <FilterSelect label="Category" value={search.category ?? 'all'} onChange={(value) => patchSearch({ category: value === 'all' ? undefined : value as IncidentCategory })} options={[['all', 'All categories'], ...INCIDENT_CATEGORIES.map((item) => [item, humanize(item)] as [string, string])]} />
                <FilterSelect label="Acknowledged" value={search.ack ?? 'all'} onChange={(value) => patchSearch({ ack: value === 'all' ? undefined : value as 'yes' | 'no' })} options={[['all', 'Any acknowledgement'], ['no', 'Unacknowledged'], ['yes', 'Acknowledged']]} />
              </div>
            </AdminCard>

            <AdminCard strong>
              <AdminCardHeader eyebrow="Incident board" title={`${filtered.length} incident${filtered.length === 1 ? '' : 's'}`} description="Active incidents are prioritized by severity; resolved history remains available for postmortem and audit work." />
              {filtered.length ? <div className="space-y-2">{filtered.map((incident) => <IncidentRow key={incident.id} incident={incident} onOpen={() => patchSearch({ incident: incident.id })} />)}</div> : <AdminEmptyState icon={CheckCircle2} title="No matching incidents" description="The current filters contain no incidents." />}
            </AdminCard>
          </>
        )}
      </div>

      <AdminConfirmSheet
        open={Boolean(pendingCreateReview)}
        onClose={() => {
          if (!createIncident.isPending) setPendingCreateReview(null);
        }}
        onConfirm={async () => {
          if (!pendingCreateReview) return;
          await createIncident.mutateAsync(pendingCreateReview);
        }}
        title={pendingCreateReview ? `Open “${pendingCreateReview.title}” as SEV-1?` : 'Review SEV-1 incident'}
        description={pendingCreateReview ? (
          <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <p className="font-semibold text-foreground">{pendingCreateReview.editionLabel} · {pendingCreateReview.title}</p>
              <p className="mt-1">{incidentSeverityLabel(pendingCreateReview.severity)} · {humanize(pendingCreateReview.category)}</p>
              <p className="mt-1">Edition ID: <span className="font-mono text-foreground">{pendingCreateReview.editionId}</span></p>
              {pendingCreateReview.affectedSystems.length ? <p className="mt-2">Affected systems: {pendingCreateReview.affectedSystems.join(', ')}</p> : null}
            </div>
            <p>Opening an unresolved SEV-1 incident immediately activates crisis treatment in Incident Command and a persistent crisis warning in Control Room until the incident is resolved.</p>
            <p>The reviewed Edition and incident payload are frozen now. Solaris rechecks the shell Edition immediately before the server-authorized create and refuses the command if context changed.</p>
          </div>
        ) : null}
        confirmLabel="Open SEV-1 incident"
        confirmationText={pendingCreateReview?.title}
        confirmationHint={pendingCreateReview ? `Type ${pendingCreateReview.title} exactly to confirm this SEV-1 incident` : undefined}
        busy={createIncident.isPending}
        danger
      />

      <IncidentDetailSheet
        incident={selected}
        events={eventsQuery.data ?? []}
        editionId={resolvedEditionId}
        onClose={() => patchSearch({ incident: undefined })}
        onChanged={invalidate}
      />
    </AdminPage>
  );
}

function IncidentDetailSheet({ incident, events, editionId, onClose, onChanged }: {
  incident: Studio2IncidentRecord | null;
  events: Awaited<ReturnType<typeof studio2Persistence.listEditionEvents>>;
  editionId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [description, setDescription] = useState('');
  const [systems, setSystems] = useState('');
  const [resolution, setResolution] = useState('');
  const [postmortem, setPostmortem] = useState('');
  const [note, setNote] = useState('');
  const [pendingReview, setPendingReview] = useState<PendingIncidentReview | null>(null);

  useEffect(() => {
    setDescription(incident?.description ?? '');
    setSystems(incident?.affectedSystems.join(', ') ?? '');
    setResolution(incident?.resolution ?? '');
    setPostmortem(incident?.postmortem ?? '');
    setNote('');
    setPendingReview(null);
  }, [incident?.id, incident?.updatedAt]);

  const mutate = useMutation({
    mutationFn: async (action: { kind: string; value?: string }) => {
      if (!incident) return;
      if (!editionId || incident.editionId !== editionId) {
        throw Object.assign(
          new Error('Edition context changed before the incident command. Reload Incident Command before retrying.'),
          { status: 409 },
        );
      }
      if (action.kind === 'ack') await studio2Persistence.acknowledgeIncident(incident.id);
      else if (action.kind === 'crisis') await studio2Persistence.declareIncidentCrisis(incident.id);
      else if (action.kind === 'transition') await studio2Persistence.transitionIncident(incident.id, action.value as IncidentStatus);
      else if (action.kind === 'severity') await studio2Persistence.updateIncident({ id: incident.id, severity: action.value as IncidentSeverity });
      else if (action.kind === 'save') await studio2Persistence.updateIncident({ id: incident.id, description, affectedSystems: parseSystems(systems), resolution, postmortem });
      else if (action.kind === 'assign-me') {
        const { data } = await supabase.auth.getUser();
        if (!data.user) throw new Error('You must be signed in to become incident commander.');
        await studio2Persistence.updateIncident({ id: incident.id, commanderId: data.user.id, setCommander: true });
      } else if (action.kind === 'clear-commander') {
        await studio2Persistence.updateIncident({ id: incident.id, commanderId: null, setCommander: true });
      } else if (action.kind === 'note') {
        await studio2Persistence.addIncidentTimelineEvent(incident.id, note);
        setNote('');
      } else if (action.kind === 'resolve') {
        if (!resolution.trim()) throw new Error('Enter a resolution before resolving the incident.');
        await studio2Persistence.updateIncident({ id: incident.id, resolution });
        await studio2Persistence.transitionIncident(incident.id, 'resolved');
      }
    },
    onSuccess: async () => {
      setPendingReview(null);
      await onChanged();
    },
  });

  const timeline = incident ? incidentTimeline(events, incident.id) : [];
  const transitions = incident ? availableIncidentTransitions(incident.status) : [];
  const escalation = incident ? previousSeverity(incident.severity) : null;

  const applyReviewedCommand = async () => {
    if (!pendingReview || !incident) return;
    await mutate.mutateAsync(pendingReview);
  };

  const reviewTitle = pendingReview
    ? pendingReview.kind === 'crisis'
      ? `Enter crisis mode for “${incident?.title ?? 'incident'}”?`
      : pendingReview.kind === 'severity'
        ? `Escalate “${incident?.title ?? 'incident'}” to ${pendingReview.value?.toUpperCase() ?? 'a higher severity'}?`
        : pendingReview.kind === 'resolve'
          ? `Resolve “${incident?.title ?? 'incident'}”?`
          : `${incident?.status === 'resolved' ? 'Reopen' : 'Move'} “${incident?.title ?? 'incident'}” to ${humanize(pendingReview.value ?? '')}?`
    : 'Review incident command';

  return (
    <>
      <AdminSheet open={Boolean(incident)} onClose={onClose} title={incident?.title ?? 'Incident'} description={incident ? `${incidentSeverityLabel(incident.severity)} · ${humanize(incident.category)} · ${humanize(incident.status)}` : undefined}>
        {incident ? <div className="space-y-4">
          {incident.severity === 'sev1' || incident.crisisDeclaredAt ? <div className="rounded-xl border border-rose-300/25 bg-rose-300/[0.07] p-3"><div className="flex gap-2"><Siren className="size-5 text-rose-200" /><div><p className="text-sm font-bold text-rose-50">Crisis incident</p><p className="mt-1 text-xs text-rose-100/70">This incident remains prominent in Control Room until resolved.</p></div></div></div> : null}

          <div className="grid grid-cols-2 gap-2">
            <DetailMetric label="Opened" value={formatDateTime(incident.startedAt)} />
            <DetailMetric label="Acknowledged" value={incident.acknowledgedAt ? formatDateTime(incident.acknowledgedAt) : 'No'} />
            <DetailMetric label="Commander" value={incident.commanderId ?? 'Unassigned'} />
            <DetailMetric label="Edition" value={editionId || 'Unavailable'} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {!incident.acknowledgedAt ? <button type="button" disabled={mutate.isPending} onClick={() => mutate.mutate({ kind: 'ack' })} className="admin-action-secondary"><UserRoundCheck className="size-4" /> Acknowledge</button> : null}
            <button type="button" disabled={mutate.isPending} onClick={() => mutate.mutate({ kind: incident.commanderId ? 'clear-commander' : 'assign-me' })} className="admin-action-secondary">{incident.commanderId ? 'Clear commander' : 'Assign me commander'}</button>
            {!incident.crisisDeclaredAt && incident.status !== 'resolved' ? <button type="button" disabled={mutate.isPending} onClick={() => setPendingReview({ kind: 'crisis' })} className="admin-action-secondary text-rose-100"><Siren className="size-4" /> Review crisis mode</button> : null}
            {escalation && incident.status !== 'resolved' ? <button type="button" disabled={mutate.isPending} onClick={() => setPendingReview({ kind: 'severity', value: escalation })} className="admin-action-secondary"><CircleAlert className="size-4" /> Review escalation to {escalation.toUpperCase()}</button> : null}
          </div>

          <AdminCard>
            <AdminCardHeader eyebrow="Incident record" title="Scope and command notes" />
            <div className="space-y-3">
              <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="admin-input min-h-28" /></Field>
              <Field label="Affected systems"><input value={systems} onChange={(e) => setSystems(e.target.value)} className="admin-input" /></Field>
              <Field label="Resolution"><textarea value={resolution} onChange={(e) => setResolution(e.target.value)} className="admin-input min-h-20" placeholder="Required before resolving" /></Field>
              <Field label="Postmortem"><textarea value={postmortem} onChange={(e) => setPostmortem(e.target.value)} className="admin-input min-h-24" placeholder="Root cause, lessons and follow-up" /></Field>
              <button type="button" disabled={mutate.isPending} onClick={() => mutate.mutate({ kind: 'save' })} className="admin-action-primary">Save incident record</button>
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="Lifecycle" title="Incident state" description="State transitions are reviewed before they change the operational incident truth." />
            <div className="flex flex-wrap gap-2">
              {transitions.filter((status) => status !== 'resolved').map((status) => <button key={status} type="button" disabled={mutate.isPending} onClick={() => setPendingReview({ kind: 'transition', value: status })} className="admin-action-secondary">{incident.status === 'resolved' && status === 'monitoring' ? 'Review reopen to monitoring' : `Review move to ${humanize(status)}`}</button>)}
              {transitions.includes('resolved') ? <button type="button" disabled={mutate.isPending || !resolution.trim()} onClick={() => setPendingReview({ kind: 'resolve' })} className="admin-action-primary">Review resolution</button> : null}
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="Timeline" title="Operational history" description="Timeline notes become immutable contest events rather than being buried inside an editable description." />
            <div className="flex gap-2"><input value={note} onChange={(e) => setNote(e.target.value)} className="admin-input flex-1" placeholder="Add timeline update…" /><button type="button" disabled={!note.trim() || mutate.isPending} onClick={() => mutate.mutate({ kind: 'note' })} className="admin-action-secondary">Add</button></div>
            <div className="mt-3 space-y-2">
              {timeline.map((item) => <div key={item.id} className="flex gap-3 rounded-xl border border-white/[0.07] p-3"><Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="text-sm font-semibold">{item.message ?? humanize(item.action ?? item.type.replace('.', ' '))}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.occurredAt)}{item.actorUserId ? ` · ${item.actorUserId}` : ''}</p></div></div>)}
              {!timeline.length ? <p className="py-3 text-center text-xs text-muted-foreground">No incident events recorded yet.</p> : null}
            </div>
          </AdminCard>

          {mutate.error ? <p className="text-sm text-rose-200">{errorText(mutate.error)}</p> : null}
          <a href="/admin/control-room" className="admin-action-secondary flex w-full items-center justify-center gap-2">Open Control Room <ChevronRight className="size-4" /></a>
        </div> : null}
      </AdminSheet>

      <AdminConfirmSheet
        open={Boolean(incident && pendingReview)}
        onClose={() => {
          if (!mutate.isPending) setPendingReview(null);
        }}
        onConfirm={applyReviewedCommand}
        title={reviewTitle}
        description={incident && pendingReview ? (
          <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <p className="font-semibold text-foreground">{incident.title}</p>
              <p className="mt-1">Edition {editionId} · {incidentSeverityLabel(incident.severity)} · {humanize(incident.status)}</p>
              <p className="mt-1">Incident ID: <span className="font-mono text-foreground">{incident.id}</span></p>
            </div>
            {pendingReview.kind === 'crisis' ? (
              <p>Declaring crisis mode makes this incident persist as a prominent crisis warning in Control Room until the incident is resolved. This should represent an actual operational crisis, not routine escalation.</p>
            ) : pendingReview.kind === 'severity' ? (
              <p>Severity changes from <strong className="text-foreground">{incident.severity.toUpperCase()}</strong> to <strong className="text-foreground">{pendingReview.value?.toUpperCase()}</strong>. This changes prioritization and can activate crisis treatment when the target is SEV-1.</p>
            ) : pendingReview.kind === 'resolve' ? (
              <>
                <p>Resolving closes the active incident lifecycle and removes its unresolved crisis state from operational attention.</p>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                  <p className="font-semibold text-foreground">Resolution being recorded</p>
                  <p className="mt-2 whitespace-pre-wrap">{resolution.trim()}</p>
                </div>
                <p>The current implementation saves the resolution text immediately before the existing server-authorized resolved transition. This review does not invent atomic rollback semantics that the server contract does not provide.</p>
              </>
            ) : (
              <p>Status changes from <strong className="text-foreground">{humanize(incident.status)}</strong> to <strong className="text-foreground">{humanize(pendingReview.value ?? '')}</strong>. {incident.status === 'resolved' ? 'This reopens the incident into active operational monitoring.' : 'The incident remains active unless the reviewed target is resolved.'}</p>
            )}
          </div>
        ) : null}
        confirmLabel={pendingReview
          ? pendingReview.kind === 'crisis'
            ? 'Enter crisis mode'
            : pendingReview.kind === 'severity'
              ? `Escalate to ${pendingReview.value?.toUpperCase() ?? 'higher severity'}`
              : pendingReview.kind === 'resolve'
                ? 'Resolve incident'
                : incident?.status === 'resolved'
                  ? 'Reopen incident'
                  : `Move to ${humanize(pendingReview.value ?? '')}`
          : 'Confirm incident command'}
        confirmationText={pendingReview && (pendingReview.kind === 'crisis' || pendingReview.kind === 'resolve') ? incident?.title : undefined}
        confirmationHint={pendingReview && (pendingReview.kind === 'crisis' || pendingReview.kind === 'resolve') && incident ? `Type ${incident.title} exactly to confirm this incident command` : undefined}
        busy={mutate.isPending}
        confirmDisabled={pendingReview?.kind === 'resolve' && !resolution.trim()}
        danger={pendingReview?.kind === 'crisis' || pendingReview?.kind === 'resolve'}
      />
    </>
  );
}

function IncidentRow({ incident, onOpen }: { incident: Studio2IncidentRecord; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="grid w-full gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-left hover:bg-white/[0.045] md:grid-cols-[90px_minmax(0,2fr)_140px_120px_120px_30px] md:items-center">
    <AdminStatus tone={severityTone(incident.severity)}>{incident.severity.toUpperCase()}</AdminStatus>
    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{incident.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{incident.description || incident.affectedSystems.join(', ') || 'No description'}</span></span>
    <span className="text-xs font-semibold text-muted-foreground">{humanize(incident.category)}</span>
    <AdminStatus tone={incident.status === 'resolved' ? 'ready' : incident.status === 'mitigating' ? 'attention' : 'info'}>{humanize(incident.status)}</AdminStatus>
    <span className="text-xs text-muted-foreground">{incident.acknowledgedAt ? 'Acknowledged' : 'Unacknowledged'}</span>
    <ChevronRight className="hidden size-4 text-muted-foreground md:block" />
  </button>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'ready' | 'attention' | 'blocked' | 'info' }) { return <AdminCard><p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><div className="mt-2 flex items-center justify-between"><p className="text-2xl font-bold tabular-nums">{value}</p><AdminStatus tone={tone}>{value ? 'Active' : 'Clear'}</AdminStatus></div></AdminCard>; }
function DetailMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-1 break-all text-sm font-bold">{value}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>; }
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) { return <label><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="admin-input">{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>; }
function severityTone(severity: IncidentSeverity): 'blocked' | 'attention' | 'info' | 'neutral' { if (severity === 'sev1') return 'blocked'; if (severity === 'sev2') return 'attention'; if (severity === 'sev3') return 'info'; return 'neutral'; }
function previousSeverity(severity: IncidentSeverity): IncidentSeverity | null { const index = INCIDENT_SEVERITIES.indexOf(severity); return index > 0 ? INCIDENT_SEVERITIES[index - 1] : null; }
function parseSystems(value: string) { return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]; }
function hasFilters(search: IncidentSearch) { return Boolean(search.status || search.severity || search.category || search.ack || search.q); }
function humanize(value: string) { return value.replace(/[._-]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function errorText(error: unknown) { return error instanceof Error && error.message ? error.message : 'Incident Command operation failed.'; }
