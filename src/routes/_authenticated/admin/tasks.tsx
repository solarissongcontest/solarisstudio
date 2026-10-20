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
import {
  resolveOrganizerTaskOperationalState,
  useOrganizerTasksV5,
  type OrganizerTaskFilter,
  type OrganizerTaskOperationalState,
  type OrganizerTaskPriority,
  type OrganizerTaskV5,
} from "@/lib/admin-tasks-v5";
import {
  useOrganizerTasksV3,
  type OrganizerTaskV3Filter,
} from "@/lib/admin-tasks-v3";

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
  operationalState: OrganizerTaskOperationalState;
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
  const backend = useOrganisationBackendContract();
  const tasksSupported = backend.data?.capabilities.organizerTasks === true;
  const tasksV3Supported = backend.data?.capabilities.organizerTasksV3 === true;

  // Deployment-order compatibility is deliberate. A frontend deployed before
  // the migration continues to consume the exact-edition legacy projection; as
  // soon as the runtime advertises organizerTasksV3, canonical server-side task
  // classification becomes authoritative without requiring a flag-day deploy.
  const v3Query = useOrganizerTasksV3(
    editionId,
    filter as OrganizerTaskV3Filter,
    tasksSupported && tasksV3Supported,
  );
  const v5Query = useOrganizerTasksV5(
    editionId,
    backendFilterForView(filter),
    tasksSupported && !tasksV3Supported,
  );

  const rawTasks: OrganizerTaskV5[] = tasksV3Supported
    ? (v3Query.data?.items ?? [])
    : (v5Query.data ?? []);
  const evaluatedAt = tasksV3Supported
    ? Date.parse(v3Query.data?.serverTime ?? "") || Date.now()
    : v5Query.dataUpdatedAt || Date.now();
  const classifiedTasks: ClassifiedTask[] = rawTasks.map((task) => ({
    task,
    operationalState:
      tasksV3Supported && task.operationalState
        ? task.operationalState
        : resolveOrganizerTaskOperationalState(task, evaluatedAt),
  }));
  const tasks = classifiedTasks.filter((item) => matchesViewFilter(item, filter));
  const explicitOperationalEvidence =
    tasksV3Supported || rawTasks.some((task) => task.operationalState != null);

  const tasksLoading = tasksV3Supported ? v3Query.isLoading : v5Query.isLoading;
  const tasksError = tasksV3Supported ? v3Query.error : v5Query.error;
  const metricsAvailable =
    backend.isSuccess && tasksSupported && !tasksLoading && !tasksError;
  const v3Summary = tasksV3Supported ? v3Query.data?.summary : null;
  const actionable = metricsAvailable
    ? v3Summary
      ? v3Summary.actionable + v3Summary.inProgress
      : countOperationalStates(classifiedTasks, ["actionable", "in_progress"])
    : null;
  const blocked = metricsAvailable && explicitOperationalEvidence
    ? v3Summary?.blocked ?? countOperationalState(classifiedTasks, "blocked")
    : null;
  const waiting = metricsAvailable
    ? v3Summary?.waiting ?? countOperationalState(classifiedTasks, "waiting")
    : null;
  const failed = metricsAvailable && explicitOperationalEvidence
    ? v3Summary?.failed ?? countOperationalState(classifiedTasks, "failed")
    : null;
  const overdue = metricsAvailable
    ? v3Summary
      ? v3Summary.overdue + v3Summary.expired
      : countOperationalStates(classifiedTasks, ["overdue", "expired"])
    : null;
  const classificationUnavailable =
    !tasksV3Supported &&
    (filter === "blocked" || filter === "failed") &&
    metricsAvailable &&
    !explicitOperationalEvidence;

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-4">
        <AdminPageHeader
          eyebrow="Organizer · Work"
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

        {filter !== "resolved" ? (
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5 sm:gap-3">
            <Metric label="Actionable" value={actionable} tone="info" />
            <Metric label="Blocked" value={blocked} tone="blocked" />
            <Metric label="Waiting" value={waiting} tone="info" />
            <Metric label="Failed" value={failed} tone="blocked" />
            <Metric label="Overdue" value={overdue} tone="attention" />
          </section>
        ) : null}

        {backend.isLoading ? (
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
        ) : tasksLoading ? (
          <AdminCard>
            <p className="py-12 text-center text-sm text-muted-foreground">
              Evaluating authoritative task state…
            </p>
          </AdminCard>
        ) : tasksError ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title="Tasks could not be evaluated"
              description={
                tasksError instanceof Error
                  ? tasksError.message
                  : "The Organizer Task Engine could not complete this request."
              }
            />
          </AdminCard>
        ) : classificationUnavailable ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title={`${filterLabel(filter)} classification is not available yet`}
              description="The compatibility Organizer Task payload does not expose explicit blocked/failed evidence. Solaris will not infer workflow state from priority, title text or notification severity."
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
                    ? "Resolved task objects remain available as operational history."
                    : "Tasks are deduplicated by source condition and disappear only when domain truth resolves, expires or supersedes them."
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

        <p className="px-1 text-[11px] leading-5 text-muted-foreground">
          Task state is reconciled from canonical confirmation, entry, media, voting, results, integration, incident, approval and system state. V3 classifies workflow state server-side; priority remains severity rather than workflow truth. There is intentionally no generic “Mark resolved” button.
        </p>
      </div>
    </AdminPage>
  );
}

