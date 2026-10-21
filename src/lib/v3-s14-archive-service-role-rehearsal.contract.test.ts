import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rehearsal = readFileSync('.github/scripts/v3-s14-archive-system-rehearsal.sh', 'utf8');

describe('System V3 S14 archive worker rehearsal identity', () => {
  it('uses the canonical service-role GUC required by S4 worker RPCs', () => {
    expect(rehearsal).toContain(
      String.raw`set \"request.jwt.claim.role\" = 'service_role'`,
    );
    expect(rehearsal).not.toContain(
      String.raw`set request.jwt.claims = '{\"role\":\"service_role\"}'`,
    );
    expect(rehearsal).toContain('studio2_claim_domain_event_deliveries');
    expect(rehearsal).toContain('studio2_process_edition_domain_event');
  });
});
