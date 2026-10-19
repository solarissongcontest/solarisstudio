import type { Show } from "./data";
import { isShowPublic } from "./publication";
import { showModeConfig } from "./show-mode";
import type { V3ExploreNextEvent } from "./v3-explore";

type TimedPublicEvent = V3ExploreNextEvent & {
  timestamp: number;
  sortOrder: number;
};

/**
 * Resolve the next genuinely scheduled public show using canonical broadcast
 * metadata and server time supplied by the caller. Invalid, past, ended and
 * private shows never become public Explore chronology.
 */
export function resolveV3ExploreNextPublicEvent(
  shows: readonly Show[],
  serverTime: string,
): V3ExploreNextEvent | null {
  const now = Date.parse(serverTime);
  if (!Number.isFinite(now)) return null;

  const candidates = shows.flatMap<TimedPublicEvent>((show) => {
    if (!isShowPublic(show)) return [];
    const config = showModeConfig(show);
    if (config.phase !== "scheduled" || !config.scheduledStart) return [];
    const timestamp = Date.parse(config.scheduledStart);
    if (!Number.isFinite(timestamp) || timestamp <= now) return [];

    return [{
      id: show.id,
      title: show.name,
      startsAt: config.scheduledStart,
      href: `/shows/${show.id}`,
      timestamp,
      sortOrder: show.sort_order,
    }];
  });

  const next = candidates.sort(
    (left, right) =>
      left.timestamp - right.timestamp ||
      left.sortOrder - right.sortOrder ||
      left.id.localeCompare(right.id),
  )[0];

  if (!next) return null;
  return {
    id: next.id,
    title: next.title,
    startsAt: next.startsAt,
    href: next.href,
  };
}