function TaskRow({
  task,
  operationalState,
}: {
  task: OrganizerTaskV5;
  operationalState: OrganizerTaskOperationalState;
}) {
  const terminal = isTerminalTaskState(operationalState);
  return (
    <Link
      to={task.href as any}
      className="group flex min-h-20 items-start gap-3 p-4 transition-colors hover:bg-white/[0.025] sm:p-5"
    >
      <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
        {operationalState === "waiting" || operationalState === "in_progress" ? (
          <Clock3 className="size-4 text-sky-100" />
        ) : operationalState === "resolved" || operationalState === "superseded" ? (
          <CheckCircle2 className="size-4 text-emerald-200" />
        ) : operationalState === "blocked" ||
          operationalState === "failed" ||
          operationalState === "overdue" ||
          operationalState === "expired" ? (
          <AlertTriangle className="size-4 text-amber-100" />
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
          {!terminal ? (
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
  if (filter === "actionable") {
    return item.operationalState === "actionable" || item.operationalState === "in_progress";
  }
  if (filter === "overdue") {
    return item.operationalState === "overdue" || item.operationalState === "expired";
  }
  return item.operationalState === filter;
}

function countOperationalState(
  tasks: ClassifiedTask[],
  operationalState: OrganizerTaskOperationalState,
) {
  return tasks.filter((item) => item.operationalState === operationalState).length;
}

function countOperationalStates(
  tasks: ClassifiedTask[],
  states: readonly OrganizerTaskOperationalState[],
) {
  const accepted = new Set(states);
  return tasks.filter((item) => accepted.has(item.operationalState)).length;
}

function isTerminalTaskState(state: OrganizerTaskOperationalState) {
  return state === "resolved" || state === "expired" || state === "superseded";
}

function taskTone(
  operationalState: OrganizerTaskOperationalState,
  priority: OrganizerTaskPriority,
) {
  if (operationalState === "resolved" || operationalState === "superseded") {
    return "ready" as const;
  }
  if (operationalState === "blocked" || operationalState === "failed") {
    return "blocked" as const;
  }
  if (operationalState === "overdue" || operationalState === "expired") {
    return "attention" as const;
  }
  if (operationalState === "waiting" || operationalState === "in_progress") {
    return "info" as const;
  }
  if (priority === "critical" || priority === "high") return "attention" as const;
  return "neutral" as const;
}

function priorityTone(priority: OrganizerTaskPriority) {
  if (priority === "critical") return "attention" as const;
  if (priority === "high") return "info" as const;
  return "neutral" as const;
}

function operationalStateLabel(state: OrganizerTaskOperationalState) {
  if (state === "in_progress") return "In progress";
  if (state === "overdue") return "Overdue";
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
  if (filter === "overdue") return "No unresolved task is overdue or canonically expired.";
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
