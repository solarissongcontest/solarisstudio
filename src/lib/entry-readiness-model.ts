import type { EligibilityCheck, EligibilityResult } from './eligibility-engine';
import type { WorkflowEvaluation, WorkflowSummary } from './workflow-engine';

export type EntryReadinessStatus = 'ready' | 'attention' | 'blocked';
export type EntryReadinessActionPriority = 'critical' | 'high' | 'normal';

export type EntryReadinessAction = {
  id: string;
  label: string;
  description: string;
  source: 'eligibility' | 'workflow';
  priority: EntryReadinessActionPriority;
};

export type EntryReadinessModel = {
  status: EntryReadinessStatus;
  score: number;
  eligibilityScore: number;
  workflowProgress: number;
  passedChecks: number;
  totalChecks: number;
  blockerCount: number;
  warningCount: number;
  completedWorkflowTasks: number;
  totalWorkflowTasks: number;
  nextTaskIds: string[];
  nextTasks: WorkflowEvaluation[];
  actions: EntryReadinessAction[];
};

function eligibilityAction(check: EligibilityCheck): EntryReadinessAction {
  return {
    id: `eligibility:${check.id}`,
    label: check.label,
    description: check.message,
    source: 'eligibility',
    priority: check.level === 'blocked' ? 'critical' : 'high',
  };
}

function workflowAction(task: WorkflowEvaluation): EntryReadinessAction {
  return {
    id: `workflow:${task.id}`,
    label: task.label,
    description: task.overdue
      ? 'This workflow step is overdue and needs attention.'
      : 'This workflow step is ready to be completed now.',
    source: 'workflow',
    priority: task.overdue ? 'high' : 'normal',
  };
}

export function buildEntryReadinessModel(
  eligibility: EligibilityResult,
  workflow: WorkflowSummary,
): EntryReadinessModel {
  const passedChecks = eligibility.checks.filter((check) => check.level === 'pass').length;
  const completedWorkflowTasks = workflow.tasks.filter(
    (task) => task.effectiveStatus === 'completed' || task.effectiveStatus === 'cancelled',
  ).length;
  const nextTaskSet = new Set(workflow.nextTaskIds);
  const nextTasks = workflow.tasks.filter((task) => nextTaskSet.has(task.id));

  const eligibilityActions = [...eligibility.blockers, ...eligibility.warnings].map(eligibilityAction);
  const workflowActions = nextTasks.map(workflowAction);
  const actions = [...eligibilityActions, ...workflowActions];

  const blockerCount = eligibility.blockers.length + workflow.blockedCount;
  const warningCount = eligibility.warnings.length + workflow.overdueCount;
  const status: EntryReadinessStatus = blockerCount > 0
    ? 'blocked'
    : eligibility.status === 'warning' || warningCount > 0 || !workflow.complete
      ? 'attention'
      : 'ready';

  return {
    status,
    score: Math.round((eligibility.score + workflow.progress) / 2),
    eligibilityScore: eligibility.score,
    workflowProgress: workflow.progress,
    passedChecks,
    totalChecks: eligibility.checks.length,
    blockerCount,
    warningCount,
    completedWorkflowTasks,
    totalWorkflowTasks: workflow.tasks.length,
    nextTaskIds: [...workflow.nextTaskIds],
    nextTasks,
    actions,
  };
}
