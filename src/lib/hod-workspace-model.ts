import type { CountryOperationalReadiness, CountryReadinessState } from './country-operational-readiness';
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
  operationalReadiness: CountryOperationalReadiness;
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
  readinessState: CountryReadinessState;
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
      id: 'jury-hod',
      label: 'Confirm HOD assignment',
      description: 'No Head of Delegation is recorded for this country and edition. The HOD is the country’s sole jury.',
      priority: 'high',
      href: '/country-hub/hod',
    });
  } else if (!input.juryBallotSubmitted) {
    actions.push({
      id: 'jury-ballot',
      label: 'Submit jury ballot',
      description: 'The HOD is assigned as the country’s jury, but the jury ballot has not been submitted.',
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

  if (input.operationalReadiness.overdueDeadlines.length) {
    actions.push({
      id: 'overdue-deadlines',
      label: 'Resolve overdue deadline requirements',
      description: `${input.operationalReadiness.overdueDeadlines.length} open deadline${input.operationalReadiness.overdueDeadlines.length === 1 ? ' is' : 's are'} overdue.`,
      priority: 'critical',
      href: '/country-hub/hod',
    });
  }

  const priorityRank: Record<HodActionPriority, number> = { critical: 3, high: 2, normal: 1 };
  actions.sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority]);

  return {
    editionId: input.editionId,
    editionName: input.editionName,
    countryId: input.countryId,
    countryName: input.countryName,
    readiness: input.operationalReadiness.score,
    readinessState: input.operationalReadiness.state,
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
