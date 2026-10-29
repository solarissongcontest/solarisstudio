import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  UserRound,
} from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { useOrganisationBackendContract } from "@/lib/organisation-backend-contract";
import { SolarisMorphingSelection } from "@/components/interaction/SolarisMorphingSelection";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { selectOrganizerEdition } from "@/lib/admin-edition-selection";
import {
  hasCompleteOrganizerTaskOperationalEvidence,
  resolveOrganizerTaskOperationalState,
  useOrganizerTasksV5,
  type OrganizerTaskClassification,
  type OrganizerTaskFilter,
  type OrganizerTaskOperationalState,
  type OrganizerTaskPriority,
  type OrganizerTaskV5,
} from "@/lib/admin-tasks-v5";
import { editionLabel as formatEditionLabel, useEditions } from "@/lib/data";

const FILTERS = [
  "all",
  "actionable",
  "blocked",
  "waiting",
  "failed",
  "overdue",
  "mine",
  "resolved",
] as const;

type OrganizerTaskViewFilter = (typeof FILTERS)[number];

type TasksSearch = {
  filter: OrganizerTaskViewFilter;
};

type ClassifiedTask = {
  task: OrganizerTaskV5;
  operationalState: OrganizerTaskClassification;
};

export const Route = createFileRoute("/_authenticated/admin/tasks")({
  validateSearch: (search: Record<string, unknown>): TasksSearch => ({
    filter: FILTERS.includes(search.filter as OrganizerTaskViewFilter)
      ? (search.filter as OrganizerTaskViewFilter)
      : "all",
  }),
  head: () => ({
    meta: [
      { title: "Tasks — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrganizerTasksPage,
});

function OrganizerTasksPage() {
  const { editionId } = useAdminContext();
  const { filter } = Route.useSearch();
  const navigate = Route.useNavigate();
  const editionsQuery = useEditions();
  const editions = editionsQuery.data ?? [];
  const edition = selectOrganizerEdition(editions, editionId);
  const resolvedEditionId = editionId && edition ? edition.id : "";
  const organizerEditionLabel = edition ? formatEditionLabel(edition) : null;
  const backend = useOrganisationBackendContract();
  const tasksSupported = backend.data?.capabilities.organizerTasks === true;
  const backendFilter = backendFilterForView(filter);
  const tasksQuery = useOrganizerTasksV5(
    resolvedEditionId || null,
    backendFilter,
    tasksSupported &&
      Boolean(resolvedEditionId) &&
      editionsQuery.isSuccess &&
      !editionsQuery.error,
  );
  const rawTasks = tasksQuery.data ?? [];
  const classifiedTasks: ClassifiedTask[] = rawTasks.map((task) => ({
    task,
    operationalState: resolveOrganizerTaskOperationalState(task),
  }));
  const tasks = classifiedTasks.filter((item) => matchesViewFilter(item, filter));
  const completeOperationalEvidence = hasCompleteOrganizerTaskOperationalEvidence(rawTasks);

  const metricsAvailable =
    Boolean(resolvedEditionId) &&
    editionsQuery.isSuccess &&
    !editionsQuery.error &&
    backend.isSuccess &&
    tasksSupported &&
    !tasksQuery.isLoading &&
    !tasksQuery.error;
  const richMetricsAvailable = metricsAvailable && completeOperationalEvidence;
  const actionable = richMetricsAvailable
    ? countOperationalState(classifiedTasks, "actionable")
    : null;
  const blocked = richMetricsAvailable
    ? countOperationalState(classifiedTasks, "blocked")
    : null;
  const waiting = metricsAvailable
    ? countOperationalState(classifiedTasks, "waiting")
    : null;
  const failed = richMetricsAvailable
    ? countOperationalState(classifiedTasks, "failed")
    : null;
  const overdue = richMetricsAvailable
    ? countOperationalState(classifiedTasks, "overdue")
    : null;
  const filterRequiresRichState =
    filter === "actionable" ||
    filter === "blocked" ||
    filter === "failed" ||
    filter === "overdue";
  const classificationUnavailable =
    filterRequiresRichState && metricsAvailable && !completeOperationalEvidence;

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-4">
        <AdminPageHeader
          eyebrow={organizerEditionLabel ? `${organizerEditionLabel} · Organizer work` : "Organizer · Work"}
          title="Tasks"
          description="One domain-backed queue for work that is genuinely unresolved. Reading a notification never completes a task; the authoritative source state does."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/inbox" className="admin-action-secondary">
                <BellRing className="size-4" />
                Notifications
              </Link>
            </div>
          }
        />

        {organizerEditionLabel ? (
          <div
            data-v3-organizer-context-lock="edition"
            className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2"
          >
            <span className="admin-section-label">Edition context</span>
            <AdminStatus tone="info">{organizerEditionLabel}</AdminStatus>
          </div>
        ) : null}

        {edition ? (
          <SolarisMorphingSelection
            value={filter}
            ariaLabel="Task filters"
            options={FILTERS.map((value) => ({
              value,
              label: filterLabel(value),
            }))}
            onChange={(next) => {
              if (!FILTERS.includes(next as OrganizerTaskViewFilter)) return;
              void navigate({
                search: { filter: next as OrganizerTaskViewFilter },
                replace: true,
              });
            }}
            className="border-white/[0.07] bg-white/[0.02]"
          />
        ) : null}

        {edition && filter !== "resolved" ? (
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5">
            <Metric label="Actionable" value={actionable} tone="info" />
            <Metric label="Blocked" value={blocked} tone="blocked" />
            <Metric label="Waiting" value={waiting} tone="info" />
            <Metric label="Failed" value={failed} tone="blocked" />
            <Metric label="Overdue" value={overdue} tone="attention" />
          </section>
        ) : null}

        {editionsQuery.isLoading ? (
          <AdminCard>
            <p className="py-12 text-center text-sm text-muted-foreground">
              Resolving Organizer edition context…
            </p>
          </AdminCard>
        ) : editionsQuery.error ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title="Edition context could not be resolved"
              description={
                editionsQuery.error instanceof Error
                  ? editionsQuery.error.message
                  : "Solaris could not verify the selected Organizer edition."
              }
            />
          </AdminCard>
        ) : !edition ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title="Choose an edition"
              description="Select an edition that is currently available to your Organizer account before evaluating Tasks. Solaris will not query task state for a missing, stale or inaccessible edition context."
            />
          </AdminCard>
        ) : backend.isLoading ? (
          <AdminCard>
            <p className="py-12 text-center text-sm text-muted-foreground">
              Verifying Organizer backend compatibility…
            </p>
          </AdminCard>
        ) : !tasksSupported ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title="Organizer Tasks backend update required"
              description="This frontend will not evaluate Tasks until the production database exposes the matching Organizer Task contract. No zero counts are inferred while task truth is unavailable."
            />
          </AdminCard>
        ) : tasksQuery.isLoading ? (
          <AdminCard>
            <p className="py-12 text-center text-sm text-muted-foreground">
              Evaluating authoritative task state…
            </p>
          </AdminCard>
        ) : tasksQuery.error ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title="Tasks could not be evaluated"
              description={
                tasksQuery.error instanceof Error
                  ? tasksQuery.error.message
                  : "The Organizer Task Engine could not complete this request."
              }
            />
          </AdminCard>
        ) : classificationUnavailable ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title={`${filterLabel(filter)} classification is not available yet`}
              description="At least one unresolved task does not expose canonical rich-state evidence. Solaris will not infer actionable, blocked, failed or overdue workflow state from priority, notification severity, due timestamps or the browser clock."
            />
          </AdminCard>
        ) : tasks.length ? (
          <AdminCard strong className="!p-0 overflow-hidden">
            <div className="p-4 sm:p-5">
              <AdminCardHeader
                eyebrow={filter === "resolved" ? "History" : "Canonical queue"}
                title={filterTitle(filter)}
                description={
                  filter === "resolved"
                    ? "Recently resolved task objects remain visible as operational history."
                    : "Tasks are deduplicated by source condition and disappear only when domain truth resolves them."
                }
                action={<AdminStatus tone="neutral">{tasks.length}</AdminStatus>}
              />
            </div>
            <div className="divide-y divide-white/[0.07] border-t border-white/[0.07]">
              {tasks.map(({ task, operationalState }) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  operationalState={operationalState}
                />
              ))}
            </div>
          </AdminCard>
        ) : (
          <AdminCard>
            <AdminEmptyState
              icon={filter === "resolved" ? CheckCircle2 : BellRing}
              title={emptyTitle(filter)}
              description={emptyDescription(filter)}
            />
          </AdminCard>
        )}

        {edition ? (
          <p className="px-1 text-[11px] leading-5 text-muted-foreground">
            Task state is derived from canonical domain evidence. Legacy waiting and resolved states remain authoritative; actionable, blocked, failed and overdue require explicit rich-state evidence from the task projection. Due timestamps are display metadata only and the browser clock never upgrades them into workflow truth. Priority is severity, not workflow state. There is intentionally no generic “Mark resolved” button.
          </p>
        ) : null}
      </div>
    </AdminPage>
  );
}

