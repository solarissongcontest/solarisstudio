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
  mySolarisNotices: "/my-solaris/notices",
  mySolarisPageBuilder: "/my-solaris/page-builder",
  mySolarisTheme: "/my-solaris/theme",
  organizer: "/admin",
} as const;

export type CountrySearch = { country?: string };

export function countrySearch(country?: string): CountrySearch {
  return country ? { country } : {};
}
