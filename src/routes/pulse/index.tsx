import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { editionLabel, useAllShows, useEditions } from "@/lib/data";
import {
  useContentEvents,
  useEventReads,
  useMarkEventRead,
  useMyFollows,
  useNotificationPreferences,
  useSaveNotificationPreferences,
} from "@/lib/engagement-data";
import { useFanSession, usePredictionRounds } from "@/lib/prediction-data";

export const Route = createFileRoute("/pulse/")({
  head: () => ({ meta: [{ title: "Solaris Pulse — Solaris Studio" }] }),
  component: SolarisPulsePage,
});

const CATEGORY_OPTIONS = [
  ["entries", "Entries"],
  ["running_orders", "Running orders"],
  ["predictions", "Predictions"],
  ["results", "Results"],
  ["records", "Records"],
] as const;

function eventCategory(eventType: string) {
  if (eventType === "entry_published") return "entries";
  if (eventType === "running_order_published") return "running_orders";
  if (eventType.startsWith("prediction_")) return "predictions";
  if (eventType === "results_published") return "results";
  if (eventType === "record_broken") return "records";
  return null;
}

function SolarisPulsePage() {
  const { data: user } = useFanSession();
  const { data: eventsData, isLoading } = useContentEvents(40);
  const { data: followData } = useMyFollows(user?.id);
  const { data: reads } = useEventReads(user?.id);
  const markRead = useMarkEventRead(user?.id);
  const { data: preferences } = useNotificationPreferences(user?.id);
  const savePreferences = useSaveNotificationPreferences(user?.id);
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: roundData } = usePredictionRounds();

  const [categories, setCategories] = useState<string[]>([
    "entries",
    "running_orders",
    "predictions",
    "results",
    "records",
  ]);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [preferenceMessage, setPreferenceMessage] = useState<string | null>(null);
  const [lastRoute, setLastRoute] = useState<string | null>(null);

  useEffect(() => {
    if (!preferences) return;
    setCategories(preferences.categories);
    setInAppEnabled(preferences.in_app_enabled);
  }, [preferences]);

  useEffect(() => {
    const stored = window.localStorage.getItem("solaris:last-meaningful-route");
    if (stored?.startsWith("/") && !stored.startsWith("//") && stored !== "/pulse") {
      setLastRoute(stored);
    }
  }, []);

  const readIds = useMemo(() => new Set((reads ?? []).map((read) => read.event_id)), [reads]);
  const follows = followData?.follows ?? [];
  const categoryEvents = (eventsData?.events ?? []).filter((event) => {
    const category = eventCategory(event.event_type);
    return category === null || categories.includes(category);
  });
  const followedEvents = categoryEvents.filter((event) =>
    follows.some(
      (follow) => follow.entity_type === event.entity_type && follow.entity_id === event.entity_id,
    ),
  );
  const inboxEvents = user && !inAppEnabled
    ? []
    : followedEvents.length
      ? followedEvents
      : categoryEvents;
  const unreadCount = user
    ? inboxEvents.filter((event) => !readIds.has(event.id)).length
    : 0;

  const latestEdition = [...(editions ?? [])]
    .filter((edition) => edition.published)
    .sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0];
  const latestShows = latestEdition
    ? (shows ?? []).filter((show) => show.edition_id === latestEdition.id && show.published)
    : [];
  const nextRound = (roundData?.rounds ?? []).find(
    (round) => round.status === "open" && new Date(round.locks_at).getTime() > Date.now(),
  );

  const saveNotificationSettings = async () => {
    setPreferenceMessage(null);
    try {
      await savePreferences.mutateAsync({
        in_app_enabled: inAppEnabled,
        categories,
        external_enabled: false,
      });
      setPreferenceMessage("Inbox preferences saved.");
    } catch (error) {
      setPreferenceMessage(
        error instanceof Error ? error.message : "Inbox preferences could not be saved.",
      );
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="What changed?"
        title="Solaris Pulse"
        description="One compact update desk for the current edition, predictions and the countries you follow. No endless feed and no fake urgency."
        actions={
          <Link to="/me" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
            My Solaris
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-5">
          <Panel title="Right now" description="The latest public Solaris state">
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
                  {nextRound ? "A round is open" : "No round is open"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {nextRound
                    ? `Locks ${new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(nextRound.locks_at))}`
                    : "The next round appears here when published."}
                </p>
                <Link to="/predictions" className="mt-3 inline-block text-xs font-semibold text-primary">
                  Open predictions →
                </Link>
              </div>
            </div>
          </Panel>

          <Panel
            title={user ? "Your update inbox" : "Latest updates"}
            description={user ? `${unreadCount} unread · ${follows.length} followed` : "Sign in to filter by follows"}
          >
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading updates…</p>
            ) : eventsData?.schemaReady === false ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Pulse is ready in the interface. Its content-event feed will switch on after the
                Phase 3 database migration is applied.
              </p>
            ) : inboxEvents.length ? (
              <div className="divide-y divide-border/60">
                {inboxEvents.slice(0, 12).map((event) => {
                  const unread = user && !readIds.has(event.id);
                  return (
                    <Link
                      key={event.id}
                      to={event.route}
                      onClick={() => markRead.mutate(event.id)}
                      className="flex gap-3 py-4 first:pt-0 last:pb-0"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          unread ? "bg-primary" : "bg-border"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
                          {event.event_type.replaceAll("_", " ")}
                        </span>
                        <span className="mt-1 block text-sm font-semibold">{event.title}</span>
                        {event.summary && (
                          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                            {event.summary}
                          </span>
                        )}
                        <span className="mt-2 block text-[10px] text-muted-foreground">
                          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                            new Date(event.published_at),
                          )}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                No curated updates have been published yet. Current edition and prediction status
                above still come directly from the public archive.
              </p>
            )}
          </Panel>
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

          <Panel title="Following">
            {!user ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Sign in, then use Follow on country, edition and show pages to build a private
                update list.
              </p>
            ) : follows.length ? (
              <div className="space-y-2">
                {follows.slice(0, 10).map((follow) => (
                  <div key={follow.id} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5">
                    <span className="text-sm font-semibold capitalize">{follow.entity_type}</span>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {follow.notification_level}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">You are not following anything yet.</p>
            )}
          </Panel>

          {user && (
            <Panel title="Inbox preferences" description="External notifications stay off in this phase.">
              <label className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-3">
                <span className="text-sm font-semibold">In-app inbox</span>
                <input
                  type="checkbox"
                  checked={inAppEnabled}
                  onChange={(event) => setInAppEnabled(event.target.checked)}
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {CATEGORY_OPTIONS.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-xs">
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
