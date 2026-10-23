import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const nav = source('src/components/admin/admin-navigation.ts');
const route = source('src/routes/_authenticated/admin/voting-lab.tsx');
const server = source('src/integrations/televoting/voting-lab.server.ts');
const functions = source('src/integrations/televoting/voting-lab.functions.ts');

describe('Studio 2 Voting Laboratory integration', () => {
  it('is discoverable from Organizer navigation', () => {
    expect(nav).toContain('"Voting Lab",');
    expect(nav).toContain('"/admin/voting-lab"');
  });

  it('uses organizer-only server access and synthetic ballot identities', () => {
    expect(server).toContain('requireMergedTelevotingAdminServer');
    expect(server).toContain('syntheticId');
    expect(functions).toContain("createServerFn({ method: 'POST' })");
  });

  it('does not select identifying or integrity metadata for the Voting Lab payload', () => {
    const selectLists = [...server.matchAll(/\.select\('([^']+)'\)/g)].map((match) => match[1]).join(',');
    expect(selectLists).toContain('id,round_id,status');
    expect(selectLists).toContain('submission_id,target_country_code,points');
    for (const forbidden of ['username', 'ip_hash', 'fingerprint_hash', 'device_token_hash', 'risk_score', 'ip_country', 'is_vpn']) {
      expect(selectLists).not.toContain(forbidden);
    }
  });

  it('uses the verified current ballot contract as its baseline', () => {
    expect(route).toContain('maxPerCountry: 10');
    expect(route).toContain('ballotBudget: 20');
    expect(route).toContain('minimumCountries: 5');
    expect(route).toContain("invalidBallotPolicy: 'reject'");
  });

  it('binds rollout to the exact selected edition and fails closed without it', () => {
    expect(route).toContain("queryKey: ['studio2-feature', 'voting_lab', editionId ?? 'none']");
    expect(route).toContain('enabled: Boolean(editionId)');
    expect(route).toContain("isStudio2FeatureEnabled('voting_lab', editionId)");
    expect(route).toContain('if (!editionId)');
    expect(route).toContain('will not probe a global rollout');
    expect(route).not.toContain("isStudio2FeatureEnabled('voting_lab')");
  });

  it('remains simulation-only and outside official vote/result mutation authority', () => {
    expect(route).toContain('compareVotingSystems');
    expect(route).toContain('Synthetic scenarios only');
    expect(route).toContain('No submitted jury or televote ballot');
    expect(route).not.toContain('.update(');
    expect(route).not.toContain('.insert(');
    expect(route).not.toContain('.delete(');
  });

  it('keeps the authenticated lab out of crawler discovery', () => {
    expect(route).toContain("{ name: 'robots', content: 'noindex, nofollow' }");
  });

  it('does not import or modify Friend Voting or Rules', () => {
    expect(server).not.toContain('friend-voting');
    expect(route).not.toContain('friend-voting');
    expect(route).not.toContain('/rules');
    expect(server).not.toContain('rules_engine');
  });
});
