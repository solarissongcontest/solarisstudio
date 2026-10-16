/**
 * Canonical product destinations.
 *
 * Compatibility routes remain explicit while V3 ownership surfaces get their
 * own targets. This lets existing deep links survive cutover without forcing
 * new participant navigation back into a duplicate legacy workspace.
 */
export const NAV_TARGETS = {
  mySolaris: "/my-solaris",
  mySolarisCountry: "/my-solaris/country",
  mySolarisTasks: "/my-solaris/tasks",
  mySolarisEntry: "/my-solaris/entry",
  mySolarisVoting: "/my-solaris/voting",
  participate: "/participate",
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
