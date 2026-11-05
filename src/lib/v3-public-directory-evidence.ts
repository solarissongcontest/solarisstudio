import { V3_PUBLIC_CAPABILITIES } from "./v3-capability-registry";

/**
 * Evidence INDEX for Public collection routes. This does not own migration,
 * publication, routing, rollout, or authorization truth. Capability IDs below
 * resolve to the existing canonical Public capability registry.
 *
 * A PR merge or a DOM class check is not visual/product certification.
 * Unverified entries remain explicitly uncertified until exact-head evidence
 * for all three actual rendered experiences has been reviewed.
 */
export type PublicDirectoryEvidence = {
  id: string;
  route: string;
  capabilityId: string;
  domainOwner: string;
  canonicalReadModel: string;
  installedApp: string;
  mobileWeb: string;
  desktopWeb: string;
  productParity: "unverified" | "partial" | "parity";
  responsiveEvidence: readonly string[];
  accessibilityEvidence: readonly string[];
  visualEvidence: readonly string[];
  exactHeadCi: {
    sha: string | null;
    requiredChecks: readonly string[];
    passedChecks: readonly string[];
  };
  certification: "uncertified" | "candidate" | "certified";
};

const REQUIRED_CHECKS = [
  "Quality",
  "Browser audit",
  "Client bundle budget evidence",
] as const;

type DirectoryDefinition = Pick<
  PublicDirectoryEvidence,
  "id" | "route" | "capabilityId" | "domainOwner" | "canonicalReadModel"
  | "installedApp" | "mobileWeb" | "desktopWeb" | "productParity"
>;

/** A deliberately unverified baseline. Never infer certification from merged code. */
function registerDirectory(definition: DirectoryDefinition): PublicDirectoryEvidence {
  return {
    ...definition,
    responsiveEvidence: [],
    accessibilityEvidence: [],
    visualEvidence: [],
    exactHeadCi: {
      sha: null,
      requiredChecks: REQUIRED_CHECKS,
      passedChecks: [],
    },
    certification: "uncertified",
  };
}

export const V3_PUBLIC_DIRECTORY_EVIDENCE: readonly PublicDirectoryEvidence[] = [
  registerDirectory({
    id: "countries", route: "/countries", capabilityId: "explore-root",
    domainOwner: "country-profile", canonicalReadModel: "published country discovery",
    installedApp: "focused flag grid and region sheet",
    mobileWeb: "editorial 3:2 flag rows and native region filter",
    desktopWeb: "country explorer with persistent region rail",
    productParity: "partial",
  }),
  registerDirectory({
    id: "editions", route: "/editions", capabilityId: "edition-hub",
    domainOwner: "edition", canonicalReadModel: "public edition chronology",
    installedApp: "compact edition timeline and groups",
    mobileWeb: "chronological editorial edition rows",
    desktopWeb: "edition collection with contextual year and status filters",
    productParity: "partial",
  }),
  registerDirectory({
    id: "tools", route: "/tools", capabilityId: "explore-root",
    domainOwner: "public-ux", canonicalReadModel: "published tool navigation",
    installedApp: "grouped action launcher",
    mobileWeb: "compact descriptive utility directory",
    desktopWeb: "categorized utility explorer",
    productParity: "partial",
  }),
  registerDirectory({
    id: "site-directory", route: "/site-directory", capabilityId: "explore-root",
    domainOwner: "public-ux", canonicalReadModel: "canonical public destination registry",
    installedApp: "grouped app destinations",
    mobileWeb: "browser-native sitemap sections",
    desktopWeb: "expanded structured site directory",
    productParity: "partial",
  }),
  registerDirectory({
    id: "shows", route: "/shows", capabilityId: "live-show",
    domainOwner: "show", canonicalReadModel: "publication-safe show and broadcast state",
    installedApp: "state-first show discovery",
    mobileWeb: "linked broadcast rows with status",
    desktopWeb: "editorial shows and contextual state filters",
    productParity: "unverified",
  }),
  registerDirectory({
    id: "archive", route: "/archive", capabilityId: "explore-root",
    domainOwner: "archive", canonicalReadModel: "published historical destinations",
    installedApp: "historical collection and category sheet",
    mobileWeb: "searchable history catalogue",
    desktopWeb: "archive with subject rail and contextual cards",
    productParity: "unverified",
  }),
  registerDirectory({
    id: "stories", route: "/stories", capabilityId: "stories",
    domainOwner: "story", canonicalReadModel: "publication- and spoiler-safe stories",
    installedApp: "focused spoiler-aware story collection",
    mobileWeb: "editorial stories and edition links",
    desktopWeb: "magazine-style story directory",
    productParity: "unverified",
  }),
  registerDirectory({
    id: "reference", route: "/encyclopedia", capabilityId: "explore-root",
    domainOwner: "reference", canonicalReadModel: "bounded published Reference projection",
    installedApp: "topic search and category sheet",
    mobileWeb: "article rows and browser topic navigation",
    desktopWeb: "knowledge-base with topic rail",
    productParity: "unverified",
  }),
  registerDirectory({
    id: "rulebook", route: "/rules/chapters", capabilityId: "rules",
    domainOwner: "rules", canonicalReadModel: "22 official chapter records",
    installedApp: "grouped chapter list and filter sheet",
    mobileWeb: "numbered chapter links and native category select",
    desktopWeb: "chapter directory and contextual navigation",
    productParity: "unverified",
  }),
  registerDirectory({
    id: "music", route: "/music", capabilityId: "explore-root",
    domainOwner: "music", canonicalReadModel: "published song and artist discovery projection",
    installedApp: "focused published music previews and catalogue links",
    mobileWeb: "editorial music discovery and browser links",
    desktopWeb: "music-first discovery feature and subject collections",
    productParity: "unverified",
  }),
  registerDirectory({
    id: "songs", route: "/songs", capabilityId: "explore-root",
    domainOwner: "music", canonicalReadModel: "durable published Song identities",
    installedApp: "music-focused compact song rows",
    mobileWeb: "song titles and linked artist context",
    desktopWeb: "song catalogue with discoverable relationships",
    productParity: "unverified",
  }),
  registerDirectory({
    id: "artists", route: "/artists", capabilityId: "explore-root",
    domainOwner: "music", canonicalReadModel: "durable published Artist identities",
    installedApp: "identity and portrait-first collection",
    mobileWeb: "editorial artist rows and song links",
    desktopWeb: "artist explorer with relationship context",
    productParity: "unverified",
  }),
];

