import { ORGANISATION_OS_V5_COUNTERPARTS } from "@/lib/organisation-os-v5-counterparts";
import { solarisV6Domain } from "@/lib/solaris-v6-domain-registry";

export type SolarisV6FeatureSurface = {
  featureId: string;
  canonicalDomain: string;
  sourceOfTruth: string;
  publicSurface: string | null;
  participantSurface: string | null;
  organizerSurface: string | null;
  moderationSurface: string | null;
  diagnosticSurface: string | null;
  requiredCapabilities: readonly string[];
  publicationDependencies: readonly string[];
  taskTypes: readonly string[];
  eventTypes: readonly string[];
  legacyRoutes: readonly string[];
  featureFlag: string | null;
  noOrganizerCounterpartReason: string | null;
  v5CounterpartIds: readonly string[];
};

const feature = (
  input: Omit<SolarisV6FeatureSurface, "sourceOfTruth" | "taskTypes" | "eventTypes">,
): SolarisV6FeatureSurface => {
  const domain = solarisV6Domain(input.canonicalDomain);
  if (!domain) throw new Error(`Unknown Solaris V6 canonical domain: ${input.canonicalDomain}`);
  return {
    ...input,
    sourceOfTruth: domain.canonicalWriteModel,
    taskTypes: domain.tasks,
    eventTypes: domain.events,
  };
};

/**
 * V6 cross-surface ownership registry.
 *
 * Each row owns cross-navigation and operational responsibility only. It never
 * creates a second domain authority. The V5 counterpart IDs are a migration
 * bridge: CI requires every V5 counterpart obligation to land exactly once
 * before old routes can be retired.
 */
