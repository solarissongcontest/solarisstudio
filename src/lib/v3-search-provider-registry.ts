export type V3SearchProvider = {
  id: string;
  mode: "remote-rpc" | "local-projection" | "local-navigation" | "local-history";
  ownerDomain: string;
  capabilityId: string;
  resultGroups: readonly string[];
  evidence: readonly string[];
  notes: string;
};

/**
 * Search is a capability fan-in, not a separate truth store. Every provider is
 * attached to the domain/projection that owns the result and to a registered
 * Public capability so new search sources cannot quietly invent product scope.
 */
export const V3_SEARCH_PROVIDER_REGISTRY = [
  {
    id: "installed-app-public-search-rpc",
    mode: "remote-rpc",
    ownerDomain: "public-ux",
    capabilityId: "global-search",
    resultGroups: ["Countries", "Wiki", "Editions", "Shows", "Entries", "Solaris"],
    evidence: [
      "src/components/public/PublicCommandPalette.tsx#solaris_public_search",
      "public.solaris_public_search",
    ],
    notes: "Installed-app search uses the existing server-authoritative public search RPC and merges local actions/governance results.",
  },
  {
    id: "navigation-actions",
    mode: "local-navigation",
    ownerDomain: "public-ux",
    capabilityId: "global-search",
    resultGroups: ["Actions"],
    evidence: [
      "src/components/public/PublicCommandPalette.tsx#actionResults",
      "src/lib/public-search.ts#navigationSearchResults",
    ],
    notes: "Navigation/action affordances point into already registered capabilities; they are not domain records.",
  },
  {
    id: "country-and-wiki",
    mode: "local-projection",
    ownerDomain: "country-profile",
    capabilityId: "country-profile",
    resultGroups: ["Countries", "Wiki"],
    evidence: ["src/components/public/PublicCommandPalette.tsx#useCountries"],
    notes: "Country identity/profile results are derived from canonical country projections.",
  },
  {
    id: "editions",
    mode: "local-projection",
    ownerDomain: "edition",
    capabilityId: "edition-hub",
    resultGroups: ["Editions"],
    evidence: ["src/components/public/PublicCommandPalette.tsx#useEditions"],
    notes: "Edition results route to the canonical edition entity hub.",
  },
  {
    id: "shows",
    mode: "local-projection",
    ownerDomain: "live-show",
    capabilityId: "explore-root",
    resultGroups: ["Shows"],
    evidence: ["src/components/public/PublicCommandPalette.tsx#useAllShows"],
    notes: "Show results are read-only published/visible show projections.",
  },
  {
    id: "entries",
    mode: "local-projection",
    ownerDomain: "entry",
    capabilityId: "explore-root",
    resultGroups: ["Entries"],
    evidence: ["src/components/public/PublicCommandPalette.tsx#useAllParticipants"],
    notes: "Search deduplicates logical edition-country entries instead of exposing show appearances as separate entries.",
  },
  {
    id: "stories",
    mode: "local-projection",
    ownerDomain: "story",
    capabilityId: "stories",
    resultGroups: ["Stories"],
    evidence: ["src/components/public/PublicCommandPalette.tsx#loadPublicStorylines"],
    notes: "Only published public storyline projections participate in search.",
  },
  {
    id: "scorecharts",
    mode: "local-projection",
    ownerDomain: "results",
    capabilityId: "scorecharts",
    resultGroups: ["Scorecharts"],
    evidence: ["src/components/public/PublicCommandPalette.tsx#scorechartShows"],
    notes: "Search exposes scorecharts only when the show is public and detailed voting is published.",
  },
  {
    id: "records",
    mode: "local-projection",
    ownerDomain: "results",
    capabilityId: "records",
    resultGroups: ["Records"],
    evidence: ["src/components/public/PublicCommandPalette.tsx#buildCanonicalFanRecords"],
    notes: "Records use the canonical fan-record projection rather than a second search-specific result calculation.",
  },
  {
    id: "governance-library",
    mode: "local-projection",
    ownerDomain: "rules",
    capabilityId: "rules",
    resultGroups: ["Governance"],
    evidence: ["src/components/public/PublicCommandPalette.tsx#searchGovernanceLibrary"],
    notes: "Rules/governance search delegates to the existing public governance library provider.",
  },
  {
    id: "recent-public-destinations",
    mode: "local-history",
    ownerDomain: "public-ux",
    capabilityId: "global-search",
    resultGroups: ["Recent"],
    evidence: ["src/components/public/PublicCommandPalette.tsx#readPublicRecents"],
    notes: "Recent destinations are local navigation history, never canonical contest state.",
  },
] as const satisfies readonly V3SearchProvider[];
