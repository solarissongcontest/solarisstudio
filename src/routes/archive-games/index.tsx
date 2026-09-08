import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import { getSolarisAnniversarySeason } from "@/lib/anniversary";
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

const MODES: ReadonlyArray<readonly [ArchiveGameMode, string, string]> = [
  ["higher-lower", "Higher or Lower", "Pick which entry finished higher in the same historical show."],
  ["jury-tele", "Jury vs Televote", "Guess which voting side supported an entry more."],
  ["edition-detective", "Edition Detective", "Match an archived entry to the edition where it appeared."],
  ["winner-detective", "Winner Detective", "Choose the winner from four real entries in the same historical show."],
  ["archive-trivia", "Archive Trivia", "Questions about songs, artists, host cities and other archived facts, not just placements."],
];

const ANNIVERSARY_CHALLENGE_LENGTH = 10;

function anniversaryRank(score: number) {
  if (score >= 10) return { title: "Living Archive", detail: "A perfect score. The SSC archive has apparently occupied the part of your brain meant for ordinary information." };
  if (score >= 8) return { title: "Solaris Historian", detail: "You know the archive disturbingly well." };
  if (score >= 6) return { title: "Scoreboard Addict", detail: "The important numbers are clearly taking up valuable brain space." };
  if (score >= 4) return { title: "Delegation Intern", detail: "Solid archive knowledge. Someone may trust you with a spreadsheet." };
  return { title: "Casual Viewer", detail: "You survived ten archive questions. Civilization continues." };
}

