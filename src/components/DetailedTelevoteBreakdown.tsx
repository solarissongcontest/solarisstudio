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

  const [selectedRoundId, setSelectedRoundId] = useState(rounds[0]?.round.id ?? "");
  const selectedRound =
    rounds.find((round) => round.round.id === selectedRoundId) ??
    rounds[0] ??
    null;

  if (!selectedRound) return null;

  const allocatedAcrossSources = rounds.reduce(
    (sum, round) =>
      sum +
      round.rows.reduce(
        (roundSum, row) => roundSum + Number(row.final_points || 0),
        0,
      ),
    0,
  );

  return (
    <div className="space-y-5" data-detailed-televote>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
            Detailed televote
          </p>
          <h3 className="mt-1 font-display text-2xl font-bold sm:text-3xl">
            Public vote breakdown
          </h3>
        </div>

        <div className="flex items-baseline gap-5 text-right">
          <div>
            <p className="numeric text-lg font-black">{rounds.length}</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {rounds.length === 1 ? "source" : "sources"}
            </p>
          </div>
          <div>
            <p className="numeric text-lg font-black">{allocatedAcrossSources}</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              allocated pts
            </p>
          </div>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Televote sources"
        className={cn(
          "grid gap-2",
          rounds.length === 1
            ? "grid-cols-1"
            : rounds.length === 2
              ? "grid-cols-2"
              : "grid-cols-1 sm:grid-cols-3",
        )}
      >
        {rounds.map((round) => {
          const selected = round.round.id === selectedRound.round.id;
          const sourceTotal = round.rows.reduce(
            (sum, row) => sum + Number(row.final_points || 0),
            0,
          );

          return (
            <button
              key={round.round.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSelectedRoundId(round.round.id)}
              className={cn(
                "min-w-0 rounded-2xl border px-4 py-3 text-left transition",
                selected
                  ? "border-primary/45 bg-primary/[0.09] shadow-sm"
                  : "border-border/70 bg-surface/35 hover:border-border hover:bg-surface/60",
              )}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {round.round.name}
                  </p>
                  <p className="numeric mt-1 text-xs text-muted-foreground">
                    {sourceTotal} pts
                  </p>
                </div>
                {round.round.weightPercent != null ? (
                  <span className={cn(
                    "numeric shrink-0 rounded-full px-2 py-1 text-[10px] font-black",
                    selected
                      ? "bg-primary/15 text-primary"
                      : "bg-background/55 text-muted-foreground",
                  )}>
                    {round.round.weightPercent}%
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {selectedRound.round.hasSourceMatrix ? (
        <SourceMatrixRound
          key={selectedRound.round.id}
          round={selectedRound}
          countries={byCode}
        />
      ) : (
        <TotalsOnlyRound
          key={selectedRound.round.id}
          round={selectedRound}
          countries={byCode}
        />
      )}
    </div>
  );
}

function SourceMatrixRound({
  round,
  countries,
}: {
  round: PublicShowTelevoteRoundDetail;
  countries: Map<string, FlagDisplay>;
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
  const maxPoints = Math.max(1, ...visibleRows.map((row) => row.points));

  return (
    <>
      <section className="grid gap-3 rounded-[1.35rem] border border-border/70 bg-surface/30 p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end sm:p-4">
        <div>
          <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            View
          </span>
          <div className="grid grid-cols-2 rounded-xl bg-background/45 p-1">
            <button
              type="button"
              aria-pressed={direction === "received"}
              onClick={() => setDirection("received")}
              className={cn(
                "min-h-10 rounded-lg px-4 text-xs font-semibold transition",
                direction === "received"
                  ? "bg-surface-strong text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Received
            </button>
            <button
              type="button"
              aria-pressed={direction === "given"}
              onClick={() => setDirection("given")}
              className={cn(
                "min-h-10 rounded-lg px-4 text-xs font-semibold transition",
                direction === "given"
                  ? "bg-surface-strong text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Given
            </button>
          </div>
        </div>

        <label className="min-w-0">
          <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
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
            className="min-h-11 w-full rounded-xl border border-border bg-background/45 px-3 text-sm font-semibold outline-none focus:border-primary/50"
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
      </section>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[1.5rem] border border-border/70 bg-border/60 lg:grid-cols-4">
        <TeleMetric
          label="Broadest support"
          value={
            supportStats.broadestRecipient
              ? countries.get(supportStats.broadestRecipient.code)?.name ??
                supportStats.broadestRecipient.code
              : "—"
          }
          hint={
            supportStats.broadestRecipient
              ? `${supportStats.broadestRecipient.sources} source countries`
              : undefined
          }
        />
        <TeleMetric
          label="Biggest single source"
          value={
            supportStats.biggestSingle
              ? `${supportStats.biggestSingle.points} units`
              : "—"
          }
          hint={
            supportStats.biggestSingle
              ? `${countries.get(supportStats.biggestSingle.source)?.name ?? supportStats.biggestSingle.source} → ${countries.get(supportStats.biggestSingle.recipient)?.name ?? supportStats.biggestSingle.recipient}`
              : undefined
          }
        />
        <TeleMetric
          label="Most generous source"
          value={
            supportStats.mostGenerous
              ? countries.get(supportStats.mostGenerous.code)?.name ??
                supportStats.mostGenerous.code
              : "—"
          }
          hint={
            supportStats.mostGenerous
              ? `${supportStats.mostGenerous.points} source units`
              : undefined
          }
        />
        <TeleMetric
          label="Avg. support breadth"
          value={
            recipientRows.length ? supportStats.averageSources.toFixed(1) : "—"
          }
          hint="source countries per entry"
        />
      </section>

      <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-surface/30">
        <header className="flex items-center gap-3 border-b border-border/60 p-4 sm:p-5">
          <PublicFlag
            code={selectedCode}
            country={selectedCountry}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              {direction === "received" ? "Received by" : "Given by"}
            </p>
            <h4 className="mt-1 truncate font-display text-xl font-bold">
              {selectedCountry?.name ?? selectedCode}
            </h4>
          </div>
          <div className="shrink-0 text-right">
            {direction === "received" && receivedRow ? (
              <>
                <p className="numeric text-2xl font-black">
                  {receivedRow.final_points}
                </p>
                <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  {round.round.weightPercent != null ? "allocated pts" : "official pts"}
                </p>
                {receivedRow.raw_score != null ? (
                  <p className="numeric mt-1 text-xs font-semibold text-muted-foreground">
                    raw {receivedRow.raw_score}
                  </p>
                ) : null}
                <p className="numeric mt-1 text-xs font-semibold text-muted-foreground">
                  {detailTotal} units
                </p>
              </>
            ) : (
              <>
                <p className="numeric text-2xl font-black">{detailTotal}</p>
                <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  units
                </p>
              </>
            )}
          </div>
        </header>

        {visibleRows.length ? (
          <div className="divide-y divide-border/55">
            {visibleRows.map((row, index) => {
              const country = countries.get(row.code);
              const width = Math.max(5, (row.points / maxPoints) * 100);

              return (
                <div
                  key={row.code}
                  className="grid grid-cols-[28px_auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <span className="numeric text-center text-[10px] text-muted-foreground">
                    #{index + 1}
                  </span>
                  <PublicFlag
                    code={row.code}
                    country={country}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {country?.name ?? row.code}
                    </p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/60">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                  <span className="numeric min-w-8 text-right text-base font-black">
                    {row.points}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No published source contributions are stored for this selection.
          </div>
        )}
      </section>
    </>
  );
}

function TotalsOnlyRound({
  round,
  countries,
}: {
  round: PublicShowTelevoteRoundDetail;
  countries: Map<string, FlagDisplay>;
}) {
  const rows = [...round.rows].sort(
    (a, b) =>
      b.final_points - a.final_points ||
      (b.raw_score ?? -Infinity) - (a.raw_score ?? -Infinity) ||
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

  return (
    <>
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[1.5rem] border border-border/70 bg-border/60 lg:grid-cols-4">
        <TeleMetric label="Recipients" value={String(rows.length)} />
        <TeleMetric
          label={
            round.round.weightPercent != null
              ? "Allocated points"
              : "Official points"
          }
          value={String(allocatedTotal)}
        />
        <TeleMetric
          label="Raw score"
          value={rows.some((row) => row.raw_score != null) ? String(rawTotal) : "—"}
        />
        <TeleMetric
          label="Top score"
          value={rows.length ? String(rows[0]?.final_points ?? 0) : "—"}
        />
      </section>

      <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-surface/30">
        <div className="divide-y divide-border/55">
          {rows.map((row, index) => {
            const country = countries.get(row.country_code);
            return (
              <div
                key={row.country_code}
                className="grid grid-cols-[28px_auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5"
              >
                <span className="numeric text-center text-[10px] text-muted-foreground">
                  #{index + 1}
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
                  {row.raw_score != null ? (
                    <p className="numeric mt-0.5 text-[10px] text-muted-foreground">
                      Raw score {row.raw_score}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="numeric text-base font-black">
                    {row.final_points}
                  </p>
                  <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                    {round.round.weightPercent != null
                      ? "allocated"
                      : "points"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function TeleMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 bg-surface/75 p-4 sm:p-5">
      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 truncate text-sm font-black sm:text-base">{value}</p>
      {hint ? (
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
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
