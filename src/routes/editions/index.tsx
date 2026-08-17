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

type HostLocation = {
  key: string;
  city: string | null;
  country: any | null;
  showNames: string[];
};

type EditionCard = {
  edition: any;
  editionShows: any[];
  winner: any;
  winnerResult: any;
  hosts: HostLocation[];
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

        const hostMap = new Map<string, HostLocation>();

        editionShows.forEach((show: any) => {
          const countryId = show.host_country_id ?? edition.host_country_id ?? null;
          const city = show.host_city ?? edition.host_city ?? null;

          if (!countryId && !city) return;

          const key = `${countryId ?? "none"}:${city ?? "none"}`;
          const current: HostLocation = hostMap.get(key) ?? {
            key,
            city,
            country: countryId ? countryMap.get(countryId) ?? null : null,
            showNames: [],
          };

          current.showNames.push(show.name);
          hostMap.set(key, current);
        });

        if (hostMap.size === 0 && (edition.host_country_id || edition.host_city)) {
          const country = edition.host_country_id ? countryMap.get(edition.host_country_id) ?? null : null;
          const key = `${edition.host_country_id ?? "none"}:${edition.host_city ?? "none"}`;
          hostMap.set(key, {
            key,
            city: edition.host_city ?? null,
            country,
            showNames: editionShows.map((show) => show.name),
          });
        }

        return {
          edition,
          editionShows,
          winner,
          winnerResult,
          hosts: [...hostMap.values()],
        };
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
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-primary">Archive desk</p>
              <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.03em] sm:text-2xl">
                Past editions
              </h2>
            </div>
            <p className="numeric shrink-0 text-xs text-muted-foreground">{cards.length} editions</p>
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
  const { edition, editionShows, winner, winnerResult, hosts } = card;

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
        <div className="relative min-h-[285px] overflow-hidden sm:min-h-[390px]">
          <BackgroundFlag
            image={winner?.flag_image ?? hosts[0]?.country?.flag_image}
            className="-right-[34%] top-1/2 w-[145%] -translate-y-1/2 sm:-right-[14%] sm:w-[78%]"
            opacity={0.18}
          />

          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_38%,rgba(91,159,210,0.16),transparent_35%),linear-gradient(90deg,rgba(2,8,23,0.96)_0%,rgba(3,17,39,0.88)_45%,rgba(3,17,39,0.38)_100%)]" />

          <div className="relative z-10 flex min-h-[285px] flex-col justify-between p-5 sm:min-h-[390px] sm:p-7 lg:p-9">
            <div className="flex items-start justify-between gap-4">
              <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-primary backdrop-blur-md">
                {edition.status === "completed" ? "Completed edition" : "Current edition"}
              </span>
              <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[9px] font-semibold text-white/65 backdrop-blur-md">
                {editionShows.length} public shows
              </span>
            </div>

            <div className="max-w-[760px]">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                Edition {edition.edition_number ?? "—"}
              </p>
              <h2 className="mt-2 font-display text-4xl font-black leading-[0.92] tracking-[-0.055em] text-white sm:text-6xl">
                {editionLabel(edition)}
              </h2>
              <p className="mt-3 max-w-xl text-base font-medium text-white/68 sm:text-lg">{edition.name}</p>

              <HostSummary hosts={hosts} prominent />

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
  const { edition, editionShows, winner, winnerResult, hosts } = card;
  const backgroundFlag = winner?.flag_image ?? hosts[0]?.country?.flag_image;

  return (
    <Link
      to="/editions/$slug"
      params={{ slug: edition.slug }}
      className="group relative min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(150deg,rgba(12,31,58,.96),rgba(4,17,37,.98))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 sm:p-5"
    >
      <BackgroundFlag
        image={backgroundFlag}
        className="-bottom-20 -right-16 h-56 w-56 sm:-bottom-24 sm:-right-20 sm:h-64 sm:w-64"
        opacity={0.075}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_15%,rgba(96,190,230,.08),transparent_34%)]" />

      <div className="relative z-10 min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.19em] text-primary">
              Edition {edition.edition_number ?? "—"}
            </p>
            <h3 className="mt-1 truncate text-[1.35rem] font-bold leading-tight tracking-[-0.035em] text-foreground sm:text-[1.5rem]">
              {editionLabel(edition)}
            </h3>
            {edition.name && edition.name !== editionLabel(edition) && (
              <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">{edition.name}</p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-base text-primary transition-transform group-hover:translate-x-0.5">
              →
            </span>
            <p className="text-[9px] font-medium text-muted-foreground">
              {editionShows.length} show{editionShows.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-border/50 pt-4">
          <ArchiveInfoBlock label={hosts.length > 1 ? "Hosts" : "Host"}>
            {hosts.length ? (
              <div className="space-y-2">
                {hosts.map((host) => (
                  <div key={host.key} className="flex min-w-0 items-center gap-2">
                    {host.country && (
                      <FlagChip
                        code={host.country.short_code}
                        color={host.country.accent_color}
                        image={host.country.flag_image}
                        size="sm"
                      />
                    )}
                    <p className="min-w-0 break-words text-[11px] font-semibold leading-tight text-foreground/92 sm:text-xs">
                      {[host.city, host.country?.name].filter(Boolean).join(", ") || "TBC"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">TBC</p>
            )}
          </ArchiveInfoBlock>

          <ArchiveInfoBlock label="Winner">
            {winner ? (
              <div className="flex min-w-0 items-center gap-2">
                <FlagChip
                  code={winner.short_code}
                  color={winner.accent_color}
                  image={winner.flag_image}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold leading-tight text-foreground/92 sm:text-xs">
                    {winner.name}
                  </p>
                  {winnerResult && (
                    <p className="numeric mt-0.5 text-[9px] text-muted-foreground">
                      {winnerResult.total_points} pts
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[10px] leading-snug text-muted-foreground">Not public yet</p>
            )}
          </ArchiveInfoBlock>
        </div>
      </div>
    </Link>
  );
}

function ArchiveInfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.055] bg-black/10 p-2.5 sm:p-3">
      <p className="mb-2 text-[8px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function HostSummary({ hosts, prominent = false }: { hosts: HostLocation[]; prominent?: boolean }) {
  if (!hosts.length) {
    return (
      <div className={prominent ? "mt-5" : ""}>
        <p className={prominent ? "text-xs font-semibold text-white/50" : "text-[10px] text-muted-foreground"}>
          Host location TBC
        </p>
      </div>
    );
  }

  return (
    <div className={prominent ? "mt-5 flex flex-wrap gap-2" : "space-y-1.5"}>
      {hosts.map((host, index) => (
        <div
          key={host.key}
          className={
            prominent
              ? "flex min-w-0 items-center gap-2 rounded-xl border border-white/12 bg-black/20 px-3 py-2 backdrop-blur-md"
              : "flex min-w-0 items-center gap-2"
          }
        >
          {host.country && (
            <FlagChip
              code={host.country.short_code}
              color={host.country.accent_color}
              image={host.country.flag_image}
              size="sm"
            />
          )}
          <div className="min-w-0">
            <p
              className={
                prominent
                  ? "text-[8px] font-bold uppercase tracking-[0.14em] text-white/45"
                  : "text-[8px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
              }
            >
              {hosts.length > 1 ? `Host ${index + 1}` : "Host"}
            </p>
            <p
              className={
                prominent
                  ? "break-words text-xs font-semibold text-white"
                  : "break-words text-[11px] font-semibold leading-tight"
              }
            >
              {[host.city, host.country?.name].filter(Boolean).join(", ") || "Host location TBC"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
