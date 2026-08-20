import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  useContentEvents,
  useEventReads,
  useMyFollows,
  useNotificationPreferences,
} from "@/lib/engagement-data";
import { useFanSession } from "@/lib/prediction-data";
import { buildPulseInbox, PULSE_CATEGORY_OPTIONS } from "@/lib/pulse";

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

  const unreadCount = user ? events.filter((event) => !readIds.has(event.id)).length : 0;
  const lead = events.find((event) => event.importance === "important") ?? events[0];
  const more = events.filter((event) => event.id !== lead?.id).slice(0, 2);

  return (
    <section
      className="overflow-hidden rounded-3xl border border-border/70 bg-surface"
      aria-labelledby="pulse-strip-title"
    >
      <div className="grid md:grid-cols-[1.15fr_.85fr]">
        <div className="bg-gradient-to-br from-primary/15 via-surface to-background p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
              What changed
            </p>
            {user && unreadCount > 0 && (
              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
                {unreadCount} new
              </span>
            )}
          </div>
          <h2 id="pulse-strip-title" className="mt-2 text-2xl font-bold tracking-tight">
            Solaris Pulse
          </h2>

          {lead ? (
            <Link to={lead.route} className="mt-4 block">
              <p className="text-lg font-bold leading-snug">{lead.title}</p>
              {lead.summary && (
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                  {lead.summary}
                </p>
              )}
              <p className="mt-3 text-sm font-semibold text-primary">See what changed →</p>
            </Link>
          ) : (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Current contest changes will appear here when something happens.
            </p>
          )}
        </div>

        <div className="border-t border-border/70 p-5 md:border-l md:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold">More updates</p>
            <Link to="/pulse" className="text-sm font-bold text-primary">
              Catch up →
            </Link>
          </div>

          {more.length ? (
            <div className="mt-3 divide-y divide-border/70">
              {more.map((event) => (
                <Link key={event.id} to={event.route} className="block py-3 first:pt-0 last:pb-0">
                  <p className="line-clamp-2 text-sm font-semibold leading-5">{event.title}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Nothing else needs your attention right now.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
