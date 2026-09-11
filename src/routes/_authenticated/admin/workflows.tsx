import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  GitBranch,
  ListChecks,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useMemo } from 'react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminProgress,
  AdminSheet,
  AdminStatus,
} from '@/components/admin/AdminUI';
import { useAdminDeadlines } from '@/lib/admin-ops';
import { useCountries, useEditions, useParticipants, useShows } from '@/lib/data';
import { defaultSubsystemStatesForEdition, normalizeLegacyEditionStatus } from '@/lib/edition-state';
import { studio2ControlRoom } from '@/lib/studio2-control-room';
import { isStudio2FeatureEnabled } from '@/lib/studio2-feature-flags';
import {
  buildStudio2TaskBoard,
  buildStudio2WorkflowModel,
  filterStudio2Workflows,
  STUDIO2_WORKFLOW_KINDS,
  STUDIO2_WORKFLOW_OWNERS,
  STUDIO2_WORKFLOW_STATUSES,
  type Studio2TaskBoardItem,
  type Studio2WorkflowInstance,
  type Studio2WorkflowKind,
  type Studio2WorkflowOwner,
  type Studio2WorkflowStatus,
} from '@/lib/studio2-workflows';

const KIND_SET = new Set<string>(STUDIO2_WORKFLOW_KINDS);
const STATUS_SET = new Set<string>(STUDIO2_WORKFLOW_STATUSES);
const OWNER_SET = new Set<string>(STUDIO2_WORKFLOW_OWNERS);

type WorkflowSearch = {
  status?: Studio2WorkflowStatus;
  kind?: Studio2WorkflowKind;
  owner?: Studio2WorkflowOwner;
  country?: string;
  q?: string;
  workflow?: string;
};

