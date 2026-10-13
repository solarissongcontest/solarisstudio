import { Link } from "@tanstack/react-router";
import { ChevronRight, Trophy } from "lucide-react";

import { FlagChip } from "@/components/FlagChip";
import type { Standing } from "@/lib/analysis";
import type { Country, Participant } from "@/lib/data";
import { V3Section, V3StatusChip, V3Surface } from "./V3Foundation";

export type V3ScoreboardPresentationProps = {
  standings: readonly Standing[];
  countries: ReadonlyMap<string, Country>;
  participants?: ReadonlyMap<string, Participant>;
  qualifiers?: number | null;
};

function entrySubtitle(participant: Participant | undefined) {
  if (!participant) return null;
  if (participant.artist && participant.song) return `${participant.artist} · ${participant.song}`;
  return participant.artist ?? participant.song ?? null;
}

/**
 * Installed-app scoreboard presentation only.
 *
 * This component deliberately receives the already-resolved public standings,
 * country map and participant map used by ScoreboardStage. It owns presentation
 * only: ranking, publication, scoring and qualification authority stay in the
 * canonical show/result pipeline instead of being reimplemented for V3.
 */
export function V3ScoreboardPresentation({
  standings,
  countries,
  participants,
  qualifiers,
}: V3ScoreboardPresentationProps) {
  const rows = [...standings].sort((a, b) => a.rank - b.rank);
  const winnerStanding = rows.find((row) => row.rank === 1) ?? rows[0] ?? null;
  const winnerCountry = winnerStanding ? countries.get(winnerStanding.countryId) : null;
  const winnerParticipant = winnerStanding ? participants?.get(winnerStanding.countryId) : undefined;
  const winnerSubtitle = entrySubtitle(winnerParticipant);

  return (
    <section
      data-solaris-v3
      data-v3-scoreboard=""
      style={{ minHeight: "auto" }}
      className="overflow-hidden rounded-[var(--v3-radius-2xl)] border border-[var(--v3-border-subtle)] bg-[var(--v3-bg-base)] p-3 text-[var(--v3-text-primary)] shadow-[var(--v3-shadow-raised)] sm:p-4"
      aria-label="Scoreboard"
    >
      {winnerStanding && winnerCountry ? (
        <V3Surface level="raised" className="overflow-hidden p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="v3-kicker">Winner</p>
              <div className="mt-2 flex min-w-0 items-center gap-3">
                <FlagChip
                  code={winnerCountry.short_code}
                  color={winnerCountry.accent_color}
                />
                <div className="min-w-0">
                  <p className="truncate text-xl font-bold tracking-[-0.03em]">
                    {winnerCountry.name}
                  </p>
                  {winnerSubtitle ? (
                    <p className="mt-0.5 truncate text-xs text-[var(--v3-text-secondary)]">
                      {winnerSubtitle}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-[var(--v3-border-subtle)] bg-white/[0.035] px-3 py-2">
              <Trophy className="size-4 text-[var(--v3-warning)]" aria-hidden="true" />
              <span className="text-lg font-bold tabular-nums">{winnerStanding.total}</span>
              <span className="text-[0.68rem] text-[var(--v3-text-tertiary)]">pts</span>
            </div>
          </div>
        </V3Surface>
      ) : null}

      <V3Section
        title="Final ranking"
        meta={`${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
        className="mt-5"
      >
        <ol className="grid gap-2" aria-label="Final ranking">
          {rows.map((standing) => {
            const country = countries.get(standing.countryId);
            const participant = participants?.get(standing.countryId);
            const subtitle = entrySubtitle(participant);
            const isQualified = qualifiers
              ? standing.rank <= qualifiers
              : participant?.qualified === true
                ? true
                : participant?.qualified === false
                  ? false
                  : null;

            const body = (
              <>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.025] text-sm font-bold tabular-nums text-[var(--v3-text-secondary)]">
                  {standing.rank}
                </span>
                <span className="shrink-0">
                  <FlagChip
                    code={country?.short_code ?? ""}
                    color={country?.accent_color ?? null}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {country?.name ?? standing.countryId}
                    </span>
                    {isQualified === true ? (
                      <V3StatusChip tone="success">Qualified</V3StatusChip>
                    ) : isQualified === false && qualifiers ? (
                      <V3StatusChip tone="neutral">Eliminated</V3StatusChip>
                    ) : null}
                  </span>
                  {subtitle ? (
                    <span className="mt-0.5 block truncate text-[0.72rem] text-[var(--v3-text-tertiary)]">
                      {subtitle}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-base font-bold tabular-nums">{standing.total}</span>
                  <span className="block text-[0.65rem] text-[var(--v3-text-tertiary)]">points</span>
                </span>
                {country?.short_code ? (
                  <ChevronRight className="size-4 shrink-0 text-white/30" aria-hidden="true" />
                ) : null}
              </>
            );

            const className =
              "flex min-h-16 items-center gap-2.5 rounded-2xl border border-[var(--v3-border-subtle)] bg-white/[0.022] px-3 py-2.5 transition active:scale-[0.99]";

            return country?.short_code ? (
              <li key={standing.countryId}>
                <Link
                  to="/countries/$code"
                  params={{ code: country.short_code.toLowerCase() }}
                  className={className}
                  aria-label={`Open ${country.name}, rank ${standing.rank}, ${standing.total} points`}
                >
                  {body}
                </Link>
              </li>
            ) : (
              <li key={standing.countryId} className={className}>
                {body}
              </li>
            );
          })}
        </ol>
      </V3Section>
    </section>
  );
}
