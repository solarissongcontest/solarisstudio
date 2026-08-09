import { useEffect, useMemo, useState } from "react";

import {
  matchVoterKey,
  resolveShowVoters,
  type Country,
  type JuryVote,
  type Participant,
  type Televote,
  type Voter,
} from "@/lib/data";
import { cn } from "@/lib/utils";

type Direction = "received" | "given";
type Layer = "combined" | "jury" | "televote";

type Props = {
  participants: Participant[];
  countries: Map<string, Country>;
  jury: JuryVote[];
  televote: Televote[];
  voters?: Voter[];
};

type CircleItem = {
  key: string;
  name: string;
  code: string | null;
  flag: string | null;
  accent: string;
  points: number;
};

export function RadialPointsView({
  participants,
  countries,
  jury,
  televote,
  voters,
}: Props) {
  const participantIds = useMemo(
    () => participants.map((participant) => participant.country_id),
    [participants],
  );

  const participantOptions = useMemo(
    () =>
      participantIds
        .map((id) => countries.get(id))
        .filter((country): country is Country => !!country),
    [participantIds, countries],
  );

  const voterOptions = useMemo(
    () =>
      resolveShowVoters(
        voters,
        participantIds,
        [...countries.values()],
      ),
    [voters, participantIds, countries],
  );

  const [direction, setDirection] =
    useState<Direction>("received");

  const [layer, setLayer] =
    useState<Layer>("combined");

  const [selectedCountryId, setSelectedCountryId] =
    useState("");

  const [selectedVoterKey, setSelectedVoterKey] =
    useState("");

  /*
   * Data arrives asynchronously.
   * Pick a valid initial country once participants exist.
   */
  useEffect(() => {
    if (
      !selectedCountryId ||
      !participantIds.includes(selectedCountryId)
    ) {
      setSelectedCountryId(participantIds[0] ?? "");
    }
  }, [participantIds, selectedCountryId]);

  /*
   * Same thing for jury / voter identity.
   */
  useEffect(() => {
    if (
      !selectedVoterKey ||
      !voterOptions.some(
        (voter) => voter.key === selectedVoterKey,
      )
    ) {
      setSelectedVoterKey(voterOptions[0]?.key ?? "");
    }
  }, [voterOptions, selectedVoterKey]);

  const selectedCountry =
    countries.get(selectedCountryId) ?? null;

  const selectedVoter =
    voterOptions.find(
      (voter) => voter.key === selectedVoterKey,
    ) ?? null;

  /* =========================================================
     POINTS RECEIVED

     IMPORTANT:
     Countries / juries with 0 points are REMOVED completely.
     ========================================================= */

  const juryItemsReceived = useMemo<CircleItem[]>(() => {
    if (!selectedCountryId) {
      return [];
    }

    return voterOptions
      .map((voter) => {
        const points = jury
          .filter(
            (vote) =>
              vote.receiving_country_id === selectedCountryId &&
              matchVoterKey(
                vote,
                voterOptions,
              ) === voter.key,
          )
          .reduce(
            (sum, vote) => sum + vote.points,
            0,
          );

        return {
          key: voter.key,
          name: voter.name,
          code: voter.short_code,
          flag: voter.flag_image,
          accent:
            voter.accent_color || "#75a9bd",
          points,
        };
      })

      /*
       * THIS is the important fix.
       *
       * Do not show juries that gave nothing.
       */
      .filter((item) => item.points > 0)

      /*
       * Eurovisionworld-style ordering:
       * biggest scores first.
       */
      .sort(
        (a, b) =>
          b.points - a.points ||
          a.name.localeCompare(b.name),
      );
  }, [
    selectedCountryId,
    jury,
    voterOptions,
  ]);

  /* =========================================================
     POINTS GIVEN

     Again, ONLY recipients that actually got points.
     ========================================================= */

  const juryItemsGiven = useMemo<CircleItem[]>(() => {
    if (!selectedVoter) {
      return [];
    }

    return participantOptions
      .map((country) => {
        const points = jury
          .filter(
            (vote) =>
              vote.receiving_country_id ===
                country.id &&
              matchVoterKey(
                vote,
                voterOptions,
              ) === selectedVoter.key,
          )
          .reduce(
            (sum, vote) => sum + vote.points,
            0,
          );

        return {
          key: country.id,
          name: country.name,
          code: country.short_code,
          flag: country.flag_image,
          accent:
            country.accent_color ||
            "#75a9bd",
          points,
        };
      })

      /*
       * No pointless zero bubbles.
       */
      .filter((item) => item.points > 0)

      .sort(
        (a, b) =>
          b.points - a.points ||
          a.name.localeCompare(b.name),
      );
  }, [
    selectedVoter,
    participantOptions,
    jury,
    voterOptions,
  ]);

  /* =========================================================
     TELEVOTE

     Solaris stores only the aggregate country televote result.
     Therefore there is ONE televote amount, not fake individual
     public-vote countries.
     ========================================================= */

  const teleTotal = useMemo(() => {
    if (!selectedCountryId) {
      return 0;
    }

    return televote
      .filter(
        (vote) =>
          vote.country_id === selectedCountryId,
      )
      .reduce(
        (sum, vote) => sum + vote.points,
        0,
      );
  }, [
    selectedCountryId,
    televote,
  ]);

  const circleItems =
    direction === "received"
      ? juryItemsReceived
      : juryItemsGiven;

  const visibleItems =
    direction === "received" &&
    layer === "televote"
      ? []
      : circleItems;

  const juryTotal = useMemo(
    () =>
      circleItems.reduce(
        (sum, item) =>
          sum + item.points,
        0,
      ),
    [circleItems],
  );

  const total =
    direction === "received"
      ? layer === "jury"
        ? juryTotal
        : layer === "televote"
          ? teleTotal
          : juryTotal + teleTotal
      : juryTotal;

  const centerName =
    direction === "received"
      ? selectedCountry?.name ??
        "Country"
      : selectedVoter?.name ??
        "Jury";

  const centerFlag =
    direction === "received"
      ? selectedCountry?.flag_image ??
        null
      : selectedVoter?.flag_image ??
        null;

  const centerAccent =
    direction === "received"
      ? selectedCountry?.accent_color ??
        "#75a9bd"
      : selectedVoter?.accent_color ??
        "#75a9bd";

  const centerCode =
    direction === "received"
      ? selectedCountry?.short_code ??
        ""
      : selectedVoter?.short_code ??
        "";

  /*
   * Fewer countries = slightly wider ring.
   * More countries = pull them in a little.
   */
  const radius =
    visibleItems.length <= 10
      ? 39
      : visibleItems.length <= 16
        ? 40
        : 41;

  return (
    <div className="space-y-4">
      {/* =====================================================
          CONTROLS
         ===================================================== */}

      <div className="glass p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">

          <div className="grid gap-2 sm:grid-cols-2">

            <label>
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Direction
              </span>

              <select
                value={direction}
                onChange={(event) => {
                  const next =
                    event.target.value as Direction;

                  setDirection(next);

                  /*
                   * There is no detailed "points given"
                   * televote breakdown.
                   */
                  if (next === "given") {
                    setLayer("jury");
                  }
                }}
                className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
              >
                <option value="received">
                  Points received
                </option>

                <option value="given">
                  Points given
                </option>
              </select>
            </label>

            {direction === "received" ? (
              <label>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Country
                </span>

                <select
                  value={selectedCountryId}
                  onChange={(event) =>
                    setSelectedCountryId(
                      event.target.value,
                    )
                  }
                  className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                >
                  {participantOptions.map(
                    (country) => (
                      <option
                        key={country.id}
                        value={country.id}
                      >
                        {country.name}
                      </option>
                    ),
                  )}
                </select>
              </label>
            ) : (
              <label>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Jury
                </span>

                <select
                  value={selectedVoterKey}
                  onChange={(event) =>
                    setSelectedVoterKey(
                      event.target.value,
                    )
                  }
                  className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                >
                  {voterOptions.map(
                    (voter) => (
                      <option
                        key={voter.key}
                        value={voter.key}
                      >
                        {voter.name}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}

          </div>

          {/* Jury / Combined / Tele only matters
              when looking at received points. */}

          {direction === "received" && (
            <div className="flex flex-wrap gap-1 rounded-xl bg-surface p-1">

              {(
                [
                  "combined",
                  "jury",
                  "televote",
                ] as Layer[]
              ).map((value) => {
                const text =
                  value === "combined"
                    ? "Combined"
                    : value === "jury"
                      ? "Jury"
                      : "Televote";

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setLayer(value)
                    }
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                      layer === value
                        ? "bg-surface-strong text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {text}
                  </button>
                );
              })}

            </div>
          )}

        </div>
      </div>

      {/* =====================================================
          RADIAL VIEW
         ===================================================== */}

      <div
        className="
          relative
          mx-auto
          aspect-square
          w-full
          max-w-[760px]
          overflow-hidden
          rounded-[2rem]
          border
          border-border/70
          bg-black/20
          shadow-2xl
        "
      >

        {/* soft centre glow */}

        <div
          className="absolute inset-[8%] rounded-full opacity-60"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--primary) 18%, transparent) 0%, transparent 64%)",
          }}
        />

        {/* ===================================================
            JURY / COUNTRY CIRCLE
           =================================================== */}

        <div className="absolute inset-0">

          {visibleItems.map(
            (item, index) => {
              const count =
                visibleItems.length;

              const angle =
                -90 +
                (360 / count) *
                  index;

              const radians =
                (angle *
                  Math.PI) /
                180;

              const x =
                50 +
                Math.cos(radians) *
                  radius;

              const y =
                50 +
                Math.sin(radians) *
                  radius;

              return (
                <button
                  key={item.key}
                  type="button"
                  title={`${item.name}: ${item.points} points`}
                  className="
                    absolute
                    z-20
                    -translate-x-1/2
                    -translate-y-1/2
                    transition-transform
                    active:scale-95
                  "
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                  }}
                  onClick={() => {
                    /*
                     * Tap a jury while viewing points received:
                     * switch to their ballot.
                     */
                    if (
                      direction ===
                      "received"
                    ) {
                      setSelectedVoterKey(
                        item.key,
                      );

                      setDirection(
                        "given",
                      );

                      setLayer(
                        "jury",
                      );

                      return;
                    }

                    /*
                     * Tap a country while viewing points given:
                     * switch to points received by that country.
                     */
                    if (
                      countries.has(
                        item.key,
                      )
                    ) {
                      setSelectedCountryId(
                        item.key,
                      );

                      setDirection(
                        "received",
                      );

                      setLayer(
                        "combined",
                      );
                    }
                  }}
                >
                  <CircleFlag
                    item={item}
                  />
                </button>
              );
            },
          )}

        </div>

        {/* ===================================================
            ARROWS
           =================================================== */}

        {visibleItems.length > 0 && (
          <ArrowRing
            count={
              visibleItems.length
            }
            inward={
              direction ===
              "received"
            }
          />
        )}

        {/* ===================================================
            ONE SINGLE TELEVOTE RESULT
           =================================================== */}

        {direction === "received" &&
          layer !== "jury" &&
          teleTotal > 0 && (
            <div
              className="
                absolute
                left-1/2
                top-[5%]
                z-30
                -translate-x-1/2
              "
            >
              <div
                className="
                  min-w-[68px]
                  rounded-full
                  border
                  border-fuchsia-200/60
                  bg-fuchsia-500/90
                  px-4
                  py-2
                  text-center
                  shadow-[0_0_26px_rgba(217,70,239,.55)]
                  backdrop-blur-xl
                "
              >
                <p
                  className="
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[0.15em]
                    text-white
                  "
                >
                  TELE
                </p>

                <p
                  className="
                    numeric
                    text-lg
                    font-black
                    leading-none
                    text-white
                  "
                >
                  {teleTotal}
                </p>
              </div>
            </div>
          )}

        {/* ===================================================
            CENTRE
           =================================================== */}

        <div
          className="
            absolute
            left-1/2
            top-1/2
            z-30
            w-[38%]
            min-w-[132px]
            max-w-[235px]
            -translate-x-1/2
            -translate-y-1/2
          "
        >
          <button
            type="button"
            className="
              glass
              w-full
              rounded-[2rem]
              p-4
              text-center
              sm:p-5
            "
            onClick={() => {
              /*
               * If selected jury represents a country,
               * tapping centre can return to that country's
               * received view.
               */
              if (
                direction ===
                  "given" &&
                selectedVoter?.countryId
              ) {
                setSelectedCountryId(
                  selectedVoter.countryId,
                );

                setDirection(
                  "received",
                );

                setLayer(
                  "combined",
                );
              }
            }}
          >

            <div
              className="
                mx-auto
                grid
                aspect-square
                w-[58%]
                place-items-center
                overflow-hidden
                rounded-full
                border
                border-white/30
                shadow-xl
              "
              style={{
                backgroundColor:
                  `${centerAccent}33`,
              }}
            >

              {centerFlag ? (
                <img
                  src={centerFlag}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span
                  className="
                    font-display
                    text-lg
                    font-bold
                  "
                >
                  {centerCode ||
                    "?"}
                </span>
              )}

            </div>

            <p
              className="
                mt-3
                truncate
                font-display
                text-base
                font-bold
                sm:text-xl
              "
            >
              {centerName}
            </p>

            <p
              className="
                numeric
                mt-1
                text-sm
                font-semibold
                text-foreground
              "
            >
              {total}{" "}
              point
              {total === 1
                ? ""
                : "s"}
            </p>

            {direction ===
              "received" &&
              layer ===
                "combined" && (
                <p
                  className="
                    mt-1
                    text-[10px]
                    text-muted-foreground
                    sm:text-xs
                  "
                >
                  Jury{" "}
                  {juryTotal} ·
                  Tele{" "}
                  {teleTotal}
                </p>
              )}

          </button>
        </div>

        {/* ===================================================
            TELE-ONLY MODE
           =================================================== */}

        {direction ===
          "received" &&
          layer ===
            "televote" && (
            <div
              className="
                absolute
                inset-x-5
                bottom-[8%]
                text-center
              "
            >
              <p
                className="
                  mx-auto
                  max-w-sm
                  text-[11px]
                  leading-relaxed
                  text-muted-foreground
                "
              >
                Only the total
                televote result is
                available. Solaris
                does not store a
                country-by-country
                public-vote
                breakdown.
              </p>
            </div>
          )}

        {/* No jury support */}

        {direction ===
          "received" &&
          layer !==
            "televote" &&
          visibleItems.length ===
            0 && (
            <div
              className="
                absolute
                inset-x-5
                bottom-[8%]
                text-center
                text-xs
                text-muted-foreground
              "
            >
              No jury awarded
              points to this
              country.
            </div>
          )}

      </div>

      {/* =====================================================
          LEGEND
         ===================================================== */}

      <div
        className="
          flex
          flex-wrap
          items-center
          justify-center
          gap-x-5
          gap-y-2
          text-[11px]
          text-muted-foreground
        "
      >

        <LegendDot
          className="bg-[var(--jury)]"
          label="Jury points"
        />

        {direction ===
          "received" && (
          <LegendDot
            className="bg-fuchsia-500"
            label="Televote total"
          />
        )}

        <span>
          Only juries that
          awarded points are
          shown.
        </span>

      </div>
    </div>
  );
}

