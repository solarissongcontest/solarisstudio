/**
 * Canonical product destinations.
 *
 * Keep participant links on the MySolaris route family. Legacy Country Hub
 * paths remain compatibility entry points, but they should not be authored by
 * new UI code.
 */
export const NAV_TARGETS = {
  mySolaris: "/my-solaris",
  mySolarisCountry: "/my-solaris/country",
  mySolarisTasks: "/my-solaris/tasks",
  mySolarisEntry: "/my-solaris/entry",
  mySolarisVoting: "/my-solaris/voting",
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