export const SOLARIS_V6_FEATURE_SURFACES: readonly SolarisV6FeatureSurface[] = [
  feature({ featureId: "participant-view", canonicalDomain: "participation", publicSurface: null, participantSurface: "/my-solaris", organizerSurface: "/admin/countries/:countryId?tab=participant-view", moderationSurface: null, diagnosticSurface: "/admin/system-operations", requiredCapabilities: ["delegation.read"], publicationDependencies: [], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["mysolaris.home", "mysolaris.tasks"] }),
  feature({ featureId: "entry", canonicalDomain: "entry", publicSurface: "/editions/:edition/entries/:entry", participantSurface: "/my-solaris/entry", organizerSurface: "/admin/entries/:editionSlug", moderationSurface: "/admin/media-assets", diagnosticSurface: null, requiredCapabilities: ["entry.read_private"], publicationDependencies: ["publication"], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["mysolaris.entry"] }),
  feature({ featureId: "participant-voting-overview", canonicalDomain: "participation", publicSurface: null, participantSurface: "/my-solaris/voting", organizerSurface: "/televoting/admin", moderationSurface: "/admin/integrity-investigations", diagnosticSurface: "/admin/system-operations", requiredCapabilities: ["voting.read"], publicationDependencies: ["results"], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["mysolaris.voting"] }),
  feature({ featureId: "official-notices", canonicalDomain: "notice", publicSurface: "/", participantSurface: "/my-solaris/notices", organizerSurface: "/admin/communications", moderationSurface: null, diagnosticSurface: "/admin/system-operations", requiredCapabilities: ["communications.read"], publicationDependencies: [], legacyRoutes: ["/admin/inbox"], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["mysolaris.notices"] }),
  feature({ featureId: "country-profile", canonicalDomain: "country-profile", publicSurface: "/countries/:country", participantSurface: "/my-solaris/page-builder", organizerSurface: "/admin/countries/:countryId?tab=public-profile", moderationSurface: "/admin/community-moderation", diagnosticSurface: null, requiredCapabilities: ["delegation.read", "community.read"], publicationDependencies: ["publication"], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["mysolaris.country", "mysolaris.page-media"] }),
  feature({ featureId: "delegation-history", canonicalDomain: "delegation", publicSurface: null, participantSurface: "/my-solaris/history", organizerSurface: "/admin/hod-history", moderationSurface: null, diagnosticSurface: null, requiredCapabilities: ["delegation.read"], publicationDependencies: [], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["mysolaris.history"] }),
  feature({ featureId: "participant-activity", canonicalDomain: "activity", publicSurface: null, participantSurface: "/my-solaris/activity", organizerSurface: null, moderationSurface: null, diagnosticSurface: null, requiredCapabilities: [], publicationDependencies: [], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: "Activity is a private derived recipient projection. Organizers operate the canonical source events rather than a second copy of the feed.", v5CounterpartIds: ["mysolaris.activity"] }),
  feature({ featureId: "predictions", canonicalDomain: "prediction", publicSurface: "/predictions", participantSurface: "/my-solaris/predictions", organizerSurface: "/admin/predictions", moderationSurface: "/admin/community-moderation", diagnosticSurface: null, requiredCapabilities: ["edition.read"], publicationDependencies: ["results"], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["mysolaris.predictions"] }),
  feature({ featureId: "saved-items", canonicalDomain: "personal-preference", publicSurface: null, participantSurface: "/my-solaris/saved", organizerSurface: null, moderationSurface: null, diagnosticSurface: null, requiredCapabilities: [], publicationDependencies: [], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: "Saved and followed entities are private user preferences and deliberately have no Organizer read or mutation surface.", v5CounterpartIds: ["mysolaris.saved"] }),
  feature({ featureId: "country-account", canonicalDomain: "delegation", publicSurface: null, participantSurface: "/my-solaris/account", organizerSurface: "/admin/country-accounts", moderationSurface: null, diagnosticSurface: "/admin/system-operations", requiredCapabilities: ["delegation.read"], publicationDependencies: [], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["mysolaris.account"] }),
  feature({ featureId: "confirmations", canonicalDomain: "confirmation", publicSurface: null, participantSurface: "/confirmations", organizerSurface: "/confirmations/admin", moderationSurface: null, diagnosticSurface: "/admin/system-operations", requiredCapabilities: ["confirmation.read"], publicationDependencies: [], legacyRoutes: ["/confirmations/admin/*"], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["participation.confirmations"] }),
  feature({ featureId: "jury", canonicalDomain: "jury", publicSurface: null, participantSurface: "/jury-voting", organizerSurface: "/admin/jury/:editionSlug", moderationSurface: "/admin/integrity-investigations", diagnosticSurface: "/admin/system-operations", requiredCapabilities: ["voting.read"], publicationDependencies: ["results", "publication"], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["participation.jury"] }),
  feature({ featureId: "televote", canonicalDomain: "televote", publicSurface: null, participantSurface: "/televoting", organizerSurface: "/televoting/admin", moderationSurface: "/admin/integrity-investigations", diagnosticSurface: "/admin/system-operations", requiredCapabilities: ["voting.read"], publicationDependencies: ["results", "publication"], legacyRoutes: ["/televoting/admin/*"], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["participation.televoting"] }),
  feature({ featureId: "next-in-line", canonicalDomain: "next-in-line", publicSurface: null, participantSurface: "/next-in-line", organizerSurface: "/admin/next-in-line", moderationSurface: null, diagnosticSurface: null, requiredCapabilities: ["delegation.read"], publicationDependencies: [], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["participation.next-in-line"] }),
  feature({ featureId: "integrity-report", canonicalDomain: "integrity", publicSurface: null, participantSurface: "/integrity/report", organizerSurface: "/admin/integrity-investigations", moderationSurface: "/admin/integrity-investigations", diagnosticSurface: "/admin/system-operations", requiredCapabilities: ["integrity.read"], publicationDependencies: [], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["participation.integrity-report"] }),
  feature({ featureId: "rules", canonicalDomain: "rules", publicSurface: "/rules", participantSurface: "/rules", organizerSurface: "/admin/rules-manager", moderationSurface: "/admin/integrity-investigations", diagnosticSurface: null, requiredCapabilities: ["rules.read"], publicationDependencies: [], legacyRoutes: ["/admin/integrity-rules"], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["public.rules"] }),
  feature({ featureId: "results", canonicalDomain: "results", publicSurface: "/results", participantSurface: "/results", organizerSurface: "/admin/results", moderationSurface: null, diagnosticSurface: "/admin/system-operations", requiredCapabilities: ["results.preview"], publicationDependencies: ["publication"], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["public.results"] }),
  feature({ featureId: "live-show", canonicalDomain: "live-show", publicSurface: "/show-mode", participantSurface: "/show-mode", organizerSurface: "/admin/broadcast-rundown", moderationSurface: null, diagnosticSurface: "/admin/system-operations", requiredCapabilities: ["broadcast.read"], publicationDependencies: ["publication"], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["public.show-mode"] }),
  feature({ featureId: "fantasy", canonicalDomain: "fantasy", publicSurface: "/fantasy", participantSurface: "/fantasy", organizerSurface: "/admin/fantasy", moderationSurface: null, diagnosticSurface: null, requiredCapabilities: ["edition.read"], publicationDependencies: ["results"], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["engagement.fantasy"] }),
  feature({ featureId: "fan-public-identity", canonicalDomain: "community-profile", publicSurface: "/predictions", participantSurface: "/predictions", organizerSurface: "/admin/community-moderation", moderationSurface: "/admin/community-moderation", diagnosticSurface: null, requiredCapabilities: ["community.read"], publicationDependencies: [], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["engagement.fan-public-identity"] }),
  feature({ featureId: "push-delivery", canonicalDomain: "notification", publicSurface: null, participantSurface: "/settings", organizerSurface: "/admin/system-operations", moderationSurface: null, diagnosticSurface: "/admin/system-operations", requiredCapabilities: ["system.read"], publicationDependencies: [], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["delivery.push"] }),
  feature({ featureId: "public-ux-diagnostics", canonicalDomain: "public-ux", publicSurface: "/", participantSurface: null, organizerSurface: "/admin/public-ux", moderationSurface: null, diagnosticSurface: "/admin/public-ux", requiredCapabilities: ["edition.read"], publicationDependencies: [], legacyRoutes: [], featureFlag: null, noOrganizerCounterpartReason: null, v5CounterpartIds: ["diagnostics.public-ux"] }),
] as const;

export function solarisV6Feature(featureId: string) {
  return SOLARIS_V6_FEATURE_SURFACES.find((item) => item.featureId === featureId) ?? null;
}

export const SOLARIS_V6_V5_COUNTERPART_IDS = new Set(
  SOLARIS_V6_FEATURE_SURFACES.flatMap((item) => item.v5CounterpartIds),
);

export const SOLARIS_V5_COUNTERPART_IDS = new Set(
  ORGANISATION_OS_V5_COUNTERPARTS.map((item) => item.id),
);