/**
 * This guard checks registry consistency and blocks false certification.
 * It does NOT purport to assess screenshot quality. A human or authorized
 * visual review must supply real screenshot evidence separately.
 */
export function validateV3PublicDirectoryEvidence(
  entries: readonly PublicDirectoryEvidence[],
  expectedCandidateSha: string | null,
): string[] {
  const issues: string[] = [];
  const knownCapabilities = new Set<string>(V3_PUBLIC_CAPABILITIES.map((item) => item.id));
  const seenIds = new Set<string>();
  const seenRoutes = new Set<string>();
  for (const entry of entries) {
    const prefix = `directory ${entry.id}`;
    if (seenIds.has(entry.id)) issues.push(`${prefix}: duplicate ID`);
    if (seenRoutes.has(entry.route)) issues.push(`${prefix}: duplicate route ${entry.route}`);
    seenIds.add(entry.id);
    seenRoutes.add(entry.route);
    if (!entry.route.startsWith("/")) issues.push(`${prefix}: invalid route`);
    if (!knownCapabilities.has(entry.capabilityId)) {
      issues.push(`${prefix}: unknown canonical capability ${entry.capabilityId}`);
    }
    if (!entry.canonicalReadModel.trim() || !entry.domainOwner.trim()) {
      issues.push(`${prefix}: missing domain ownership or read model`);
    }
    if (![entry.installedApp, entry.mobileWeb, entry.desktopWeb].every(Boolean)) {
      issues.push(`${prefix}: missing required presentation family`);
    }
    if (entry.certification !== "uncertified") {
      if (entry.productParity !== "parity") issues.push(`${prefix}: product parity not proven`);
      if ([entry.responsiveEvidence, entry.accessibilityEvidence, entry.visualEvidence]
        .some((evidence) => evidence.length === 0 || evidence.some((item) => !item.trim()))) {
        issues.push(`${prefix}: three-experience verification evidence incomplete`);
      }
      if (!expectedCandidateSha || !/^[0-9a-f]{40}$/.test(expectedCandidateSha)
        || entry.exactHeadCi.sha !== expectedCandidateSha) {
        issues.push(`${prefix}: exact candidate SHA evidence missing or stale`);
      }
      // A row may require extra checks, but cannot remove the canonical minimum.
      const requiredChecks = new Set([...REQUIRED_CHECKS, ...entry.exactHeadCi.requiredChecks]);
      const missing = [...requiredChecks].filter(
        (check) => !entry.exactHeadCi.passedChecks.includes(check),
      );
      if (missing.length) issues.push(`${prefix}: missing required CI: ${missing.join(", ")}`);
    }
  }
  return issues;
}
