import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const route = source('src/routes/_authenticated/admin/control-room.tsx');

describe('V3 Organizer Control Room consequence reviews', () => {
  it('captures exact edition context, reason and runtime version before final apply', () => {
    expect(route).toContain("kind: 'edition-transition'");
    expect(route).toContain('editionId,');
    expect(route).toContain('editionLabel: selectedEdition?.name ?? editionId');
    expect(route).toContain('commandReason: reason.trim()');
    expect(route).toContain('runtimeVersion: snapshot.runtime.version');
    expect(route).toContain('commandEditionId: reviewedEditionId');
    expect(route).not.toContain("onClick={() => transitionEdition.mutate({ to: transition.to })}");
  });

  it('re-reads canonical state instead of trusting the 60-second render cache', () => {
    expect(route).toContain('const reviewedEditionId = pendingReview.editionId');
    expect(route).toContain('editionIdRef.current !== reviewedEditionId');
    expect(route).toContain('studio2ControlRoom.loadSnapshot(reviewedEditionId)');
    expect(route).toContain('studio2ControlRoom.listTransitionApprovals(reviewedEditionId)');
    expect(route).toContain('freshSnapshot.runtime.version !== pendingReview.runtimeVersion');
    expect(route).toContain('freshSnapshot.runtime.runtime.edition !== pendingReview.from');
    expect(route).toContain('await refresh(reviewedEditionId).catch(() => undefined)');
    expect(route).not.toContain('runtimeVersion: freshSnapshot.runtime.version');
  });

  it('preserves server expected-version/CAS after fresh client revalidation', () => {
    expect(route).toContain('expectedVersion: number;');
    expect(route).toContain('expectedVersion,');
    expect(route).toContain('expectedVersion: pendingReview.runtimeVersion');
    const freshCheck = route.indexOf('freshSnapshot.runtime.version !== pendingReview.runtimeVersion');
    const reviewedVersion = route.indexOf('expectedVersion: pendingReview.runtimeVersion');
    expect(freshCheck).toBeGreaterThan(-1);
    expect(reviewedVersion).toBeGreaterThan(freshCheck);
  });

  it('revalidates an approved critical rollback without substituting a newer approval', () => {
    expect(route).toContain('approvalExpiresAt: reviewedApproval?.expiresAt ?? null');
    expect(route).toContain('freshApproval.editionId !== reviewedEditionId');
    expect(route).toContain('!freshApproval.canApply');
    expect(route).toContain('freshApproval.reason !== pendingReview.commandReason');
    expect(route).toContain('freshApproval.expiresAt !== pendingReview.approvalExpiresAt');
    expect(route).toContain('The critical-transition approval changed, expired or is no longer applicable.');
  });

  it('reviews and freshly revalidates second-operator approval instead of approving from the list button', () => {
    expect(route).toContain('openApprovalReview(approval)');
    expect(route).toContain('Second-operator approval');
    expect(route).toContain('!freshApproval.canApprove');
    expect(route).toContain('freshApproval.expiresAt !== pendingReview.expiresAt');
    expect(route).toContain('requestId: pendingReview.requestId');
    expect(route).toContain('commandEditionId: reviewedEditionId');
    expect(route).not.toContain('onClick={() => approveTransition.mutate(approval.id)}');
  });

  it('requires an explicit reviewed final step for approved critical rollback', () => {
    expect(route).toContain('openEditionReview(transition, approvedForRequester.id)');
    expect(route).toContain('Review approved rollback');
    expect(route).toContain("pendingReview.risk === 'critical'");
    expect(route).toContain('Type ${humanize(pendingReview.to)} exactly to apply this critical rollback');
  });

  it('does not let compact Control Room incident actions bypass Incident Command resolution', () => {
    expect(route).toContain("const compactStatuses = nextStatuses.filter((status) => status !== 'resolved')");
    expect(route).toContain('Resolve in Incident Command');
    expect(route).toContain('/admin/incidents?incident=');
    expect(route).toContain('openIncidentReview(incident, status)');
    expect(route).not.toContain('onClick={() => transitionIncident.mutate({ id: incident.id, to: status })}');
  });

  it('rechecks exact incident identity and state from a fresh edition snapshot before compact lifecycle apply', () => {
    expect(route).toContain('liveIncident.editionId !== reviewedEditionId');
    expect(route).toContain('liveIncident.title !== pendingReview.title');
    expect(route).toContain('liveIncident.status !== pendingReview.from');
    expect(route).toContain('liveIncident.severity !== pendingReview.severity');
    expect(route).toContain("pendingReview.to === 'resolved'");
    expect(route).toContain('transitionIncident.mutateAsync');
  });

  it('repeats frozen edition context and freshness behavior in the confirmation sheet', () => {
    expect(route).toContain('{pendingReview.editionLabel}');
    expect(route).toContain('re-reads canonical state immediately before commit');
    expect(route).toContain('The exact edition runtime and approval request are re-read immediately before approval.');
    expect(route).toContain('The exact edition snapshot is re-read immediately before apply.');
    expect(route).toContain('reviewChecking || transitionEdition.isPending');
  });

  it('states the System transition-authority boundary instead of faking parity', () => {
    expect(route).toContain('System #587');
    expect(route).toContain('server-side expected-version/CAS');
    expect(route).toContain('stable idempotency');
    expect(route).toContain('canonical operation-receipt semantics');
  });
});
