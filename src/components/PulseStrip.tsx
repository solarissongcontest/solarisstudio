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
import {
  buildPulseInbox,
  eventTypeLabel,
  PULSE_CATEGORY_OPTIONS,
} from "@/lib/pulse";
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

  const unreadCount = user
    ? events.filter((event) => !readIds.has(event.id)).length
    : 0;

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
    <section className="glass p-4 sm:p-5" aria-labelledby="pulse-strip-title">
      {activeRound && (
        <Link
          to="/confirmations"
          className="mb-4 flex min-w-0 items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.07] px-3 py-3 transition-colors hover:bg-primary/[0.1]"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Clock3 className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[8px] font-black uppercase tracking-[0.16em] text-primary">
              {roundState === "open" || roundState === "closing-soon"
                ? "Confirmations open"
                : "Coming up"}
            </span>
            <span className="mt-0.5 block truncate text-sm font-semibold">{activeRound.name}</span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
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
          <span className="shrink-0 text-xs font-bold text-primary">Open →</span>
        </Link>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
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
          <h2 id="pulse-strip-title" className="mt-1 text-xl font-bold tracking-[-0.025em]">
            What’s happening across Solaris?
          </h2>
          {user && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Your personal country feed also lives in MySolaris.
            </p>
          )}
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
                : "Entry reveals, national finals, results, records and other public updates collect here."}
          </p>
        </div>
      )}
    </section>
  );
}
