import type { OrganizerTaskV5 } from "@/lib/admin-tasks-v5";
import type { ControlRoomModel } from "@/lib/control-room-model";

export type V3OrganizerRisk = "normal" | "elevated" | "critical";

export type OrganizerContext = {
  editionId: string | null;
  editionSlug: string | null;
  editionLabel: string | null;
  showId: string | null;
  showLabel: string | null;
  mode: "organizer";
  contextVersion: number;
};

export type V3OrganizerEditionProjection = {
  id: string;
  slug: string;
  name: string;
  editionNumber: number | null;
  status: string | null;
};

export type V3OrganizerTaskProjection = {
  total: number;
  critical: number;
  high: number;
  waiting: number;
  mine: number;
  top: OrganizerTaskV5[];
};

export type V3OrganizerReadinessFactor = {
  id: string;
  label: string;
  detail: string;
  route: string;
};

export type V3OrganizerReadiness = {
  overall: number;
  blocking: V3OrganizerReadinessFactor[];
  incomplete: V3OrganizerReadinessFactor[];
  ready: V3OrganizerReadinessFactor[];
  calculatedAt: string;
  stateVersion: string;
};

export type V3OrganizerAttentionItem = {
  id: string;
  severity: OrganizerTaskV5["priority"];
  title: string;
  detail: string;
  consequence: string;
  route: string;
  dueAt: string | null;
};

export type V3OrganizerUpcomingItem = {
  id: string;
  label: string;
  detail: string;
  at: string;
  route: string;
};

export type V3OrganizerRecentChange = {
  id: string;
  action: string;
  subject: string;
  createdAt: string;
  actorId: string | null;
};

export type V3OrganizerDomainState =
  | "ready"
  | "attention"
  | "blocked"
  | "active"
  | "not_configured"
  | "complete";

export type V3OrganizerDomainSummary = {
  state: V3OrganizerDomainState;
  label: string;
  detail: string;
  issueCount: number;
  blockingIssueCount: number;
  primaryRoute: string;
  recommendedAction?: { label: string; route: string };
};

export type V3OrganizerDomainKey =
  | "delegations"
  | "contest"
  | "voting"
  | "results"
  | "communications"
  | "production"
  | "governance"
  | "system";

export type V3OrganizerSystemHealth = {
  state: "healthy" | "degraded" | "partial_outage" | "outage" | "unknown";
  detail: string;
  issueCount: number;
  criticalIssueCount: number;
};

export type V3OrganizerHealthInput = {
  status?: string | null;
  progress?: number | null;
  issues_count?: number | null;
  critical_count?: number | null;
  missing_songs?: number | null;
  missing_artists?: number | null;
  running_issues?: number | null;
  jury_issues?: number | null;
  televote_issues?: number | null;
  result_issues?: number | null;
};

export type V3OrganizerProjection = {
  context: OrganizerContext;
  edition: V3OrganizerEditionProjection;
  activeShow?: { id: string; label: string; status: string; kind: string };
  readiness: V3OrganizerReadiness;
  attention: V3OrganizerAttentionItem[];
  tasks: V3OrganizerTaskProjection;
  upcoming: V3OrganizerUpcomingItem[];
  recentChanges: V3OrganizerRecentChange[];
  domains: Record<V3OrganizerDomainKey, V3OrganizerDomainSummary>;
  systemHealth: V3OrganizerSystemHealth;
  live: ControlRoomModel;
  risk: V3OrganizerRisk;
  stateVersion: string;
  serverTime: string;
};

const priorityRank: Record<OrganizerTaskV5["priority"], number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

