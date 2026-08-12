import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { BackgroundFlag } from "@/components/BackgroundFlag";
import { FlagChip } from "@/components/FlagChip";
import {
  editionLabel,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";

export const Route = createFileRoute("/editions/")({
  head: () => ({ meta: [{ title: "Editions — Solaris Song Contest" }] }),
  component: EditionsPage,
});

type EditionCard = {
  edition: any;
  editionShows: any[];
  winner: any;
  winnerResult: any;
};

function EditionsPage() {
  const { data: editions, isLoading } = useEditions();
  const { data: shows } = useAllShows();
  const { data: results } = useAllResults();
  const { data: countries } = useCountries();

  const editionList = useMemo(
    () =>
      [...(editions ?? []).filter((edition) => edition.published)].sort(
        (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
      ),
    [editions],
  );

  const countryMap = useMemo(
    () => new Map((countries ?? []).map((country) => [country.id, country])),
    [countries],
  );

  const cards = useMemo<EditionCard[]>(
    () =>
      editionList.map((edition) => {
        const editionShows = (shows ?? [])
          .filter((show) => show.edition_id === edition.id && isShowPublic(show))
          .sort((a, b) => a.sort_order - b.sort_order);

        const grandFinal =
          editionShows.find((show) => show.kind === "grand-final" || show.kind === "final") ?? null;
        const publication = grandFinal ? resolveShowPublication(grandFinal) : null;
        const finalResults =
          grandFinal && publication?.results
            ? (results ?? [])
                .filter((result) => result.show_id === grandFinal.id && result.final_rank != null)
                .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999))
            : [];
        const winnerResult =
          finalResults.find((result) => result.final_rank === 1) ?? finalResults[0] ?? null;
        const winner = winnerResult ? countryMap.get(winnerResult.country_id) ?? null : null;

        return { edition, editionShows, winner, winnerResult };
      }),
    [editionList, shows, results, countryMap],
  );

  const latest = cards[0] ?? null;
  const archive = cards.slice(1);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Contest archive"
        title="Editions"
        description="Every published Solaris chapter, from the latest contest back through the archive."
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading editions…</p>}

      {latest && <LatestEdition card={latest} />}

      {archive.length > 0 && (
        <section className="mt-7 sm:mt-9">
          <div className="mb-4 flex items-end justify-between gap-4 border-b border-border/60 pb-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-primary">Archive desk</p>
              <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.03em] sm:text-2xl">Past editions</h2>
            </div>
            <p className="numeric text-xs text-muted-foreground">{cards.length} editions</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {archive.map((card) => (
              <ArchiveEdition key={card.edition.id} card={card} />
            ))}
          </div>
        </section>
      )}

      {!isLoading && cards.length === 0 && (
        <div className="glass p-5 text-sm text-muted-foreground">No editions are public yet.</div>
      )}
    </AppShell>
  );
}

function LatestEdition({ card }: { card: EditionCard }) {
  const { edition, editionShows, winner, winnerResult } = card;

  return (
    <section>
      <p className="mb-3 text-[9px] font-black uppercase tracking-[0.22em] text-muted-foreground">
        Latest edition
      </p>

      <Link
        to="/editions/$slug"
        params={{ slug: edition.slug }}
        className="glass-strong group relative block overflow-hidden p-0"
      >
        <div className="relative min-h-[310px] overflow-hidden sm:min-h-[390px]">
          <BackgroundFlag
            image={winner?.flag_image}
            className="-right-[20%] top-1/2 w-[105%] -translate-y-1/2 sm:-right-[8%] sm:w-[58%]"
            opacity={0.24}
          />

          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_38%,rgba(91,159,210,0.18),transparent_35%),linear-gradient(90deg,rgba(2,8,23,0.96)_0%,rgba(3,17,39,0.88)_45%,rgba(3,17,39,0.38)_100%)]" />

          <div className="relative z-10 flex min-h-[310px] flex-col justify-between p-5 sm:min-h-[390px] sm:p-7 lg:p-9">
            <div className="flex items-start justify-between gap-4">
              <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-primary backdrop-blur-md">
                {edition.status === "completed" ? "Completed edition" : "Current edition"}
              </span>
              <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[9px] font-semibold text-white/65 backdrop-blur-md">
                {editionShows.length} public shows
              </span>
            </div>

            <div className="max-w-[700px]">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                Edition {edition.edition_number ?? "—"}{edition.host_city ? ` · ${edition.host_city}` : ""}
              </p>
              <h2 className="mt-2 font-display text-4xl font-black leading-[0.92] tracking-[-0.055em] text-white sm:text-6xl">
                {editionLabel(edition)}
              </h2>
              <p className="mt-3 max-w-xl text-base font-medium text-white/68 sm:text-lg">{edition.name}</p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <span className="bg-aurora rounded-lg px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg">
                  Open edition →
                </span>
                {winner && (
                  <div className="flex items-center gap-2 rounded-lg border border-white/12 bg-black/20 px-3 py-2 backdrop-blur-md">
                    <FlagChip
                      code={winner.short_code}
                      color={winner.accent_color}
                      image={winner.flag_image}
                      size="sm"
                    />
                    <div>
                      <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-white/45">Winner</p>
                      <p className="text-xs font-semibold text-white">
                        {winner.name}{winnerResult ? ` · ${winnerResult.total_points} pts` : ""}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </section>
  );
}

function ArchiveEdition({ card }: { card: EditionCard }) {
  const { edition, editionShows, winner, winnerResult } = card;

  return (
    <Link
      to="/editions/$slug"
      params={{ slug: edition.slug }}
      className="glass group relative min-h-[178px] overflow-hidden p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 sm:min-h-[196px] sm:p-5"
    >
      <BackgroundFlag
        image={winner?.flag_image}
        className="-bottom-12 -right-10 h-44 w-44 opacity-80 sm:h-48 sm:w-48"
        opacity={0.18}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#06142b]/38 via-transparent to-[#06142b]/48" />

      <div className="relative z-10 flex h-full min-h-[146px] flex-col sm:min-h-[156px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.19em] text-primary">
              Edition {edition.edition_number ?? "—"}
            </p>
            <h3 className="mt-1 truncate font-display text-2xl font-black tracking-[-0.045em] sm:text-[1.7rem]">
              {editionLabel(edition)}
            </h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">{edition.name}</p>
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/12 bg-white/[0.04] text-primary backdrop-blur-md transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-border/55 pt-3">
          <div className="min-w-0">
            {winner ? (
              <div className="flex min-w-0 items-center gap-2.5">
                <FlagChip
                  code={winner.short_code}
                  color={winner.accent_color}
                  image={winner.flag_image}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Winner</p>
                  <p className="truncate text-xs font-semibold">{winner.name}</p>
                  {winnerResult && (
                    <p className="numeric text-[9px] text-muted-foreground">{winnerResult.total_points} pts</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Results not public yet</p>
            )}
          </div>

          <div className="shrink-0 text-right text-[9px] text-muted-foreground">
            <p>{edition.host_city ?? "Host TBC"}</p>
            <p className="mt-0.5">{editionShows.length} shows</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
