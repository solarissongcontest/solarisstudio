import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const route = readFileSync('src/routes/_authenticated/admin/hosts.tsx', 'utf8');

describe('V3 Organizer Host Management review boundary', () => {
  it('routes operational readiness through a frozen reviewed snapshot', () => {
    expect(route).toContain('async function requestSaveOperations()');
    expect(route).toContain("action: 'update_operations'");
    expect(route).toContain('expectedRevision: operations.revision');
    expect(route).toContain('payload: { ...readiness, notes: nextNotes }');
    expect(route).toContain("title: 'Review operational readiness'");
    expect(route).toContain('confirmationText: contextLabel');
    expect(route).not.toContain('async function saveOperations()');
    expect(route).not.toContain("action: 'update_operations',\n      reason: operationsReason");
  });

  it('routes individual show-host overrides through the same reviewed command path', () => {
    expect(route).toContain('async function requestSaveShowHost()');
    expect(route).toContain("action: 'set_show_host'");
    expect(route).toContain("payload: { showId: showTarget.showId, countryId: nextCountryId, city: nextCity }");
    expect(route).toContain('confirmationText: showTarget.showName');
    expect(route).toContain('Current host: ${currentHost}');
    expect(route).toContain('Proposed host: ${proposedHost}');
    expect(route).not.toContain('async function saveShowHost()');
    expect(route).not.toContain("action: 'set_show_host',\n      reason: showReason");
  });

  it('keeps review payloads revision-bound and visible before mutation', () => {
    expect(route).toContain('data-v3-organizer-host-review-snapshot');
    expect(route).toContain('Expected revision: {pending.expectedRevision}');
    expect(route).toContain('onConfirm={confirmPending}');
    expect(route).toContain('payload: pending.payload');
    expect(route).toContain('expectedRevision: pending.expectedRevision');
    expect(route).toContain('if (action === \'update_operations\') setOperationsReason(\'\')');
    expect(route).toContain("if (action === 'set_show_host')");
  });

  it('preserves existing reviewed bid and edition-wide host operations', () => {
    expect(route).toContain("function requestBidAction(bid: HostBid, action: HostOperationAction)");
    expect(route).toContain("action: 'sync_show_hosts'");
    expect(route).toContain("danger: ['reject_bid', 'withdraw_bid', 'select_bid'].includes(action)");
    expect(route).toContain('confirmationHint={pending ? `Type ${pending.confirmationText} to confirm` : undefined}');
  });
});
