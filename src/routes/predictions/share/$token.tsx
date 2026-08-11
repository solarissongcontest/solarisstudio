import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { useContestEntities, useCountries, useShow, useShowParticipants } from "@/lib/data";
import { entityDisplayMap, entityKeyOf } from "@/lib/entities";
import { useSharedPrediction } from "@/lib/prediction-data";

export const Route = createFileRoute("/predictions/share/$token")({
  head: () => ({ meta: [{ title: "Prediction result — Solaris Studio" }] }),
  component: SharedPredictionPage,
});

function SharedPredictionPage() {
  const { token } = Route.useParams();
  const { data: prediction, isLoading, error } = useSharedPrediction(token);
  const { data: show } = useShow(prediction?.showId);
  const { data: participants } = useShowParticipants(prediction?.showId);
  const { data: countries } = useCountries();
  const { data: entities } = useContestEntities(show?.edition_id);
  const [message, setMessage] = useState<string | null>(null);

  const displayMap = useMemo(() => entityDisplayMap(entities, countries), [entities, countries]);
  const participantDisplay = useMemo(() => {
    const map = new Map<string, ReturnType<typeof displayMap.get>>();
    for (const participant of participants ?? []) {
      const key = entityKeyOf(participant);
      if (key) map.set(key, displayMap.get(key));
    }
    return map;
  }, [displayMap, participants]);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${prediction?.displayName ?? "A Solaris fan"}'s prediction result`,
          text: prediction ? `Prediction Arena score: ${prediction.score.toFixed(1)}/100` : "",
          url,
        });
        setMessage("Share card opened.");
      } else {
        await navigator.clipboard.writeText(url);
        setMessage("Link copied.");
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setMessage("This result could not be shared from this browser.");
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading prediction result…</p>
      </AppShell>
    );
  }

  if (error || !prediction) {
    return (
      <AppShell>
        <PageHeader eyebrow="Prediction Arena" title="This shared result is unavailable" />
        <Panel>
          <p className="text-sm text-muted-foreground">
            The link may be invalid, the result may no longer be public, or database setup may
            still be in progress.
          </p>
        </Panel>
      </AppShell>
    );
  }

  const headlinePicks = prediction.items.filter((item) =>
    ["winner", "jury_winner", "televote_winner"].includes(item.type),
  );
  const topThree = prediction.items
    .filter((item) => item.type === "top_three")
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const breakdownRows = [
    ["headlineScore", "Headline picks"],
    ["qualifierScore", "Qualifiers"],
    ["rankingScore", "Ranking"],
    ["confidenceScore", "Confidence"],
  ] as const;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Prediction Arena result"
        title={`${prediction.displayName} scored ${prediction.score.toFixed(1)}`}
        description={`${show?.name ?? "Solaris show"} · Scored with ${prediction.scoringVersion}`}
        actions={
          <button
            type="button"
            onClick={share}
            className="rounded-xl bg-aurora px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Share result
          </button>
        }
      />

      <div className="mx-auto max-w-3xl space-y-5">
        <section className="glass relative overflow-hidden p-6 sm:p-8">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative z-10 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
              Prediction accuracy
            </p>
            <p className="numeric mt-4 text-7xl font-black tracking-[-0.06em] sm:text-8xl">
              {prediction.score.toFixed(1)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">out of 100</p>
            {prediction.percentile != null && (
              <p className="mt-4 text-sm font-semibold">
                At or above {prediction.percentile.toFixed(0)}% of scored entries
              </p>
            )}
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          {breakdownRows.map(([key, label]) => {
            const value = prediction.breakdown[key];
            if (typeof value !== "number") return null;
            return (
              <div key={key} className="glass p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {label}
                </p>
                <p className="numeric mt-2 text-3xl font-black">{value.toFixed(0)}%</p>
              </div>
            );
          })}
        </div>

        {(headlinePicks.length > 0 || topThree.length > 0) && (
          <Panel title="The prediction">
            <div className="space-y-3">
              {[...headlinePicks, ...topThree].map((item, index) => {
                const display = participantDisplay.get(item.countryId);
                const label =
                  item.type === "winner"
                    ? "Winner"
                    : item.type === "jury_winner"
                      ? "Jury winner"
                      : item.type === "televote_winner"
                        ? "Televote winner"
                        : `#${item.rank}`;
                return (
                  <div
                    key={`${item.type}-${item.countryId}-${index}`}
                    className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5"
                  >
                    <span className="w-24 shrink-0 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {label}
                    </span>
                    {display && (
                      <FlagChip
                        code={display.short_code}
                        color={display.accent_color}
                        image={display.flag_image}
                        size="sm"
                      />
                    )}
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {display?.name ?? "Entry"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {message && <p className="text-center text-sm text-muted-foreground">{message}</p>}
        <div className="text-center">
          <Link to="/predictions" className="text-sm font-semibold text-primary">
            Make your own prediction →
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
