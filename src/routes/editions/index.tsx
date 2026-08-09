import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import {
  editionLabel,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";

export const Route = createFileRoute("/editions/")({
  head: () => ({
    meta: [
      {
        title: "Editions — Solaris Song Contest",
      },
      {
        name: "description",
        content:
          "Explore every edition of the Solaris Song Contest.",
      },
    ],
  }),

  component: EditionsPage,
});

function EditionsPage() {
  const {
    data: editions,
    isLoading,
  } = useEditions();

  const {
    data: shows,
  } = useAllShows();

  const {
    data: results,
  } = useAllResults();

  const {
    data: countries,
  } = useCountries();

  const editionList =
    editions ?? [];

  const showList =
    shows ?? [];

  const resultList =
    results ?? [];

  const countryList =
    countries ?? [];

  const countryMap =
    useMemo(
      () =>
        new Map(
          countryList.map(
            (country) => [
              country.id,
              country,
            ],
          ),
        ),
      [countryList],
    );

  const editionCards =
    useMemo(
      () =>
        editionList.map(
          (edition) => {
            const editionShows =
              showList.filter(
                (show) =>
                  show.edition_id ===
                  edition.id,
              );

            const grandFinal =
              editionShows.find(
                (show) =>
                  show.kind ===
                  "grand-final",
              ) ?? null;

            const finalResults =
              grandFinal
                ? resultList
                    .filter(
                      (result) =>
                        result.show_id ===
                        grandFinal.id,
                    )
                    .sort(
                      (a, b) =>
                        (a.final_rank ??
                          999) -
                        (b.final_rank ??
                          999),
                    )
                : [];

            const winnerResult =
              finalResults.find(
                (result) =>
                  result.final_rank ===
                  1,
              ) ??
              finalResults[0] ??
              null;

            const winner =
              winnerResult
                ? countryMap.get(
                    winnerResult.country_id,
                  ) ?? null
                : null;

            return {
              edition,
              shows:
                editionShows,
              grandFinal,
              winner,
              winnerResult,
            };
          },
        ),
      [
        editionList,
        showList,
        resultList,
        countryMap,
      ],
    );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Contest archive"
        title="Editions"
        description="Every Solaris Song Contest edition, from hosts and winners to complete show results."
      />

      {isLoading && (
        <p className="text-sm text-muted-foreground">
          Loading editions…
        </p>
      )}

      {!isLoading &&
        editionCards.length ===
          0 && (
          <div className="glass p-6 text-sm text-muted-foreground">
            No editions yet.
          </div>
        )}

      {/* =====================================================
          FEATURED / LATEST EDITION
         ===================================================== */}

      {editionCards[0] && (
        <section className="mb-8">
          <p
            className="
              mb-3
              text-[10px]
              font-bold
              uppercase
              tracking-[0.2em]
              text-muted-foreground
            "
          >
            Latest edition
          </p>

          <FeaturedEdition
            {...editionCards[0]}
          />
        </section>
      )}

      {/* =====================================================
          ARCHIVE
         ===================================================== */}

      {editionCards.length >
        1 && (
        <section>
          <div
            className="
              mb-3
              flex
              items-end
              justify-between
              gap-4
            "
          >
            <p
              className="
                text-[10px]
                font-bold
                uppercase
                tracking-[0.2em]
                text-muted-foreground
              "
            >
              Archive
            </p>

            <p
              className="
                text-xs
                text-muted-foreground
              "
            >
              {
                editionCards.length
              }{" "}
              editions
            </p>
          </div>

          <div
            className="
              grid
              gap-4
              md:grid-cols-2
              xl:grid-cols-3
            "
          >
            {editionCards
              .slice(1)
              .map(
                ({
                  edition,
                  shows:
                    editionShows,
                  winner,
                  winnerResult,
                }) => (
                  <Link
                    key={
                      edition.id
                    }
                    to="/editions/$slug"
                    params={{
                      slug:
                        edition.slug,
                    }}
                    className="
                      glass
                      group
                      relative
                      block
                      min-h-[260px]
                      overflow-hidden
                      p-5
                      transition-transform
                      hover:-translate-y-1
                    "
                  >
                    {/* Background art */}

                    {edition.logo && (
                      <img
                        src={
                          edition.logo
                        }
                        alt=""
                        className="
                          absolute
                          -right-8
                          -top-8
                          h-48
                          w-48
                          object-contain
                          opacity-[0.08]
                        "
                      />
                    )}

                    {winner?.flag_image && (
                      <div
                        className="
                          absolute
                          -bottom-14
                          -right-14
                          h-52
                          w-52
                          overflow-hidden
                          rounded-full
                          opacity-[0.08]
                        "
                      >
                        <img
                          src={
                            winner.flag_image
                          }
                          alt=""
                          className="
                            h-full
                            w-full
                            object-cover
                          "
                        />
                      </div>
                    )}

                    <div
                      className="
                        relative
                        z-10
                        flex
                        min-h-[220px]
                        flex-col
                      "
                    >
                      <div
                        className="
                          flex
                          items-start
                          justify-between
                          gap-3
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
                            {edition.year ??
                              "Edition"}
                          </p>

                          <h2
                            className="
                              mt-1
                              font-display
                              text-3xl
                              font-bold
                              tracking-[-0.04em]
                            "
                          >
                            {editionLabel(
                              edition,
                            )}
                          </h2>

                          <p
                            className="
                              mt-1
                              text-sm
                              text-muted-foreground
                            "
                          >
                            {
                              edition.name
                            }
                          </p>
                        </div>

                        <span
                          className="
                            text-lg
                            text-primary
                            transition-transform
                            group-hover:translate-x-1
                          "
                        >
                          →
                        </span>
                      </div>

                      <div className="mt-auto">
                        {winner ? (
                          <div
                            className="
                              mb-4
                              flex
                              items-center
                              gap-3
                            "
                          >
                            <FlagChip
                              code={
                                winner.short_code
                              }
                              color={
                                winner.accent_color
                              }
                              image={
                                winner.flag_image
                              }
                              size="sm"
                            />

                            <div className="min-w-0">
                              <p
                                className="
                                  text-[9px]
                                  font-semibold
                                  uppercase
                                  tracking-[0.15em]
                                  text-muted-foreground
                                "
                              >
                                Winner
                              </p>

                              <p
                                className="
                                  truncate
                                  text-sm
                                  font-semibold
                                "
                              >
                                {
                                  winner.name
                                }
                              </p>

                              {winnerResult && (
                                <p
                                  className="
                                    numeric
                                    mt-0.5
                                    text-[10px]
                                    text-muted-foreground
                                  "
                                >
                                  {
                                    winnerResult.total_points
                                  }{" "}
                                  points
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p
                            className="
                              mb-4
                              text-xs
                              text-muted-foreground
                            "
                          >
                            Winner not decided
                          </p>
                        )}

                        <div
                          className="
                            flex
                            flex-wrap
                            gap-x-4
                            gap-y-1
                            border-t
                            border-border/60
                            pt-3
                            text-[11px]
                            text-muted-foreground
                          "
                        >
                          <span>
                            {edition.host_city ??
                              "Host TBC"}
                          </span>

                          <span>
                            {
                              editionShows.length
                            }{" "}
                            show
                            {editionShows.length ===
                            1
                              ? ""
                              : "s"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ),
              )}
          </div>
        </section>
      )}
    </AppShell>
  );
}

/* =========================================================
   FEATURED EDITION
   ========================================================= */

function FeaturedEdition({
  edition,
  shows,
  winner,
  winnerResult,
}: {
  edition: ReturnType<
    typeof useEditions
  >["data"] extends
    | Array<infer T>
    | undefined
    ? T
    : never;

  shows: ReturnType<
    typeof useAllShows
  >["data"] extends
    | Array<infer T>
    | undefined
    ? T[]
    : never;

  winner:
    | ReturnType<
        typeof useCountries
      >["data"] extends
        | Array<infer T>
        | undefined
      ? T
      : never
    | null;

  winnerResult:
    | ReturnType<
        typeof useAllResults
      >["data"] extends
        | Array<infer T>
        | undefined
      ? T
      : never
    | null;
}) {
  return (
    <Link
      to="/editions/$slug"
      params={{
        slug: edition.slug,
      }}
      className="
        group
        relative
        block
        min-h-[390px]
        overflow-hidden
        rounded-[2rem]
        border
        border-white/20
        bg-black/25
        shadow-2xl
        sm:min-h-[430px]
      "
    >
      {/* Winner flag backdrop */}

      {winner?.flag_image && (
        <div
          className="
            absolute
            -right-[15%]
            top-1/2
            aspect-square
            w-[90%]
            -translate-y-1/2
            overflow-hidden
            rounded-full
            opacity-[0.20]
            sm:w-[58%]
          "
        >
          <img
            src={
              winner.flag_image
            }
            alt=""
            className="
              h-full
              w-full
              object-cover
            "
          />
        </div>
      )}

      {/* Edition logo */}

      {edition.logo && (
        <img
          src={edition.logo}
          alt=""
          className="
            absolute
            right-5
            top-5
            z-10
            h-20
            w-20
            object-contain
            opacity-70
            sm:h-28
            sm:w-28
          "
        />
      )}

      {/* Readability gradient */}

      <div
        className="
          absolute
          inset-0
          bg-gradient-to-r
          from-[#020817]/95
          via-[#041328]/82
          to-[#041328]/30
        "
      />

      <div
        className="
          relative
          z-20
          flex
          min-h-[390px]
          flex-col
          justify-between
          p-5
          sm:min-h-[430px]
          sm:p-8
          lg:p-10
        "
      >
        <div
          className="
            flex
            items-start
            gap-2
          "
        >
          <span
            className="
              rounded-full
              border
              border-primary/30
              bg-primary/10
              px-3
              py-1.5
              text-[9px]
              font-bold
              uppercase
              tracking-[0.18em]
              text-primary
              backdrop-blur-md
            "
          >
            {edition.published
              ? "Published"
              : "Upcoming"}
          </span>
        </div>

        <div className="max-w-3xl">
          <p
            className="
              text-xs
              font-semibold
              uppercase
              tracking-[0.2em]
              text-primary
            "
          >
            {[
              edition.host_city,
              edition.year,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <h2
            className="
              mt-2
              font-display
              text-4xl
              font-bold
              leading-[0.95]
              tracking-[-0.05em]
              text-white
              sm:text-6xl
            "
          >
            {editionLabel(
              edition,
            )}
          </h2>

          <p
            className="
              mt-2
              text-lg
              font-medium
              text-white/80
              sm:text-xl
            "
          >
            {edition.name}
          </p>

          {winner ? (
            <div
              className="
                mt-6
                flex
                items-center
                gap-3
              "
            >
              <FlagChip
                code={
                  winner.short_code
                }
                color={
                  winner.accent_color
                }
                image={
                  winner.flag_image
                }
                size="sm"
              />

              <div>
                <p
                  className="
                    text-[9px]
                    font-semibold
                    uppercase
                    tracking-[0.16em]
                    text-white/50
                  "
                >
                  Winner
                </p>

                <p
                  className="
                    text-sm
                    font-semibold
                    text-white
                  "
                >
                  {winner.name}
                  {winnerResult
                    ? ` · ${winnerResult.total_points} pts`
                    : ""}
                </p>
              </div>
            </div>
          ) : (
            <p
              className="
                mt-5
                max-w-xl
                text-sm
                leading-relaxed
                text-white/60
              "
            >
              {edition.description ??
                "The newest chapter of the Solaris Song Contest."}
            </p>
          )}

          <div
            className="
              mt-7
              flex
              flex-wrap
              items-center
              gap-4
            "
          >
            <span
              className="
                inline-flex
                items-center
                gap-2
                rounded-xl
                bg-white
                px-4
                py-2.5
                text-sm
                font-semibold
                text-[#051223]
                transition-transform
                group-hover:translate-x-1
              "
            >
              Explore edition
              <span>→</span>
            </span>

            <span
              className="
                text-xs
                text-white/50
              "
            >
              {shows.length} show
              {shows.length ===
              1
                ? ""
                : "s"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
