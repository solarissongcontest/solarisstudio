import { assertEditionTransition, type EditionState, type EditionTransition } from './edition-state';
import type { ContestEvent } from './contest-events';
import { createSecureClientId } from './secure-client-id';

export type EditionTransitionRequest = {
  editionId: string;
  from: EditionState;
  to: EditionState;
  actorUserId: string;
  reason?: string | null;
  secondApproverUserId?: string | null;
  occurredAt?: string;
  eventId?: string;
};

export type PreparedEditionTransition = {
  transition: EditionTransition;
  requiresReason: boolean;
  requiresSecondApproval: boolean;
  event: ContestEvent<{
    from: EditionState;
    to: EditionState;
    risk: EditionTransition['risk'];
    reason: string | null;
    secondApproverUserId: string | null;
  }>;
};

function randomId() {
  const id = createSecureClientId();
  if (!id) {
    throw new Error('Cryptographically secure edition transition event ID is required');
  }
  return id;
}

export function prepareEditionTransition(request: EditionTransitionRequest): PreparedEditionTransition {
  const transition = assertEditionTransition(request.from, request.to);
  const reason = request.reason?.trim() || null;
  const secondApproverUserId = request.secondApproverUserId?.trim() || null;
  const requiresReason = transition.risk !== 'normal';
  const requiresSecondApproval = transition.risk === 'critical';

  if (requiresReason && !reason) {
    throw new Error(`A reason is required for ${transition.risk} edition transitions`);
  }

  if (requiresSecondApproval && !secondApproverUserId) {
    throw new Error('A second approver is required for critical edition transitions');
  }

  if (secondApproverUserId && secondApproverUserId === request.actorUserId) {
    throw new Error('The second approver must be a different user');
  }

  return {
    transition,
    requiresReason,
    requiresSecondApproval,
    event: {
      id: request.eventId ?? randomId(),
      editionId: request.editionId,
      type: 'edition.state_changed',
      occurredAt: request.occurredAt ?? new Date().toISOString(),
      actorUserId: request.actorUserId,
      entityType: 'edition',
      entityId: request.editionId,
      payload: {
        from: request.from,
        to: request.to,
        risk: transition.risk,
        reason,
        secondApproverUserId,
      },
    },
  };
}
