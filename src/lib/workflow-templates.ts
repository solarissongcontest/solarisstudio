import type { WorkflowTask, WorkflowTaskStatus } from './workflow-engine';

export type WorkflowTemplateStatusMap = Partial<Record<string, WorkflowTaskStatus>>;

function status(statuses: WorkflowTemplateStatusMap, id: string): WorkflowTaskStatus {
  return statuses[id] ?? 'pending';
}

export function entrySubmissionWorkflow(
  statuses: WorkflowTemplateStatusMap = {},
  deadlines: Partial<Record<string, string>> = {},
): WorkflowTask[] {
  return [
    {
      id: 'entry.song-info',
      label: 'Song information',
      status: status(statuses, 'entry.song-info'),
      required: true,
      dependsOn: [],
      dueAt: deadlines['entry.song-info'] ?? null,
    },
    {
      id: 'entry.artist-info',
      label: 'Artist information',
      status: status(statuses, 'entry.artist-info'),
      required: true,
      dependsOn: [],
      dueAt: deadlines['entry.artist-info'] ?? null,
    },
    {
      id: 'entry.media',
      label: 'Entry media',
      status: status(statuses, 'entry.media'),
      required: true,
      dependsOn: ['entry.song-info', 'entry.artist-info'],
      dueAt: deadlines['entry.media'] ?? null,
    },
    {
      id: 'entry.eligibility',
      label: 'Eligibility validation',
      status: status(statuses, 'entry.eligibility'),
      required: true,
      dependsOn: ['entry.song-info', 'entry.artist-info', 'entry.media'],
      dueAt: deadlines['entry.eligibility'] ?? null,
    },
    {
      id: 'entry.broadcaster-approval',
      label: 'Broadcaster approval',
      status: status(statuses, 'entry.broadcaster-approval'),
      required: true,
      dependsOn: ['entry.eligibility'],
      dueAt: deadlines['entry.broadcaster-approval'] ?? null,
    },
    {
      id: 'entry.tsbc-review',
      label: 'TSBC review',
      status: status(statuses, 'entry.tsbc-review'),
      required: true,
      dependsOn: ['entry.broadcaster-approval'],
      dueAt: deadlines['entry.tsbc-review'] ?? null,
    },
    {
      id: 'entry.lock',
      label: 'Entry locked',
      status: status(statuses, 'entry.lock'),
      required: true,
      dependsOn: ['entry.tsbc-review'],
      dueAt: deadlines['entry.lock'] ?? null,
    },
  ];
}

export function hostTransferWorkflow(
  statuses: WorkflowTemplateStatusMap = {},
  deadlines: Partial<Record<string, string>> = {},
): WorkflowTask[] {
  const task = (
    id: string,
    label: string,
    dependsOn: readonly string[],
  ): WorkflowTask => ({
    id,
    label,
    status: status(statuses, id),
    required: true,
    dependsOn,
    dueAt: deadlines[id] ?? null,
  });

  return [
    task('host.acceptance', 'Host responsibility accepted', []),
    task('host.city', 'Host city confirmed', ['host.acceptance']),
    task('host.venue', 'Venue confirmed', ['host.city']),
    task('host.dates', 'Contest dates confirmed', ['host.venue']),
    task('host.brand', 'Edition brand approved', ['host.acceptance']),
    task('host.production', 'Production plan approved', ['host.venue', 'host.dates']),
    task('host.broadcast', 'Broadcast integration ready', ['host.production', 'host.brand']),
    task('host.press', 'Press operation ready', ['host.dates', 'host.brand']),
    task('host.handover', 'Host handover complete', ['host.broadcast', 'host.press']),
  ];
}

export function liveShowReadinessWorkflow(
  statuses: WorkflowTemplateStatusMap = {},
): WorkflowTask[] {
  const task = (id: string, label: string, dependsOn: readonly string[] = []): WorkflowTask => ({
    id,
    label,
    status: status(statuses, id),
    required: true,
    dependsOn,
  });

  return [
    task('show.lineup', 'Running order locked'),
    task('show.assets', 'Broadcast assets ready', ['show.lineup']),
    task('show.jury', 'Jury voting complete'),
    task('show.televote', 'Televote system ready'),
    task('show.results', 'Results calculation verified', ['show.jury', 'show.televote']),
    task('show.rundown', 'Broadcast rundown locked', ['show.lineup', 'show.assets']),
    task('show.go', 'Show cleared to go live', ['show.results', 'show.rundown']),
  ];
}
