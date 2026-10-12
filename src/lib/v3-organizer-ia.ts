export type V3OrganizerSectionId = 'overview' | 'tasks' | 'control' | 'live' | 'more';

export type V3OrganizerTaskPriority = 'critical' | 'high' | 'normal';
export type V3OrganizerTaskState = 'open' | 'blocked' | 'waiting' | 'resolved';

export type V3OrganizerTask = {
  id: string;
  title: string;
  detail: string;
  domain: string;
  href: string;
  priority: V3OrganizerTaskPriority;
  state: V3OrganizerTaskState;
  blockedReason?: string | null;
};

export type V3OrganizerInboxItem = {
  id: string;
  title: string;
  detail?: string | null;
  href?: string | null;
  unread: boolean;
  requiresAction: boolean;
  resolved: boolean;
};

export type V3OrganizerUpcomingItem = {
  id: string;
  label: string;
  detail: string;
  at: string;
  href?: string | null;
};

export type V3OrganizerReadiness = {
  status: 'ready' | 'attention' | 'blocked';
  progress: number;
  label: string;
};

export type V3OrganizerResolvedLive = {
  available: boolean;
  label: string;
  detail: string;
  route: string | null;
};

export type V3OrganizerSurfaceAccess = {
  control: boolean;
  live: boolean;
};

export type V3OrganizerContext = {
  contextKey: string;
  competitionId: string;
  editionId: string;
  editionLabel: string;
  showId: string | null;
};

export type V3OrganizerOverviewProjection = {
  context: V3OrganizerContext;
  navigation: readonly {
    id: V3OrganizerSectionId;
    label: string;
    available: boolean;
  }[];
  doNow: readonly V3OrganizerTask[];
  remainingTaskCount: number;
  inbox: readonly V3OrganizerInboxItem[];
  unresolvedInboxCount: number;
  unreadInboxCount: number;
  upcoming: V3OrganizerUpcomingItem | null;
  readiness: V3OrganizerReadiness;
  live: V3OrganizerResolvedLive | null;
};

const NAVIGATION: readonly { id: V3OrganizerSectionId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'control', label: 'Control' },
  { id: 'live', label: 'Live' },
  { id: 'more', label: 'More' },
];

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must be non-empty`);
  return normalized;
}

function timestamp(value: string, label: string): string {
  const normalized = nonEmpty(value, label);
  if (Number.isNaN(Date.parse(normalized))) throw new Error(`${label} must be a valid timestamp`);
  return normalized;
}

function normalizeContext(context: V3OrganizerContext): V3OrganizerContext {
  return {
    contextKey: nonEmpty(context.contextKey, 'contextKey'),
    competitionId: nonEmpty(context.competitionId, 'competitionId'),
    editionId: nonEmpty(context.editionId, 'editionId'),
    editionLabel: nonEmpty(context.editionLabel, 'editionLabel'),
    showId: context.showId?.trim() || null,
  };
}

function normalizeProgress(progress: number): number {
  if (!Number.isFinite(progress)) throw new Error('readiness progress must be finite');
  return Math.max(0, Math.min(100, progress));
}

const PRIORITY_ORDER: Record<V3OrganizerTaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

const STATE_ORDER: Record<V3OrganizerTaskState, number> = {
  blocked: 0,
  open: 1,
  waiting: 2,
  resolved: 3,
};

function taskOrder(left: V3OrganizerTask, right: V3OrganizerTask): number {
  const priority = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
  if (priority !== 0) return priority;
  const state = STATE_ORDER[left.state] - STATE_ORDER[right.state];
  if (state !== 0) return state;
  return left.id.localeCompare(right.id);
}

export function buildV3OrganizerOverviewProjection(input: {
  context: V3OrganizerContext;
  serverTime: string;
  tasks: readonly V3OrganizerTask[];
  inbox: readonly V3OrganizerInboxItem[];
  upcoming: readonly V3OrganizerUpcomingItem[];
  readiness: V3OrganizerReadiness;
  live: V3OrganizerResolvedLive;
  surfaceAccess: V3OrganizerSurfaceAccess;
  doNowLimit?: number;
  inboxLimit?: number;
}): V3OrganizerOverviewProjection {
  const context = normalizeContext(input.context);
  const now = Date.parse(timestamp(input.serverTime, 'serverTime'));
  const doNowLimit = Math.max(1, Math.min(6, input.doNowLimit ?? 4));
  const inboxLimit = Math.max(1, Math.min(5, input.inboxLimit ?? 3));

  const activeTasks = input.tasks
    .filter((task) => task.state !== 'resolved')
    .map((task) => ({
      ...task,
      id: nonEmpty(task.id, 'task id'),
      title: nonEmpty(task.title, 'task title'),
      detail: nonEmpty(task.detail, 'task detail'),
      domain: nonEmpty(task.domain, 'task domain'),
      href: nonEmpty(task.href, 'task href'),
      blockedReason: task.blockedReason?.trim() || null,
    }))
    .sort(taskOrder);

  const unresolvedInbox = input.inbox.filter((item) => item.requiresAction && !item.resolved);
  const visibleInbox = unresolvedInbox.slice(0, inboxLimit);

  const future = input.upcoming
    .map((item) => ({ ...item, at: timestamp(item.at, 'upcoming at') }))
    .filter((item) => Date.parse(item.at) >= now)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const navigation = NAVIGATION.map((item) => ({
    ...item,
    available:
      item.id === 'control'
        ? input.surfaceAccess.control
        : item.id === 'live'
          ? input.surfaceAccess.live
          : true,
  }));

  return {
    context,
    navigation,
    doNow: activeTasks.slice(0, doNowLimit),
    remainingTaskCount: Math.max(0, activeTasks.length - doNowLimit),
    inbox: visibleInbox,
    unresolvedInboxCount: unresolvedInbox.length,
    unreadInboxCount: input.inbox.filter((item) => item.unread).length,
    upcoming: future[0] ?? null,
    readiness: {
      ...input.readiness,
      progress: normalizeProgress(input.readiness.progress),
      label: nonEmpty(input.readiness.label, 'readiness label'),
    },
    live: input.surfaceAccess.live && input.live.available ? input.live : null,
  };
}
