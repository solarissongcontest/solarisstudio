import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getPublicRounds } from "@/lib/confirmation-rounds.functions";
import {
  useContentEvents,
  useEventReads,
  useMyFollows,
  useNotificationPreferences,
} from "@/lib/engagement-data";
import { useFanSession } from "@/lib/prediction-data";
import { buildPulseInbox, PULSE_CATEGORY_OPTIONS } from "@/lib/pulse";
import {
  formatCompactCountdown,
  millisecondsUntil,
  resolveScheduleState,
} from "@/lib/solaris-schedule";

const DEFAULT_CATEGORIES = PULSE_CATEGORY_OPTIONS.map(([value]) => value);

function confirmationState(
  round: { status?: string | null; opens_at?: string | null; closes_at?: string | null },
  now: number,
) {
  return resolveScheduleState(
    { status: round.status, opensAt: round.opens_at, closesAt: round.closes_at },
    now,
  );
}

export function PulseStrip() {
  const { data: user } = useFanSession();
  const { data: eventsData } = useContentEvents(12);
  const { data: followData } = useMyFollows(user?.id);
  const { data: reads } = useEventReads(user?.id);
  const { data: preferences } = useNotificationPreferences(user?.id);
  const [now, setNow] = useState(() => Date.now());

  const roundsQuery = useQuery({
    queryKey: ["home-confirmation-rounds"],
    queryFn: () => getPublicRounds(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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

  const activeRound = useMemo(() => {
    return [...(roundsQuery.data ?? [])]
      .filter((round) =>
        ["upcoming", "opening-soon", "open", "closing-soon"].includes(
          confirmationState(round, now),
        ),
      )
      .sort((a, b) => {
        const aState = confirmationState(a, now);
        const bState = confirmationState(b, now);
        const score = (state: string) =>
          state === "open" || state === "closing-soon" ? 0 : state === "opening-soon" ? 1 : 2;
        const difference = score(aState) - score(bState);
        if (difference !== 0) return difference;
        return (a.opens_at ? new Date(a.opens_at).getTime() : 0) -
          (b.opens_at ? new Date(b.opens_at).getTime() : 0);
      })[0];
  }, [roundsQuery.data, now]);

  const roundState = activeRound ? confirmationState(activeRound, now) : null;
  const untilOpen = activeRound?.opens_at ? millisecondsUntil(activeRound.opens_at, now) : null;
  const untilClose = activeRound?.closes_at ? millisecondsUntil(activeRound.closes_at, now) : null;

  return (
    <section className="overflow-hidden rounded-3xl border border-border/70 bg-surface" aria-labelledby="pulse-strip-title">
      {activeRound && (
        <Link
          to="/confirmations"
          className="flex min-w-0 items-center gap-3 border-b border-primary/20 bg-primary/[0.07] px-4 py-3 transition-colors hover:bg-primary/[0.1] sm:px-5"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Clock3 className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold uppercase tracking-[0.12em] text-primary">
              {roundState === "open" || roundState === "closing-soon" ? "Confirmations open" : "Coming up"}
            </span>
            <span className="mt-0.5 block truncate text-sm font-semibold">{activeRound.name}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {roundState === "open"
                ? untilClose !== null
                  ? `Open now · closes in ${formatCompactCountdown(untilClose)}`
                  : "Open now"
                : roundState === "closing-soon"
                  ? untilClose !== null
                    ? `Closing in ${formatCompactCountdown(untilClose)}`
                    : "Closing soon"
                  : untilOpen !== null
                    ? `Opens in ${formatCompactCountdown(untilOpen)}`
                    : "Opening time is set in Confirmations"}
            </span>
          </span>
          <span className="shrink-0 text-sm font-bold text-primary">Open →</span>
        </Link>
      )}

      <div className="grid md:grid-cols-[1.15fr_.85fr]">
        <div className="bg-gradient-to-br from-primary/15 via-surface to-background p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">What changed</p>
            {user && unreadCount > 0 && (
              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
                {unreadCount} new
              </span>
            )}
          </div>
          <h2 id="pulse-strip-title" className="mt-2 text-2xl font-bold tracking-tight">Solaris Pulse</h2>

          {lead ? (
            <Link to={lead.route} className="mt-4 block">
              <p className="text-lg font-bold leading-snug">{lead.title}</p>
              {lead.summary && (
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{lead.summary}</p>
              )}
              <p className="mt-3 text-sm font-semibold text-primary">See what changed →</p>
            </Link>
          ) : (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {user && preferences?.in_app_enabled === false
                ? "Your Pulse inbox is paused. You can switch it back on from Pulse preferences."
                : "Current contest changes will appear here when something happens."}
            </p>
          )}
        </div>

        <div className="border-t border-border/70 p-5 md:border-l md:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold">More updates</p>
            <Link to="/pulse" className="text-sm font-bold text-primary">Catch up →</Link>
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
