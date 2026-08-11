import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  useContentEvents,
  useEventReads,
  useMyFollows,
  useNotificationPreferences,
} from "@/lib/engagement-data";
import { useFanSession } from "@/lib/prediction-data";
import {
  buildPulseInbox,
  eventTypeLabel,
  PULSE_CATEGORY_OPTIONS,
} from "@/lib/pulse";

const DEFAULT_CATEGORIES = PULSE_CATEGORY_OPTIONS.map(([value]) => value);

export function PulseStrip() {
  const { data: user } = useFanSession();
  const { data: eventsData } = useContentEvents(12);
  const { data: followData } = useMyFollows(user?.id);
  const { data: reads } = useEventReads(user?.id);
  const { data: preferences } = useNotificationPreferences(user?.id);

  const readIds = useMemo(
    () => new Set((reads ?? []).map((read) => read.event_id)),
    [reads],
  );

  const events = buildPulseInbox({
    events: eventsData?.events ?? [],
    follows: followData?.follows ?? [],
    categories: preferences?.categories ?? DEFAULT_CATEGORIES,
    signedIn: Boolean(user),
    inAppEnabled: preferences?.in_app_enabled ?? true,
  });

  const unreadCount = user
    ? events.filter((event) => !readIds.has(event.id)).length
    : 0;

  return (
    <section className="glass p-4 sm:p-5" aria-labelledby="pulse-strip-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">
              Solaris Pulse
            </p>
            {user && unreadCount > 0 && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold text-primary">
                {unreadCount} unread
              </span>
            )}
          </div>
          <h2 id="pulse-strip-title" className="mt-1 font-display text-xl font-bold">
            {user ? "Your latest meaningful changes" : "What changed recently?"}
          </h2>
        </div>
        <Link to="/pulse" className="shrink-0 text-xs font-bold text-primary">
          Open →
        </Link>
      </div>

      {events.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {events.slice(0, 3).map((event) => (
            <Link
              key={event.id}
              to={event.route}
              className="rounded-xl bg-surface px-3 py-3 transition-colors hover:bg-surface-strong"
            >
              <div className="flex items-center gap-2">
                {user && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      readIds.has(event.id) ? "bg-border" : "bg-primary"
                    }`}
                  />
                )}
                <p className="text-[8px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                  {eventTypeLabel(event.event_type)}
                </p>
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-semibold">{event.title}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-surface px-3 py-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {user && preferences?.in_app_enabled === false
              ? "Your Pulse inbox is paused. You can switch it back on from Pulse preferences."
              : user && (followData?.follows.length ?? 0) > 0
                ? "Nothing important has changed for the things you follow. A rare moment of internet peace."
                : "Current edition status, open predictions and public updates are collected here."}
          </p>
        </div>
      )}
    </section>
  );
}
