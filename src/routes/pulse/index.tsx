import { createFileRoute, Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import type { ContentEventRow } from "@/integrations/supabase/app-types";
import {
  editionLabel,
  useAllContestEntities,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import {
  useContentEvents,
  useEventReads,
  useMarkAllEventsRead,
  useMarkEventRead,
  useMyFollows,
  useNotificationPreferences,
  usePredictionMovement,
  useSaveNotificationPreferences,
  useSetFanFollow,
} from "@/lib/engagement-data";
import { entityDisplayMap } from "@/lib/entities";
import {
  useFanSession,
  useMyPrediction,
  usePredictionRounds,
} from "@/lib/prediction-data";
import {
  buildPulseInbox,
  buildRecordInsights,
  eventTypeLabel,
  predictionLeaderMovements,
  PULSE_CATEGORY_OPTIONS,
  type PulseCategory,
} from "@/lib/pulse";

export const Route = createFileRoute("/pulse/")({
  head: () => ({ meta: [{ title: "Solaris Pulse — Solaris Studio" }] }),
  component: SolarisPulsePage,
});

const DEFAULT_CATEGORIES = PULSE_CATEGORY_OPTIONS.map(([value]) => value);

type FeedCategory =
  | "latest"
  | "contest"
  | "countries"
  | "music"
  | "numbers"
  | "announcements";

type CatchUpWindow = "today" | "week" | "edition";

const FEED_CATEGORIES: ReadonlyArray<readonly [FeedCategory, string]> = [
  ["latest", "Latest"],
  ["contest", "Contest"],
  ["countries", "Countries"],
  ["music", "Music"],
  ["numbers", "Numbers"],
  ["announcements", "Announcements"],
];

const CATCH_UP_WINDOWS: ReadonlyArray<readonly [CatchUpWindow, string]> = [
  ["today", "Today"],
  ["week", "This week"],
  ["edition", "This edition"],
];

const PREDICTION_LABELS: Record<string, string> = {
  winner: "Winner prediction",
  jury_winner: "Jury winner",
  televote_winner: "Televote winner",
  top_three: "Top three",
  top_ten: "Top ten",
  qualifier: "Qualifier prediction",
  full_ranking: "Full ranking",
};

function payloadObject(event: ContentEventRow) {
  const payload = event.payload;
  if (!payload || Array.isArray(payload) || typeof payload !== "object") return {};
  return payload as Record<string, unknown>;
}

function payloadString(event: ContentEventRow, ...keys: string[]) {
  const payload = payloadObject(event);
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function eventFeedCategory(event: ContentEventRow): Exclude<FeedCategory, "latest"> {
  if (event.entity_type === "country") return "countries";
  if (event.event_type === "entry_published") return "music";
  if (
    event.event_type === "record_broken" ||
    event.event_type === "record_threat" ||
    event.event_type.startsWith("prediction_")
  ) {
    return "numbers";
  }
  if (
    event.event_type === "running_order_published" ||
    event.event_type === "results_published" ||
    event.entity_type === "show" ||
    event.entity_type === "edition"
  ) {
    return "contest";
  }
  return "announcements";
}

function eventBelongsToEdition(event: ContentEventRow, editionId?: string) {
  if (!editionId) return false;
  if (event.entity_type === "edition" && event.entity_id === editionId) return true;
  return payloadString(event, "editionId", "edition_id") === editionId;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortDateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function actionLabel(event: ContentEventRow) {
  if (event.event_type === "entry_published") return "See the entry";
  if (event.event_type === "running_order_published") return "See the running order";
  if (event.event_type === "results_published") return "See the results";
  if (event.event_type.startsWith("prediction_")) return "See predictions";
  if (event.event_type.includes("record")) return "Explore the record";
  if (event.entity_type === "country") return "Open the country";
  if (event.entity_type === "edition") return "Open the edition";
  return "See what changed";
}

function EventMeta({ event, unread }: { event: ContentEventRow; unread?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
      {unread && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
      <span>{eventTypeLabel(event.event_type)}</span>
      {event.importance === "important" && (
        <>
          <span aria-hidden="true">·</span>
          <span className="text-primary">Important</span>
        </>
      )}
      <span aria-hidden="true">·</span>
      <span>{shortDateLabel(event.published_at)}</span>
    </div>
  );
}

function EmptyFeed({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-surface/70 p-5">
      <p className="text-sm leading-6 text-muted-foreground">{children}</p>
    </div>
  );
}

function SolarisPulsePage() {
  const { data: user } = useFanSession();
  const { data: eventsData, isLoading } = useContentEvents(100);
  const { data: followData } = useMyFollows(user?.id);
  const { data: reads } = useEventReads(user?.id);
  const markRead = useMarkEventRead(user?.id);
  const markAllRead = useMarkAllEventsRead(user?.id);
  const setFollow = useSetFanFollow(user?.id);
  const { data: preferences } = useNotificationPreferences(user?.id);
  const savePreferences = useSaveNotificationPreferences(user?.id);

  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: countries } = useCountries();
  const { data: entities } = useAllContestEntities();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: roundData } = usePredictionRounds();

  const [categories, setCategories] = useState<PulseCategory[]>(DEFAULT_CATEGORIES);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [preferenceMessage, setPreferenceMessage] = useState<string | null>(null);
  const [followMessage, setFollowMessage] = useState<string | null>(null);
  const [lastRoute, setLastRoute] = useState<string | null>(null);
  const [previousVisit, setPreviousVisit] = useState<string | null>(null);
  const [feedCategory, setFeedCategory] = useState<FeedCategory>("latest");
  const [catchUpWindow, setCatchUpWindow] = useState<CatchUpWindow>("week");

  useEffect(() => {
    if (!preferences) return;
    setCategories(preferences.categories as PulseCategory[]);
    setInAppEnabled(preferences.in_app_enabled);
  }, [preferences]);

  useEffect(() => {
    const storedRoute = window.localStorage.getItem("solaris:last-meaningful-route");
    if (storedRoute?.startsWith("/") && !storedRoute.startsWith("//") && storedRoute !== "/pulse") {
      setLastRoute(storedRoute);
    }

    const storedVisit = window.localStorage.getItem("solaris:pulse:last-visit");
    if (storedVisit && Number.isFinite(new Date(storedVisit).getTime())) {
      setPreviousVisit(storedVisit);
    }
    window.localStorage.setItem("solaris:pulse:last-visit", new Date().toISOString());
  }, []);

  const follows = followData?.follows ?? [];
  const readIds = useMemo(
    () => new Set((reads ?? []).map((read) => read.event_id)),
    [reads],
  );

  const allEvents = useMemo(
    () =>
      buildPulseInbox({
        events: eventsData?.events ?? [],
        follows: [],
        categories: DEFAULT_CATEGORIES,
        signedIn: false,
        inAppEnabled: true,
      }),
    [eventsData?.events],
  );

  const personalEvents = useMemo(
    () =>
      buildPulseInbox({
        events: eventsData?.events ?? [],
        follows,
        categories,
        signedIn: Boolean(user),
        inAppEnabled,
      }),
    [eventsData?.events, follows, categories, user, inAppEnabled],
  );

  const unreadIds = user
    ? personalEvents.filter((event) => !readIds.has(event.id)).map((event) => event.id)
    : [];

  const filteredEvents = useMemo(
    () =>
      feedCategory === "latest"
        ? allEvents
        : allEvents.filter((event) => eventFeedCategory(event) === feedCategory),
    [allEvents, feedCategory],
  );

  const leadEvent =
    filteredEvents.find((event) => event.importance === "important") ?? filteredEvents[0];
  const secondaryStories = filteredEvents
    .filter((event) => event.id !== leadEvent?.id)
    .slice(0, 5);
  const quickUpdates = filteredEvents
    .filter((event) => event.id !== leadEvent?.id)
    .slice(5, 11);

  const sinceVisitEvents = useMemo(() => {
    if (!previousVisit) return allEvents.slice(0, 3);
    const previousTime = new Date(previousVisit).getTime();
    return allEvents
      .filter((event) => new Date(event.published_at).getTime() > previousTime)
      .slice(0, 3);
  }, [allEvents, previousVisit]);

  const latestEdition = [...(editions ?? [])]
    .filter((edition) => edition.published)
    .sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0];

  const latestShows = latestEdition
    ? (shows ?? []).filter((show) => show.edition_id === latestEdition.id && show.published)
    : [];

  const now = Date.now();
  const rounds = roundData?.rounds ?? [];
  const openRound = rounds.find(
    (round) => round.status === "open" && new Date(round.locks_at).getTime() > now,
  );
  const recentClosedRound = [...rounds]
    .filter((round) => ["open", "locked", "scoring", "scored"].includes(round.status))
    .sort((a, b) => new Date(b.locks_at).getTime() - new Date(a.locks_at).getTime())[0];
  const pulseRound = openRound ?? recentClosedRound;
  const { data: myPrediction } = useMyPrediction(pulseRound?.id, user?.id);
  const movementAllowed = Boolean(
    user &&
      pulseRound &&
      (myPrediction || new Date(pulseRound.locks_at).getTime() <= now),
  );
  const { data: movementData } = usePredictionMovement(pulseRound?.id, movementAllowed);
  const movements = predictionLeaderMovements(movementData?.movement).slice(0, 4);

  const displayMap = useMemo(
    () => entityDisplayMap(entities ?? [], countries ?? []),
    [entities, countries],
  );

  const recordInsights = useMemo(
    () =>
      buildRecordInsights({
        editions: editions ?? [],
        shows: shows ?? [],
        results: results ?? [],
        participants: participants ?? [],
        nameForEntity: (id) => displayMap.get(id)?.name ?? "A country",
      }),
    [editions, shows, results, participants, displayMap],
  );

  const countryMap = useMemo(
    () => new Map((countries ?? []).map((country) => [country.id, country.name])),
    [countries],
  );
  const editionMap = useMemo(
    () => new Map((editions ?? []).map((edition) => [edition.id, editionLabel(edition)])),
    [editions],
  );
  const showMap = useMemo(
    () => new Map((shows ?? []).map((show) => [show.id, show.name])),
    [shows],
  );

  const countryStories = useMemo(
    () => allEvents.filter((event) => eventFeedCategory(event) === "countries").slice(0, 4),
    [allEvents],
  );

  const forYouEvents = useMemo(
    () =>
      user && follows.length
        ? personalEvents.filter((event) => !readIds.has(event.id)).slice(0, 3)
        : [],
    [user, follows.length, personalEvents, readIds],
  );

  const catchUpEvents = useMemo(() => {
    if (catchUpWindow === "edition") {
      return allEvents
        .filter((event) => eventBelongsToEdition(event, latestEdition?.id))
        .slice(0, 6);
    }

    const threshold = new Date();
    if (catchUpWindow === "today") {
      threshold.setHours(0, 0, 0, 0);
    } else {
      threshold.setTime(now - 7 * 24 * 60 * 60 * 1000);
    }
    return allEvents
      .filter((event) => new Date(event.published_at).getTime() >= threshold.getTime())
      .slice(0, 6);
  }, [allEvents, catchUpWindow, latestEdition?.id, now]);

  const followLabel = (entityType: "country" | "edition" | "show", entityId: string) => {
    if (entityType === "country") return countryMap.get(entityId) ?? "Country";
    if (entityType === "edition") return editionMap.get(entityId) ?? "Edition";
    return showMap.get(entityId) ?? "Show";
  };

  const saveNotificationSettings = async () => {
    setPreferenceMessage(null);
    try {
      await savePreferences.mutateAsync({
        in_app_enabled: inAppEnabled,
        categories,
        external_enabled: false,
      });
      setPreferenceMessage("Pulse preferences saved.");
    } catch (error) {
      setPreferenceMessage(
        error instanceof Error ? error.message : "Pulse preferences could not be saved.",
      );
    }
  };

  const updateFollowLevel = async (
    follow: (typeof follows)[number],
    notificationLevel: (typeof follows)[number]["notification_level"],
  ) => {
    setFollowMessage(null);
    try {
      await setFollow.mutateAsync({
        entityType: follow.entity_type,
        entityId: follow.entity_id,
        following: true,
        notificationLevel,
      });
      setFollowMessage("Follow level updated.");
    } catch (error) {
      setFollowMessage(error instanceof Error ? error.message : "Follow could not be updated.");
    }
  };

  const removeFollow = async (follow: (typeof follows)[number]) => {
    setFollowMessage(null);
    try {
      await setFollow.mutateAsync({
        entityType: follow.entity_type,
        entityId: follow.entity_id,
        following: false,
      });
      setFollowMessage("Unfollowed.");
    } catch (error) {
      setFollowMessage(error instanceof Error ? error.message : "Follow could not be removed.");
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="What changed"
        title="Solaris Pulse"
        description="The fastest way to catch up with SSC. See the important changes first, then open the country, edition or analysis behind the story."
        actions={
          <Link
            to="/me"
            className="min-h-11 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold"
          >
            My Solaris
          </Link>
        }
      />

      {openRound && (
        <Link
          to="/predictions"
          className="mb-5 flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Live now</p>
            <p className="mt-1 text-base font-semibold">Prediction Arena is open</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Predictions close {dateLabel(openRound.locks_at)}.
            </p>
          </div>
          <span className="text-sm font-bold text-primary">Make a prediction →</span>
        </Link>
      )}

      <div className="mb-5 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2">
          {FEED_CATEGORIES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFeedCategory(value)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${
                feedCategory === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface hover:bg-surface-strong"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Panel title="Loading Pulse">
          <p className="text-sm text-muted-foreground">Finding the latest changes…</p>
        </Panel>
      ) : eventsData?.schemaReady === false ? (
        <Panel title="Pulse is temporarily unavailable">
          <p className="text-sm leading-6 text-muted-foreground">
            The update feed is unavailable right now. Countries, editions, results and the rest of
            Solaris Studio still work normally.
          </p>
        </Panel>
      ) : (
        <div className="space-y-6">
          {leadEvent ? (
            <section
              className="overflow-hidden rounded-3xl border border-border/70 bg-surface"
              aria-labelledby="pulse-lead-story"
            >
              <div className="grid min-h-[22rem] lg:grid-cols-[1.15fr_.85fr]">
                <Link
                  to={leadEvent.route}
                  onClick={() => user && markRead.mutate(leadEvent.id)}
                  className="flex flex-col justify-end bg-gradient-to-br from-primary/20 via-surface to-background p-6 sm:p-8 lg:p-10"
                >
                  <EventMeta event={leadEvent} unread={Boolean(user && !readIds.has(leadEvent.id))} />
                  <h2
                    id="pulse-lead-story"
                    className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight sm:text-4xl"
                  >
                    {leadEvent.title}
                  </h2>
                  {leadEvent.summary && (
                    <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                      {leadEvent.summary}
                    </p>
                  )}
                  <span className="mt-6 text-sm font-bold text-primary">
                    {actionLabel(leadEvent)} →
                  </span>
                </Link>

                <div className="flex flex-col justify-between border-t border-border/70 p-6 lg:border-l lg:border-t-0 lg:p-8">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
                      What’s happening now
                    </p>
                    <p className="mt-3 text-2xl font-bold">
                      {latestEdition ? editionLabel(latestEdition) : "No public edition"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {latestEdition
                        ? `${latestShows.length} public show${latestShows.length === 1 ? "" : "s"} are available for the current edition.`
                        : "There is no public edition to show yet."}
                    </p>
                  </div>
                  {latestEdition && (
                    <Link
                      to="/editions/$slug"
                      params={{ slug: latestEdition.slug }}
                      className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold"
                    >
                      Open {editionLabel(latestEdition)} →
                    </Link>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <EmptyFeed>There are no public Pulse stories yet.</EmptyFeed>
          )}

          <section aria-labelledby="since-last-visit">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
                  {previousVisit ? "Since your last visit" : "Start here"}
                </p>
                <h2 id="since-last-visit" className="mt-1 text-2xl font-bold">
                  {previousVisit
                    ? sinceVisitEvents.length
                      ? `${sinceVisitEvents.length} important thing${sinceVisitEvents.length === 1 ? "" : "s"} changed`
                      : "You’re caught up"
                    : "Three things worth knowing"}
                </h2>
              </div>
              {user && unreadIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate(unreadIds)}
                  disabled={markAllRead.isPending}
                  className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold disabled:opacity-60"
                >
                  {markAllRead.isPending ? "Saving…" : `Mark ${unreadIds.length} as read`}
                </button>
              )}
            </div>

            {sinceVisitEvents.length ? (
              <div className="grid gap-3 md:grid-cols-3">
                {sinceVisitEvents.map((event) => (
                  <Link
                    key={event.id}
                    to={event.route}
                    onClick={() => user && markRead.mutate(event.id)}
                    className="rounded-2xl border border-border/70 bg-surface p-5 transition-transform hover:-translate-y-0.5"
                  >
                    <EventMeta event={event} unread={Boolean(user && !readIds.has(event.id))} />
                    <h3 className="mt-3 text-lg font-bold leading-snug">{event.title}</h3>
                    {event.summary && (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {event.summary}
                      </p>
                    )}
                    <p className="mt-4 text-sm font-semibold text-primary">{actionLabel(event)} →</p>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyFeed>Nothing new since your previous visit. A rare moment of SSC peace.</EmptyFeed>
            )}
          </section>

          {forYouEvents.length > 0 && (
            <section aria-labelledby="for-you">
              <div className="mb-3">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">For you</p>
                <h2 id="for-you" className="mt-1 text-2xl font-bold">
                  Updates from things you follow
                </h2>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {forYouEvents.map((event) => (
                  <Link
                    key={event.id}
                    to={event.route}
                    onClick={() => markRead.mutate(event.id)}
                    className="rounded-2xl border border-primary/20 bg-primary/5 p-5"
                  >
                    <EventMeta event={event} unread />
                    <h3 className="mt-3 text-lg font-bold leading-snug">{event.title}</h3>
                    {event.summary && (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {event.summary}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="latest-stories">
            <div className="mb-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Latest</p>
              <h2 id="latest-stories" className="mt-1 text-2xl font-bold">
                More from Solaris
              </h2>
            </div>

            {secondaryStories.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {secondaryStories.map((event) => (
                  <Link
                    key={event.id}
                    to={event.route}
                    onClick={() => user && markRead.mutate(event.id)}
                    className="group rounded-2xl border border-border/70 bg-surface p-5"
                  >
                    <EventMeta event={event} unread={Boolean(user && !readIds.has(event.id))} />
                    <h3 className="mt-3 text-lg font-bold leading-snug group-hover:text-primary">
                      {event.title}
                    </h3>
                    {event.summary && (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {event.summary}
                      </p>
                    )}
                    <p className="mt-4 text-sm font-semibold text-primary">{actionLabel(event)} →</p>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyFeed>No more stories in this category yet.</EmptyFeed>
            )}
          </section>

          {quickUpdates.length > 0 && (
            <section aria-labelledby="quick-updates">
              <div className="mb-3">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Quick updates</p>
                <h2 id="quick-updates" className="mt-1 text-2xl font-bold">
                  Small changes, no essay required
                </h2>
              </div>
              <div className="divide-y divide-border/70 rounded-2xl border border-border/70 bg-surface px-4 sm:px-5">
                {quickUpdates.map((event) => (
                  <Link
                    key={event.id}
                    to={event.route}
                    onClick={() => user && markRead.mutate(event.id)}
                    className="flex min-h-16 items-center justify-between gap-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{event.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {eventTypeLabel(event.event_type)} · {shortDateLabel(event.published_at)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-primary">→</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {(recordInsights.length > 0 || (user && pulseRound)) && (
            <section aria-labelledby="numbers-worth-knowing">
              <div className="mb-3">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Numbers worth knowing</p>
                <h2 id="numbers-worth-knowing" className="mt-1 text-2xl font-bold">
                  The interesting part of the data
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Pulse gives you the headline. Analysis keeps the charts and deeper explanation.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {recordInsights.slice(0, 4).map((insight) => (
                  <Link
                    key={insight.id}
                    to={insight.route}
                    className="rounded-2xl border border-border/70 bg-surface p-5"
                  >
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-primary">
                      {insight.kind === "broken"
                        ? "Record broken"
                        : insight.kind === "personal_best"
                          ? "Personal best"
                          : "Close to a record"}
                    </p>
                    <h3 className="mt-3 text-lg font-bold leading-snug">{insight.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{insight.summary}</p>
                    <p className="mt-4 text-sm font-semibold text-primary">See the full context →</p>
                  </Link>
                ))}

                {user &&
                  movementAllowed &&
                  movements
                    .slice(0, Math.max(0, 4 - recordInsights.slice(0, 4).length))
                    .map((movement) => {
                      const currentName =
                        displayMap.get(movement.currentCountryId)?.name ?? "A country";
                      const previousName = movement.previousCountryId
                        ? displayMap.get(movement.previousCountryId)?.name ?? "another country"
                        : null;
                      const delta = movement.percentageDelta;
                      return (
                        <Link
                          key={movement.predictionType}
                          to="/predictions"
                          className="rounded-2xl border border-border/70 bg-surface p-5"
                        >
                          <p className="text-xs font-bold uppercase tracking-[0.1em] text-primary">
                            {PREDICTION_LABELS[movement.predictionType] ??
                              movement.predictionType.replaceAll("_", " ")}
                          </p>
                          <h3 className="mt-3 text-lg font-bold leading-snug">
                            {movement.leaderChanged && previousName
                              ? `${currentName} moved ahead of ${previousName}`
                              : `${currentName} leads at ${movement.currentPercentage}%`}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {delta == null
                              ? `${movement.sampleSize} predictions are in the latest snapshot.`
                              : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} points since the last snapshot.`}
                          </p>
                        </Link>
                      );
                    })}
              </div>

              <Link
                to="/analysis"
                className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
              >
                Explore the full analysis →
              </Link>
            </section>
          )}

          {countryStories.length > 0 && (
            <section aria-labelledby="around-terra-solaris">
              <div className="mb-3">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Around Terra Solaris</p>
                <h2 id="around-terra-solaris" className="mt-1 text-2xl font-bold">
                  Country stories
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {countryStories.map((event) => (
                  <Link
                    key={event.id}
                    to={event.route}
                    onClick={() => user && markRead.mutate(event.id)}
                    className="rounded-2xl border border-border/70 bg-surface p-5"
                  >
                    <EventMeta event={event} unread={Boolean(user && !readIds.has(event.id))} />
                    <h3 className="mt-3 text-lg font-bold">{event.title}</h3>
                    {event.summary && (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {event.summary}
                      </p>
                    )}
                    <p className="mt-4 text-sm font-semibold text-primary">Open the country →</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="catch-me-up">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Catch me up</p>
                <h2 id="catch-me-up" className="mt-1 text-2xl font-bold">
                  What did I miss?
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {CATCH_UP_WINDOWS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCatchUpWindow(value)}
                    className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
                      catchUpWindow === value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {catchUpEvents.length ? (
              <ol className="rounded-2xl border border-border/70 bg-surface px-4 sm:px-6">
                {catchUpEvents.map((event, index) => (
                  <li
                    key={event.id}
                    className="grid grid-cols-[2rem_1fr] gap-3 border-b border-border/70 py-4 last:border-b-0"
                  >
                    <span className="font-display text-xl font-bold text-primary">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <Link
                      to={event.route}
                      onClick={() => user && markRead.mutate(event.id)}
                      className="min-w-0"
                    >
                      <p className="text-base font-semibold">{event.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {eventTypeLabel(event.event_type)} · {dateLabel(event.published_at)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyFeed>No updates were found for this period. Try another catch-up window.</EmptyFeed>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            {lastRoute && (
              <Panel title="Continue where you left off">
                <Link
                  to={lastRoute}
                  className="flex min-h-12 items-center justify-between rounded-xl bg-surface-strong px-4 text-sm font-semibold"
                >
                  Return to your last page <span className="text-primary">→</span>
                </Link>
              </Panel>
            )}

            <Panel
              title="Make Pulse yours"
              description={
                user
                  ? "Follow countries, editions and shows, then choose which updates you want to see."
                  : "Sign in to follow the parts of SSC you care about."
              }
            >
              {!user ? (
                <Link
                  to="/auth"
                  className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
                >
                  Sign in →
                </Link>
              ) : (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-primary">
                    Manage follows and update preferences
                  </summary>

                  <div className="mt-4 space-y-5">
                    <div>
                      <h3 className="text-base font-bold">Following</h3>
                      {followData?.schemaReady === false ? (
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          Following is temporarily unavailable.
                        </p>
                      ) : follows.length ? (
                        <div className="mt-3 space-y-2">
                          {follows.map((follow) => (
                            <div
                              key={follow.id}
                              className="rounded-xl border border-border/70 bg-surface p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold">
                                    {followLabel(follow.entity_type, follow.entity_id)}
                                  </p>
                                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                                    {follow.entity_type}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeFollow(follow)}
                                  disabled={setFollow.isPending}
                                  className="min-h-10 px-2 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
                                >
                                  Unfollow
                                </button>
                              </div>
                              <label className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm text-muted-foreground">Show me</span>
                                <select
                                  value={follow.notification_level}
                                  onChange={(event) =>
                                    updateFollowLevel(
                                      follow,
                                      event.target.value as "all" | "important" | "none",
                                    )
                                  }
                                  disabled={setFollow.isPending}
                                  className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm"
                                >
                                  <option value="all">All updates</option>
                                  <option value="important">Important only</option>
                                  <option value="none">Nothing</option>
                                </select>
                              </label>
                            </div>
                          ))}
                          {followMessage && (
                            <p className="text-sm text-muted-foreground">{followMessage}</p>
                          )}
                        </div>
                      ) : (
                        <div className="mt-3">
                          <p className="text-sm text-muted-foreground">
                            You are not following anything yet.
                          </p>
                          <Link
                            to="/countries"
                            className="mt-3 inline-block text-sm font-semibold text-primary"
                          >
                            Browse countries →
                          </Link>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="text-base font-bold">Your update preferences</h3>
                      <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface p-3">
                        <span>
                          <span className="block text-sm font-semibold">Show my personal updates</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Turn this off to pause your personal Pulse without unfollowing anything.
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          checked={inAppEnabled}
                          onChange={(event) => setInAppEnabled(event.target.checked)}
                        />
                      </label>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {PULSE_CATEGORY_OPTIONS.map(([value, label]) => (
                          <label
                            key={value}
                            className="flex min-h-11 items-center gap-2 rounded-xl border border-border/70 bg-surface px-3 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={categories.includes(value)}
                              onChange={(event) =>
                                setCategories((current) =>
                                  event.target.checked
                                    ? [...new Set([...current, value])]
                                    : current.filter((category) => category !== value),
                                )
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={saveNotificationSettings}
                        disabled={savePreferences.isPending}
                        className="mt-3 min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm font-semibold disabled:opacity-60"
                      >
                        {savePreferences.isPending ? "Saving…" : "Save preferences"}
                      </button>
                      {preferenceMessage && (
                        <p className="mt-2 text-sm text-muted-foreground">{preferenceMessage}</p>
                      )}
                    </div>
                  </div>
                </details>
              )}
            </Panel>
          </section>
        </div>
      )}
    </AppShell>
  );
}