export const Route = createFileRoute('/_authenticated/admin/workflows')({
  head: () => ({
    meta: [
      { title: 'Workflows — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): WorkflowSearch => ({
    status: typeof search.status === 'string' && STATUS_SET.has(search.status)
      ? search.status as Studio2WorkflowStatus
      : undefined,
    kind: typeof search.kind === 'string' && KIND_SET.has(search.kind)
      ? search.kind as Studio2WorkflowKind
      : undefined,
    owner: typeof search.owner === 'string' && OWNER_SET.has(search.owner)
      ? search.owner as Studio2WorkflowOwner
      : undefined,
    country: typeof search.country === 'string' && search.country ? search.country : undefined,
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    workflow: typeof search.workflow === 'string' && search.workflow ? search.workflow : undefined,
  }),
  component: WorkflowsPage,
});

function WorkflowsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { editionId } = useAdminContext();
  const editionsQuery = useEditions();
  const countriesQuery = useCountries();
  const editions = editionsQuery.data ?? [];
  const selectedEdition = editions.find((edition) => edition.id === editionId)
    ?? [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0]
    ?? null;
  const resolvedEditionId = selectedEdition?.id ?? '';

  const participantsQuery = useParticipants(resolvedEditionId || undefined);
  const showsQuery = useShows(resolvedEditionId || undefined);
  const deadlinesQuery = useAdminDeadlines(resolvedEditionId || null);

  const featureQuery = useQuery({
    queryKey: ['studio2-workflow-flags', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId),
    queryFn: async () => {
      const [workflowEngine, controlRoom] = await Promise.all([
        isStudio2FeatureEnabled('workflow_engine', resolvedEditionId),
        isStudio2FeatureEnabled('live_control_room', resolvedEditionId),
      ]);
      return { workflowEngine, controlRoom };
    },
    staleTime: 30_000,
  });

  const snapshotQuery = useQuery({
    queryKey: ['studio2-workflow-runtime', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId) && featureQuery.data?.controlRoom === true,
    queryFn: () => studio2ControlRoom.loadSnapshot(resolvedEditionId, 100),
    refetchInterval: 20_000,
  });

  const runtime = useMemo(() => {
    if (snapshotQuery.data?.runtime.runtime) return snapshotQuery.data.runtime.runtime;
    if (!selectedEdition) return null;
    const state = normalizeLegacyEditionStatus(selectedEdition.status);
    return { edition: state, subsystems: defaultSubsystemStatesForEdition(state) };
  }, [selectedEdition, snapshotQuery.data]);

  const model = useMemo(() => {
    if (!selectedEdition || !runtime) return null;
    return buildStudio2WorkflowModel({
      edition: selectedEdition,
      participants: participantsQuery.data ?? [],
      shows: showsQuery.data ?? [],
      countries: countriesQuery.data ?? [],
      runtime,
      deadlines: deadlinesQuery.data ?? [],
      events: snapshotQuery.data?.recentEvents ?? [],
    });
  }, [
    countriesQuery.data,
    deadlinesQuery.data,
    participantsQuery.data,
    runtime,
    selectedEdition,
    showsQuery.data,
    snapshotQuery.data?.recentEvents,
  ]);

  const filtered = useMemo(() => model ? filterStudio2Workflows(model.workflows, {
    status: search.status,
    kind: search.kind,
    owner: search.owner,
    countryId: search.country,
    q: search.q,
  }) : [], [model, search.country, search.kind, search.owner, search.q, search.status]);

  const taskBoard = useMemo(() => buildStudio2TaskBoard(filtered), [filtered]);
  const selectedWorkflow = model?.workflows.find((workflow) => workflow.id === search.workflow) ?? null;
  const countriesInWorkflows = useMemo(() => {
    if (!model) return [];
    const names = new Map<string, string>();
    for (const workflow of model.workflows) {
      if (workflow.countryId && workflow.countryName) names.set(workflow.countryId, workflow.countryName);
    }
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [model]);

  const patchSearch = (patch: Partial<WorkflowSearch>) => {
    void navigate({ search: { ...search, ...patch }, replace: true });
  };

  const clearFilters = () => {
    void navigate({ search: search.workflow ? { workflow: search.workflow } : {}, replace: true });
  };

  const loading = editionsQuery.isLoading
    || countriesQuery.isLoading
    || participantsQuery.isLoading
    || showsQuery.isLoading
    || deadlinesQuery.isLoading
    || featureQuery.isLoading
    || (featureQuery.data?.controlRoom === true && snapshotQuery.isLoading);
  const error = editionsQuery.error
    || countriesQuery.error
    || participantsQuery.error
    || showsQuery.error
    || deadlinesQuery.error
    || featureQuery.error
    || snapshotQuery.error;

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2 · Operations"
          title="Workflows"
          description="Operational workflow state derived from canonical contest data and evaluated by the shared Workflow Engine. Automations may recommend work; irreversible actions stay explicit."
          actions={
            <a href="/admin/action-center" className="admin-action-secondary">
              Open Action Center
            </a>
          }
        />

        {!selectedEdition && !editionsQuery.isLoading ? (
          <AdminCard>
            <AdminEmptyState
              icon={GitBranch}
              title="No edition selected"
              description="Select an edition before Studio 2 can derive operational workflows."
            />
          </AdminCard>
        ) : featureQuery.data && !featureQuery.data.workflowEngine ? (
          <AdminCard>
            <AdminEmptyState
              icon={ShieldAlert}
              title="Workflow Engine is disabled"
              description="Enable Workflow Engine from Feature Rollout before using the organizer workflow queue."
            />
          </AdminCard>
        ) : loading ? (
          <AdminCard>
            <p className="py-12 text-center text-sm text-muted-foreground">Evaluating workflow dependencies…</p>
          </AdminCard>
        ) : error ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title="Workflows could not load"
              description={errorText(error)}
            />
          </AdminCard>
        ) : model ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <Metric label="All" value={model.metrics.total} tone="neutral" />
              <Metric label="Open" value={model.metrics.open} tone={model.metrics.open ? 'info' : 'ready'} />
              <Metric label="Blocked" value={model.metrics.blocked} tone={model.metrics.blocked ? 'blocked' : 'ready'} />
              <Metric label="Ready" value={model.metrics.ready} tone={model.metrics.ready ? 'attention' : 'ready'} />
              <Metric label="Completed" value={model.metrics.completed} tone="ready" />
              <Metric label="Overdue" value={model.metrics.overdue} tone={model.metrics.overdue ? 'blocked' : 'ready'} />
            </section>

            <AdminCard>
              <AdminCardHeader
                eyebrow="Active workflows"
                title="Operational flow"
                description="The current edition stage drives confirmation, submission, jury, broadcast, verification and publication work. Entry and show workflows stay attached to their canonical records."
              />
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {filtered.filter((workflow) => workflow.status !== 'completed').slice(0, 9).map((workflow) => (
                  <button
                    key={workflow.id}
                    type="button"
                    onClick={() => patchSearch({ workflow: workflow.id })}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-left hover:bg-white/[0.045]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{workflow.kindLabel}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{workflow.entityLabel}</p>
                      </div>
                      <AdminStatus tone={workflowTone(workflow.status)}>{humanize(workflow.status)}</AdminStatus>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Stage: {workflow.currentStage}</p>
                    {workflow.dueAt ? <p className="mt-1 text-[11px] text-muted-foreground">Due {formatDateTime(workflow.dueAt)}</p> : null}
                  </button>
                ))}
              </div>
            </AdminCard>

            <AdminCard>
              <AdminCardHeader
                eyebrow="Queue controls"
                title="Filter operational workflows"
                description="Filters are URL-driven, so reload, browser history and shared links preserve the operator view."
                action={hasFilters(search) ? (
                  <button type="button" onClick={clearFilters} className="admin-action-secondary !min-h-9 !px-3">
                    Clear filters
                  </button>
                ) : undefined}
              />
              <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
                <label className="relative block">
                  <span className="sr-only">Search workflows</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search.q ?? ''}
                    onChange={(event) => patchSearch({ q: event.target.value || undefined })}
                    placeholder="Search workflow, country or task…"
                    className="min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] pl-9 pr-3 text-sm outline-none focus:border-sky-200/30"
                  />
                </label>
                <FilterSelect
                  label="Status"
                  value={search.status ?? 'all'}
                  onChange={(value) => patchSearch({ status: value === 'all' ? undefined : value as Studio2WorkflowStatus })}
                  options={[
                    ['all', 'All statuses'],
                    ['blocked', 'Blocked'],
                    ['ready', 'Ready'],
                    ['in_progress', 'In progress'],
                    ['completed', 'Completed'],
                  ]}
                />
                <FilterSelect
                  label="Type"
                  value={search.kind ?? 'all'}
                  onChange={(value) => patchSearch({ kind: value === 'all' ? undefined : value as Studio2WorkflowKind })}
                  options={[
                    ['all', 'All types'],
                    ['edition', 'Edition'],
                    ['entry', 'Entry'],
                    ['show', 'Show'],
                  ]}
                />
                <FilterSelect
                  label="Owner"
                  value={search.owner ?? 'all'}
                  onChange={(value) => patchSearch({ owner: value === 'all' ? undefined : value as Studio2WorkflowOwner })}
                  options={[
                    ['all', 'All owners'],
                    ['organizer', 'Organizer'],
                    ['delegation', 'Delegation'],
                  ]}
                />
                <FilterSelect
                  label="Country"
                  value={search.country ?? 'all'}
                  onChange={(value) => patchSearch({ country: value === 'all' ? undefined : value })}
                  options={[
                    ['all', 'All countries'],
                    ...countriesInWorkflows,
                  ]}
                />
              </div>
            </AdminCard>

            <AdminCard strong>
              <AdminCardHeader
                eyebrow="Operational queue"
                title={`${filtered.length} workflow${filtered.length === 1 ? '' : 's'}`}
                description="Blocked work is sorted first. Open a workflow to inspect trigger, stage, dependencies, ownership, due time, history, failure reason and safe next actions."
              />
              {filtered.length ? (
                <div className="overflow-hidden rounded-xl border border-white/[0.08]">
                  <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_110px_100px_90px_30px] gap-3 border-b border-white/[0.08] bg-white/[0.025] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground lg:grid">
                    <span>Workflow</span><span>Entity</span><span>Status</span><span>Owner</span><span>Progress</span><span />
                  </div>
                  <div className="divide-y divide-white/[0.07]">
                    {filtered.map((workflow) => (
                      <button
                        key={workflow.id}
                        type="button"
                        onClick={() => patchSearch({ workflow: workflow.id })}
                        className="grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.035] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_110px_100px_90px_30px] lg:items-center"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-foreground">{workflow.title}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">{workflow.kindLabel} · {workflow.tasks.length} tasks</span>
                        </span>
                        <span className="min-w-0 truncate text-sm text-muted-foreground">{workflow.entityLabel}</span>
                        <span><AdminStatus tone={workflowTone(workflow.status)}>{humanize(workflow.status)}</AdminStatus></span>
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{workflow.owner}</span>
                        <span className="min-w-20">
                          <span className="mb-1 block text-xs tabular-nums text-muted-foreground">{workflow.progress}%</span>
                          <AdminProgress value={workflow.progress} />
                        </span>
                        <ChevronRight className="hidden size-4 text-muted-foreground lg:block" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <AdminEmptyState icon={ListChecks} title="No workflows match these filters" description="Clear or change the filters to return to the operational queue." />
              )}
            </AdminCard>

            <AdminCard>
              <AdminCardHeader
                eyebrow="Task board"
                title="Execution state"
                description="Tasks are grouped after dependency evaluation. Pending means ready to be picked up; blocked tasks show unmet dependencies in workflow detail."
              />
              <div className="grid gap-3 lg:grid-cols-4">
                <TaskColumn title="Pending" items={taskBoard.pending} tone="attention" onOpen={(id) => patchSearch({ workflow: id })} />
                <TaskColumn title="In progress" items={taskBoard.inProgress} tone="info" onOpen={(id) => patchSearch({ workflow: id })} />
                <TaskColumn title="Blocked" items={taskBoard.blocked} tone="blocked" onOpen={(id) => patchSearch({ workflow: id })} />
                <TaskColumn title="Completed" items={taskBoard.completed} tone="ready" onOpen={(id) => patchSearch({ workflow: id })} />
              </div>
            </AdminCard>

            <AdminCard>
              <AdminCardHeader
                eyebrow="Automations"
                title="Safe recommendations"
                description="Automation can create or recommend work. It never silently publishes results or performs another irreversible contest action."
              />
              {model.automations.length ? (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {model.automations.map((automation) => (
                    <a key={automation.id} href={automation.href} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 hover:bg-white/[0.045]">
                      <div className="flex items-start gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-sky-200/10 bg-sky-200/[0.06] text-sky-100"><Sparkles className="size-4" /></span>
                        <span>
                          <span className="block text-sm font-semibold">{automation.title}</span>
                          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{automation.description}</span>
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No automation recommendations are active for the current edition state.</p>
              )}
            </AdminCard>

            {featureQuery.data?.controlRoom === false ? (
              <AdminCard>
                <div className="flex items-start gap-3">
                  <CircleDot className="mt-0.5 size-5 shrink-0 text-sky-200" />
                  <div>
                    <p className="text-sm font-semibold">Compatibility runtime in use</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Live Control Room is disabled, so lifecycle state is derived from the legacy edition status. Entry, show and deadline data still comes from canonical records.</p>
                  </div>
                </div>
              </AdminCard>
            ) : null}
          </>
        ) : null}
      </div>

      <WorkflowDetailSheet workflow={selectedWorkflow} onClose={() => patchSearch({ workflow: undefined })} />
    </AdminPage>
  );
}

function WorkflowDetailSheet({ workflow, onClose }: { workflow: Studio2WorkflowInstance | null; onClose: () => void }) {
  return (
    <AdminSheet
      open={Boolean(workflow)}
      onClose={onClose}
      title={workflow?.title ?? 'Workflow'}
      description={workflow ? `${workflow.entityLabel} · ${workflow.kindLabel}` : undefined}
    >
      {workflow ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <DetailMetric label="Status" value={humanize(workflow.status)} />
            <DetailMetric label="Current stage" value={workflow.currentStage} />
            <DetailMetric label="Assigned role" value={workflow.assignedRole} />
            <DetailMetric label="Due" value={workflow.dueAt ? formatDateTime(workflow.dueAt) : 'No deadline'} />
          </div>

          <AdminCard>
            <AdminCardHeader eyebrow="Trigger" title="Why this workflow exists" />
            <p className="text-sm leading-relaxed text-muted-foreground">{workflow.trigger}</p>
          </AdminCard>

          {workflow.failureReason ? (
            <div className="rounded-xl border border-amber-200/20 bg-amber-200/[0.06] p-3">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-amber-100">Failure / blocker reason</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-50/80">{workflow.failureReason}</p>
            </div>
          ) : null}

          <AdminCard>
            <AdminCardHeader eyebrow="Dependencies" title="Tasks" description="Effective status comes from the shared Workflow Engine after dependency evaluation." />
            <div className="space-y-2">
              {workflow.tasks.map((task) => (
                <div key={task.id} className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{task.label}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{task.id}</p>
                    </div>
                    <AdminStatus tone={taskTone(task.effectiveStatus)}>{humanize(task.effectiveStatus)}</AdminStatus>
                  </div>
                  {task.blockers.length ? <p className="mt-2 text-xs text-amber-100/80">Waiting for {task.blockers.join(', ')}</p> : null}
                  {task.dueAt ? <p className="mt-1 text-[11px] text-muted-foreground">Due {formatDateTime(task.dueAt)}</p> : null}
                </div>
              ))}
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="History" title="Recent workflow events" />
            {workflow.history.length ? (
              <div className="space-y-2">
                {workflow.history.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 rounded-xl border border-white/[0.07] p-3">
                    <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-semibold">{humanize(event.type.replace('.', ' '))}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(event.occurredAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No matching persisted events are available for this workflow yet.</p>}
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="Available actions" title="Continue in authoritative tools" />
            <div className="space-y-2">
              {workflow.availableActions.map((action) => (
                <a key={`${action.label}:${action.href}`} href={action.href} className="admin-action-row flex w-full items-center gap-3">
                  <span className="min-w-0 flex-1 text-sm font-semibold">{action.label}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </a>
              ))}
            </div>
          </AdminCard>

          <p className="text-xs leading-relaxed text-muted-foreground">Workflow state is derived from authoritative edition, entry, show, deadline and event data. The workflow UI does not create a second copy of contest truth.</p>
        </div>
      ) : null}
    </AdminSheet>
  );
}

function TaskColumn({ title, items, tone, onOpen }: {
  title: string;
  items: Studio2TaskBoardItem[];
  tone: 'ready' | 'attention' | 'blocked' | 'info';
  onOpen: (workflowId: string) => void;
}) {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-black/10 p-3">
      <div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm font-bold">{title}</p><AdminStatus tone={tone}>{items.length}</AdminStatus></div>
      <div className="space-y-2">
        {items.slice(0, 10).map((item) => (
          <button key={item.id} type="button" onClick={() => onOpen(item.workflowId)} className="w-full rounded-lg border border-white/[0.06] bg-white/[0.025] p-2.5 text-left hover:bg-white/[0.045]">
            <p className="text-xs font-semibold leading-snug">{item.label}</p>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">{item.workflowTitle}</p>
            {item.dueAt ? <p className={`mt-1 text-[10px] ${item.overdue ? 'text-rose-200' : 'text-muted-foreground'}`}>{item.overdue ? 'Overdue · ' : 'Due '}{formatDateTime(item.dueAt)}</p> : null}
          </button>
        ))}
        {!items.length ? <p className="py-4 text-center text-xs text-muted-foreground">No tasks</p> : null}
      </div>
    </section>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/[0.1] bg-[#081326] px-3 text-sm outline-none focus:border-sky-200/30">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'ready' | 'attention' | 'blocked' | 'info' | 'neutral' }) {
  return (
    <AdminCard>
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <AdminStatus tone={tone}>{tone === 'ready' ? 'Clear' : tone === 'blocked' ? 'Critical' : tone === 'attention' ? 'Ready' : tone === 'info' ? 'Open' : 'Total'}</AdminStatus>
      </div>
    </AdminCard>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div>;
}

function workflowTone(status: Studio2WorkflowStatus): 'ready' | 'attention' | 'blocked' | 'info' | 'neutral' {
  if (status === 'completed') return 'ready';
  if (status === 'blocked') return 'blocked';
  if (status === 'ready') return 'attention';
  return 'info';
}

function taskTone(status: string): 'ready' | 'attention' | 'blocked' | 'info' | 'neutral' {
  if (status === 'completed' || status === 'cancelled') return 'ready';
  if (status === 'blocked') return 'blocked';
  if (status === 'ready') return 'attention';
  return 'info';
}

function hasFilters(search: WorkflowSearch) { return Boolean(search.status || search.kind || search.owner || search.country || search.q); }
function humanize(value: string) { return value.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase()); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function errorText(error: unknown) { return error instanceof Error && error.message ? error.message : 'Studio 2 could not evaluate the workflow queue.'; }
