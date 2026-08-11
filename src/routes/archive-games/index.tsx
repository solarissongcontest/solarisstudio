import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import {
  archiveGameStats,
  buildArchiveGameQuestion,
  type ArchiveGameMode,
} from "@/lib/archive-games";
import {
  useAllContestEntities,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import { entityDisplayMap } from "@/lib/entities";

export const Route = createFileRoute("/archive-games/")({
  head: () => ({ meta: [{ title: "Archive Games — Solaris Studio" }] }),
  component: ArchiveGamesPage,
});

const MODES: ReadonlyArray<
  readonly [ArchiveGameMode, string, string]
> = [
  ["higher-lower", "Higher or Lower", "Pick which entry finished higher in the same historical show."],
  ["jury-tele", "Jury vs Televote", "Guess which voting side supported an entry more."],
  ["edition-detective", "Edition Detective", "Match an archived entry to the edition where it appeared."],
];

function ArchiveGamesPage() {
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: countries } = useCountries();
  const { data: entities } = useAllContestEntities();

  const [mode, setMode] = useState<ArchiveGameMode>("higher-lower");
  const [round, setRound] = useState(1);
  const [answer, setAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const displayMap = useMemo(
    () => entityDisplayMap(entities ?? [], countries ?? []),
    [entities, countries],
  );

  const gameInput = useMemo(
    () => ({
      editions: editions ?? [],
      shows: shows ?? [],
      participants: participants ?? [],
      results: results ?? [],
      nameForEntity: (id: string) => displayMap.get(id)?.name ?? "Unknown entry",
    }),
    [editions, shows, participants, results, displayMap],
  );

  const stats = useMemo(() => archiveGameStats(gameInput), [gameInput]);

  const question = useMemo(
    () => buildArchiveGameQuestion(gameInput, mode, `${mode}:${round}`),
    [gameInput, mode, round],
  );

  const answered = answer != null;
  const correct = answered && answer === question?.correctOptionId;

  const chooseAnswer = (optionId: string) => {
    if (!question || answered) return;

    setAnswer(optionId);

    if (optionId === question.correctOptionId) {
      setScore((current) => current + 1);
      setStreak((current) => {
        const next = current + 1;
        setBestStreak((best) => Math.max(best, next));
        return next;
      });
    } else {
      setStreak(0);
    }
  };

  const nextQuestion = () => {
    setAnswer(null);
    setRound((current) => current + 1);
  };

  const switchMode = (nextMode: ArchiveGameMode) => {
    setMode(nextMode);
    setAnswer(null);
    setRound(1);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Phase 6 · Archive Games"
        title="Play the SSC archive"
        description="Turn old results into quick games instead of merely staring at another spreadsheet-shaped monument to human voting behaviour. No account is needed and nothing is stored."
        actions={
          <Link
            to="/records"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-center text-sm sm:w-auto"
          >
            Records →
          </Link>
        }
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-5">
        <div className="min-w-0 space-y-4">
          <Panel title="Game mode" description="Switching mode starts a fresh session">
            <div className="space-y-2" role="radiogroup" aria-label="Archive game mode">
              {MODES.map(([value, label, description]) => {
                const active = value === mode;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => switchMode(value)}
                    className={`w-full min-w-0 rounded-xl border px-3 py-3 text-left transition-colors ${
                      active
                        ? "border-primary/50 bg-surface-strong"
                        : "border-border bg-surface hover:bg-surface-strong"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {description}
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Session">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Score" value={score} />
              <Stat label="Streak" value={streak} />
              <Stat label="Best" value={bestStreak} />
            </div>
          </Panel>

          <Panel title="Archive pool" description="Public historical data currently available">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Results" value={stats.resultCount} />
              <Stat label="Editions" value={stats.editionCount} />
              <Stat label="Shows" value={stats.showCount} />
              <Stat label="Countries" value={stats.entityCount} />
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          {question ? (
            <Panel
              title={`Question ${round}`}
              description={question.eyebrow}
              actions={
                <span className="rounded-lg bg-surface px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {MODES.find(([value]) => value === mode)?.[1]}
                </span>
              }
            >
              <div aria-live="polite">
                <h2 className="break-words font-display text-xl font-semibold sm:text-2xl">
                  {question.prompt}
                </h2>

                <div className={`mt-5 grid min-w-0 gap-2 ${question.options.length > 2 ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
                  {question.options.map((option) => {
                    const selected = answer === option.id;
                    const isCorrect = answered && option.id === question.correctOptionId;
                    const isWrong = answered && selected && !isCorrect;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => chooseAnswer(option.id)}
                        disabled={answered}
                        aria-pressed={selected}
                        className={`min-h-20 min-w-0 rounded-xl border px-3 py-3 text-left transition-colors disabled:cursor-default disabled:opacity-100 ${
                          isCorrect
                            ? "border-primary bg-surface-strong"
                            : isWrong
                              ? "border-destructive/70 bg-destructive/10"
                              : selected
                                ? "border-primary/50 bg-surface-strong"
                                : "border-border bg-surface hover:bg-surface-strong"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {question.entityIds.includes(option.id) && displayMap.get(option.id) ? (
                            <FlagChip
                              code={displayMap.get(option.id)!.short_code}
                              color={displayMap.get(option.id)!.accent_color}
                              image={displayMap.get(option.id)!.flag_image}
                              size="sm"
                            />
                          ) : null}
                          <span className="min-w-0 flex-1 break-words text-sm font-semibold">
                            {option.label}
                          </span>
                        </span>
                        {option.detail && (
                          <span className="mt-1 block break-words text-xs leading-relaxed text-muted-foreground">
                            {option.detail}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {answered && (
                  <div
                    className={`mt-5 rounded-xl border p-4 ${
                      correct
                        ? "border-primary/40 bg-surface-strong"
                        : "border-border bg-surface"
                    }`}
                  >
                    <p className="font-display text-lg font-semibold">
                      {correct ? "Correct" : "Not quite"}
                    </p>
                    <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">
                      {question.explanation}
                    </p>
                    <button
                      type="button"
                      onClick={nextQuestion}
                      autoFocus
                      className="mt-4 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold sm:w-auto"
                    >
                      Next question →
                    </button>
                  </div>
                )}
              </div>
            </Panel>
          ) : (
            <Panel title="Archive Games">
              <p className="text-sm leading-relaxed text-muted-foreground">
                There is not enough published historical data for this game mode yet. Archive Games automatically grows as more SSC results are published.
              </p>
            </Panel>
          )}

          <Panel title="How it works" description="No mysterious scoring algorithm hiding under the floorboards">
            <div className="grid gap-3 sm:grid-cols-3">
              <InfoCard
                number="01"
                title="Real archive data"
                text="Questions are generated from published Solaris results, editions and entries."
              />
              <InfoCard
                number="02"
                title="Fresh questions"
                text="Each round uses a deterministic new seed, so the session keeps moving through the archive."
              />
              <InfoCard
                number="03"
                title="Private by default"
                text="Scores stay in this browser session. Phase 6 does not create public leaderboards or user profiles."
              />
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface p-3 text-center">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function InfoCard({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface p-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">{number}</p>
      <p className="mt-1 text-sm font-semibold">{title}</p>
      <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}
