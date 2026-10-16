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
  useOrganizerTasksV5,
  type OrganizerTaskFilter,
  type OrganizerTaskV5,
} from "@/lib/admin-tasks-v5";
import {
  ORGANIZER_TASK_DOMAINS,
  organizerTaskDomain,
  type OrganizerTaskDomain,
} from "@/lib/v3-organizer-task-domain";

const FILTERS = ["all", "mine", "waiting", "resolved"] as const;
const DOMAINS = ["all", ...ORGANIZER_TASK_DOMAINS] as const;

type OrganizerTaskDomainFilter = "all" | OrganizerTaskDomain;

type TasksSearch = {
  filter: OrganizerTaskFilter;
  domain: OrganizerTaskDomainFilter;
};

export const Route = createFileRoute("/_authenticated/admin/tasks")({
  validateSearch: (search: Record<string, unknown>): TasksSearch => ({
    filter: FILTERS.includes(search.filter as OrganizerTaskFilter)
      ? (search.filter as OrganizerTaskFilter)
      : "all",
    domain: DOMAINS.includes(search.domain as OrganizerTaskDomainFilter)
      ? (search.domain as OrganizerTaskDomainFilter)
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
  const { filter, domain } = Route.useSearch();
  const navigate = Route.useNavigate();
  const backend = useOrganisationBackendContract();
  const tasksSupported = backend.data?.capabilities.organizerTasks === true;
  const tasksQuery = useOrganizerTasksV5(
    editionId,
    filter,
    tasksSupported && Boolean(editionId),
  );
  const tasks = tasksQuery.data ?? [];
  const visibleTasks =
    domain === "all" ? tasks : tasks.filter((task) => organizerTaskDomain(task) === domain);

  const metricsAvailable =
    Boolean(editionId) &&
    backend.isSuccess &&
    tasksSupported &&
    !tasksQuery.isLoading &&
    !tasksQuery.error;
  const critical = metricsAvailable
    ? visibleTasks.filter((task) => task.priority === "critical").length
    : null;
  const high = metricsAvailable
    ? visibleTasks.filter((task) => task.priority === "high").length
    : null;
  const waiting = metricsAvailable
    ? visibleTasks.filter((task) => task.state === "waiting").length
    : null;

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-4" data-v3-organizer-tasks="">
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
          ariaLabel="Task state filters"
          options={FILTERS.map((value) => ({
            value,
            label: filterLabel(value),
          }))}
          onChange={(next) => {
            if (!FILTERS.includes(next as OrganizerTaskFilter)) return;
            void navigate({
              search: (previous) => ({
                ...previous,
                filter: next as OrganizerTaskFilter,
              }),
              replace: true,
            });
          }}
          className="border-white/[0.07] bg-white/[0.02]"
        />

        <AdminCard className="!p-3 sm:!p-4">
          <label className="block">
            <span className="admin-section-label">Operational domain</span>
            <select
              value={domain}
              onChange={(event) => {
                const next = event.target.value as OrganizerTaskDomainFilter;
                if (!DOMAINS.includes(next)) return;
                void navigate({
                  search: (previous) => ({ ...previous, domain: next }),
                  replace: true,
                });
              }}
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            >
              {DOMAINS.map((value) => (
                <option key={value} value={value}>
                  {domainLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            Domain filtering only organizes canonical task objects. It never changes or resolves task state.
          </p>
        </AdminCard>

        {filter !== "resolved" ? (
          <section className="grid grid-cols-3 gap-2 sm:gap-3">
            <Metric
              label="Critical"
              value={critical}
              tone={critical == null ? "neutral" : critical ? "blocked" : "ready"}
            />
            <Metric
              label="High"
              value={high}
              tone={high == null ? "neutral" : high ? "attention" : "ready"}
            />
            <Metric
              label="Waiting"
              value={waiting}
              tone={waiting == null ? "neutral" : waiting ? "info" : "neutral"}
            />
          </section>
        ) : null}

        {!editionId ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title="Choose an edition"
              description="Select the edition in the Organizer toolbar before evaluating Tasks. Solaris never merges task truth across editions when Organizer scope is missing."
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
        ) : visibleTasks.length ? (
          <AdminCard strong className="!p-0 overflow-hidden">
            <div className="p-4 sm:p-5">
              <AdminCardHeader
                eyebrow={filter === "resolved" ? "History" : "Canonical queue"}
                title={filterTitle(filter, domain)}
                description={
                  filter === "resolved"
                    ? "Recently resolved task objects remain visible as operational history."
                    : "Tasks are deduplicated by source condition and disappear only when domain truth resolves them."
                }
                action={<AdminStatus tone="neutral">{visibleTasks.length}</AdminStatus>}
              />
            </div>
            <div className="divide-y divide-white/[0.07] border-t border-white/[0.07]">
              {visibleTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          </AdminCard>
        ) : (
          <AdminCard>
            <AdminEmptyState
              icon={filter === "resolved" ? CheckCircle2 : BellRing}
              title={emptyTitle(filter, domain)}
              description={emptyDescription(filter, domain)}
            />
          </AdminCard>
        )}

        <p className="px-1 text-[11px] leading-5 text-muted-foreground">
          Task state is recalculated from confirmation requirements and reviews, entries, required media, voting, results, integrations, incidents, governed approvals, Integrity work and paused edition subsystems. There is intentionally no generic “Mark resolved” button. Blocked, failed, expired and overdue distinctions remain System-owned until the V3 task contract exposes them canonically.
        </p>
      </div>
    </AdminPage>
  );
}

function TaskRow({ task }: { task: OrganizerTaskV5 }) {
  const resolved = task.state === "resolved";
  const domain = organizerTaskDomain(task);
  const resolutionConditions = Object.keys(task.resolutionPredicate).map(humanize);
  return (
    <Link
      to={task.href as any}
      className="group flex min-h-20 items-start gap-3 p-4 transition-colors hover:bg-white/[0.025] sm:p-5"
    >
      <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
        {task.state === "waiting" ? (
          <Clock3 className="size-4 text-sky-100" />
        ) : resolved ? (
          <CheckCircle2 className="size-4 text-emerald-200" />
        ) : task.assignedTo ? (
          <UserRound className="size-4 text-muted-foreground" />
        ) : (
          <BellRing className="size-4 text-muted-foreground" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{task.title}</span>
          <AdminStatus tone={taskTone(task)}>
            {resolved ? "Resolved" : task.state === "waiting" ? "Waiting" : task.priority}
          </AdminStatus>
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {task.description}
        </span>
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <span>{domainLabel(domain)}</span>
          <span>{humanize(task.sourceKind)}</span>
          {task.dueAt ? <span>Due {formatWhen(task.dueAt)}</span> : null}
          {task.assignedTo ? <span>Assigned</span> : null}
        </span>
        {task.ruleReference.length || resolutionConditions.length ? (
          <span className="mt-2 block space-y-1 text-[11px] leading-5 text-muted-foreground">
            {task.ruleReference.length ? (
              <span className="block">
                <strong className="font-semibold text-foreground/80">Rules:</strong>{" "}
                {task.ruleReference.join(", ")}
              </span>
            ) : null}
            {resolutionConditions.length ? (
              <span className="block">
                <strong className="font-semibold text-foreground/80">Closes when:</strong>{" "}
                {resolutionConditions.join(", ")}
              </span>
            ) : null}
          </span>
        ) : null}
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
        <AdminStatus tone={tone}>
          {value == null ? "Unavailable" : value ? "Active" : "Clear"}
        </AdminStatus>
      </div>
    </AdminCard>
  );
}

function taskTone(task: OrganizerTaskV5) {
  if (task.state === "resolved") return "ready" as const;
  if (task.priority === "critical") return "blocked" as const;
  if (task.priority === "high") return "attention" as const;
  if (task.state === "waiting") return "info" as const;
  return "neutral" as const;
}

function filterLabel(filter: OrganizerTaskFilter) {
  if (filter === "all") return "All";
  if (filter === "mine") return "Mine";
  if (filter === "waiting") return "Waiting";
  return "Resolved";
}

function domainLabel(domain: OrganizerTaskDomainFilter) {
  if (domain === "all") return "All domains";
  if (domain === "delegations") return "Delegations";
  if (domain === "entries") return "Entries";
  if (domain === "media") return "Media";
  if (domain === "voting") return "Voting";
  if (domain === "integrity") return "Integrity";
  if (domain === "publication") return "Publication";
  if (domain === "communications") return "Communications";
  if (domain === "production") return "Production";
  return "System";
}

function filterTitle(filter: OrganizerTaskFilter, domain: OrganizerTaskDomainFilter) {
  const scope = domain === "all" ? "" : `${domainLabel(domain)} · `;
  if (filter === "mine") return `${scope}Assigned to me`;
  if (filter === "waiting") return `${scope}Waiting`;
  if (filter === "resolved") return `${scope}Resolved tasks`;
  return `${scope}Unresolved tasks`;
}

function emptyTitle(filter: OrganizerTaskFilter, domain: OrganizerTaskDomainFilter) {
  const subject = domain === "all" ? "task" : `${domainLabel(domain).toLowerCase()} task`;
  if (filter === "mine") return `No ${subject} is assigned to you`;
  if (filter === "waiting") return `No ${subject} is waiting`;
  if (filter === "resolved") return `No resolved ${subject}s yet`;
  return `No unresolved ${subject} needs attention`;
}

function emptyDescription(filter: OrganizerTaskFilter, domain: OrganizerTaskDomainFilter) {
  if (domain !== "all") {
    return `No canonical ${domainLabel(domain).toLowerCase()} task matches the selected state filter.`;
  }
  if (filter === "mine") return "Unassigned and team tasks remain available under All.";
  if (filter === "waiting") return "No governed approval or dependency is currently waiting.";
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
