import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
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

const PREDICTION_LABELS: Record<string, string> = {
  winner: "Winner prediction",
  jury_winner: "Jury winner",
  televote_winner: "Televote winner",
  top_three: "Top three",
  top_ten: "Top ten",
  qualifier: "Qualifier prediction",
  full_ranking: "Full ranking",
};

function SolarisPulsePage() {
  const { data: user } = useFanSession();
  const { data: eventsData, isLoading } = useContentEvents(80);
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

  useEffect(() => {
    if (!preferences) return;
    setCategories(preferences.categories as PulseCategory[]);
    setInAppEnabled(preferences.in_app_enabled);
  }, [preferences]);

  useEffect(() => {
    const stored = window.localStorage.getItem("solaris:last-meaningful-route");
    if (stored?.startsWith("/") && !stored.startsWith("//") && stored !== "/pulse") {
      setLastRoute(stored);
    }
  }, []);

  const follows = followData?.follows ?? [];
  const readIds = useMemo(
    () => new Set((reads ?? []).map((read) => read.event_id)),
    [reads],
  );

  const inboxEvents = buildPulseInbox({
    events: eventsData?.events ?? [],
    follows,
    categories,
    signedIn: Boolean(user),
    inAppEnabled,
  });

  const unreadIds = user
    ? inboxEvents.filter((event) => !readIds.has(event.id)).map((event) => event.id)
    : [];

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
        eyebrow="Personal update desk"
        title="Solaris Pulse"
        description="The useful changes from the contest, your follows and Prediction Arena, without turning every quiet update into noise."
        actions={
          <Link to="/me" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
            My Solaris
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-5">
          <Panel title="Right now" description="Current public state, before the personalized layer">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-surface p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-primary">
                  Current edition
                </p>
                <p className="mt-2 font-display text-xl font-semibold">
                  {latestEdition ? editionLabel(latestEdition) : "No edition is public"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {latestShows.length} public show{latestShows.length === 1 ? "" : "s"}
                </p>
                {latestEdition && (
                  <Link
                    to="/editions/$slug"
                    params={{ slug: latestEdition.slug }}
                    className="mt-3 inline-block text-xs font-semibold text-primary"
                  >
                    Open edition →
                  </Link>
                )}
              </div>

              <div className="rounded-xl bg-surface p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-primary">
                  Prediction Arena
                </p>
                <p className="mt-2 font-display text-xl font-semibold">
                  {openRound ? "A round is open" : pulseRound ? "Latest round available" : "No round is open"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {openRound
                    ? `Locks ${new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(openRound.locks_at))}`
                    : "Prediction movement appears here once enough aggregate data exists."}
                </p>
                <Link to="/predictions" className="mt-3 inline-block text-xs font-semibold text-primary">
                  Open predictions →
                </Link>
              </div>
            </div>
          </Panel>

          <Panel
            title={user ? "Your update inbox" : "Latest updates"}
            description={
              user
                ? `${unreadIds.length} unread · ${follows.length} followed`
                : "Sign in to filter updates by the things you follow"
            }
            actions={
              user && unreadIds.length ? (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate(unreadIds)}
                  disabled={markAllRead.isPending}
                  className="text-xs font-semibold text-primary disabled:opacity-60"
                >
                  {markAllRead.isPending ? "Saving…" : "Mark all read"}
                </button>
              ) : undefined
            }
          >
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading updates…</p>
            ) : eventsData?.schemaReady === false ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                The update feed is temporarily unavailable. Other public contest pages still work normally.
              </p>
            ) : inboxEvents.length ? (
              <div className="divide-y divide-border/60">
                {inboxEvents.slice(0, 16).map((event) => {
                  const unread = Boolean(user && !readIds.has(event.id));
                  return (
                    <Link
                      key={event.id}
                      to={event.route}
                      onClick={() => user && markRead.mutate(event.id)}
                      className="flex gap-3 py-4 first:pt-0 last:pb-0"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          unread ? "bg-primary" : "bg-border"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
                          {eventTypeLabel(event.event_type)}
                          {event.importance === "important" ? " · Important" : ""}
                        </span>
                        <span className="mt-1 block text-sm font-semibold">{event.title}</span>
                        {event.summary && (
                          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                            {event.summary}
                          </span>
                        )}
                        <span className="mt-2 block text-[10px] text-muted-foreground">
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(event.published_at))}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl bg-surface p-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {user && !inAppEnabled
                    ? "Your in-app Pulse is paused in preferences."
                    : user && follows.length
                      ? "Nothing matching your current follow levels has changed yet. Set a follow to All updates if you want the quieter changes too."
                      : "There are no public updates to show yet. Check back when something changes in Solaris."}
                </p>
              </div>
            )}
          </Panel>

          {user && pulseRound && (
            <Panel
              title="Prediction movement"
              description="Aggregate movement only. Nobody else's individual prediction is exposed."
            >
              {!movementAllowed ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Submit your prediction first to see consensus movement before the round locks.
                </p>
              ) : movementData?.schemaReady === false ? (
                <p className="text-sm text-muted-foreground">
                  Prediction movement is not available for this round yet.
                </p>
              ) : movements.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {movements.map((movement) => {
                    const currentName = displayMap.get(movement.currentCountryId)?.name ?? "A country";
                    const previousName = movement.previousCountryId
                      ? displayMap.get(movement.previousCountryId)?.name ?? "another country"
                      : null;
                    const delta = movement.percentageDelta;
                    return (
                      <div key={movement.predictionType} className="rounded-xl bg-surface p-3">
                        <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-primary">
                          {PREDICTION_LABELS[movement.predictionType] ?? movement.predictionType.replaceAll("_", " ")}
                        </p>
                        <p className="mt-1 text-sm font-semibold">
                          {movement.leaderChanged && previousName
                            ? `${currentName} moved ahead of ${previousName}`
                            : `${currentName} leads at ${movement.currentPercentage}%`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {delta == null
                            ? `${movement.sampleSize} predictions in the latest snapshot.`
                            : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} percentage points since the previous snapshot · ${movement.sampleSize} predictions.`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  There is not enough changed aggregate data for a meaningful movement signal yet.
                </p>
              )}
            </Panel>
          )}

          {recordInsights.length > 0 && (
            <Panel title="Record watch" description="Automatically compared with earlier public results">
              <div className="grid gap-2 sm:grid-cols-2">
                {recordInsights.slice(0, 6).map((insight) => (
                  <Link key={insight.id} to={insight.route} className="rounded-xl bg-surface p-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-primary">
                      {insight.kind === "broken"
                        ? "Record broken"
                        : insight.kind === "personal_best"
                          ? "Personal best"
                          : "Record threat"}
                    </p>
                    <p className="mt-1 text-sm font-semibold">{insight.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {insight.summary}
                    </p>
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-5">
          {lastRoute && (
            <Panel title="Continue exploring">
              <Link
                to={lastRoute}
                className="flex min-h-11 items-center justify-between rounded-xl bg-surface px-3 text-sm font-semibold"
              >
                Return to your last page <span className="text-primary">→</span>
              </Link>
            </Panel>
          )}

          <Panel title="Following" description="Choose how noisy each follow is allowed to become">
            {!user ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Sign in, then follow countries, editions and shows from their public pages.
              </p>
            ) : followData?.schemaReady === false ? (
              <p className="text-sm text-muted-foreground">
                Following is temporarily unavailable. You can still browse countries, editions and shows.
              </p>
            ) : follows.length ? (
              <div className="space-y-2">
                {follows.map((follow) => (
                  <div key={follow.id} className="rounded-xl bg-surface px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {followLabel(follow.entity_type, follow.entity_id)}
                        </p>
                        <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                          {follow.entity_type}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFollow(follow)}
                        disabled={setFollow.isPending}
                        className="text-[10px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
                      >
                        Unfollow
                      </button>
                    </div>
                    <label className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">Pulse level</span>
                      <select
                        value={follow.notification_level}
                        onChange={(event) =>
                          updateFollowLevel(
                            follow,
                            event.target.value as "all" | "important" | "none",
                          )
                        }
                        disabled={setFollow.isPending}
                        className="min-h-9 rounded-lg border border-border bg-background px-2 text-xs"
                      >
                        <option value="all">All updates</option>
                        <option value="important">Important only</option>
                        <option value="none">Muted</option>
                      </select>
                    </label>
                  </div>
                ))}
                {followMessage && <p className="text-xs text-muted-foreground">{followMessage}</p>}
              </div>
            ) : (
              <div className="rounded-xl bg-surface p-4">
                <p className="text-sm text-muted-foreground">You are not following anything yet.</p>
                <Link to="/countries" className="mt-3 inline-block text-xs font-semibold text-primary">
                  Browse countries →
                </Link>
              </div>
            )}
          </Panel>

          {user && (
            <Panel title="Pulse preferences" description="Global filters for your in-app inbox">
              <label className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-3">
                <span>
                  <span className="block text-sm font-semibold">In-app Pulse</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    External notifications remain off.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={inAppEnabled}
                  onChange={(event) => setInAppEnabled(event.target.checked)}
                />
              </label>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {PULSE_CATEGORY_OPTIONS.map(([value, label]) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-xs"
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
                className="mt-3 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold disabled:opacity-60"
              >
                {savePreferences.isPending ? "Saving…" : "Save preferences"}
              </button>
              {preferenceMessage && (
                <p className="mt-2 text-xs text-muted-foreground">{preferenceMessage}</p>
              )}
            </Panel>
          )}
        </div>
      </div>
    </AppShell>
  );
}
