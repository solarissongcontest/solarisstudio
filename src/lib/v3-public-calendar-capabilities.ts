import type { PublicCapabilityMigration, PublicPersona } from './v3-public-capability-registry';

const PUBLIC_PERSONAS = [
  'anonymous',
  'fan',
  'member',
  'hod',
  'historical-participant',
] as const satisfies readonly PublicPersona[];

/**
 * Net-new V3 public Show Calendar capability. This is not a second Show
 * scheduling authority: all dates are read from canonical published Show mode.
 */
export const V3_PUBLIC_CALENDAR_CAPABILITIES = [
  {
    id: 'public-show-calendar',
    sourceFeatureFlags: [],
    legacyRoutes: [],
    legacyComponents: [],
    backendOwners: ['edition', 'show', 'publication'],
    personas: PUBLIC_PERSONAS,
    authRequirement: 'public',
    classification: 'contextualize',
    targetArea: 'explore',
    targetRoute: '/calendar',
    specificationStatus: 'building',
    acceptanceScenarioId: 'public.published-show-calendar-export',
    migrationEvidence:
      'Published-only Show schedule with timezone-safe UTC export, per-show and per-edition .ics snapshots, bounded server reads, dedicated Public UI and focused tests. Final responsive/browser and exact-SHA certification remain outstanding.',
  },
] as const satisfies readonly PublicCapabilityMigration[];
