import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";

import {
  useMemo,
} from "react";

import {
  AppShell,
  PageHeader,
} from "@/components/AppShell";

import {
  BackgroundFlag,
} from "@/components/BackgroundFlag";

import {
  FlagChip,
} from "@/components/FlagChip";

import {
  editionLabel,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";

export const Route =
  createFileRoute(
    "/editions/",
  )({
    head: () => ({
      meta: [
        {
          title:
            "Editions — Solaris Song Contest",
        },
      ],
    }),

    component:
      EditionsPage,
  });

function EditionsPage() {
  const {
    data: editions,
    isLoading,
  } =
    useEditions();

  const {
    data: shows,
  } =
    useAllShows();

  const {
    data: results,
  } =
    useAllResults();

  const {
    data: countries,
  } =
    useCountries();

  const editionList =
    useMemo(
      () =>
        [
          ...(editions ??
            []),
        ].sort(
          (a, b) =>
            (b.edition_number ??
              -1) -
            (a.edition_number ??
              -1),
        ),
      [
        editions,
      ],
    );

  const showList =
    shows ?? [];

  const resultList =
    results ?? [];

  const countryMap =
    new Map(
      (
        countries ??
        []
      ).map(
        (country) => [
          country.id,
          country,
        ],
      ),
    );

  const cards =
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
          ) ??
          null;

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
          finalResults[
            0
          ] ??
          null;

        const winner =
          winnerResult
            ? countryMap.get(
                winnerResult.country_id,
              ) ??
              null
            : null;

        return {
          edition,
          editionShows,
          winner,
          winnerResult,
        };
      },
    );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Contest archive"
        title="Editions"
        description="Every Solaris Song Contest edition in numerical order."
      />

      {isLoading && (
        <p className="text-sm text-muted-foreground">
          Loading editions…
        </p>
      )}

      {cards[0] && (
        <section className="mb-8">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Latest edition
          </p>

          <EditionHero
            edition={
              cards[0]
                .edition
            }
            shows={
              cards[0]
                .editionShows
            }
            winner={
              cards[0]
                .winner
            }
            winnerResult={
              cards[0]
                .winnerResult
            }
          />
        </section>
      )}

      {cards.length >
        1 && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Archive
            </p>

            <p className="text-xs text-muted-foreground">
              {
                cards.length
              }{" "}
              editions
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards
              .slice(1)
              .map(
                ({
                  edition,
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
                    className="glass group relative block min-h-[260px] overflow-hidden p-5 transition-transform hover:-translate-y-1"
                  >
                    <BackgroundFlag
                      image={winner?.flag_image}
                      className="
                        -bottom-14
                        -right-14
                        h-52
                        w-52
                      "
                      opacity={0.14}
                    />

                    <div className="relative z-10 flex min-h-[220px] flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                            Edition{" "}
                            {edition.edition_number ??
                              "—"}
                          </p>

                          <h2 className="mt-1 font-display text-3xl font-bold tracking-[-0.04em]">
                            {editionLabel(
                              edition,
                            )}
                          </h2>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {
                              edition.name
                            }
                          </p>
                        </div>

                        <span className="text-lg text-primary">
                          →
                        </span>
                      </div>

                      <div className="mt-auto">
                        {winner ? (
                          <div className="mb-4 flex items-center gap-3">
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
                              <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                                Winner
                              </p>

                              <p className="text-sm font-semibold">
                                {
                                  winner.name
                                }
                              </p>

                              {winnerResult && (
                                <p className="numeric text-[10px] text-muted-foreground">
                                  {
                                    winnerResult.total_points
                                  }{" "}
                                  pts
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="mb-4 text-xs text-muted-foreground">
                            Winner not decided
                          </p>
                        )}

                        <div className="flex flex-wrap gap-x-4 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                          <span>
                            {edition.host_city ??
                              "Host TBC"}
                          </span>

                          <span>
                            {
                              editionShows.length
                            }{" "}
                            shows
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

function EditionHero({
  edition,
  shows,
  winner,
  winnerResult,
}: {
  edition:
    any;

  shows:
    any[];

  winner:
    any;

  winnerResult:
    any;
}) {
  return (
    <Link
      to="/editions/$slug"
      params={{
        slug:
          edition.slug,
      }}
      className="group relative block min-h-[390px] overflow-hidden rounded-[2rem] border border-white/20 bg-black/25 shadow-2xl sm:min-h-[430px]"
    >
      <BackgroundFlag
        image={winner?.flag_image}
        className="
          -right-[15%]
          top-1/2
          w-[90%]
          -translate-y-1/2
          sm:w-[58%]
        "
        opacity={0.24}
      />

      <div className="absolute inset-0 bg-gradient-to-r from-[#020817]/95 via-[#041328]/82 to-[#041328]/30" />

      <div className="relative z-20 flex min-h-[390px] flex-col justify-between p-5 sm:min-h-[430px] sm:p-8 lg:p-10">
        <span className="w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
          {edition.published
            ? "Published"
            : "Upcoming"}
        </span>

        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Edition{" "}
            {edition.edition_number ??
              "—"}
            {edition.host_city
              ? ` · ${edition.host_city}`
              : ""}
          </p>

          <h2 className="mt-2 font-display text-4xl font-bold leading-[0.95] tracking-[-0.05em] text-white sm:text-6xl">
            {editionLabel(
              edition,
            )}
          </h2>

          <p className="mt-2 text-lg font-medium text-white/80">
            {
              edition.name
            }
          </p>

          {winner && (
            <div className="mt-6 flex items-center gap-3">
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
                <p className="text-[9px] uppercase tracking-[0.16em] text-white/50">
                  Winner
                </p>

                <p className="text-sm font-semibold text-white">
                  {winner.name}
                  {winnerResult
                    ? ` · ${winnerResult.total_points} pts`
                    : ""}
                </p>
              </div>
            </div>
          )}

          <div className="mt-7 flex items-center gap-4">
            <span className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#051223]">
              Explore edition →
            </span>

            <span className="text-xs text-white/50">
              {shows.length} shows
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
