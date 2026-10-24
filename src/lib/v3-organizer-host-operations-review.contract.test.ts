import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const route = readFileSync('src/routes/_authenticated/admin/hosts.tsx', 'utf8');

describe('V3 Organizer Host Management review boundary', () => {
  it('routes operational readiness through a frozen reviewed snapshot', () => {
    expect(route).toContain('async function requestSaveOperations()');
    expect(route).toContain("action: 'update_operations'");
    expect(route).toContain('expectedRevision: operations.revision');
    expect(route).toContain('const payload = { ...readiness, notes: nextNotes };');
    expect(route).toContain("title: 'Review operational readiness'");
    expect(route).toContain('confirmationText: contextLabel');
    expect(route).not.toContain('async function saveOperations()');
    expect(route).not.toContain("action: 'update_operations',\n      reason: operationsReason");
  });

  it('routes individual show-host overrides through the same reviewed command path', () => {
    expect(route).toContain('async function requestSaveShowHost()');
    expect(route).toContain("action: 'set_show_host'");
    expect(route).toContain("const payload = { showId: showTarget.showId, countryId: nextCountryId, city: nextCity };");
    expect(route).toContain('confirmationText: showTarget.showName');
    expect(route).toContain('Current host: ${currentHost}');
    expect(route).toContain('Proposed host: ${proposedHost}');
    expect(route).not.toContain('async function saveShowHost()');
    expect(route).not.toContain("action: 'set_show_host',\n      reason: showReason");
  });

  it('binds every reviewed Host operation to exact edition, state fingerprint and one execution identity', () => {
    expect(route).toContain('function hostReviewFingerprint(snapshot: HostManagementSnapshot, operation: HostReviewCandidate)');
    expect(route).toContain('editionId: resolvedEditionId');
    expect(route).toContain('executionId: crypto.randomUUID()');
    expect(route).toContain('commandReason: null');
    expect(route).toContain('attempted: false');
    expect(route).toContain('reviewFingerprint: hostReviewFingerprint(snapshot, reviewCandidate)');
    expect(route).toContain('data-v3-organizer-host-context-lock');
  });

  it('re-reads authoritative Host state before the first commit and refuses reviewed-basis drift', () => {
    const freshRead = route.indexOf('const freshSnapshot = await loadStudio2HostManagement(operation.editionId);');
    const freshFingerprint = route.indexOf('hostReviewFingerprint(freshSnapshot, operation) !== operation.reviewFingerprint');
    const mutation = route.indexOf('await mutation.mutateAsync({', freshFingerprint);

    expect(freshRead).toBeGreaterThanOrEqual(0);
    expect(freshFingerprint).toBeGreaterThan(freshRead);
    expect(route).toContain('Host Management changed while this review was open. Refresh and review the current authoritative state before applying it.');
    expect(mutation).toBeGreaterThan(freshFingerprint);
  });

  it('freezes audit reason and operation identity after the first command attempt', () => {
    expect(route).toContain('const commandReason = pending.commandReason ?? pendingReason.trim();');
    expect(route).toContain('operation = { ...operation, attempted: true };');
    expect(route).toContain('reason: operation.commandReason ?? commandReason');
    expect(route).toContain('executionId: operation.executionId');
    expect(route).toContain('value={pending.commandReason ?? pendingReason}');
    expect(route).toContain('disabled={mutation.isPending || pending.attempted}');
    expect(route).toContain('Retry uses the exact same reviewed reason and operation identity');
  });

  it('refreshes authoritative Host state after rejected or uncertain command outcomes', () => {
    expect(route).toContain('onError: async (error) => {');
    expect(route).toContain("await queryClient.invalidateQueries({ queryKey: ['studio2-host-management', resolvedEditionId] });");
  });

  it('preserves existing reviewed bid and edition-wide host operations', () => {
    expect(route).toContain('function requestBidAction(bid: HostBid, action: HostOperationAction)');
    expect(route).toContain("action: 'sync_show_hosts'");
    expect(route).toContain("danger: ['reject_bid', 'withdraw_bid', 'select_bid'].includes(action)");
    expect(route).toContain('confirmationHint={pending ? `Type ${pending.confirmationText} to confirm` : undefined}');
  });
});
