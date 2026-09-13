import { Link } from "@tanstack/react-router";
import { Bookmark, ChevronRight, Sparkles } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { PageHeader, Panel } from "@/components/AppShell";
import { editionLabel, useCountries, useEditions } from "@/lib/data";
import { useContentEvents, useMyFollows } from "@/lib/engagement-data";
import { useFanSession, useMyPredictionHistory } from "@/lib/prediction-data";

export type MySolarisPersonalView = "activity" | "predictions" | "saved";

const COPY: Record<MySolarisPersonalView, { title: string; description: string }> = {
  activity: {
    title: "Activity",
    description:
      "Recent Solaris updates, prioritised around the countries and editions you follow.",
  },
  predictions: {
    title: "Predictions",
    description: "Your Prediction Arena submissions and scores in one focused view.",
  },
  saved: {
    title: "Saved",
    description: "Countries and editions you follow, without mixing them into account settings.",
  },
};

export function MySolarisPersonalPage({ view }: { view: MySolarisPersonalView }) {
  const userQuery = useFanSession();
  const followsQuery = useMyFollows(userQuery.data?.id);
  const predictionsQuery = useMyPredictionHistory(userQuery.data?.id);
  const eventsQuery = useContentEvents(40);
  const countriesQuery = useCountries();
  const editionsQuery = useEditions();

  const follows = followsQuery.data?.follows ?? [];
  const followedIds = useMemo(() => new Set(follows.map((follow) => follow.entity_id)), [follows]);
  const activity = useMemo(() => {
    const events = eventsQuery.data?.events ?? [];
    const personal = events.filter((event) => followedIds.has(event.entity_id));
    return (personal.length ? personal : events).slice(0, 12);
  }, [eventsQuery.data?.events, followedIds]);
  const savedCountries = follows
    .filter((follow) => follow.entity_type === "country")
    .map((follow) => (countriesQuery.data ?? []).find((country) => country.id === follow.entity_id))
    .filter((country): country is NonNullable<typeof country> => Boolean(country));
  const savedEditions = follows
    .filter((follow) => follow.entity_type === "edition")
    .map((follow) => (editionsQuery.data ?? []).find((edition) => edition.id === follow.entity_id))
    .filter((edition): edition is NonNullable<typeof edition> => Boolean(edition));
  const predictions = predictionsQuery.data ?? [];
  const copy = COPY[view];

  return (
    <>
      <PageHeader eyebrow="MySolaris" title={copy.title} description={copy.description} />

      {view === "activity" ? (
        <Panel title="Latest updates" description="The twelve most relevant published changes">
          {activity.length ? (
            <div className="divide-y divide-border/60">
              {activity.map((event) => (
                <Link
                  key={event.id}
                  to={event.route as any}
                  className="flex min-h-14 items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{event.title}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {formatDate(event.published_at)}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState>No recent activity is available yet.</EmptyState>
          )}
        </Panel>
      ) : null}

      {view === "predictions" ? (
        <Panel
          title="Prediction history"
          description="Newest submissions first"
          actions={
            <Link to="/predictions" className="text-xs font-semibold text-primary">
              Open Prediction Arena →
            </Link>
          }
        >
          {predictions.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {predictions.slice(0, 10).map((prediction) => (
                <article
                  key={prediction.id}
                  className="rounded-xl border border-border/70 bg-surface/55 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Sparkles className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {prediction.prediction_score
                          ? `${prediction.prediction_score.score} points`
                          : "Waiting for scoring"}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {prediction.prediction_items.length} item
                        {prediction.prediction_items.length === 1 ? "" : "s"} · updated{" "}
                        {formatDate(prediction.updated_at)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState>
              You have not submitted a prediction yet. Open Prediction Arena when a round is
              available.
            </EmptyState>
          )}
        </Panel>
      ) : null}

      {view === "saved" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Saved countries" description={`${savedCountries.length} followed`}>
            {savedCountries.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {savedCountries.map((country) => (
                  <Link
                    key={country.id}
                    to="/countries/$code"
                    params={{ code: country.short_code }}
                    className="flex min-h-12 items-center gap-3 rounded-xl border border-border/70 bg-surface/55 px-3 text-sm font-semibold"
                  >
                    <Bookmark className="size-3.5 text-primary" aria-hidden="true" />
                    <span className="truncate">{country.name}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState>
                Follow a country from its public page and it will appear here.
              </EmptyState>
            )}
          </Panel>

          <Panel title="Saved editions" description={`${savedEditions.length} followed`}>
            {savedEditions.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {savedEditions.map((edition) => (
                  <Link
                    key={edition.id}
                    to="/editions/$slug"
                    params={{ slug: edition.slug }}
                    className="flex min-h-12 items-center gap-3 rounded-xl border border-border/70 bg-surface/55 px-3 text-sm font-semibold"
                  >
                    <Bookmark className="size-3.5 text-primary" aria-hidden="true" />
                    <span className="truncate">{editionLabel(edition)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState>Follow an edition and it will appear here.</EmptyState>
            )}
          </Panel>
        </div>
      ) : null}
    </>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-surface p-4 text-sm text-muted-foreground">{children}</p>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