/* =========================================================
   OUTER COUNTRY / JURY

   The score is intentionally LARGE and sits over the bottom
   of the flag rather than hiding underneath it.
   ========================================================= */

function CircleFlag({
  item,
}: {
  item: CircleItem;
}) {
  return (
    <div
      className="
        relative
        flex
        flex-col
        items-center
      "
    >

      <div
        className="
          relative
          h-12
          w-12
          overflow-hidden
          rounded-full
          border
          border-white/45
          shadow-[0_4px_18px_rgba(0,0,0,.35)]
          sm:h-14
          sm:w-14
          md:h-16
          md:w-16
        "
        style={{
          backgroundColor:
            `${item.accent}55`,
        }}
      >

        {item.flag ? (
          <img
            src={item.flag}
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
              text-[10px]
              font-black
              text-white
            "
          >
            {item.code ??
              "J"}
          </div>
        )}

        {/* dark fade makes white number readable */}

        <div
          className="
            absolute
            inset-x-0
            bottom-0
            h-[52%]
            bg-gradient-to-t
            from-black/75
            to-transparent
          "
        />

        {/* POINTS */}

        <div
          className="
            numeric
            absolute
            inset-x-0
            bottom-[2px]
            z-10
            text-center
            text-[16px]
            font-black
            leading-none
            text-white
            [text-shadow:0_2px_4px_rgba(0,0,0,.95)]
            sm:text-[18px]
            md:text-[20px]
          "
        >
          {item.points}
        </div>

      </div>

    </div>
  );
}

