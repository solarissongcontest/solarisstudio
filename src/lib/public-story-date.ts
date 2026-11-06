import { SOLARIS_TIME_ZONE } from "./public-time";

/**
 * Historical Story dates must be stable between the server render and the
 * browser. The viewer's device locale/time zone cannot move a published
 * timeline event onto another calendar day.
 */
export function formatSolarisStoryDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SOLARIS_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
