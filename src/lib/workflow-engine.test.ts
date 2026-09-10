import { describe, expect, it } from 'vitest';
import { evaluateWorkflow, validateWorkflow, type WorkflowTask } from './workflow-engine';

const tasks: WorkflowTask[] = [
  {
    id: 'entry',
    label: 'Entry submitted',
    status: 'completed',
    required: true,
    dependsOn: [],
  },
  {
    id: 'graphics',
    label: 'Graphics produced',
    status: 'pending',
    required: true,
    dependsOn: ['entry'],
    dueAt: '2026-09-12T18:00:00.000Z',
  },
  {
    id: 'recap',
    label: 'Recap generated',
    status: 'pending',
    required: true,
    dependsOn: ['graphics'],
  },
];

describe('workflow engine', () => {
  it('unblocks tasks only when dependencies are complete', () => {
    const summary = evaluateWorkflow(tasks, new Date('2026-09-10T18:00:00.000Z'));
    expect(summary.nextTaskIds).toEqual(['graphics']);
    expect(summary.tasks.find((task) => task.id === 'recap')?.effectiveStatus).toBe('blocked');
    expect(summary.progress).toBe(33);
  });

  it('marks unfinished tasks overdue when their due time passes', () => {
    const summary = evaluateWorkflow(tasks, new Date('2026-09-13T18:00:00.000Z'));
    expect(summary.tasks.find((task) => task.id === 'graphics')?.overdue).toBe(true);
    expect(summary.overdueCount).toBe(1);
  });

  it('rejects missing dependencies and dependency cycles', () => {
    expect(() =>
      validateWorkflow([
        { id: 'a', label: 'A', status: 'pending', required: true, dependsOn: ['missing'] },
      ]),
    ).toThrow(/Unknown workflow dependency/);

    expect(() =>
      validateWorkflow([
        { id: 'a', label: 'A', status: 'pending', required: true, dependsOn: ['b'] },
        { id: 'b', label: 'B', status: 'pending', required: true, dependsOn: ['a'] },
      ]),
    ).toThrow(/cycle/i);
  });
});
