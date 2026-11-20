import { matchesPublicSearch } from "./public-search";

/** One read-only search contract for Organizer commands, countries and editions. */
export function matchesOrganizerCommandSearch(
  query: string,
  command: { label: string; group: string; keywords: string },
): boolean {
  return matchesPublicSearch(query, command.label, command.group, command.keywords);
}
