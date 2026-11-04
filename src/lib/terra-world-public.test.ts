import { describe, expect, it } from 'vitest';
import {
  currentWorldMemberships,
  currentWorldRepresentatives,
  normalizeWorldOrgSearch,
  parseWorldOrganization,
  parseWorldOrganizationProfile,
  safeWorldAssetUrl,
  WORLD_ORG_PAGE_SIZE,
} from './terra-world-public';

const publicOrg = {
  id: 'org-one', slug: 'guard', officialName: 'Global Union for Allied Resilience and Defence',
  shortName: 'GUARD', type: 'international_union', status: 'active', revision: 2,
};

describe('Terra Solaris public world projection', () => {
  it('uses only visible, valid canonical organization identities', () => {
    expect(parseWorldOrganization({ ...publicOrg, public_visibility: 'private' })).toBeNull();
    expect(parseWorldOrganization({ ...publicOrg, public_visibility: 'members' })).toBeNull();
    expect(parseWorldOrganization({ ...publicOrg, slug: '../private' })).toBeNull();
    expect(parseWorldOrganization({ ...publicOrg, status: 'unknown' })).toBeNull();
    expect(parseWorldOrganization({ ...publicOrg, public_visibility: 'public' })?.shortName).toBe('GUARD');
  });

  it('accepts only HTTPS imagery and keeps the historical projection non-authoritative', () => {
    expect(safeWorldAssetUrl('javascript:alert(1)')).toBeNull();
    expect(safeWorldAssetUrl('http://example.org/emblem')).toBeNull();
    expect(safeWorldAssetUrl('https://example.org/flag.svg')).toBe('https://example.org/flag.svg');
    const profile = parseWorldOrganizationProfile({
      organization: publicOrg,
      memberships: [
        { id: 'm1', countryId: 'c1', status: 'member', membershipType: 'member', endedAt: null },
        { id: 'm2', countryId: 'c2', status: 'former', membershipType: 'member', endedAt: '2025-01-01' },
        { id: 'm3', countryId: 'c3', status: 'suspended', membershipType: 'member', endedAt: null },
      ],
      representatives: [
        { id: 'r1', countryId: 'c1', displayName: 'Official Representative', role: 'representative', endsAt: null },
        { id: 'r2', countryId: 'c2', displayName: 'Former Representative', role: 'representative', endsAt: '2025-01-01' },
      ],
      offices: [{ id: 'o1', title: 'Chairperson', defaultTermLengthEditions: 2, currentTerm: null }],
      organs: [{ id: 'a1', name: 'General Assembly', type: 'assembly' }],
      privateProxy: { secret: 'must not surface' },
    });
    expect(profile).not.toBeNull();
    expect(currentWorldMemberships(profile!).map((membership) => membership.id)).toEqual(['m1', 'm3']);
    expect(currentWorldRepresentatives(profile!).map((representative) => representative.id)).toEqual(['r1']);
    expect(profile!.offices[0].currentHolder).toBeNull();
    expect(profile).not.toHaveProperty('privateProxy');
  });

  it('bounds the search grammar and list pagination', () => {
    expect(normalizeWorldOrgSearch('GUARD),status.eq.private')).toBe('GUARD status eq private');
    expect(normalizeWorldOrgSearch('  UNITY  ')).toBe('UNITY');
    expect(normalizeWorldOrgSearch('a'.repeat(200)).length).toBe(64);
    expect(WORLD_ORG_PAGE_SIZE).toBeLessThanOrEqual(30);
  });
});
