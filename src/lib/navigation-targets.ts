/**
 * Canonical product destinations.
 *
 * Participant links should point at their V3 ownership surface. Legacy
 * MySolaris paths remain compatibility/deep-link entry points while cutover is
 * proven, but new participant navigation should converge on the canonical
 * destination instead of preserving duplicate workspaces forever.
 */
export const NAV_TARGETS = {
  mySolaris: "/my-solaris",
  mySolarisCountry: "/my-solaris/country",
  mySolarisTasks: "/my-solaris/tasks",
  mySolarisEntry: "/my-solaris/entry",
  mySolarisVoting: "/participate",
  mySolarisNotices: "/my-solaris/notices",
  mySolarisPageBuilder: "/my-solaris/page-builder",
  mySolarisTheme: "/my-solaris/theme",
  mySolarisHistory: "/my-solaris/history",
  mySolarisActivity: "/my-solaris/activity",
  mySolarisPredictions: "/my-solaris/predictions",
  mySolarisSaved: "/my-solaris/saved",
  mySolarisAccount: "/my-solaris/account",
  organizer: "/admin",
} as const;

export type CountrySearch = { country?: string };

export function countrySearch(country?: string): CountrySearch {
  return country ? { country } : {};
}
