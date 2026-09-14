import type { SolarisCapability } from "./permissions-v2";

type RouteCapabilityRule = {
  matches: (pathname: string) => boolean;
  capability: SolarisCapability;
};

const ROUTE_CAPABILITY_RULES: RouteCapabilityRule[] = [
  rule(["/admin/access-permissions"], "permissions.read"),
  rule(["/admin/feature-rollout"], "rollout.read"),
  rule(["/admin/communications"], "communications.read"),
  rule(["/admin/rules-manager", "/admin/rule-interpretations"], "rules.read"),
  rule(["/admin/integrity"], "integrity.read"),
  rule(["/admin/results"], "results.preview"),
  rule(
    [
      "/admin/jury/",
      "/admin/voting-system/",
      "/admin/televote/",
      "/admin/friend-voting",
      "/admin/jury-integrity",
      "/admin/voting-lab",
    ],
    "voting.read",
  ),
  rule(["/admin/broadcast-rundown", "/admin/design/", "/admin/edition-theme/"], "broadcast.read"),
  rule(["/admin/storytelling"], "story.read"),
  rule(["/admin/media-assets", "/admin/publication/"], "publishing.read"),
  rule(["/admin/hosts"], "host.read"),
  rule(["/admin/entries/"], "entry.read_private"),
  rule(
    [
      "/admin/countries",
      "/admin/country-accounts",
      "/admin/hod-history",
      "/admin/eligibility",
      "/admin/submission-versions",
    ],
    "delegation.read",
  ),
];

export function capabilityForOrganizerPath(pathname: string): SolarisCapability | null {
  if (!pathname.startsWith("/admin")) return null;
  return (
    ROUTE_CAPABILITY_RULES.find((candidate) => candidate.matches(pathname))?.capability ??
    "edition.read"
  );
}

function rule(prefixes: string[], capability: SolarisCapability): RouteCapabilityRule {
  return {
    matches: (pathname) => prefixes.some((prefix) => pathname.startsWith(prefix)),
    capability,
  };
}
