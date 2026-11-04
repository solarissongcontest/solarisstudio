import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const route = source('src/routes/_authenticated/admin/control-room.tsx');

describe('V3 Organizer Control Room consequence reviews', () => {
  it('captures edition transition reason and runtime version before final apply', () => {
    expect(route).toContain("kind: 'edition-transition'");
    expect(route).toContain('commandReason: reason.trim()');
    expect(route).toContain('runtimeVersion: snapshot.runtime.version');
    expect(route).toContain('commandReason: pendingReview.commandReason');
    expect(route).toContain('snapshot.runtime.version !== pendingReview.runtimeVersion');
    expect(route).not.toContain("onClick={() => transitionEdition.mutate({ to: transition.to })}");
  });

  it('passes the exact reviewed runtime version through the mutation instead of rereading mutable snapshot state', () => {
    expect(route).toContain('expectedVersion: number;');
    expect(route).toContain('expectedVersion,');
    expect(route).toContain('expectedVersion: pendingReview.runtimeVersion');
    const reviewedCheck = route.indexOf('snapshot.runtime.version !== pendingReview.runtimeVersion');
    const reviewedVersion = route.indexOf('expectedVersion: pendingReview.runtimeVersion');
    expect(reviewedCheck).toBeGreaterThan(-1);
    expect(reviewedVersion).toBeGreaterThan(reviewedCheck);
  });

  it('reviews second-operator approval instead of approving from the list button', () => {
    expect(route).toContain('openApprovalReview(approval)');
    expect(route).toContain('Second-operator approval');
    expect(route).toContain('liveApproval.canApprove');
    expect(route).toContain('approveTransition.mutateAsync(pendingReview.requestId)');
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

  it('rechecks exact incident state before compact lifecycle apply', () => {
    expect(route).toContain('liveIncident.status !== pendingReview.from');
    expect(route).toContain('liveIncident.severity !== pendingReview.severity');
    expect(route).toContain("pendingReview.to === 'resolved'");
    expect(route).toContain('transitionIncident.mutateAsync');
  });

  it('states the remaining System transition-authority boundary instead of faking parity', () => {
    expect(route).toContain('System #587');
    expect(route).toContain('server-side expected-version/CAS');
    expect(route).toContain('stable idempotency');
    expect(route).toContain('canonical operation-receipt semantics');
  });
});