/* =========================================================
   RADIAL ARROWS
   ========================================================= */

function ArrowRing({
  count,
  inward,
}: {
  count: number;
  inward: boolean;
}) {
  /*
   * Don't draw 40 arrows.
   * Keep it visually clean.
   */
  const arrowCount =
    Math.min(
      Math.max(
        Math.ceil(count / 2),
        8,
      ),
      14,
    );

  const arrows =
    Array.from({
      length:
        arrowCount,
    });

  return (
    <div
      className="
        pointer-events-none
        absolute
        inset-[27%]
        rounded-full
      "
    >
      {arrows.map(
        (_, index) => {
          const angle =
            -90 +
            (360 /
              arrows.length) *
              index;

          return (
            <span
              key={index}
              className="
                absolute
                left-1/2
                top-1/2
                text-xl
                font-light
                text-primary/45
                sm:text-2xl
              "
              style={{
                transform:
                  `rotate(${angle}deg) ` +
                  `translateY(-135%) ` +
                  `rotate(${
                    inward
                      ? 90
                      : -90
                  }deg)`,

                transformOrigin:
                  "0 0",
              }}
            >
              →
            </span>
          );
        },
      )}
    </div>
  );
}

/* =========================================================
   LEGEND
   ========================================================= */

function LegendDot({
  className,
  label,
}: {
  className: string;
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
        className={cn(
          "h-2.5 w-2.5 rounded-full",
          className,
        )}
      />

      {label}
    </span>
  );
}
