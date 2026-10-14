export type PublicSearchProvider = {
  id: string;
  entryCapabilityId: string;
  contentOwnerCapabilityIds: string[];
  kind: "database-rpc" | "navigation" | "governance" | "compatibility-catalog";
  sourcePath: string;
  evidencePaths: string[];
  sourceSignals: string[];
  publicationBoundary: string;
  migrationStatus: "canonical" | "compatibility" | "retiring";
};

/**
 * Canonical search-provider inventory for Public V3.
 *
 * Search is one user capability with several data providers. Registering those
 * providers separately prevents a new search source from bypassing publication
 * and ownership rules while still appearing under the same global Search UI.
 */
export const PUBLIC_V3_SEARCH_PROVIDERS: readonly PublicSearchProvider[] = [
  {
    id: "installed-app-public-rpc",
    entryCapabilityId: "public-search",
    contentOwnerCapabilityIds: [
      "public-edition-hub",
      "public-country-entity",
      "public-scoreboard",
      "public-stories",
      "public-results",
    ],
    kind: "database-rpc",
    sourcePath: "src/components/public/PublicCommandPalette.tsx",
    evidencePaths: ["supabase/migrations/20261013140000_v3_search_cutover.sql"],
    sourceSignals: [
      'rpc("solaris_public_search"',
      "create or replace function public.solaris_public_search",
      "show_publication_enabled",
    ],
    publicationBoundary:
      "Security-definer public search RPC is explicitly granted to anon/authenticated and filters searchable contest entities through current public publication rules.",
    migrationStatus: "canonical",
  },
  {
    id: "public-navigation",
    entryCapabilityId: "public-search",
    contentOwnerCapabilityIds: ["public-explore", "public-participate", "public-results", "public-me"],
    kind: "navigation",
    sourcePath: "src/lib/public-search.ts",
    evidencePaths: ["src/lib/public-navigation.ts"],
    sourceSignals: ["navigationSearchResults", "PUBLIC_DESTINATIONS"],
    publicationBoundary:
      "Static product destinations only; no contest data is introduced by this provider.",
    migrationStatus: "canonical",
  },
  {
    id: "public-governance-library",
    entryCapabilityId: "public-search",
    contentOwnerCapabilityIds: ["public-rules-guidance"],
    kind: "governance",
    sourcePath: "src/lib/public-library-governance.ts",
    evidencePaths: ["src/components/public/PublicCommandPalette.tsx"],
    sourceSignals: ["searchGovernanceLibrary", "GOVERNANCE_LIBRARY_DESTINATIONS"],
    publicationBoundary:
      "Searches canonical public SSC rules and caller-supplied published interpretation/release data; protected case data is not a provider input.",
    migrationStatus: "canonical",
  },
  {
    id: "legacy-web-public-catalog",
    entryCapabilityId: "public-search",
    contentOwnerCapabilityIds: [
      "public-country-entity",
      "public-edition-hub",
      "public-scoreboard",
      "public-stories",
      "public-results",
    ],
    kind: "compatibility-catalog",
    sourcePath: "src/components/public/PublicCommandPalette.tsx",
    evidencePaths: ["src/lib/publication.ts", "src/lib/studio2-storytelling.ts"],
    sourceSignals: ["WebPublicPaletteDialog", "useCountries", "useEditions", "useAllParticipants", "useAllShows", "loadPublicStorylines", "isShowPublic"],
    publicationBoundary:
      "Legacy web compatibility path composes canonical public data hooks and explicit show/story publication helpers. Installed-app V3 search uses the database RPC instead.",
    migrationStatus: "compatibility",
  },
] as const;
