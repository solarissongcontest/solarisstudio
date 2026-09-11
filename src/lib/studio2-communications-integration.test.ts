import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const adminNav = source('src/components/admin/AdminNav.tsx');
const route = source('src/routes/_authenticated/admin/communications.tsx');
const adapter = source('src/lib/studio2-communications.ts');

describe('Studio 2 Official Communications integration', () => {
  it('is discoverable from Organizer navigation', () => {
    expect(adminNav).toContain('label: "Communications"');
    expect(adminNav).toContain('to: "/admin/communications"');
  });

  it('uses the existing secured notice command and rollout flag', () => {
    expect(adapter).toContain("isStudio2FeatureEnabled('official_communications')");
    expect(adapter).toContain("client.rpc('studio2_send_notice'");
    expect(adapter).toContain("from('studio2_official_notices')");
    expect(adapter).toContain("from('studio2_notice_receipts')");
  });

  it('supports scoped audiences, acknowledgements and specific-country selection', () => {
    expect(route).toContain('NOTICE_AUDIENCES');
    expect(route).toContain("audience === 'specific_countries'");
    expect(route).toContain('acknowledgementRequired');
    expect(route).toContain('Send official notice');
  });

  it('does not introduce a second Rules or Trust & Integrity implementation', () => {
    expect(route).not.toContain('/rules');
    expect(route).not.toContain('/integrity');
    expect(adapter).not.toContain('rules_engine');
  });
});
