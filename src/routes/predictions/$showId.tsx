import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { useContestEntities, useCountries, useShow, useShowParticipants } from "@/lib/data";
import { entityDisplayMap, entityKeyOf, type EntityDisplay } from "@/lib/entities";
import {
  useEnablePredictionShare,
  useFanSession,
  useMyPrediction,
  usePredictionConsensus,
  usePredictionRounds,
  useSubmitPrediction,
} from "@/lib/prediction-data";
import type { PredictionItem, PredictionType } from "@/lib/predictions";

export const Route = createFileRoute("/predictions/$showId")({
  head: () => ({
    meta: [{ title: "Make a prediction — Solaris Studio" }],
  }),
  component: PredictionBuilderPage,
});

function PredictionBuilderPage() {
  const { showId } = Route.useParams();
  const { data: show } = useShow(showId);
  const { data: participants } = useShowParticipants(showId);
  const { data: countries } = useCountries();
  const { data: entities } = useContestEntities(show?.edition_id);
  const { data: roundData, isLoading } = usePredictionRounds(showId);
  const { data: user } = useFanSession();

  const round = roundData?.rounds[0] ?? null;
  const { data: savedPrediction } = useMyPrediction(round?.id, user?.id);
  const submitPrediction = useSubmitPrediction(round?.id);
  const enableShare = useEnablePredictionShare();

  const [winner, setWinner] = useState("");
  const [juryWinner, setJuryWinner] = useState("");
  const [televoteWinner, setTelevoteWinner] = useState("");
  const [topThree, setTopThree] = useState(["", "", ""]);
  const [qualifiers, setQualifiers] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const displayMap = useMemo(() => entityDisplayMap(entities, countries), [entities, countries]);
  const options = useMemo(
    () =>
      (participants ?? [])
        .map((participant) => {
          const referenceId = entityKeyOf(participant);
          const display = referenceId ? displayMap.get(referenceId) : undefined;
          return {
            id: display?.id ?? referenceId,
            display,
            runningOrder: participant.running_order,
          };
        })
        .filter((item): item is typeof item & { display: EntityDisplay } => Boolean(item.display))
        .sort(
          (a, b) =>
            (a.runningOrder ?? Number.MAX_SAFE_INTEGER) -
            (b.runningOrder ?? Number.MAX_SAFE_INTEGER),
        ),
    [participants, displayMap],
  );

  useEffect(() => {
    if (!savedPrediction) return;

    const items = savedPrediction.prediction_items;
    setWinner(items.find((item) => item.prediction_type === "winner")?.country_id ?? "");
    setJuryWinner(items.find((item) => item.prediction_type === "jury_winner")?.country_id ?? "");
    setTelevoteWinner(
      items.find((item) => item.prediction_type === "televote_winner")?.country_id ?? "",
    );
    setTopThree(
      items
        .filter((item) => item.prediction_type === "top_three")
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
        .map((item) => item.country_id)
        .concat(["", "", ""])
        .slice(0, 3),
    );
    setQualifiers(
      items.filter((item) => item.prediction_type === "qualifier").map((item) => item.country_id),
    );
  }, [savedPrediction]);

  const types = new Set<PredictionType>(round?.prediction_types ?? []);
  const locked =
    !round ||
    round.status !== "open" ||
    now < new Date(round.opens_at).getTime() ||
    now >= new Date(round.locks_at).getTime();
  const canSeeConsensus = Boolean(
    user && (savedPrediction || (round && now >= new Date(round.locks_at).getTime())),
  );
  const { data: consensus } = usePredictionConsensus(round?.id, canSeeConsensus);

  const toggleQualifier = (countryId: string) => {
    setQualifiers((current) => {
      if (current.includes(countryId)) {
        return current.filter((id) => id !== countryId);
      }

      if (show?.qualifier_count && current.length >= show.qualifier_count) {
        return current;
      }

      return [...current, countryId];
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const required: Array<[PredictionType, string]> = [
      ["winner", winner],
      ["jury_winner", juryWinner],
      ["televote_winner", televoteWinner],
    ];
    const missing = required.find(([type, countryId]) => types.has(type) && !countryId);
    if (missing) {
      setMessage("Complete every enabled winner pick before submitting.");
      return;
    }

    if (types.has("top_three") && (topThree.some((id) => !id) || new Set(topThree).size < 3)) {
      setMessage("Choose three different countries for your top three.");
      return;
    }

    if (
      types.has("qualifier") &&
      show?.qualifier_count &&
      qualifiers.length !== show.qualifier_count
    ) {
      setMessage(`Choose exactly ${show.qualifier_count} qualifiers.`);
      return;
    }

    const items: PredictionItem[] = [];
    if (types.has("winner")) items.push({ type: "winner", countryId: winner });
    if (types.has("jury_winner")) {
      items.push({ type: "jury_winner", countryId: juryWinner });
    }
    if (types.has("televote_winner")) {
      items.push({ type: "televote_winner", countryId: televoteWinner });
    }
    if (types.has("top_three")) {
      topThree.forEach((countryId, index) =>
        items.push({ type: "top_three", countryId, rank: index + 1 }),
      );
    }
    if (types.has("qualifier")) {
      qualifiers.forEach((countryId) => items.push({ type: "qualifier", countryId }));
    }

    try {
      await submitPrediction.mutateAsync(items);
      setMessage("Prediction saved. You can revise it until the database lock time.");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error && "message" in error
            ? String(error.message)
            : "Prediction could not be saved.";
      setMessage(errorMessage);
    }
  };

  const sharePrediction = async () => {
    if (!savedPrediction?.prediction_score) return;
    setShareMessage(null);
    try {
      const token =
        savedPrediction.share_token ?? (await enableShare.mutateAsync(savedPrediction.id));
      const url = `${window.location.origin}/predictions/share/${token}`;
      if (navigator.share) {
        await navigator.share({
          title: `My ${show?.name ?? "Solaris"} prediction result`,
          text: `I scored ${savedPrediction.prediction_score.score.toFixed(1)} in the Solaris Prediction Arena.`,
          url,
        });
        setShareMessage("Share card opened.");
      } else {
        await navigator.clipboard.writeText(url);
        setShareMessage("Share link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareMessage(error instanceof Error ? error.message : "Share link could not be created.");
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading prediction round…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Prediction Arena"
        title={show?.name ?? "Make a prediction"}
        description="Your picks stay private. Consensus remains hidden until you submit, preventing other predictions from anchoring yours."
        actions={
          <Link
            to="/predictions"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          >
            ← All rounds
          </Link>
        }
      />

      {roundData?.schemaReady === false ? (
        <Panel title="Arena setup in progress">
          <p className="text-sm text-muted-foreground">
            Private prediction storage is still being applied. This page will open automatically
            when the migration is live.
          </p>
        </Panel>
      ) : !round ? (
        <Panel title="Predictions are not open for this show">
          <p className="text-sm text-muted-foreground">
            An organizer has not published a prediction window for this show.
          </p>
        </Panel>
      ) : !user ? (
        <Panel title="Sign in to keep your prediction private">
          <p className="text-sm leading-relaxed text-muted-foreground">
            A fan account preserves your picks and accuracy history. Profiles are private unless you
            explicitly change that later.
          </p>
          <a
            href={`/auth?redirect=${encodeURIComponent(`/predictions/${showId}`)}`}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground"
          >
            Sign in or create an account
          </a>
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <Panel
            title={locked ? "Your prediction" : "Build your prediction"}
            description={
              locked
                ? "This round is locked. Your saved version can no longer be changed."
                : `Locks ${new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(round.locks_at))}. The database clock decides the deadline.`
            }
          >
            <form onSubmit={submit} className="space-y-5">
              {types.has("winner") && (
                <PredictionSelect
                  label="Winner"
                  value={winner}
                  onChange={(value) => {
                    setWinner(value);
                    if (types.has("top_three")) {
                      setTopThree((current) => [value, current[1], current[2]]);
                    }
                  }}
                  options={options}
                  disabled={locked}
                />
              )}

              {types.has("top_three") && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    Top three in order
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {topThree.map((countryId, index) => (
                      <PredictionSelect
                        key={index}
                        label={`#${index + 1}`}
                        value={countryId}
                        onChange={(value) => {
                          setTopThree((current) =>
                            current.map((item, itemIndex) => (itemIndex === index ? value : item)),
                          );
                          if (index === 0 && types.has("winner")) setWinner(value);
                        }}
                        options={options}
                        disabled={locked}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )}

              {(types.has("jury_winner") || types.has("televote_winner")) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {types.has("jury_winner") && (
                    <PredictionSelect
                      label="Jury winner"
                      value={juryWinner}
                      onChange={setJuryWinner}
                      options={options}
                      disabled={locked}
                    />
                  )}
                  {types.has("televote_winner") && (
                    <PredictionSelect
                      label="Televote winner"
                      value={televoteWinner}
                      onChange={setTelevoteWinner}
                      options={options}
                      disabled={locked}
                    />
                  )}
                </div>
              )}

              {types.has("qualifier") && show?.qualifier_count && (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Qualifiers
                    </p>
                    <span className="numeric text-xs text-muted-foreground">
                      {qualifiers.length} / {show.qualifier_count}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {options.map((option) => (
                      <label
                        key={option.id}
                        className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-surface px-3"
                      >
                        <input
                          type="checkbox"
                          checked={qualifiers.includes(option.id)}
                          disabled={locked}
                          onChange={() => toggleQualifier(option.id)}
                        />
                        {option.display && (
                          <FlagChip
                            code={option.display.short_code}
                            color={option.display.accent_color}
                            image={option.display.flag_image}
                            size="sm"
                          />
                        )}
                        <span className="min-w-0 truncate text-sm font-medium">
                          {option.display?.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {message && (
                <p className="rounded-xl bg-surface px-3 py-2 text-sm text-muted-foreground">
                  {message}
                </p>
              )}

              {!locked && (
                <button
                  type="submit"
                  disabled={submitPrediction.isPending}
                  className="min-h-12 w-full rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {submitPrediction.isPending
                    ? "Saving…"
                    : savedPrediction
                      ? "Update prediction"
                      : "Submit prediction"}
                </button>
              )}
            </form>
          </Panel>

          <div className="space-y-5">
            {savedPrediction?.prediction_score && (
              <Panel title="Your result" description="Scored from the archived public result.">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="numeric text-4xl font-black text-primary">
                      {savedPrediction.prediction_score.score.toFixed(1)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">out of 100</p>
                  </div>
                  {savedPrediction.prediction_score.percentile != null && (
                    <p className="max-w-[12rem] text-right text-xs leading-relaxed text-muted-foreground">
                      At or above {savedPrediction.prediction_score.percentile.toFixed(0)}% of
                      scored entries.
                    </p>
                  )}
                </div>

                <ScoreBreakdown breakdown={savedPrediction.prediction_score.breakdown} />

                <button
                  type="button"
                  onClick={sharePrediction}
                  disabled={enableShare.isPending}
                  className="mt-4 min-h-11 w-full rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {enableShare.isPending ? "Creating link…" : "Share my result"}
                </button>
                {shareMessage && (
                  <p className="mt-2 text-xs text-muted-foreground">{shareMessage}</p>
                )}
              </Panel>
            )}

            <Panel title="Privacy and fairness">
              <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                <li>• Your individual picks are private.</li>
                <li>• The deadline uses database time, not your device clock.</li>
                <li>• Every submitted revision is preserved.</li>
                <li>• There are no paid entries, streak losses or gambling rewards.</li>
              </ul>
            </Panel>

            <Panel title="Community consensus">
              {!canSeeConsensus ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Hidden until you submit, so the crowd cannot influence your first prediction.
                </p>
              ) : !consensus?.ready ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {consensus
                    ? `${consensus.sampleSize} submitted. At least ${consensus.minimum} are needed before percentages appear.`
                    : "Consensus is loading…"}
                </p>
              ) : (
                <ConsensusList consensus={consensus.items} options={options} />
              )}
            </Panel>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ScoreBreakdown({ breakdown }: { breakdown: unknown }) {
  if (!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) return null;
  const labels: Array<[string, string]> = [
    ["headlineScore", "Headline picks"],
    ["qualifierScore", "Qualifiers"],
    ["rankingScore", "Ordered ranking"],
    ["confidenceScore", "Confidence"],
  ];
  const values = breakdown as Record<string, unknown>;
  const rows = labels
    .map(([key, label]) => ({ key, label, value: values[key] }))
    .filter((row): row is { key: string; label: string; value: number } =>
      typeof row.value === "number",
    );
  if (!rows.length) return null;

  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {rows.map((row) => (
        <div key={row.key} className="rounded-xl bg-surface px-3 py-2.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {row.label}
          </p>
          <p className="numeric mt-1 text-lg font-bold">{row.value.toFixed(0)}%</p>
        </div>
      ))}
    </div>
  );
}

function PredictionSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{
    id: string;
    display: EntityDisplay;
  }>;
  disabled: boolean;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`${compact ? "min-h-11" : "min-h-12"} w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none disabled:opacity-70`}
      >
        <option value="">Choose…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.display.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ConsensusList({
  consensus,
  options,
}: {
  consensus: Record<string, { count: number; percentage: number }>;
  options: Array<{
    id: string;
    display: EntityDisplay;
  }>;
}) {
  const displayMap = new Map(options.map((option) => [option.id, option.display]));
  const rows = Object.entries(consensus)
    .filter(([key]) => key.startsWith("winner:"))
    .map(([key, value]) => ({
      countryId: key.slice("winner:".length),
      ...value,
    }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 6);

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.countryId}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium">
              {displayMap.get(row.countryId)?.name ?? "Entry"}
            </span>
            <span className="numeric font-semibold">{row.percentage.toFixed(1)}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-background/50">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, row.percentage)}%` }}
            />
          </div>
        </div>
      ))}
      {!rows.length && (
        <p className="text-sm text-muted-foreground">No winner consensus is available yet.</p>
      )}
    </div>
  );
}