function TaskRow({
  task,
  operationalState,
}: {
  task: OrganizerTaskV5;
  operationalState: OrganizerTaskClassification;
}) {
  return (
    <Link
      to={task.href as any}
      className="group flex min-h-20 items-start gap-3 p-4 transition-colors hover:bg-white/[0.025] sm:p-5"
    >
      <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
        {operationalState === "waiting" ? (
          <Clock3 className="size-4 text-sky-100" />
        ) : operationalState === "resolved" ? (
          <CheckCircle2 className="size-4 text-emerald-200" />
        ) : operationalState === "blocked" ||
          operationalState === "failed" ||
          operationalState === "overdue" ? (
          <AlertTriangle className="size-4 text-amber-100" />
        ) : operationalState === "unclassified" ? (
          <AlertTriangle className="size-4 text-muted-foreground" />
        ) : task.assignedTo ? (
          <UserRound className="size-4 text-muted-foreground" />
        ) : (
          <BellRing className="size-4 text-muted-foreground" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{task.title}</span>
          <AdminStatus tone={taskTone(operationalState, task.priority)}>
            {operationalStateLabel(operationalState)}
          </AdminStatus>
          {operationalState !== "resolved" ? (
            <AdminStatus tone={priorityTone(task.priority)}>
              {humanize(task.priority)} priority
            </AdminStatus>
          ) : null}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {task.description}
        </span>
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <span>{humanize(task.sourceKind)}</span>
          {task.dueAt ? <span>Due {formatWhen(task.dueAt)}</span> : null}
          {task.assignedTo ? <span>Assigned</span> : null}
        </span>
      </span>

      <ArrowRight className="mt-3 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "ready" | "attention" | "blocked" | "info" | "neutral";
}) {
  return (
    <AdminCard className="!p-3 sm:!p-4">
      <p className="admin-section-label">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-2xl font-bold tabular-nums">{value == null ? "—" : value}</p>
        <AdminStatus tone={value == null ? "neutral" : value ? tone : "ready"}>
          {value == null ? "Unknown" : value ? "Active" : "Clear"}
        </AdminStatus>
      </div>
    </AdminCard>
  );
}

function backendFilterForView(filter: OrganizerTaskViewFilter): OrganizerTaskFilter {
  if (filter === "resolved") return "resolved";
  if (filter === "mine") return "mine";
  return "all";
}

function matchesViewFilter(item: ClassifiedTask, filter: OrganizerTaskViewFilter) {
  if (filter === "all" || filter === "mine" || filter === "resolved") return true;
  return item.operationalState === filter;
}

function countOperationalState(
  tasks: ClassifiedTask[],
  operationalState: OrganizerTaskOperationalState,
) {
  return tasks.filter((item) => item.operationalState === operationalState).length;
}

function taskTone(
  operationalState: OrganizerTaskClassification,
  priority: OrganizerTaskPriority,
) {
  if (operationalState === "unclassified") return "neutral" as const;
  if (operationalState === "resolved") return "ready" as const;
  if (operationalState === "blocked" || operationalState === "failed") {
    return "blocked" as const;
  }
  if (operationalState === "overdue") return "attention" as const;
  if (operationalState === "waiting") return "info" as const;
  if (priority === "critical" || priority === "high") return "attention" as const;
  return "neutral" as const;
}

function priorityTone(priority: OrganizerTaskPriority) {
  if (priority === "critical") return "attention" as const;
  if (priority === "high") return "info" as const;
  return "neutral" as const;
}

function operationalStateLabel(state: OrganizerTaskClassification) {
  if (state === "overdue") return "Overdue / expired";
  if (state === "unclassified") return "State unavailable";
  return humanize(state);
}

function filterLabel(filter: OrganizerTaskViewFilter) {
  if (filter === "all") return "All";
  if (filter === "mine") return "Mine";
  if (filter === "overdue") return "Overdue";
  return humanize(filter);
}

function filterTitle(filter: OrganizerTaskViewFilter) {
  if (filter === "mine") return "Assigned to me";
  if (filter === "actionable") return "Ready for action";
  if (filter === "blocked") return "Blocked tasks";
  if (filter === "waiting") return "Waiting tasks";
  if (filter === "failed") return "Failed tasks";
  if (filter === "overdue") return "Overdue or expired tasks";
  if (filter === "resolved") return "Resolved tasks";
  return "Unresolved tasks";
}

function emptyTitle(filter: OrganizerTaskViewFilter) {
  if (filter === "mine") return "Nothing is assigned to you";
  if (filter === "actionable") return "Nothing is ready for action";
  if (filter === "blocked") return "Nothing is blocked";
  if (filter === "waiting") return "Nothing is waiting";
  if (filter === "failed") return "No task is failed";
  if (filter === "overdue") return "Nothing is overdue";
  if (filter === "resolved") return "No resolved tasks yet";
  return "No unresolved task needs attention";
}

function emptyDescription(filter: OrganizerTaskViewFilter) {
  if (filter === "mine") return "Unassigned and team tasks remain available under All.";
  if (filter === "actionable") return "No canonical task is currently ready for an organizer action.";
  if (filter === "blocked") return "No canonical task is explicitly blocked.";
  if (filter === "waiting") return "No governed approval or dependency is currently waiting.";
  if (filter === "failed") return "No canonical task is explicitly in a failed operational state.";
  if (filter === "overdue") return "No canonical task is explicitly overdue or expired.";
  if (filter === "resolved") return "Resolved task history will appear here after domain conditions close.";
  return "The canonical task sources currently evaluate as resolved.";
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function formatWhen(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
