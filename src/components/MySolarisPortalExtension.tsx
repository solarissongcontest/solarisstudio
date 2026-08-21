import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Panel, StatTile } from "@/components/AppShell";
import {
  editionLabel,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import { useContentEvents, useMyFollows } from "@/lib/engagement-data";
import { useFanSession, useMyPredictionHistory } from "@/lib/prediction-data";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";

export function MySolarisPortalExtension() {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    setTarget(document.querySelector(".app-main"));
  }, []);

  if (!target) return null;
  return createPortal(<MySolarisPortalContent />, target);
}

function MySolarisPortalContent() {
  const { data: user } = useFanSession();
  const { data: followData } = useMyFollows(user?.id);
  const { data: predictionHistory } = useMyPredictionHistory(user?.id);
  const { data: eventsData } = useContentEvents(30);
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: results } = useAllResults();

  const follows = followData?.follows ?? [];
  const savedCountries = follows
    .filter((follow) => follow.entity_type === "country")
    .map((follow) => (countries ?? []).find((country) => country.id === follow.entity_id))
    .filter((country): country is NonNullable<typeof country> => Boolean(country));
  const savedEditions = follows
    .filter((follow) => follow.entity_type === "edition")
    .map((follow) => (editions ?? []).find((edition) => edition.id === follow.entity_id))
    .filter((edition): edition is NonNullable<typeof edition> => Boolean(edition));

  const editionMap = useMemo(
    () => new Map((editions ?? []).map((edition) => [edition.id, edition])),
    [editions],
  );
  const countryMap = useMemo(
    () => new Map((countries ?? []).map((country) => [country.id, country])),
    [countries],
  );

  const resultShows = useMemo(
    () =>
      (shows ?? [])
        .filter(
          (show) =>
            isShowPublic(show) &&
            resolveShowPublication(show).results &&
            (results ?? []).some((row) => row.show_id === show.id && row.final_rank != null),
        )
        .sort((a, b) => {
          const aEdition = editionMap.get(a.edition_id)?.edition_number ?? -1;
          const bEdition = editionMap.get(b.edition_id)?.edition_number ?? -1;
          if (aEdition !== bEdition) return bEdition - aEdition;
          return b.sort_order - a.sort_order;
        })
        .slice(0, 2),
    [shows, results, editionMap],
  );

  const latestPrediction = predictionHistory?.[0] ?? null;
  const followedIds = useMemo(() => new Set(follows.map((follow) => follow.entity_id)), [follows]);
  const activity = useMemo(() => {
    const events = eventsData?.events ?? [];
    const personalised = events.filter((event) => followedIds.has(event.entity_id));
    return (personalised.length ? personalised : events).slice(0, 4);
  }, [eventsData?.events, followedIds]);

  return (
    <section className="mt-6 space-y-5 border-t border-border/60 pt-6" data-my-solaris-portal>
      <div className="border-b border-border/60 pb-3">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Personal portal</p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-[-0.035em]">Your Solaris, beyond country admin</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Saved places, recent results, predictions, comparison shortcuts and activity stay together here instead of being scattered across the site.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Saved" description="Countries and editions you follow">
          <div className="grid grid-cols-2 gap-4">
            <StatTile label="Countries" value={savedCountries.length} />
            <StatTile label="Editions" value={savedEditions.length} />
          </div>

          <div className="mt-4 space-y-3">
            <SavedGroup
              label="Saved countries"
              empty="Follow a country from its public page and it will appear here."
            >
              {savedCountries.slice(0, 6).map((country) => (
                <Link
                  key={country.id}
                  to="/countries/$code"
                  params={{ code: country.short_code }}
                  className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-semibold"
                >
                  {country.name}
                </Link>
              ))}
            </SavedGroup>

            <SavedGroup
              label="Saved editions"
              empty="Follow an edition and it will be pinned here."
            >
              {savedEditions.slice(0, 6).map((edition) => (
                <Link
                  key={edition.id}
                  to="/editions/$slug"
                  params={{ slug: edition.slug }}
                  className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-semibold"
                >
                  {editionLabel(edition)}
                </Link>
              ))}
            </SavedGroup>
          </div>
        </Panel>

        <Panel title="Results dashboard" description="Latest and previous published result">
          {resultShows.length ? (
            <div className="space-y-2">
              {resultShows.map((show, index) => {
                const edition = editionMap.get(show.edition_id);
                const rows = (results ?? [])
                  .filter((row) => row.show_id === show.id && row.final_rank != null)
                  .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999));
                const winner = rows[0] ? countryMap.get(rows[0].country_id) : null;
                return (
                  <Link
                    key={show.id}
                    to="/shows/$showId"
                    params={{ showId: show.id }}
                    className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border/65 bg-surface px-3 py-3 transition hover:bg-surface-strong"
                  >
                    <span className="min-w-0">
                      <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-primary">
                        {index === 0 ? "Latest result" : "Previous result"}
                      </span>
                      <span className="mt-1 block truncate text-sm font-semibold">
                        {edition ? `${editionLabel(edition)} · ` : ""}{show.name}
                      </span>
                      {winner && (
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          Winner · {winner.name}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs font-bold text-primary">Open →</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No published result is available yet.</p>
          )}
        </Panel>

        <Panel title="Predictions" description="Your latest Prediction Arena activity">
          {latestPrediction ? (
            <div className="rounded-xl border border-border/65 bg-surface p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-primary">Latest prediction</p>
              <p className="mt-2 text-sm font-semibold">
                {latestPrediction.prediction_score
                  ? `${latestPrediction.prediction_score.score} points`
                  : "Submitted · waiting for scoring"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {latestPrediction.prediction_items.length} prediction item{latestPrediction.prediction_items.length === 1 ? "" : "s"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">You have not submitted a prediction yet.</p>
          )}
          <Link
            to="/predictions"
            className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-primary"
          >
            Open Prediction Arena →
          </Link>
        </Panel>

        <Panel title="Compare" description="Keep the head-to-head tool one click away">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Compare two delegations across results, voting history and their relationship without opening separate country pages.
          </p>
          <Link
            to="/compare"
            className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-primary"
          >
            Compare countries →
          </Link>
        </Panel>
      </div>

      <Panel title="Activity" description={follows.length ? "Latest updates connected to things you follow" : "Latest Solaris updates"}>
        {activity.length ? (
          <div className="divide-y divide-border/60">
            {activity.map((event) => (
              <Link key={event.id} to={event.route} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{event.title}</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.published_at))}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold text-primary">Open →</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No recent activity is available yet.</p>
        )}
      </Panel>
    </section>
  );
}

function SavedGroup({
  label,
  empty,
  children,
}: {
  label: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      {hasChildren ? (
        <div className="mt-2 flex flex-wrap gap-2">{children}</div>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
