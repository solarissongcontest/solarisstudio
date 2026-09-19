export const SOLARIS_TIME_ZONE = "Europe/Helsinki";

function parseDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatEventDateTime(
  value: string | Date,
  {
    timeZone = SOLARIS_TIME_ZONE,
    locale,
  }: {
    timeZone?: string;
    locale?: string;
  } = {},
) {
  const date = parseDate(value);
  if (!date) return typeof value === "string" ? value : "";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
    timeZoneName: "short",
  }).format(date);
}

export function formatEventWallTime(
  value: string | Date,
  {
    timeZone = SOLARIS_TIME_ZONE,
    locale,
  }: {
    timeZone?: string;
    locale?: string;
  } = {},
) {
  const date = parseDate(value);
  if (!date) return typeof value === "string" ? value : "";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

export function shouldShowLocalEventTime(
  value: string | Date,
  canonicalTimeZone: string,
  localTimeZone: string,
  locale?: string,
) {
  if (!localTimeZone || localTimeZone === canonicalTimeZone) return false;
  return (
    formatEventWallTime(value, { timeZone: canonicalTimeZone, locale }) !==
    formatEventWallTime(value, { timeZone: localTimeZone, locale })
  );
}
