import { useMemo, useState } from "react";

import type { Country } from "@/lib/data";
import { cn } from "@/lib/utils";

type StandingRow = {
  countryId: string;
  jury: number;
  televote: number;
  total: number;
};

type SortMode =
  | "overall"
  | "jury"
  | "televote"
  | "difference";

type Props = {
  standings: StandingRow[];
  countries: Map<string, Country>;
};

type ComparisonRow = StandingRow & {
  country: Country | undefined;

  juryRank: number;
  televoteRank: number;
  overallRank: number;

  difference: number;
  absoluteDifference: number;

  juryShare: number;
  televoteShare: number;

  favoredBy:
    | "jury"
    | "televote"
    | "balanced";
};

export function JuryTelevoteComparison({
  standings,
  countries,
}: Props) {
  const [sortMode, setSortMode] =
    useState<SortMode>("overall");

  const [selectedCountryId, setSelectedCountryId] =
    useState<string | null>(null);

  /* =========================================================
     RANKINGS
     ========================================================= */

  const juryRanking = useMemo(
    () =>
      [...standings]
        .sort(
          (a, b) =>
            b.jury - a.jury ||
            b.total - a.total,
        )
        .map(
          (row) => row.countryId,
        ),
    [standings],
  );

  const televoteRanking = useMemo(
    () =>
      [...standings]
        .sort(
          (a, b) =>
            b.televote -
              a.televote ||
            b.total - a.total,
        )
        .map(
          (row) => row.countryId,
        ),
    [standings],
  );

  const overallRanking = useMemo(
    () =>
      [...standings]
        .sort(
          (a, b) =>
            b.total - a.total,
        )
        .map(
          (row) => row.countryId,
        ),
    [standings],
  );

  /* =========================================================
     NORMALISE ROWS
     ========================================================= */

  const rows =
    useMemo<ComparisonRow[]>(
      () =>
        standings.map(
          (row) => {
            const total =
              row.jury +
              row.televote;

            const difference =
              row.jury -
              row.televote;

            const absoluteDifference =
              Math.abs(
                difference,
              );

            const juryShare =
              total > 0
                ? (row.jury /
                    total) *
                  100
                : 0;

            const televoteShare =
              total > 0
                ? (row.televote /
                    total) *
                  100
                : 0;

            let favoredBy:
              | "jury"
              | "televote"
              | "balanced";

            if (
              absoluteDifference <=
              Math.max(
                5,
                total * 0.08,
              )
            ) {
              favoredBy =
                "balanced";
            } else if (
              difference > 0
            ) {
              favoredBy =
                "jury";
            } else {
              favoredBy =
                "televote";
            }

            return {
              ...row,

              country:
                countries.get(
                  row.countryId,
                ),

              overallRank:
                overallRanking.indexOf(
                  row.countryId,
                ) + 1,

              juryRank:
                juryRanking.indexOf(
                  row.countryId,
                ) + 1,

              televoteRank:
                televoteRanking.indexOf(
                  row.countryId,
                ) + 1,

              difference,
              absoluteDifference,

              juryShare,
              televoteShare,

              favoredBy,
            };
          },
        ),
      [
        standings,
        countries,
        juryRanking,
        televoteRanking,
        overallRanking,
      ],
    );

  /* =========================================================
     SORTING
     ========================================================= */

  const sortedRows =
    useMemo(() => {
      const copy =
        [...rows];

      if (
        sortMode ===
        "jury"
      ) {
        return copy.sort(
          (a, b) =>
            b.jury - a.jury ||
            b.total - a.total,
        );
      }

      if (
        sortMode ===
        "televote"
      ) {
        return copy.sort(
          (a, b) =>
            b.televote -
              a.televote ||
            b.total - a.total,
        );
      }

      if (
        sortMode ===
        "difference"
      ) {
        return copy.sort(
          (a, b) =>
            b.absoluteDifference -
              a.absoluteDifference ||
            b.total - a.total,
        );
      }

      return copy.sort(
        (a, b) =>
          b.total - a.total,
      );
    }, [
      rows,
      sortMode,
    ]);

  /* =========================================================
     SHARED SCALE
     ========================================================= */

  const maxTotal =
    Math.max(
      ...rows.map(
        (row) =>
          row.total,
      ),
      1,
    );

  /* =========================================================
     INSIGHTS
     ========================================================= */

  const totalJury =
    rows.reduce(
      (sum, row) =>
        sum +
        row.jury,
      0,
    );

  const totalTelevote =
    rows.reduce(
      (sum, row) =>
        sum +
        row.televote,
      0,
    );

  const biggestJuryFavorite =
    [...rows].sort(
      (a, b) =>
        b.difference -
        a.difference,
    )[0];

  const biggestTelevoteFavorite =
    [...rows].sort(
      (a, b) =>
        a.difference -
        b.difference,
    )[0];

  return (
    <div className="space-y-4">
      {/* =====================================================
          HEADER
         ===================================================== */}

      <div className="glass p-4 sm:p-5">
        <div
          className="
            flex
            flex-col
            gap-4
            sm:flex-row
            sm:items-end
            sm:justify-between
          "
        >
          <div>
            <p
              className="
                text-[10px]
                font-semibold
                uppercase
                tracking-[0.18em]
                text-primary
              "
            >
              Score comparison
            </p>

            <h2
              className="
                mt-1
                font-display
                text-xl
                font-bold
                sm:text-2xl
              "
            >
              Jury vs Televote
            </h2>

            <p
              className="
                mt-1
                max-w-xl
                text-xs
                leading-relaxed
                text-muted-foreground
              "
            >
              See how the jury and
              televote shaped the result.
              Tap a country for detailed
              differences.
            </p>
          </div>

          {/* SORT */}

          <div
            className="
              flex
              flex-wrap
              gap-1
              rounded-xl
              bg-surface
              p-1
            "
          >
            {(
              [
                [
                  "overall",
                  "Overall",
                ],
                [
                  "jury",
                  "Jury",
                ],
                [
                  "televote",
                  "Televote",
                ],
                [
                  "difference",
                  "Difference",
                ],
              ] as const
            ).map(
              ([
                value,
                label,
              ]) => (
                <button
                  key={
                    value
                  }
                  type="button"
                  onClick={() =>
                    setSortMode(
                      value,
                    )
                  }
                  className={cn(
                    `
                      rounded-lg
                      px-3
                      py-2
                      text-[11px]
                      font-medium
                      transition-colors
                    `,
                    sortMode ===
                      value
                      ? "bg-surface-strong text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>

        {/* LEGEND */}

        <div
          className="
            mt-4
            flex
            flex-wrap
            gap-x-5
            gap-y-2
            border-t
            border-border/60
            pt-3
            text-xs
            text-muted-foreground
          "
        >
          <Legend
            color="var(--televote)"
            label="Televote"
          />

          <Legend
            color="var(--jury)"
            label="Jury"
          />

          <span>
            Bar length = total points
          </span>
        </div>
      </div>

      {/* =====================================================
          INSIGHTS
         ===================================================== */}

      <div
        className="
          grid
          grid-cols-2
          gap-3
          lg:grid-cols-4
        "
      >
        <Insight
          label="Jury points"
          value={
            totalJury
          }
        />

        <Insight
          label="Televote points"
          value={
            totalTelevote
          }
        />

        <Insight
          label="Biggest jury boost"
          value={
            biggestJuryFavorite
              ?.country
              ?.short_code ??
            "—"
          }
          hint={
            biggestJuryFavorite &&
            biggestJuryFavorite.difference >
              0
              ? `+${biggestJuryFavorite.difference}`
              : undefined
          }
        />

        <Insight
          label="Biggest tele boost"
          value={
            biggestTelevoteFavorite
              ?.country
              ?.short_code ??
            "—"
          }
          hint={
            biggestTelevoteFavorite &&
            biggestTelevoteFavorite.difference <
              0
              ? `+${Math.abs(
                  biggestTelevoteFavorite.difference,
                )}`
              : undefined
          }
        />
      </div>

      {/* =====================================================
          COMPARISON
         ===================================================== */}

      <div
        className="
          glass
          overflow-hidden
          p-3
          sm:p-5
        "
      >
        <div className="space-y-0">
          {sortedRows.map(
            (
              row,
              index,
            ) => {
              const selected =
                selectedCountryId ===
                row.countryId;

              const shownRank =
                sortMode ===
                "jury"
                  ? row.juryRank
                  : sortMode ===
                      "televote"
                    ? row.televoteRank
                    : sortMode ===
                        "overall"
                      ? row.overallRank
                      : index + 1;

              return (
                <div
                  key={
                    row.countryId
                  }
                  className="
                    border-b
                    border-border/40
                    last:border-b-0
                  "
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedCountryId(
                        selected
                          ? null
                          : row.countryId,
                      )
                    }
                    className="
                      grid
                      w-full
                      grid-cols-[30px_minmax(84px,110px)_1fr]
                      items-center
                      gap-2
                      py-2.5
                      text-left
                      sm:grid-cols-[38px_160px_1fr]
                      sm:gap-3
                    "
                  >
                    {/* RANK */}

                    <span
                      className="
                        numeric
                        text-center
                        text-[11px]
                        text-muted-foreground
                        sm:text-xs
                      "
                    >
                      #
                      {
                        shownRank
                      }
                    </span>

                    {/* COUNTRY */}

                    <div
                      className="
                        flex
                        min-w-0
                        items-center
                        gap-2
                      "
                    >
                      <div
                        className="
                          h-7
                          w-7
                          shrink-0
                          overflow-hidden
                          rounded-full
                          border
                          border-white/20
                          sm:h-8
                          sm:w-8
                        "
                        style={{
                          backgroundColor:
                            `${row.country?.accent_color ?? "#75a9bd"}44`,
                        }}
                      >
                        {row
                          .country
                          ?.flag_image ? (
                          <img
                            src={
                              row
                                .country
                                .flag_image
                            }
                            alt=""
                            className="
                              h-full
                              w-full
                              object-cover
                            "
                          />
                        ) : (
                          <div
                            className="
                              grid
                              h-full
                              w-full
                              place-items-center
                              text-[8px]
                              font-bold
                            "
                          >
                            {row
                              .country
                              ?.short_code ??
                              "?"}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p
                          className="
                            truncate
                            text-xs
                            font-semibold
                            sm:text-sm
                          "
                        >
                          {row
                            .country
                            ?.name ??
                            "Unknown"}
                        </p>

                        <p
                          className="
                            numeric
                            mt-0.5
                            text-[10px]
                            text-muted-foreground
                          "
                        >
                          {
                            row.total
                          }{" "}
                          pts
                        </p>
                      </div>
                    </div>

                    {/* BAR */}

                    <ScoreBar
                      jury={
                        row.jury
                      }
                      televote={
                        row.televote
                      }
                      total={
                        row.total
                      }
                      maxTotal={
                        maxTotal
                      }
                    />
                  </button>

                  {/* EXPANDED */}

                  {selected && (
                    <ExpandedRow
                      row={
                        row
                      }
                    />
                  )}
                </div>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   BAR
   ========================================================= */

function ScoreBar({
  jury,
  televote,
  total,
  maxTotal,
}: {
  jury: number;
  televote: number;
  total: number;
  maxTotal: number;
}) {
  const totalWidth =
    (total /
      maxTotal) *
    100;

  const juryWithin =
    total > 0
      ? (jury /
          total) *
        100
      : 0;

  const televoteWithin =
    total > 0
      ? (televote /
          total) *
        100
      : 0;

  return (
    <div
      className="
        flex
        min-w-0
        items-center
        gap-2
      "
    >
      <div
        className="
          relative
          h-9
          min-w-0
          flex-1
          overflow-hidden
          rounded-lg
          bg-black/15
          sm:h-10
        "
      >
        <div
          className="
            absolute
            inset-y-0
            left-0
            flex
            overflow-hidden
            rounded-lg
            transition-[width]
            duration-500
          "
          style={{
            width:
              `${totalWidth}%`,
          }}
        >
          {/* TELEVOTE */}

          {televote >
            0 && (
            <div
              className="
                relative
                flex
                h-full
                items-center
                justify-center
                overflow-hidden
                bg-[var(--televote)]
                transition-[width]
                duration-500
              "
              style={{
                width:
                  `${televoteWithin}%`,
              }}
            >
              <BarNumber
                value={
                  televote
                }
                share={
                  televoteWithin
                }
              />
            </div>
          )}

          {/* JURY */}

          {jury > 0 && (
            <div
              className="
                relative
                flex
                h-full
                items-center
                justify-center
                overflow-hidden
                bg-[var(--jury)]
                transition-[width]
                duration-500
              "
              style={{
                width:
                  `${juryWithin}%`,
              }}
            >
              <BarNumber
                value={
                  jury
                }
                share={
                  juryWithin
                }
              />
            </div>
          )}
        </div>
      </div>

      <span
        className="
          numeric
          w-9
          shrink-0
          text-right
          text-[11px]
          font-semibold
          sm:w-12
          sm:text-xs
        "
      >
        {total}
      </span>
    </div>
  );
}

function BarNumber({
  value,
  share,
}: {
  value: number;
  share: number;
}) {
  if (
    share < 12
  ) {
    return null;
  }

  return (
    <span
      className="
        numeric
        relative
        z-10
        px-1
        text-[10px]
        font-bold
        text-white
        [text-shadow:0_1px_3px_rgba(0,0,0,.75)]
        sm:text-xs
      "
    >
      {value}
    </span>
  );
}

/* =========================================================
   EXPANDED
   ========================================================= */

function ExpandedRow({
  row,
}: {
  row: ComparisonRow;
}) {
  const juryAhead =
    row.difference >
    0;

  const teleAhead =
    row.difference <
    0;

  const differenceText =
    row.favoredBy ===
    "balanced"
      ? "Jury and televote were closely balanced."
      : juryAhead
        ? `Jury awarded ${row.absoluteDifference} more points than the televote.`
        : `Televote awarded ${row.absoluteDifference} more points than the jury.`;

  return (
    <div
      className="
        pb-4
        pl-[40px]
        pr-1
        sm:pl-[52px]
      "
    >
      <div
        className="
          rounded-xl
          bg-surface
          p-3
        "
      >
        <div
          className="
            grid
            grid-cols-2
            gap-3
            sm:grid-cols-4
          "
        >
          <Detail
            label="Overall"
            value={`#${row.overallRank}`}
          />

          <Detail
            label="Jury"
            value={`${row.jury} · #${row.juryRank}`}
          />

          <Detail
            label="Televote"
            value={`${row.televote} · #${row.televoteRank}`}
          />

          <Detail
            label="Gap"
            value={
              row.absoluteDifference
            }
          />
        </div>

        <div
          className="
            mt-3
            border-t
            border-border/60
            pt-3
          "
        >
          <p
            className={cn(
              "text-xs font-medium",
              juryAhead &&
                "text-[var(--jury)]",
              teleAhead &&
                "text-[var(--televote)]",
              row.favoredBy ===
                "balanced" &&
                "text-muted-foreground",
            )}
          >
            {
              differenceText
            }
          </p>

          <div
            className="
              mt-2
              flex
              flex-wrap
              gap-4
              text-[10px]
              text-muted-foreground
            "
          >
            <span>
              Jury{" "}
              {row.juryShare.toFixed(
                0,
              )}
              %
            </span>

            <span>
              Televote{" "}
              {row.televoteShare.toFixed(
                0,
              )}
              %
            </span>

            <span>
              Rank change:{" "}
              {formatRankDifference(
                row.juryRank,
                row.televoteRank,
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   HELPERS
   ========================================================= */

function formatRankDifference(
  juryRank: number,
  teleRank: number,
) {
  const difference =
    juryRank -
    teleRank;

  if (
    difference === 0
  ) {
    return "same";
  }

  if (
    difference <
    0
  ) {
    return `jury +${Math.abs(
      difference,
    )}`;
  }

  return `tele +${difference}`;
}

function Legend({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <span
      className="
        inline-flex
        items-center
        gap-1.5
      "
    >
      <span
        className="
          h-2.5
          w-2.5
          rounded-full
        "
        style={{
          backgroundColor:
            color,
        }}
      />

      {label}
    </span>
  );
}

function Insight({
  label,
  value,
  hint,
}: {
  label: string;
  value:
    | string
    | number;
  hint?: string;
}) {
  return (
    <div
      className="
        glass
        p-3
        sm:p-4
      "
    >
      <p
        className="
          text-[9px]
          font-semibold
          uppercase
          tracking-[0.14em]
          text-muted-foreground
        "
      >
        {label}
      </p>

      <p
        className="
          numeric
          mt-1
          text-lg
          font-bold
        "
      >
        {value}
      </p>

      {hint && (
        <p
          className="
            numeric
            mt-0.5
            text-[10px]
            text-primary
          "
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value:
    | string
    | number;
}) {
  return (
    <div>
      <p
        className="
          text-[9px]
          uppercase
          tracking-[0.12em]
          text-muted-foreground
        "
      >
        {label}
      </p>

      <p
        className="
          numeric
          mt-1
          text-sm
          font-semibold
        "
      >
        {value}
      </p>
    </div>
  );
}