function dueTime(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function sortedUnresolved(tasks: readonly OrganizerTaskV5[]) {
  return tasks
    .filter((task) => task.state !== "resolved")
    .sort((a, b) => {
      const priority = priorityRank[a.priority] - priorityRank[b.priority];
      if (priority) return priority;
      const due = dueTime(a.dueAt) - dueTime(b.dueAt);
      if (due) return due;
      return a.openedAt.localeCompare(b.openedAt);
    });
}

export function organizerTaskDomain(task: Pick<OrganizerTaskV5, "href" | "sourceKind" | "taskType">): V3OrganizerDomainKey {
  const text = `${task.href} ${task.sourceKind} ${task.taskType}`.toLowerCase();
  if (/confirm|delegat|country|participation/.test(text)) return "delegations";
  if (/entry|media|show|lineup|progress|eligib|submission/.test(text)) return "contest";
  if (/jury|televote|voting|ballot|integrity/.test(text)) return "voting";
  if (/result|publication|publish/.test(text)) return "results";
  if (/communication|notice|announcement|delivery/.test(text)) return "communications";
  if (/broadcast|rundown|reveal|design|theme|production/.test(text)) return "production";
  if (/rule|investigation|appeal|evidence|governance|identity/.test(text)) return "governance";
  return "system";
}

function factor(id: string, count: number, label: string, route: string): V3OrganizerReadinessFactor | null {
  if (count <= 0) return null;
  return { id, label, detail: `${count} ${count === 1 ? "issue" : "issues"}`, route };
}

function buildReadiness(
  edition: V3OrganizerEditionProjection,
  health: V3OrganizerHealthInput | null | undefined,
  serverTime: string,
  stateVersion: string,
): V3OrganizerReadiness {
  const progress = Math.max(0, Math.min(100, Number(health?.progress ?? 0)));
  const critical = Math.max(0, Number(health?.critical_count ?? 0));
  const incomplete = [
    factor("entries", Number(health?.missing_songs ?? 0) + Number(health?.missing_artists ?? 0), "Entry metadata", `/admin/entries/${edition.slug}`),
    factor("running-order", Number(health?.running_issues ?? 0), "Running order", `/admin/lineup-sync/${edition.slug}`),
    factor("jury", Number(health?.jury_issues ?? 0), "Jury", `/admin/jury/${edition.slug}`),
    factor("televote", Number(health?.televote_issues ?? 0), "Televote", `/admin/televote/${edition.slug}`),
    factor("results", Number(health?.result_issues ?? 0), "Results", "/admin/results"),
  ].filter((item): item is V3OrganizerReadinessFactor => Boolean(item));

  const blocking = critical
    ? [{
        id: "critical-health",
        label: critical === 1 ? "1 critical blocker" : `${critical} critical blockers`,
        detail: "Critical edition health checks require intervention before high-consequence operations.",
        route: "/admin/tasks?filter=all",
      }]
    : [];

  const incompleteIds = new Set(incomplete.map((item) => item.id));
  const ready = [
    { id: "entries", label: "Entries", route: `/admin/entries/${edition.slug}` },
    { id: "running-order", label: "Running order", route: `/admin/lineup-sync/${edition.slug}` },
    { id: "jury", label: "Jury", route: `/admin/jury/${edition.slug}` },
    { id: "televote", label: "Televote", route: `/admin/televote/${edition.slug}` },
    { id: "results", label: "Results", route: "/admin/results" },
  ]
    .filter((item) => !incompleteIds.has(item.id))
    .map((item) => ({ ...item, detail: "No current readiness issue" }));

  return { overall: progress, blocking, incomplete, ready, calculatedAt: serverTime, stateVersion };
}

function domainMeta(edition: V3OrganizerEditionProjection): Record<V3OrganizerDomainKey, { label: string; route: string }> {
  return {
    delegations: { label: "Delegations", route: "/admin/countries" },
    contest: { label: "Contest", route: `/admin/shows/${edition.slug}` },
    voting: { label: "Voting", route: `/admin/jury/${edition.slug}` },
    results: { label: "Results & publication", route: "/admin/results" },
    communications: { label: "Communications", route: "/admin/communications" },
    production: { label: "Production", route: "/admin/control-room" },
    governance: { label: "Governance", route: "/admin/more" },
    system: { label: "System", route: "/admin/system" },
  };
}

function buildDomains(
  edition: V3OrganizerEditionProjection,
  tasks: readonly OrganizerTaskV5[],
  live: ControlRoomModel,
): Record<V3OrganizerDomainKey, V3OrganizerDomainSummary> {
  const meta = domainMeta(edition);
  const keys = Object.keys(meta) as V3OrganizerDomainKey[];

  return Object.fromEntries(keys.map((key) => {
    const domainTasks = sortedUnresolved(tasks.filter((task) => organizerTaskDomain(task) === key));
    const blocking = domainTasks.filter((task) => task.priority === "critical").length;
    const first = domainTasks[0];
    let state: V3OrganizerDomainState = blocking ? "blocked" : domainTasks.length ? "attention" : "ready";

    if (key === "voting" && !domainTasks.length && [live.subsystems.juryVoting, live.subsystems.televoting].includes("open")) {
      state = "active";
    }
    if (key === "results" && !domainTasks.length && live.subsystems.results === "published") {
      state = "complete";
    }
    if (key === "production" && !domainTasks.length && live.editionState === "live") {
      state = "active";
    }

    return [key, {
      state,
      label: meta[key].label,
      detail: domainTasks.length
        ? `${domainTasks.length} ${domainTasks.length === 1 ? "item needs" : "items need"} attention`
        : state === "active"
          ? "Active operational state"
          : state === "complete"
            ? "Complete"
            : "No known action required",
      issueCount: domainTasks.length,
      blockingIssueCount: blocking,
      primaryRoute: meta[key].route,
      recommendedAction: first ? { label: first.title, route: first.href } : undefined,
    } satisfies V3OrganizerDomainSummary];
  })) as Record<V3OrganizerDomainKey, V3OrganizerDomainSummary>;
}

function buildStateVersion(input: {
  edition: V3OrganizerEditionProjection;
  tasks: readonly OrganizerTaskV5[];
  live: ControlRoomModel;
  health?: V3OrganizerHealthInput | null;
  recentChanges?: readonly V3OrganizerRecentChange[];
}) {
  const source = JSON.stringify([
    input.edition.id,
    input.edition.status,
    input.live.editionState,
    input.live.subsystems,
    input.health?.progress ?? null,
    input.health?.issues_count ?? null,
    input.tasks.map((task) => [task.id, task.state, task.priority, task.lastEvaluatedAt]),
    input.recentChanges?.map((change) => [change.id, change.createdAt]) ?? [],
  ]);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `org-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildV3OrganizerProjection(input: {
  edition: V3OrganizerEditionProjection;
  tasks: OrganizerTaskV5[];
  live: ControlRoomModel;
  actorId: string;
  health?: V3OrganizerHealthInput | null;
  activeShow?: { id: string; label: string; status: string; kind: string };
  upcoming?: V3OrganizerUpcomingItem[];
  recentChanges?: V3OrganizerRecentChange[];
  contextVersion?: number;
  serverTime?: string;
}): V3OrganizerProjection {
  const serverTime = input.serverTime ?? new Date().toISOString();
  const unresolved = sortedUnresolved(input.tasks);
  const critical = unresolved.filter((task) => task.priority === "critical").length;
  const high = unresolved.filter((task) => task.priority === "high").length;
  const waiting = unresolved.filter((task) => task.state === "waiting").length;
  const mine = unresolved.filter((task) => task.assignedTo === input.actorId).length;
  const top = unresolved.slice(0, 5);

  const risk: V3OrganizerRisk =
    input.live.overallHealth === "critical" || critical > 0
      ? "critical"
      : input.live.overallHealth === "attention" || high > 0 || waiting > 0
        ? "elevated"
        : "normal";

  const recentChanges = input.recentChanges ?? [];
  const stateVersion = buildStateVersion({
    edition: input.edition,
    tasks: input.tasks,
    live: input.live,
    health: input.health,
    recentChanges,
  });

  const label = input.edition.editionNumber == null
    ? input.edition.name
    : `SSC ${input.edition.editionNumber}`;

  return {
    context: {
      editionId: input.edition.id,
      editionSlug: input.edition.slug,
      editionLabel: label,
      showId: input.activeShow?.id ?? null,
      showLabel: input.activeShow?.label ?? null,
      mode: "organizer",
      contextVersion: input.contextVersion ?? 1,
    },
    edition: input.edition,
    activeShow: input.activeShow,
    readiness: buildReadiness(input.edition, input.health, serverTime, stateVersion),
    attention: top.map((task) => ({
      id: task.id,
      severity: task.priority,
      title: task.title,
      detail: task.description,
      consequence:
        task.priority === "critical"
          ? "A critical organizer condition remains unresolved."
          : task.priority === "high"
            ? "This may delay or block the next operational step."
            : "Organizer attention is recommended.",
      route: task.href,
      dueAt: task.dueAt,
    })),
    tasks: { total: unresolved.length, critical, high, waiting, mine, top },
    upcoming: (input.upcoming ?? []).slice(0, 6),
    recentChanges: recentChanges.slice(0, 8),
    domains: buildDomains(input.edition, input.tasks, input.live),
    systemHealth: {
      state:
        input.live.overallHealth === "critical"
          ? "partial_outage"
          : input.live.overallHealth === "attention"
            ? "degraded"
            : input.live.overallHealth === "healthy"
              ? "healthy"
              : "unknown",
      detail:
        Number(input.health?.issues_count ?? 0) > 0
          ? `${Number(input.health?.issues_count ?? 0)} health ${Number(input.health?.issues_count ?? 0) === 1 ? "issue" : "issues"}`
          : "No known edition health issue",
      issueCount: Number(input.health?.issues_count ?? input.live.issues.total ?? 0),
      criticalIssueCount: Number(input.health?.critical_count ?? input.live.issues.critical ?? 0),
    },
    live: input.live,
    risk,
    stateVersion,
    serverTime,
  };
}