function ArchiveGamesPage() {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const previewValue = new URLSearchParams(searchStr).get("anniversary");
  const anniversary = getSolarisAnniversarySeason();
  const anniversaryMode = anniversary.phase === "active" || previewValue === "preview" || previewValue === "active";

  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const participantsQuery = useAllParticipants();
  const resultsQuery = useAllResults();
  const countriesQuery = useCountries();
  const entitiesQuery = useAllContestEntities();
  const { data: editions } = editionsQuery;
  const { data: shows } = showsQuery;
  const { data: participants } = participantsQuery;
  const { data: results } = resultsQuery;
  const { data: countries } = countriesQuery;
  const { data: entities } = entitiesQuery;

  const [mode, setMode] = useState<ArchiveGameMode>("higher-lower");
  const [round, setRound] = useState(1);
  const [answer, setAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const effectiveMode = anniversaryMode
    ? MODES[(Math.max(1, round) - 1) % MODES.length][0]
    : mode;
  const challengeComplete = anniversaryMode && round > ANNIVERSARY_CHALLENGE_LENGTH;
  const challengeRank = anniversaryRank(score);

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
    () =>
      challengeComplete
        ? null
        : buildArchiveGameQuestion(
            gameInput,
            effectiveMode,
            `${effectiveMode}:${round}:${anniversaryMode ? "anniversary" : "normal"}`,
          ),
    [anniversaryMode, challengeComplete, effectiveMode, gameInput, round],
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

  const resetSession = () => {
    setAnswer(null);
    setRound(1);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
  };

  const switchMode = (nextMode: ArchiveGameMode) => {
    setMode(nextMode);
    resetSession();
  };

  const archiveQueries = [editionsQuery, showsQuery, participantsQuery, resultsQuery, countriesQuery, entitiesQuery];
  if (archiveIsLoading(...archiveQueries)) return <AppShell><PageHeader eyebrow="Archive Games" title="Play the SSC archive" description="Quick games built from published history." /><ArchiveDataLoading label="Preparing the archive games…" /></AppShell>;
  if (archiveHasError(...archiveQueries)) return <AppShell><PageHeader eyebrow="Archive Games" title="Play the SSC archive" description="Quick games built from published history." /><ArchiveDataError /></AppShell>;

  return (
    <AppShell>
      <PageHeader
        eyebrow={anniversaryMode ? `${anniversary.age} Years Challenge` : "Archive Games"}
        title={anniversaryMode ? "Anniversary Archive Games" : "Play the SSC archive"}
        description={anniversaryMode
          ? "Ten questions rotate through all five Archive Games formats. Finish the challenge to earn an anniversary knowledge rank."
          : "Turn published SSC history into quick games about results, entries, songs, artists and host facts. No account is needed and nothing is stored."}
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
          {anniversaryMode ? (
            <Panel title={`${anniversary.age} Years Challenge`} description="Every format appears twice">
              <div className="space-y-2">
                {MODES.map(([value, label], index) => {
                  const active = value === effectiveMode && !challengeComplete;
                  const completedRounds = Math.max(0, round - 1);
                  const appearancesCompleted = Math.floor(completedRounds / MODES.length) + (completedRounds % MODES.length > index ? 1 : 0);
                  return (
                    <div
                      key={value}
                      className={`rounded-xl border px-3 py-3 ${active ? "border-primary/50 bg-surface-strong" : "border-border bg-surface"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">{label}</span>
                        <span className="text-[10px] font-semibold text-muted-foreground">{Math.min(2, appearancesCompleted)}/2</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          ) : (
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
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
                    </button>
                  );
                })}
              </div>
            </Panel>
          )}

          <Panel title={anniversaryMode ? "Challenge" : "Session"}>
            <div className={`grid gap-2 ${anniversaryMode ? "grid-cols-2" : "grid-cols-3"}`}>
              <Stat label="Score" value={score} />
              {anniversaryMode ? <Stat label="Question" value={Math.min(round, ANNIVERSARY_CHALLENGE_LENGTH)} /> : <Stat label="Streak" value={streak} />}
              {!anniversaryMode ? <Stat label="Best" value={bestStreak} /> : null}
            </div>
            {anniversaryMode ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-strong">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.min(100, ((Math.max(1, round) - 1) / ANNIVERSARY_CHALLENGE_LENGTH) * 100)}%` }}
                />
              </div>
            ) : null}
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
          {challengeComplete ? (
            <Panel title="Anniversary challenge complete" description={`${score}/${ANNIVERSARY_CHALLENGE_LENGTH} correct · best streak ${bestStreak}`}>
              <div className="rounded-2xl border border-primary/30 bg-surface-strong p-5 sm:p-7">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Your Solaris Knowledge Rank</p>
                <h2 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{challengeRank.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{challengeRank.detail}</p>
                <div className="mt-5 grid grid-cols-2 gap-2 sm:max-w-sm">
                  <Stat label="Score" value={score} />
                  <Stat label="Best streak" value={bestStreak} />
                </div>
                <button
                  type="button"
                  onClick={resetSession}
                  className="mt-5 min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm font-semibold sm:w-auto"
                >
                  Play the challenge again
                </button>
              </div>
            </Panel>
          ) : question ? (
            <Panel
              title={anniversaryMode ? `Question ${round} of ${ANNIVERSARY_CHALLENGE_LENGTH}` : `Question ${round}`}
              description={question.eyebrow}
              actions={
                <span className="rounded-lg bg-surface px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {MODES.find(([value]) => value === effectiveMode)?.[1]}
                </span>
              }
            >
              <div aria-live="polite">
                <h2 className="break-words font-display text-xl font-semibold sm:text-2xl">
                  {question.prompt}
                </h2>

                <div className="mt-5 grid min-w-0 gap-2 sm:grid-cols-2">
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
                          <span className="min-w-0 flex-1 break-words text-sm font-semibold">{option.label}</span>
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
                      correct ? "border-primary/40 bg-surface-strong" : "border-border bg-surface"
                    }`}
                  >
                    <p className="font-display text-lg font-semibold">{correct ? "Correct" : "Not quite"}</p>
                    <p className="mt-1 break-words text-sm leading-relaxed text-muted-foreground">
                      {question.explanation}
                    </p>
                    <button
                      type="button"
                      onClick={nextQuestion}
                      autoFocus
                      className="mt-4 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold sm:w-auto"
                    >
                      {anniversaryMode && round === ANNIVERSARY_CHALLENGE_LENGTH ? "See anniversary rank →" : "Next question →"}
                    </button>
                  </div>
                )}
              </div>
            </Panel>
          ) : (
            <Panel title="Archive Games">
              <p className="text-sm leading-relaxed text-muted-foreground">
                There is not enough published historical data for this game mode yet. Archive Games automatically grows as more SSC results and entry information are published.
              </p>
            </Panel>
          )}

          <Panel title="How it works" description={anniversaryMode ? "Anniversary challenge generated from the public SSC archive" : "Quick games generated from the public SSC archive"}>
            <div className="grid gap-3 sm:grid-cols-3">
              <InfoCard
                number="01"
                title="Real archive data"
                text="Questions are generated from published Solaris results, editions, songs, artists and host information."
              />
              <InfoCard
                number="02"
                title={anniversaryMode ? "Five rotating formats" : "More than results"}
                text={anniversaryMode ? "The birthday challenge rotates Higher or Lower, Jury vs Televote, Edition Detective, Winner Detective and Archive Trivia." : "Archive Trivia mixes host-city and entry questions into the games so the archive is not just placement comparisons."}
              />
              <InfoCard
                number="03"
                title="Private by default"
                text="Your score stays in this browser session and is not published to other users."
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
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
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
