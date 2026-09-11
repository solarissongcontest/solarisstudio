export const WORKFLOW_TASK_STATUSES = [
  'pending',
  'ready',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
] as const;

export type WorkflowTaskStatus = (typeof WORKFLOW_TASK_STATUSES)[number];

export type WorkflowTask = {
  id: string;
  label: string;
  status: WorkflowTaskStatus;
  required: boolean;
  dependsOn: readonly string[];
  dueAt?: string | null;
};

export type WorkflowEvaluation = {
  id: string;
  label: string;
  storedStatus: WorkflowTaskStatus;
  effectiveStatus: WorkflowTaskStatus;
  blockers: string[];
  dueAt: string | null;
  overdue: boolean;
  ready: boolean;
};

export type WorkflowSummary = {
  tasks: WorkflowEvaluation[];
  complete: boolean;
  progress: number;
  blockedCount: number;
  overdueCount: number;
  nextTaskIds: string[];
};

function assertUniqueTaskIds(tasks: readonly WorkflowTask[]) {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) throw new Error(`Duplicate workflow task id: ${task.id}`);
    ids.add(task.id);
  }
}

function assertKnownDependencies(tasks: readonly WorkflowTask[]) {
  const ids = new Set(tasks.map((task) => task.id));
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency)) {
        throw new Error(`Unknown workflow dependency: ${task.id} -> ${dependency}`);
      }
      if (dependency === task.id) throw new Error(`Workflow task cannot depend on itself: ${task.id}`);
    }
  }
}

function assertAcyclic(tasks: readonly WorkflowTask[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Workflow dependency cycle detected at: ${id}`);

    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };

  for (const task of tasks) visit(task.id);
}

export function validateWorkflow(tasks: readonly WorkflowTask[]): void {
  assertUniqueTaskIds(tasks);
  assertKnownDependencies(tasks);
  assertAcyclic(tasks);
}

export function evaluateWorkflow(tasks: readonly WorkflowTask[], now = new Date()): WorkflowSummary {
  validateWorkflow(tasks);
  const byId = new Map(tasks.map((task) => [task.id, task]));

  const evaluated = tasks.map<WorkflowEvaluation>((task) => {
    const blockers = task.dependsOn.filter((dependencyId) => {
      const dependency = byId.get(dependencyId);
      return dependency?.status !== 'completed' && dependency?.status !== 'cancelled';
    });

    const terminal = task.status === 'completed' || task.status === 'cancelled';
    const overdue = Boolean(
      task.dueAt &&
        !terminal &&
        Number.isFinite(new Date(task.dueAt).getTime()) &&
        new Date(task.dueAt).getTime() < now.getTime(),
    );

    let effectiveStatus = task.status;
    if (!terminal && blockers.length > 0) effectiveStatus = 'blocked';
    else if (task.status === 'pending') effectiveStatus = 'ready';

    return {
      id: task.id,
      label: task.label,
      storedStatus: task.status,
      effectiveStatus,
      blockers,
      dueAt: task.dueAt ?? null,
      overdue,
      ready: effectiveStatus === 'ready',
    };
  });

  const required = tasks.filter((task) => task.required);
  const completedRequired = required.filter(
    (task) => task.status === 'completed' || task.status === 'cancelled',
  ).length;
  const progress = required.length === 0 ? 100 : Math.round((completedRequired / required.length) * 100);

  return {
    tasks: evaluated,
    complete: required.every((task) => task.status === 'completed' || task.status === 'cancelled'),
    progress,
    blockedCount: evaluated.filter((task) => task.effectiveStatus === 'blocked').length,
    overdueCount: evaluated.filter((task) => task.overdue).length,
    nextTaskIds: evaluated.filter((task) => task.ready).map((task) => task.id),
  };
}
