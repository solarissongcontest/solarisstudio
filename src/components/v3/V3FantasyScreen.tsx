import { CheckCircle2, Crown, LockKeyhole, Sparkles, Trophy, Users } from "lucide-react";

import type { Country } from "@/lib/data";
import {
  canEditV3FantasyRoster,
  fantasyRosterReady,
  fantasyStateLabel,
  type V3FantasyChoice,
  type V3FantasyGame,
  type V3FantasyStanding,
  type V3FantasyState,
  type V3FantasyTeam,
} from "@/lib/v3-fantasy";
import { cn } from "@/lib/utils";
import { V3Progress, V3Screen, V3ScreenHeader, V3Section, V3StatusChip, V3Surface } from "./V3Foundation";

function stateTone(state: V3FantasyState) {
  if (state === "open" || state === "submitted") return "success" as const;
  if (state === "live_scoring") return "live" as const;
  if (state === "locked") return "locked" as const;
  if (state === "settled") return "neutral" as const;
  return "warning" as const;
}

export function V3FantasyScreen({
  game,
  games,
  choices,
  countries,
  selected,
  captain,
  cost,
  state,
  team,
  standings,
  viewerId,
  submitting,
  submitError,
  onGame,
  onToggle,
  onCaptain,
  onSubmit,
}: {
  game: V3FantasyGame;
  games?: readonly V3FantasyGame[];
  choices: readonly V3FantasyChoice[];
  countries: ReadonlyMap<string, Country>;
  selected: readonly string[];
  captain: string;
  cost: number;
  state: V3FantasyState;
  team: V3FantasyTeam | null;
  standings: readonly V3FantasyStanding[];
  viewerId: string | null;
  submitting: boolean;
  submitError: string | null;
  onGame?: (gameId: string) => void;
  onToggle: (countryId: string) => void;
  onCaptain: (countryId: string) => void;
  onSubmit: () => void;
}) {
  const availableGames = games ?? [game];
  const editable = canEditV3FantasyRoster(state);
  const ready = fantasyRosterReady({ game, selected, choices });
  const rosterProgress = game.roster_size > 0 ? (selected.length / game.roster_size) * 100 : 0;
  const budgetProgress = game.budget > 0 ? (cost / game.budget) * 100 : 0;
  const locked = !editable;

  return (
    <V3Screen className="pb-8">
      <div data-v3-fantasy-root="" data-v3-fantasy-state={state}>
        <V3ScreenHeader
          kicker="Play · Fantasy"
          title={game.name}
          description="Build a constrained roster before the server lock. Eligibility, budget, roster size and scoring remain authoritative in Solaris, not in this browser."
        />

        {availableGames.length > 1 ? (
          <V3Surface className="mb-4 p-4">
            <label className="grid gap-2 text-xs font-semibold text-[var(--v3-text-secondary)]">
              Game and history
              <select
                value={game.id}
                onChange={(event) => onGame?.(event.target.value)}
                className="min-h-11 rounded-xl border border-[var(--v3-border)] bg-[var(--v3-bg-elevated)] px-3 text-sm font-medium text-[var(--v3-text-primary)]"
              >
                {availableGames.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </V3Surface>
        ) : null}

        <V3Section title="Game status" meta={<V3StatusChip tone={stateTone(state)}>{fantasyStateLabel(state)}</V3StatusChip>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <V3Surface className="p-4">
              <div className="flex items-center gap-3">
                <Users className="size-4 text-[var(--v3-text-secondary)]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Roster</p>
                  <p className="mt-0.5 text-xs text-[var(--v3-text-secondary)]">{selected.length} of {game.roster_size} selected</p>
                </div>
              </div>
              <div className="mt-3"><V3Progress value={rosterProgress} label="Roster filled" /></div>
            </V3Surface>
            <V3Surface className="p-4">
              <div className="flex items-center gap-3">
                <Sparkles className="size-4 text-[var(--v3-text-secondary)]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Budget</p>
                  <p className="mt-0.5 text-xs text-[var(--v3-text-secondary)]">{cost} of {game.budget} used</p>
                </div>
              </div>
              <div className="mt-3"><V3Progress value={Math.min(100, budgetProgress)} label="Budget used" /></div>
            </V3Surface>
          </div>
          <V3Surface level="raised" className="mt-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span><strong>Scoring:</strong> {game.scoring_version}</span>
              <span><strong>Captain:</strong> ×{game.captain_multiplier}</span>
              <span><strong>Locks:</strong> {new Date(game.locks_at).toLocaleString()}</span>
            </div>
          </V3Surface>
        </V3Section>

        <V3Section title="Your roster" meta={viewerId ? "Private to your account" : "Sign in to save"}>
          <div className="grid gap-2 sm:grid-cols-2">
            {choices.map((choice) => {
              const country = countries.get(choice.country_id);
              if (!country) return null;
              const checked = selected.includes(choice.country_id);
              return (
                <button
                  type="button"
                  key={choice.country_id}
                  disabled={locked}
                  onClick={() => onToggle(choice.country_id)}
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-xl border px-3 text-left disabled:cursor-default disabled:opacity-70",
                    checked
                      ? "border-[var(--v3-accent)] bg-white/[0.055]"
                      : "border-[var(--v3-border)] bg-[var(--v3-bg-elevated)]",
                  )}
                  aria-pressed={checked}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--v3-border)] text-xs font-bold">
                    {checked ? <CheckCircle2 className="size-4" aria-hidden="true" /> : country.short_code.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{country.name}</span>
                  <span className="text-xs font-bold tabular-nums text-[var(--v3-text-secondary)]">{choice.cost}</span>
                </button>
              );
            })}
          </div>

          <V3Surface className="mt-3 p-4">
            <label className="grid gap-2 text-sm font-semibold">
              <span className="inline-flex items-center gap-2"><Crown className="size-4" aria-hidden="true" /> Captain</span>
              <select
                disabled={locked || !selected.length}
                value={captain}
                onChange={(event) => onCaptain(event.target.value)}
                className="min-h-11 rounded-xl border border-[var(--v3-border)] bg-[var(--v3-bg-elevated)] px-3 text-sm text-[var(--v3-text-primary)] disabled:opacity-60"
              >
                <option value="">No captain</option>
                {selected.map((id) => <option key={id} value={id}>{countries.get(id)?.name ?? id}</option>)}
              </select>
            </label>
          </V3Surface>

          {locked ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-[var(--v3-text-secondary)]">
              <LockKeyhole className="size-4" aria-hidden="true" /> This roster is no longer editable in the current game state.
            </p>
          ) : null}
          {cost > game.budget ? <p className="mt-3 text-sm text-[var(--v3-danger)]">Budget exceeded.</p> : null}
          {submitError ? <p className="mt-3 text-sm text-[var(--v3-danger)]" role="alert">{submitError}</p> : null}

          <button
            type="button"
            disabled={!viewerId || !editable || !ready || submitting}
            onClick={onSubmit}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--v3-accent)] px-5 text-sm font-bold text-[var(--v3-bg-base)] disabled:opacity-50"
          >
            {!viewerId ? "Sign in to save roster" : submitting ? "Saving…" : team ? "Update roster" : "Save roster"}
          </button>
          {team ? (
            <p className="mt-2 text-xs text-[var(--v3-text-tertiary)]">
              Canonical team state: {team.state}{team.score != null ? ` · ${team.score.toFixed(1)} points` : ""}
            </p>
          ) : null}
        </V3Section>

        <V3Section title="Leaderboard" meta={state === "settled" || state === "live_scoring" ? "Published scoring" : "When available"}>
          <V3Surface className="overflow-hidden">
            {standings.length ? standings.slice(0, 25).map((row, index) => {
              const isViewer = Boolean(viewerId && row.profileId === viewerId);
              return (
                <div key={row.profileId} className={cn("flex items-center gap-3 p-4 text-sm", index > 0 && "border-t border-[var(--v3-border-subtle)]", isViewer && "bg-white/[0.045]")}>
                  <span className="w-7 tabular-nums text-[var(--v3-text-tertiary)]">{row.position}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{row.displayName}</span>
                  {isViewer ? <V3StatusChip tone="success">You</V3StatusChip> : null}
                  <span className="font-bold tabular-nums">{row.score.toFixed(1)}</span>
                </div>
              );
            }) : (
              <div className="p-5 text-sm text-[var(--v3-text-secondary)]">
                <Trophy className="mb-2 size-5" aria-hidden="true" /> No public scored teams yet.
              </div>
            )}
          </V3Surface>
        </V3Section>

        <V3Section title="How scoring works">
          <V3Surface className="p-5">
            <p className="text-sm leading-6 text-[var(--v3-text-secondary)]">
              Scoring uses the game&apos;s versioned rules after the corresponding contest result publication gate opens. Your saved roster keeps its locked costs, and the configured captain multiplier is applied by the authoritative scoring workflow.
            </p>
          </V3Surface>
        </V3Section>
      </div>
    </V3Screen>
  );
}
