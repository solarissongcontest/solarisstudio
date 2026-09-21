import { useMemo, useState } from "react";

import { FlagChip } from "@/components/FlagChip";
import type { PublicShowTelevoteRoundDetail } from "@/integrations/televoting/public-detail.server";
import { cn } from "@/lib/utils";

type FlagDisplay = {
  name: string;
  short_code: string;
  flag_image: string | null;
  accent_color: string;
  flag_crop_x?: number | null;
  flag_crop_y?: number | null;
  flag_crop_zoom?: number | null;
};

type Props = {
  rounds: PublicShowTelevoteRoundDetail[];
  countries: Map<string, FlagDisplay>;
};

type Direction = "received" | "given";

export function DetailedTelevoteBreakdown({ rounds, countries }: Props) {
  const byCode = useMemo(
    () =>
      new Map(
        [...countries.values()].map((country) => [
          country.short_code.trim().toUpperCase(),
          country,
        ]),
      ),
    [countries],
  );

  const orderedRounds = useMemo(
    () =>
      [...rounds].sort(
        (a, b) =>
          a.round.displayOrder - b.round.displayOrder ||
          a.round.name.localeCompare(b.round.name),
      ),
    [rounds],
  );

  const scoringRounds = useMemo(
    () => orderedRounds.filter((round) => round.round.sourceType !== "live"),
    [orderedRounds],
  );

  const officialByCountry = useMemo(() => {
    const totals = new Map<string, number>();
    for (const round of scoringRounds) {
      for (const row of round.rows) {
        const code = row.country_code.toUpperCase();
        totals.set(code, (totals.get(code) ?? 0) + Number(row.final_points || 0));
      }
    }
    return totals;
  }, [scoringRounds]);

  const officialPointPool = [...officialByCountry.values()].reduce(
    (sum, value) => sum + value,
    0,
  );

  const [selectedRoundId, setSelectedRoundId] = useState(
    orderedRounds[0]?.round.id ?? "",
  );
  const selectedRound =
    orderedRounds.find((round) => round.round.id === selectedRoundId) ??
    orderedRounds[0] ??
    null;

  if (!selectedRound) return null;

  const supplementaryCount = orderedRounds.filter(
    (round) => round.round.sourceType === "live",
  ).length;

  return (
    <div className="space-y-4" data-detailed-televote>
      <header className="flex flex-col gap-3 border-b border-border/55 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.17em] text-primary">
            Televote explorer
          </p>
          <h3 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Public vote sources
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Switch between the rounds and sources behind the published public vote.
            Official points and raw source units stay separate.
          </p>
        </div>

        <div className="flex shrink-0 gap-4 text-xs">
          <div>
            <p className="numeric font-black text-foreground">{officialPointPool}</p>
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              official pts
            </p>
          </div>
          <div>
            <p className="numeric font-black text-foreground">{scoringRounds.length}</p>
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              scoring {scoringRounds.length === 1 ? "source" : "sources"}
            </p>
          </div>
          {supplementaryCount ? (
            <div>
              <p className="numeric font-black text-foreground">{supplementaryCount}</p>
              <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                raw round
              </p>
            </div>
          ) : null}
        </div>
      </header>

      <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div
          role="tablist"
          aria-label="Televote rounds and sources"
          className="flex min-w-max gap-2 px-1"
        >
          {orderedRounds.map((round) => (
            <SourceTab
              key={round.round.id}
              round={round}
              selected={round.round.id === selectedRound.round.id}
              onSelect={() => setSelectedRoundId(round.round.id)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground/85">
          {sourceFriendlyName(selectedRound)}
        </span>
        <span aria-hidden="true">·</span>
        <span>{sourceDescription(selectedRound)}</span>
      </div>

      {selectedRound.round.hasSourceMatrix ? (
        <SourceMatrixRound
          key={selectedRound.round.id}
          round={selectedRound}
          countries={byCode}
          officialByCountry={officialByCountry}
          soleScoringSource={scoringRounds.length === 1}
        />
      ) : (
        <TotalsOnlyRound
          key={selectedRound.round.id}
          round={selectedRound}
          countries={byCode}
          officialByCountry={officialByCountry}
          soleScoringSource={scoringRounds.length === 1}
        />
      )}
    </div>
  );
}

function SourceTab({
  round,
  selected,
  onSelect,
}: {
  round: PublicShowTelevoteRoundDetail;
  selected: boolean;
  onSelect: () => void;
}) {
  const isLive = round.round.sourceType === "live";
  const allocated = round.rows.reduce(
    (sum, row) => sum + Number(row.final_points || 0),
    0,
  );
  const raw = round.rows.reduce(
    (sum, row) => sum + Number(row.raw_score || 0),
    0,
  );

  const badge = isLive
    ? "Raw only"
    : round.round.weightPercent != null
      ? `${round.round.weightPercent}%`
      : null;

  const subline = isLive
    ? `${raw} raw votes`
    : `${allocated} allocated pts`;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "group min-h-12 rounded-full border px-4 py-2 text-left transition",
        selected
          ? "border-primary/55 bg-primary/[0.11] text-foreground shadow-sm"
          : "border-border/65 bg-surface/25 text-muted-foreground hover:border-border hover:bg-surface/55 hover:text-foreground",
      )}
    >
      <span className="flex items-center gap-2">
        <span className="max-w-[12rem] truncate text-xs font-bold">
          {sourceFriendlyName(round)}
        </span>
        {badge ? (
          <span
            className={cn(
              "numeric rounded-full px-1.5 py-0.5 text-[9px] font-black",
              selected
                ? "bg-primary/15 text-primary"
                : "bg-background/55 text-muted-foreground",
            )}
          >
            {badge}
          </span>
        ) : null}
      </span>
      <span className="mt-0.5 block text-[9px] text-muted-foreground">
        {subline}
      </span>
    </button>
  );
}

function SourceMatrixRound({
  round,
  countries,
  officialByCountry,
  soleScoringSource,
}: {
  round: PublicShowTelevoteRoundDetail;
  countries: Map<string, FlagDisplay>;
  officialByCountry: Map<string, number>;
  soleScoringSource: boolean;
}) {
  const recipientRows = useMemo(
    () =>
      round.rows
        .filter((row) => row.country_code)
        .map((row) => ({
          ...row,
          country_code: String(row.country_code).toUpperCase(),
        }))
        .sort(
          (a, b) =>
            b.final_points - a.final_points ||
            a.country_code.localeCompare(b.country_code),
        ),
    [round],
  );

  const sourceCodes = useMemo(() => {
    const codes = new Set<string>();
    recipientRows.forEach((row) => {
      Object.keys(row.country_contributions ?? {}).forEach((code) =>
        codes.add(code.toUpperCase()),
      );
    });
    return [...codes].sort((a, b) =>
      (countries.get(a)?.name ?? a).localeCompare(
        countries.get(b)?.name ?? b,
      ),
    );
  }, [recipientRows, countries]);

  const supportStats = useMemo(() => {
    let broadestRecipient = { code: "", sources: 0 };
    let biggestSingle = { source: "", recipient: "", points: 0 };
    const sourceTotals = new Map<string, number>();
    let sourceCountTotal = 0;

    recipientRows.forEach((row) => {
      const contributions = Object.entries(row.country_contributions ?? {})
        .map(([code, points]) => [code.toUpperCase(), Number(points)] as const)
        .filter(([, points]) => points > 0);

      sourceCountTotal += contributions.length;
      if (contributions.length > broadestRecipient.sources) {
        broadestRecipient = {
          code: row.country_code,
          sources: contributions.length,
        };
      }

      contributions.forEach(([source, points]) => {
        sourceTotals.set(source, (sourceTotals.get(source) ?? 0) + points);
        if (points > biggestSingle.points) {
          biggestSingle = {
            source,
            recipient: row.country_code,
            points,
          };
        }
      });
    });

    const mostGenerous =
      [...sourceTotals.entries()]
        .map(([code, points]) => ({ code, points }))
        .sort((a, b) => b.points - a.points || a.code.localeCompare(b.code))[0] ??
      null;

    return {
      broadestRecipient:
        broadestRecipient.code && broadestRecipient.sources
          ? broadestRecipient
          : null,
      biggestSingle: biggestSingle.points ? biggestSingle : null,
      mostGenerous,
      averageSources:
        recipientRows.length > 0 ? sourceCountTotal / recipientRows.length : 0,
    };
  }, [recipientRows]);

  const [direction, setDirection] = useState<Direction>("received");
  const [selectedRecipient, setSelectedRecipient] = useState(
    recipientRows[0]?.country_code ?? "",
  );
  const [selectedSource, setSelectedSource] = useState(sourceCodes[0] ?? "");

  const effectiveRecipient = recipientRows.some(
    (row) => row.country_code === selectedRecipient,
  )
    ? selectedRecipient
    : recipientRows[0]?.country_code ?? "";
  const effectiveSource = sourceCodes.includes(selectedSource)
    ? selectedSource
    : sourceCodes[0] ?? "";

  const receivedRow = recipientRows.find(
    (row) => row.country_code === effectiveRecipient,
  );

  const receivedContributors = Object.entries(
    receivedRow?.country_contributions ?? {},
  )
    .map(([code, points]) => ({
      code: code.toUpperCase(),
      points: Number(points),
    }))
    .filter((row) => row.points > 0)
    .sort((a, b) => b.points - a.points || a.code.localeCompare(b.code));

  const givenRecipients = recipientRows
    .map((row) => ({
      code: row.country_code,
      points: Number(row.country_contributions?.[effectiveSource] ?? 0),
    }))
    .filter((row) => row.points > 0)
    .sort((a, b) => b.points - a.points || a.code.localeCompare(b.code));

  const visibleRows =
    direction === "received" ? receivedContributors : givenRecipients;
  const selectedCode =
    direction === "received" ? effectiveRecipient : effectiveSource;
  const selectedCountry = countries.get(selectedCode);
  const detailTotal = visibleRows.reduce((sum, row) => sum + row.points, 0);
  const maxUnits = Math.max(1, ...visibleRows.map((row) => row.points));
  const officialTotal = officialByCountry.get(effectiveRecipient) ?? 0;
  const sourceAllocated = receivedRow?.final_points ?? 0;
  const sourceIsOfficial =
    soleScoringSource &&
    round.round.sourceType === "round" &&
    round.round.weightPercent == null;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-2xl bg-surface/25 p-2 sm:flex-row sm:items-center">
        <div className="grid grid-cols-2 rounded-xl bg-background/40 p-1 sm:w-auto">
          {(["received", "given"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={direction === value}
              onClick={() => setDirection(value)}
              className={cn(
                "min-h-9 rounded-lg px-4 text-xs font-semibold transition",
                direction === value
                  ? "bg-surface-strong text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "received" ? "Received" : "Given"}
            </button>
          ))}
        </div>

        <label className="min-w-0 flex-1">
          <span className="sr-only">
            {direction === "received" ? "Country" : "Source country"}
          </span>
          <select
            value={selectedCode}
            onChange={(event) => {
              if (direction === "received") {
                setSelectedRecipient(event.target.value);
              } else {
                setSelectedSource(event.target.value);
              }
            }}
            className="min-h-10 w-full rounded-xl border border-border/65 bg-background/35 px-3 text-sm font-semibold outline-none transition focus:border-primary/50"
          >
            {(direction === "received"
              ? recipientRows.map((row) => row.country_code)
              : sourceCodes
            ).map((code) => (
              <option key={code} value={code}>
                {countries.get(code)?.name ?? code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="rounded-2xl bg-surface/24 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <PublicFlag code={selectedCode} country={selectedCountry} size="lg" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold sm:text-xl">
              {selectedCountry?.name ?? selectedCode}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {direction === "received"
                ? sourceIsOfficial
                  ? "Official televote result"
                  : `${sourceFriendlyName(round)} contribution`
                : `Public-vote support given in ${sourceFriendlyName(round)}`}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="numeric text-2xl font-black leading-none sm:text-3xl">
              {direction === "received" ? sourceAllocated : detailTotal}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
              {direction === "received"
                ? sourceIsOfficial
                  ? "official pts"
                  : "from this source"
                : "source units"}
            </p>
          </div>
        </div>

        {direction === "received" && receivedRow ? (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/45 pt-3 text-[11px] text-muted-foreground">
            {!sourceIsOfficial ? (
              <span>
                <strong className="numeric text-foreground">{officialTotal}</strong>
                {" "}official televote pts
              </span>
            ) : null}
            {receivedRow.raw_score != null ? (
              <span>
                <strong className="numeric text-foreground">{receivedRow.raw_score}</strong>
                {" "}raw score
              </span>
            ) : null}
            <span>
              <strong className="numeric text-foreground">{detailTotal}</strong>
              {" "}source units
            </span>
            <span>
              <strong className="numeric text-foreground">{receivedContributors.length}</strong>
              {" "}supporting countries
            </span>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl bg-surface/18">
        <div className="flex items-end justify-between gap-4 px-4 pb-2 pt-4 sm:px-5">
          <div>
            <p className="text-xs font-bold">
              {direction === "received" ? "Where the support came from" : "Where the support went"}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Values below are source units, not official points.
            </p>
          </div>
          <span className="numeric text-xs text-muted-foreground">
            {visibleRows.length}
          </span>
        </div>

        {visibleRows.length ? (
          <div className="divide-y divide-border/40">
            {visibleRows.map((row, index) => {
              const country = countries.get(row.code);
              const width = Math.max(4, (row.points / maxUnits) * 100);

              return (
                <div
                  key={row.code}
                  className="grid grid-cols-[1.5rem_auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 sm:px-5"
                >
                  <span className="numeric text-center text-[10px] text-muted-foreground">
                    {index + 1}
                  </span>
                  <PublicFlag code={row.code} country={country} size="sm" />
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold">
                        {country?.name ?? row.code}
                      </p>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-background/45">
                      <span
                        className="block h-full rounded-full bg-primary/75"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                  <span className="numeric min-w-7 text-right text-sm font-black">
                    {row.points}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No published source contributions are stored for this selection.
          </p>
        )}
      </section>

      <details className="group rounded-2xl bg-surface/18">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold sm:px-5">
          <span>Source insights</span>
          <span className="text-muted-foreground transition group-open:rotate-180" aria-hidden="true">
            ↓
          </span>
        </summary>
        <div className="grid gap-x-6 gap-y-4 border-t border-border/40 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <Insight
            label="Broadest support"
            value={
              supportStats.broadestRecipient
                ? countries.get(supportStats.broadestRecipient.code)?.name ??
                  supportStats.broadestRecipient.code
                : "—"
            }
            detail={
              supportStats.broadestRecipient
                ? `${supportStats.broadestRecipient.sources} source countries`
                : undefined
            }
          />
          <Insight
            label="Biggest single contribution"
            value={
              supportStats.biggestSingle
                ? `${supportStats.biggestSingle.points} units`
                : "—"
            }
            detail={
              supportStats.biggestSingle
                ? `${countries.get(supportStats.biggestSingle.source)?.name ?? supportStats.biggestSingle.source} → ${countries.get(supportStats.biggestSingle.recipient)?.name ?? supportStats.biggestSingle.recipient}`
                : undefined
            }
          />
          <Insight
            label="Most generous source"
            value={
              supportStats.mostGenerous
                ? countries.get(supportStats.mostGenerous.code)?.name ??
                  supportStats.mostGenerous.code
                : "—"
            }
            detail={
              supportStats.mostGenerous
                ? `${supportStats.mostGenerous.points} source units`
                : undefined
            }
          />
          <Insight
            label="Average support breadth"
            value={
              recipientRows.length ? supportStats.averageSources.toFixed(1) : "—"
            }
            detail="source countries per entry"
          />
        </div>
      </details>
    </div>
  );
}

function TotalsOnlyRound({
  round,
  countries,
  officialByCountry,
  soleScoringSource,
}: {
  round: PublicShowTelevoteRoundDetail;
  countries: Map<string, FlagDisplay>;
  officialByCountry: Map<string, number>;
  soleScoringSource: boolean;
}) {
  const isLive = round.round.sourceType === "live";
  const rows = [...round.rows].sort(
    (a, b) =>
      (isLive
        ? (b.raw_score ?? 0) - (a.raw_score ?? 0)
        : b.final_points - a.final_points) ||
      a.country_code.localeCompare(b.country_code),
  );

  const allocatedTotal = rows.reduce(
    (sum, row) => sum + Number(row.final_points || 0),
    0,
  );
  const rawTotal = rows.reduce(
    (sum, row) => sum + Number(row.raw_score || 0),
    0,
  );
  const maxValue = Math.max(
    1,
    ...rows.map((row) =>
      isLive ? Number(row.raw_score || 0) : Number(row.final_points || 0),
    ),
  );

  return (
    <div className="space-y-3">
      <section className="flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-surface/24 px-4 py-4 sm:px-5">
        <div>
          <p className="text-sm font-bold">{sourceFriendlyName(round)}</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {isLive
              ? "Supplementary live-round totals. These raw votes were preserved for transparency but were not an allocated source in the published final aggregation."
              : soleScoringSource
                ? "This round is the published official televote for the show."
                : "This source contributes allocated points to the final published televote."}
          </p>
        </div>

        <div className="flex gap-4 text-right text-xs">
          {isLive ? (
            <div>
              <p className="numeric text-xl font-black text-foreground">{rawTotal}</p>
              <p className="text-[9px] uppercase tracking-[0.11em] text-muted-foreground">
                raw votes
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="numeric text-xl font-black text-foreground">{allocatedTotal}</p>
                <p className="text-[9px] uppercase tracking-[0.11em] text-muted-foreground">
                  {soleScoringSource ? "official pts" : "allocated pts"}
                </p>
              </div>
              {rows.some((row) => row.raw_score != null) ? (
                <div>
                  <p className="numeric text-xl font-black text-foreground">{rawTotal}</p>
                  <p className="text-[9px] uppercase tracking-[0.11em] text-muted-foreground">
                    raw score
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl bg-surface/18">
        <div className="divide-y divide-border/40">
          {rows.map((row, index) => {
            const country = countries.get(row.country_code);
            const value = isLive
              ? Number(row.raw_score || 0)
              : Number(row.final_points || 0);
            const width = Math.max(value > 0 ? 4 : 0, (value / maxValue) * 100);
            const officialTotal = officialByCountry.get(row.country_code) ?? 0;

            return (
              <div
                key={row.country_code}
                className="grid grid-cols-[1.5rem_auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 sm:px-5"
              >
                <span className="numeric text-center text-[10px] text-muted-foreground">
                  {index + 1}
                </span>
                <PublicFlag
                  code={row.country_code}
                  country={country}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {country?.name ?? row.country_code}
                  </p>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-background/45">
                    <span
                      className="block h-full rounded-full bg-primary/75"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  {!isLive &&
                  !soleScoringSource &&
                  officialTotal !== row.final_points ? (
                    <p className="numeric mt-1 text-[9px] text-muted-foreground">
                      {officialTotal} official total
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="numeric text-sm font-black">{value}</p>
                  <p className="text-[8px] uppercase tracking-[0.09em] text-muted-foreground">
                    {isLive
                      ? "raw"
                      : soleScoringSource
                        ? "pts"
                        : "allocated"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Insight({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-foreground">{value}</p>
      {detail ? (
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function sourceFriendlyName(round: PublicShowTelevoteRoundDetail) {
  const name = round.round.name;
  if (round.round.sourceType === "instagram") return "Story voting";
  if (round.round.sourceType === "activity") return "Activity points";
  if (round.round.sourceType === "live") return "Live voting";
  return name;
}

function sourceDescription(round: PublicShowTelevoteRoundDetail) {
  if (round.round.sourceType === "live") {
    return "Supplementary raw round · not part of the official allocation";
  }
  if (round.round.sourceType === "activity") {
    return "Activity component of the published televote";
  }
  if (round.round.sourceType === "instagram") {
    return "Country-source Story voting matrix";
  }
  if (round.round.weightPercent != null) {
    return "Ballot round contributing to the final televote";
  }
  return "Published televote round";
}

function PublicFlag({
  code,
  country,
  size,
}: {
  code: string;
  country?: FlagDisplay;
  size: "sm" | "lg";
}) {
  return (
    <FlagChip
      code={country?.short_code ?? code}
      color={country?.accent_color ?? "#75a9bd"}
      image={country?.flag_image ?? null}
      size={size}
    />
  );
}
