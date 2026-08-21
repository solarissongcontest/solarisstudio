export type SolarisScheduleState =
  | "upcoming"
  | "opening-soon"
  | "open"
  | "closing-soon"
  | "closed";

export type ScheduleWindow = {
  opensAt?: string | null;
  closesAt?: string | null;
};

const SOON_MS = 48 * 60 * 60 * 1000;

function timestamp(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function resolveScheduleState(
  window: ScheduleWindow,
  now = Date.now(),
): SolarisScheduleState {
  const opens = timestamp(window.opensAt);
  const closes = timestamp(window.closesAt);

  if (closes !== null && now >= closes) return "closed";

  if (opens !== null && now < opens) {
    return opens - now <= SOON_MS ? "opening-soon" : "upcoming";
  }

  if (closes !== null && closes - now <= SOON_MS) return "closing-soon";
  return "open";
}

export function millisecondsUntil(value?: string | null, now = Date.now()) {
  const target = timestamp(value);
  return target === null ? null : Math.max(target - now, 0);
}

export function countdownParts(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

export function confirmationDateToUtc(date: string | null | undefined) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function formatCompactCountdown(milliseconds: number) {
  const { days, hours, minutes } = countdownParts(milliseconds);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}
