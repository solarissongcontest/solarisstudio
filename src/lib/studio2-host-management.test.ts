import { describe, expect, it } from 'vitest';

import {
  availableHostBidActions,
  hostBidStatusLabel,
  hostReadinessProgress,
  parseHostBid,
  parseHostManagementSnapshot,
  summarizeStudio2HostManagement,
  type HostBid,
  type HostManagementSnapshot,
} from './studio2-host-management';

function bid(overrides: Partial<HostBid> = {}): HostBid {
  return {
    id: 'bid-1',
    editionId: 'edition-1',
    countryId: 'country-1',
    countryName: 'Oland',
    city: 'Tetlehamn',
    venueName: 'Tetlearena',
    venueCapacity: 18000,
    venueAddress: null,
    airportSummary: 'International airport access',
    transportSummary: 'Rail and metro',
    accommodationBeds: 24000,
    productionSummary: 'Broadcast-ready venue',
    sustainabilitySummary: null,
    accessibilitySummary: 'Step-free access',
    localBroadcaster: 'TSBC',
    timezone: 'Europe/Helsinki',
    latitude: 60.1,
    longitude: 25.1,
    supportingLinks: ['https://example.com/bid.pdf'],
    status: 'submitted',
    revision: 2,
    submittedAt: '2026-09-12T10:00:00Z',
    selectedAt: null,
    createdAt: '2026-09-12T09:00:00Z',
    updatedAt: '2026-09-12T10:00:00Z',
    evaluationCount: 1,
    averageScore: 8.5,
    evaluations: [{
      criterion: 'technical',
      score: 8.5,
      comment: 'Strong production plan',
      evaluatorUserId: 'user-1',
      updatedAt: '2026-09-12T10:30:00Z',
    }],
    ...overrides,
  };
}

function snapshot(overrides: Partial<HostManagementSnapshot> = {}): HostManagementSnapshot {
  return {
    edition: {
      id: 'edition-1',
      name: 'SSC 20',
      slug: 'ssc-20',
      hostCountryId: null,
      hostCity: null,
    },
    bids: [bid()],
    operations: null,
    shows: [],
    ...overrides,
  };
}

describe('Studio 2 host management model', () => {
  it('parses a complete host bid and rejects unknown statuses', () => {
    const parsed = parseHostBid(bid());
    expect(parsed.city).toBe('Tetlehamn');
    expect(parsed.averageScore).toBe(8.5);
    expect(parsed.evaluations[0].criterion).toBe('technical');
    expect(() => parseHostBid({ ...bid(), status: 'mystery' })).toThrow('Invalid host bid status');
  });

  it('maps the controlled bid lifecycle into available actions', () => {
    expect(availableHostBidActions(bid({ status: 'draft' }))).toEqual(['update_bid', 'submit_bid', 'withdraw_bid']);
    expect(availableHostBidActions(bid({ status: 'submitted' }))).toContain('mark_eligible');
    expect(availableHostBidActions(bid({ status: 'eligible' }))).toContain('select_bid');
    expect(availableHostBidActions(bid({ status: 'shortlisted' }))).toContain('select_bid');
    expect(availableHostBidActions(bid({ status: 'selected' }))).toEqual([]);
    expect(hostBidStatusLabel('superseded')).toBe('Superseded');
  });

  it('calculates readiness from the fixed operational checklist', () => {
    const readiness = {
      venueConfirmed: true,
      contractsReady: true,
      stageAccessReady: true,
      technicalReady: false,
      accreditationReady: false,
      hotelsReady: false,
      transportReady: false,
      securityReady: false,
      rehearsalsReady: false,
      pressCentreReady: false,
      accessibilityReady: false,
      ceremoniesReady: false,
    };
    expect(hostReadinessProgress({
      editionId: 'edition-1',
      selectedBidId: 'bid-1',
      revision: 2,
      readiness,
      notes: null,
      updatedAt: '2026-09-12T12:00:00Z',
    })).toEqual({ ready: 3, total: 12, percent: 25 });
  });

  it('summarizes bids without automatically choosing a host from scores', () => {
    const selected = bid({ id: 'bid-selected', status: 'selected', selectedAt: '2026-09-12T12:00:00Z' });
    const result = summarizeStudio2HostManagement(snapshot({
      bids: [bid({ id: 'submitted', status: 'submitted' }), bid({ id: 'eligible', status: 'eligible' }), bid({ id: 'shortlisted', status: 'shortlisted' }), selected],
    }));
    expect(result.bids).toBe(4);
    expect(result.eligible).toBe(3);
    expect(result.shortlisted).toBe(1);
    expect(result.selected?.id).toBe('bid-selected');
  });

  it('parses the server snapshot including show assignments and readiness', () => {
    const raw = {
      edition: { id: 'edition-1', name: 'SSC 20', slug: 'ssc-20', hostCountryId: 'country-1', hostCity: 'Tetlehamn' },
      bids: [bid({ status: 'selected' })],
      operations: {
        editionId: 'edition-1',
        selectedBidId: 'bid-1',
        revision: 3,
        readiness: {
          venueConfirmed: true,
          contractsReady: false,
          stageAccessReady: false,
          technicalReady: false,
          accreditationReady: false,
          hotelsReady: false,
          transportReady: false,
          securityReady: false,
          rehearsalsReady: false,
          pressCentreReady: false,
          accessibilityReady: false,
          ceremoniesReady: false,
        },
        notes: 'Venue contract next',
        updatedAt: '2026-09-12T12:00:00Z',
      },
      shows: [{
        showId: 'show-1',
        showName: 'Grand Final',
        showKind: 'grand-final',
        sortOrder: 1,
        hostCountryId: null,
        hostCountryName: null,
        hostCity: null,
        effectiveCountryId: 'country-1',
        effectiveCity: 'Tetlehamn',
      }],
    };
    const parsed = parseHostManagementSnapshot(raw);
    expect(parsed.operations?.revision).toBe(3);
    expect(parsed.shows[0].effectiveCity).toBe('Tetlehamn');
  });
});
