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
};

const feature = (
  input: Omit<SolarisV6FeatureSurface, "sourceOfTruth" | "taskTypes" | "eventTypes">,
): SolarisV6FeatureSurface => {
  const domain = solarisV6Domain(input.canonicalDomain);
  if (!domain) {
    throw new Error(`Unknown Solaris V6 canonical domain: ${input.canonicalDomain}`);
  }
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
 * V5 already established explicit Organizer counterparts. V6 promotes that
 * work into a three-perspective registry so Public, Participant and Organizer
 * can cross-navigate without inventing separate truth.
 */
export const SOLARIS_V6_FEATURE_SURFACES: readonly SolarisV6FeatureSurface[] = [
  feature({
    featureId: "confirmations",
    canonicalDomain: "confirmation",
    publicSurface: null,
    participantSurface: "/confirmations",
    organizerSurface: "/confirmations/admin",
    moderationSurface: null,
    diagnosticSurface: "/admin/system-operations",
    requiredCapabilities: ["confirmation.manage"],
    publicationDependencies: [],
    legacyRoutes: ["/confirmations/admin/*"],
    featureFlag: null,
    noOrganizerCounterpartReason: null,
  }),
  feature({
    featureId: "entry",
    canonicalDomain: "entry",
    publicSurface: "/editions/:edition/entries/:entry",
    participantSurface: "/my-solaris/entry",
    organizerSurface: "/admin/entries/:editionSlug",
    moderationSurface: "/admin/media-assets",
    diagnosticSurface: null,
    requiredCapabilities: ["entries.review"],
    publicationDependencies: ["publication"],
    legacyRoutes: [],
    featureFlag: null,
    noOrganizerCounterpartReason: null,
  }),
  feature({
    featureId: "jury",
    canonicalDomain: "jury",
    publicSurface: null,
    participantSurface: "/jury-voting",
    organizerSurface: "/admin/jury/:editionSlug",
    moderationSurface: "/admin/integrity-investigations",
    diagnosticSurface: "/admin/system-operations",
    requiredCapabilities: ["jury.manage"],
    publicationDependencies: ["results", "publication"],
    legacyRoutes: [],
    featureFlag: null,
    noOrganizerCounterpartReason: null,
  }),
  feature({
    featureId: "televote",
    canonicalDomain: "televote",
    publicSurface: null,
    participantSurface: "/televoting",
    organizerSurface: "/televoting/admin",
    moderationSurface: "/admin/integrity-investigations",
    diagnosticSurface: "/admin/system-operations",
    requiredCapabilities: ["televote.manage"],
    publicationDependencies: ["results", "publication"],
    legacyRoutes: ["/televoting/admin/*"],
    featureFlag: null,
    noOrganizerCounterpartReason: null,
  }),
  feature({
    featureId: "results",
    canonicalDomain: "results",
    publicSurface: "/results",
    participantSurface: "/results",
    organizerSurface: "/admin/results",
    moderationSurface: null,
    diagnosticSurface: "/admin/system-operations",
    requiredCapabilities: ["results.calculate", "results.verify", "results.lock", "results.publish"],
    publicationDependencies: ["publication"],
    legacyRoutes: [],
    featureFlag: null,
    noOrganizerCounterpartReason: null,
  }),
  feature({
    featureId: "official-notices",
    canonicalDomain: "notice",
    publicSurface: "/",
    participantSurface: "/my-solaris/notices",
    organizerSurface: "/admin/communications",
    moderationSurface: null,
    diagnosticSurface: "/admin/system-operations",
    requiredCapabilities: ["communications.send"],
    publicationDependencies: [],
    legacyRoutes: ["/admin/inbox"],
    featureFlag: null,
    noOrganizerCounterpartReason: null,
  }),
  feature({
    featureId: "country-profile",
    canonicalDomain: "country-profile",
    publicSurface: "/countries/:country",
    participantSurface: "/my-solaris/page-builder",
    organizerSurface: "/admin/countries/:countryId?tab=public-profile",
    moderationSurface: "/admin/community-moderation",
    diagnosticSurface: null,
    requiredCapabilities: ["country_content.moderate", "country_design.moderate"],
    publicationDependencies: ["publication"],
    legacyRoutes: [],
    featureFlag: null,
    noOrganizerCounterpartReason: null,
  }),
  feature({
    featureId: "participant-view",
    canonicalDomain: "participation",
    publicSurface: null,
    participantSurface: "/my-solaris",
    organizerSurface: "/admin/countries/:countryId?tab=participant-view",
    moderationSurface: null,
    diagnosticSurface: "/admin/system-operations",
    requiredCapabilities: ["edition.read"],
    publicationDependencies: [],
    legacyRoutes: [],
    featureFlag: null,
    noOrganizerCounterpartReason: null,
  }),
  feature({
    featureId: "rules",
    canonicalDomain: "rules",
    publicSurface: "/rules",
    participantSurface: "/rules",
    organizerSurface: "/admin/rules-manager",
    moderationSurface: "/admin/integrity-investigations",
    diagnosticSurface: null,
    requiredCapabilities: ["rules.manage"],
    publicationDependencies: [],
    legacyRoutes: ["/admin/integrity-rules"],
    featureFlag: null,
    noOrganizerCounterpartReason: null,
  }),
  feature({
    featureId: "push-delivery",
    canonicalDomain: "notification",
    publicSurface: null,
    participantSurface: "/settings",
    organizerSurface: "/admin/system-operations",
    moderationSurface: null,
    diagnosticSurface: "/admin/system-operations",
    requiredCapabilities: ["edition.read"],
    publicationDependencies: [],
    legacyRoutes: [],
    featureFlag: null,
    noOrganizerCounterpartReason: null,
  }),
  feature({
    featureId: "saved-items",
    canonicalDomain: "participation",
    publicSurface: null,
    participantSurface: "/my-solaris/saved",
    organizerSurface: null,
    moderationSurface: null,
    diagnosticSurface: null,
    requiredCapabilities: [],
    publicationDependencies: [],
    legacyRoutes: [],
    featureFlag: null,
    noOrganizerCounterpartReason:
      "Saved/followed entities are private user preferences and deliberately have no Organizer read or mutation surface.",
  }),
] as const;

export function solarisV6Feature(featureId: string) {
  return SOLARIS_V6_FEATURE_SURFACES.find((item) => item.featureId === featureId) ?? null;
}

/**
 * V5 counterpart IDs must remain accounted for while V6 is introduced. This
 * makes accidental feature loss visible during the migration instead of
 * discovering it after an old route is retired.
 */
export const SOLARIS_V6_V5_COUNTERPART_IDS = new Set(
  ORGANISATION_OS_V5_COUNTERPARTS.map((item) => item.id),
);
