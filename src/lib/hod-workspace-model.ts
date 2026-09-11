import type { EligibilityResult } from './eligibility-engine';
import type { NoticeSeverity } from './official-communications';
import type { WorkflowSummary } from './workflow-engine';

export type HodWorkspaceNotice = {
  id: string;
  title: string;
  severity: NoticeSeverity;
  acknowledgementRequired: boolean;
  acknowledged: boolean;
};

export type HodWorkspaceInput = {
  editionId: string;
  editionName: string;
  countryId: string;
  countryName: string;
  confirmationComplete: boolean;
  entryEligibility: EligibilityResult;
  entryWorkflow: WorkflowSummary;
  juryMembersRequired: number;
  juryMembersAssigned: number;
  juryBallotSubmitted: boolean;
  notices: readonly HodWorkspaceNotice[];
};

export type HodActionPriority = 'critical' | 'high' | 'normal';

export type HodWorkspaceAction = {
  id: string;
  label: string;
  description: string;
  priority: HodActionPriority;
  href: string;
};

export type HodWorkspaceModel = {
  editionId: string;
  editionName: string;
  countryId: string;
  countryName: string;
  readiness: number;
  actions: HodWorkspaceAction[];
  outstandingAcknowledgements: number;
  jury: {
    assigned: number;
    required: number;
    complete: boolean;
    ballotSubmitted: boolean;
  };
};

export function buildHodWorkspaceModel(input: HodWorkspaceInput): HodWorkspaceModel {
  const actions: HodWorkspaceAction[] = [];

  if (!input.confirmationComplete) {
    actions.push({
      id: 'confirmation',
      label: 'Complete confirmation',
      description: 'Your delegation confirmation is not complete.',
      priority: 'critical',
      href: '/confirmations',
    });
  }

  if (input.entryEligibility.status === 'blocked') {
    actions.push({
      id: 'entry-blocked',
      label: 'Fix entry requirements',
      description: `${input.entryEligibility.blockers.length} entry requirement${input.entryEligibility.blockers.length === 1 ? '' : 's'} block approval.`,
      priority: 'critical',
      href: '/my-solaris/entry',
    });
  } else if (!input.entryWorkflow.complete) {
    actions.push({
      id: 'entry-workflow',
      label: 'Finish entry submission',
      description: `${input.entryWorkflow.progress}% of the entry workflow is complete.`,
      priority: 'high',
      href: '/my-solaris/entry',
    });
  }

  const juryComplete = input.juryMembersAssigned >= input.juryMembersRequired;
  if (!juryComplete) {
    actions.push({
      id: 'jury-members',
      label: 'Complete jury assignment',
      description: `${input.juryMembersAssigned}/${input.juryMembersRequired} jury members assigned.`,
      priority: 'high',
      href: '/my-solaris/jury',
    });
  } else if (!input.juryBallotSubmitted) {
    actions.push({
      id: 'jury-ballot',
      label: 'Submit jury ballot',
      description: 'The delegation jury is complete, but the ballot has not been submitted.',
      priority: 'high',
      href: '/jury',
    });
  }

  const unacknowledged = input.notices.filter(
    (notice) => notice.acknowledgementRequired && !notice.acknowledged,
  );
  if (unacknowledged.length) {
    actions.push({
      id: 'official-notices',
      label: 'Acknowledge official notices',
      description: `${unacknowledged.length} TSBC notice${unacknowledged.length === 1 ? '' : 's'} require acknowledgement.`,
      priority: unacknowledged.some((notice) => notice.severity === 'critical') ? 'critical' : 'normal',
      href: '/country-hub/notices',
    });
  }

  const weighted = [
    input.confirmationComplete ? 1 : 0,
    input.entryEligibility.status === 'ready' ? 1 : input.entryEligibility.status === 'warning' ? 0.75 : 0,
    input.entryWorkflow.progress / 100,
    juryComplete ? 1 : Math.min(1, input.juryMembersAssigned / Math.max(1, input.juryMembersRequired)),
    input.juryBallotSubmitted ? 1 : 0,
  ];

  const readiness = Math.round((weighted.reduce((sum, value) => sum + value, 0) / weighted.length) * 100);
  const priorityRank: Record<HodActionPriority, number> = { critical: 3, high: 2, normal: 1 };

  actions.sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority]);

  return {
    editionId: input.editionId,
    editionName: input.editionName,
    countryId: input.countryId,
    countryName: input.countryName,
    readiness,
    actions,
    outstandingAcknowledgements: unacknowledged.length,
    jury: {
      assigned: input.juryMembersAssigned,
      required: input.juryMembersRequired,
      complete: juryComplete,
      ballotSubmitted: input.juryBallotSubmitted,
    },
  };
}
