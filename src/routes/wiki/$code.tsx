import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ListTree, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { BackgroundFlag } from "@/components/BackgroundFlag";
import { CountryPersonalityStyles } from "@/components/CountryPersonalityStyles";
import { EntryListenLinks } from "@/components/EntryListenLinks";
import { FlagChip } from "@/components/FlagChip";
import { CountryCustomSections } from "@/components/country/CountryCustomSections";
import { CountryNationalFinals } from "@/components/country/CountryNationalFinals";
import { computeCanonicalCountryStats } from "@/lib/canonical-country-stats";
import { useCountryWorldProfile } from "@/lib/country-account";
import { buildCountryAutoSection, type CountryPageSection } from "@/lib/country-page-builder";
import { buildCountryCharacter, buildCountryFunFacts } from "@/lib/country-wiki";
import type { Country, Edition, Participant } from "@/lib/data";
import {
  editionLabel,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useCountries,
  useEditions,
} from "@/lib/data-live";
import { canonicalEditionEntries } from "@/lib/entry-utils";
import { computeCountryForm } from "@/lib/form";
import { buildPublicCountryArchive } from "@/lib/public-country-archive";
import {
  qualificationCountsAsQualified,
  qualificationLabel,
  resolveCountryEditionQualification,
  type QualificationStatus,
} from "@/lib/qualification";

export const Route = createFileRoute("/wiki/$code")({
  head: ({ params }) => ({
    meta: [{ title: `${params.code} — Terra Solaris Wiki` }],
  }),
  component: CountryWikiRoute,
});

const ARTICLE_SECTIONS = [
  ["overview", "Introduction"],
  ["culture", "Country and culture"],
  ["contest", "Solaris Song Contest"],
  ["national-finals", "National finals"],
  ["character", "Solaris character"],
  ["facts", "Fun facts"],
] as const;

function sectionSystemSlot(section: CountryPageSection) {
  const json = section.content_json;
  return json && typeof json === "object" ? String(json.systemSlot ?? "") : "";
}

function systemFactValues(section?: CountryPageSection | null) {
  if (!section?.content_json || typeof section.content_json !== "object") return [] as string[];
  const rows = Array.isArray(section.content_json.customFacts)
    ? section.content_json.customFacts
    : [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => String(row.value ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function qualificationBadgeClass(status: QualificationStatus) {
  if (status === "wildcard") return "bg-amber-300/12 text-amber-200";
  if (qualificationCountsAsQualified(status)) return "bg-primary/10 text-primary";
  return "bg-surface text-muted-foreground";
}

function CountryWikiRoute() {
  return (
    <>
      <CountryPersonalityStyles />
      <CountryWikiPage />
    </>
  );
}

function CountryWikiPage() {
  const { code } = Route.useParams();
  const countriesQuery = useCountries();
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const participantsQuery = useAllParticipants();
  const resultsQuery = useAllResults();
  const juryQuery = useAllJuryVotes();
  const televoteQuery = useAllTelevotes();
  const { data: countries } = countriesQuery;
  const { data: editions } = editionsQuery;
  const { data: shows } = showsQuery;
  const { data: participants } = participantsQuery;
  const { data: results } = resultsQuery;
  const { data: jury } = juryQuery;
  const { data: televote } = televoteQuery;

  const country = (countries ?? []).find(
    (item) => item.short_code.toUpperCase() === code.toUpperCase(),
  );
  const world = useCountryWorldProfile(country?.id);

  // Wiki is public UI even when an organizer is authenticated. Always derive
  // contest history from the publication-safe archive so drafts never leak.
  const opts = useMemo(
    () =>
      buildPublicCountryArchive({
        editions: editions ?? [],
        shows: shows ?? [],
        participants: participants ?? [],
        results: results ?? [],
        jury: jury ?? [],
        televote: televote ?? [],
      }),
    [editions, shows, participants, results, jury, televote],
  );

  const stats = useMemo(
    () => (country ? computeCanonicalCountryStats(country.id, opts) : null),
    [country, opts],
  );
  const form = useMemo(
    () => (country ? computeCountryForm(country.id, opts) : null),
    [country, opts],
  );

  const archiveQueries = [countriesQuery, editionsQuery, showsQuery, participantsQuery, resultsQuery, juryQuery, televoteQuery, world];
  if (archiveIsLoading(...archiveQueries)) return <AppShell><ArchiveDataLoading label="Loading wiki article…" /></AppShell>;
  if (archiveHasError(...archiveQueries)) return <AppShell><ArchiveDataError /></AppShell>;

  if (!country) {
    return (
      <AppShell>
        <div className="glass p-6">
          <h1 className="font-display text-2xl font-bold">Country not found</h1>
          <Link to="/countries" className="mt-4 inline-block text-sm text-primary">← Countries</Link>
        </div>
      </AppShell>
    );
  }

  const profile = world.data?.profile;
  const sections = (world.data?.sections ?? []) as CountryPageSection[];
  const media = world.data?.media ?? [];
  const funFactsOverride = sections.find((section) => sectionSystemSlot(section) === "fun-facts") ?? null;
  const contentSections = sections.filter((section) => sectionSystemSlot(section) !== "fun-facts");
  const character = buildCountryCharacter({
    country,
    profile,
    stats,
    form,
    sections: contentSections,
  });
  const generatedFacts = buildCountryFunFacts({
    country,
    profile,
    stats,
    form,
    sections: contentSections,
    mediaCount: media.length,
  });
  const editedFacts = systemFactValues(funFactsOverride);
  const facts = editedFacts.length ? editedFacts : generatedFacts;

  const editionMap = new Map(opts.editions.map((edition) => [edition.id, edition]));
  const showMap = new Map(opts.shows.map((show) => [show.id, show]));
  const countryParticipants = opts.participants.filter((entry) => entry.country_id === country.id);
  // Wiki is archival: show every published canonical entry, not only the newest handful.
  const latestEntries = canonicalEditionEntries(countryParticipants).sort(
    (a, b) =>
      (editionMap.get(b.edition_id)?.edition_number ?? -1) -
      (editionMap.get(a.edition_id)?.edition_number ?? -1),
  );

  const qualificationFor = (editionId: string) =>
    resolveCountryEditionQualification(country.id, editionId, opts);

  const allTimeScore = opts.results
    .filter((result) => {
      if (result.country_id !== country.id) return false;
      const kind = showMap.get(result.show_id ?? "")?.kind;
      return kind === "grand-final" || kind === "final";
    })
    .reduce((sum, result) => sum + result.total_points, 0);

  const infoRows = [
    ["Capital", profile?.capital],
    ["Government", profile?.government_type],
    ["Leader", [profile?.leader_title, profile?.leader_name].filter(Boolean).join(" ") || null],
    ["Demonym", profile?.demonym],
    ["Official languages", profile?.official_languages],
    ["Currency", profile?.currency],
    ["Population", profile?.population],
    ["Established", profile?.established],
    ["Region", country.region],
  ] as const;

  // Keep Solaris-written default copy. An HOD-written summary or country
  // description takes priority, so the default is editable rather than removed.
  const generatedOverview = buildCountryAutoSection("overview", country, profile);
  const authoredOverview = profile?.summary?.trim() || country.description?.trim() || generatedOverview;
  const sortedCountries = [...(countries ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const countryIndex = sortedCountries.findIndex((item) => item.id === country.id);
  const previousCountry = countryIndex > 0 ? sortedCountries[countryIndex - 1] : null;
  const nextCountry = countryIndex >= 0 && countryIndex < sortedCountries.length - 1
    ? sortedCountries[countryIndex + 1]
    : null;
  const recentEntries = latestEntries.slice(0, 5);
  const earlierEntries = latestEntries.slice(5);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1160px]">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Link to="/countries" className="hover:text-foreground">Countries</Link>
          <span>/</span>
          <Link to="/countries/$code" params={{ code: country.short_code }} className="hover:text-foreground">{country.name}</Link>
          <span>/</span>
          <span className="text-foreground">Wiki</span>
        </div>

        <section className="wiki-public-hero glass relative mb-3 overflow-hidden px-4 py-4 sm:mb-5 sm:px-7 sm:py-8">
          <BackgroundFlag
            image={country.flag_image}
            className="country-hero-background-flag -right-20 -top-24 h-80 w-80"
            opacity={0.1}
          />
          <div aria-hidden="true" className="country-personality-signature" />
          <div className="relative z-10 max-w-none">
            {country.flag_image && (
              <div
                aria-hidden="true"
                className="country-glass-panel-flag"
                style={{ backgroundImage: `url(${JSON.stringify(country.flag_image)})` }}
              />
            )}
            <div className="country-hero-identity flex min-w-0 items-center gap-3 sm:gap-4">
              <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="md" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Terra Solaris Wiki</p>
                <h1 className="country-hero-title mt-1.5 break-words font-display text-3xl font-bold sm:mt-2 sm:text-5xl">{country.name}</h1>
                {country.native_name && country.native_name !== country.name && <p className="mt-1 text-sm text-muted-foreground">{country.native_name}</p>}
              </div>
            </div>
          </div>
        </section>

        <ArticleContents mobile />

        <div className="mb-4 lg:hidden">
          <WikiInfobox country={country} profile={profile} infoRows={infoRows} mobile />
        </div>

        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start xl:grid-cols-[210px_minmax(0,1fr)_300px]">
          <ArticleContents />
          <article className="min-w-0 space-y-6">
            <section id="overview" className="wiki-article-lead scroll-mt-24 border-b border-border/60 px-1 pb-6">
              <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">{authoredOverview}</p>
              {profile?.motto && <blockquote className="mt-4 border-l-2 border-primary/50 pl-4 font-display italic text-foreground">“{profile.motto}”</blockquote>}
            </section>

            <WikiSection id="culture" title="Country, culture and media">
              <CountryCustomSections
                country={country}
                profile={profile}
                sections={contentSections}
                media={media}
                surface="wiki"
              />
            </WikiSection>

            <WikiSection id="contest" title="Solaris Song Contest">
              {stats && stats.participations > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <MiniStat label="Participations" value={stats.participations} />
                    <MiniStat label="Wins" value={stats.wins} />
                    <MiniStat label="Podiums" value={stats.podiums} />
                    <MiniStat label="Best score" value={stats.highestScore ?? "—"} />
                    <MiniStat label="All-time score" value={allTimeScore} />
                    <MiniStat label="All-time position" value={stats.avgCombinedPlacement != null ? stats.avgCombinedPlacement.toFixed(1) : "—"} />
                  </div>
                  {latestEntries.length > 0 && (
                    <div className="mt-5 space-y-2">
                      <div className="overflow-hidden rounded-xl border border-border/70">
                        {recentEntries.map((entry) => (
                          <WikiEntryRow
                            key={entry.edition_id}
                            entry={entry}
                            edition={editionMap.get(entry.edition_id)}
                            qualification={qualificationFor(entry.edition_id)}
                          />
                        ))}
                      </div>

                      {earlierEntries.length > 0 && (
                        <details className="group overflow-hidden rounded-xl border border-border/70 bg-surface/25">
                          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                            <span>Earlier entries</span>
                            <span className="text-primary">{earlierEntries.length} <span className="group-open:hidden">↓</span><span className="hidden group-open:inline">↑</span></span>
                          </summary>
                          <div className="border-t border-border/60">
                            {earlierEntries.map((entry) => (
                              <WikiEntryRow
                                key={entry.edition_id}
                                entry={entry}
                                edition={editionMap.get(entry.edition_id)}
                                qualification={qualificationFor(entry.edition_id)}
                              />
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </>
              ) : <p>{country.name} has no published Solaris Song Contest history yet.</p>}
            </WikiSection>

            <WikiSection id="national-finals" title="National finals">
              <CountryNationalFinals country={country} />
            </WikiSection>

            <WikiSection id="character" title="Solaris character read">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Solaris character read</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">{character.title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{character.summary}</p>
              {character.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {character.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-border bg-surface px-3 py-1.5 text-[10px] font-semibold">{tag}</span>
                  ))}
                </div>
              )}
            </WikiSection>

            {facts.length > 0 && (
              <WikiSection id="facts" title="Fun facts">
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">From the national record</p>
                  <h2 className="mt-1 font-display text-xl font-semibold">Fun facts</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {editedFacts.length
                      ? "These facts use the HOD's edited wording."
                      : "Solaris automatically highlights notable facts from the country's national profile and SSC history."}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {facts.map((fact, index) => (
                    <div key={`${index}-${fact}`} className="rounded-xl bg-surface p-4">
                      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">Fact {String(index + 1).padStart(2, "0")}</p>
                      <p className="mt-2 text-sm leading-6">{fact}</p>
                    </div>
                  ))}
                </div>
              </WikiSection>
            )}
          </article>

          <aside className="hidden min-w-0 lg:sticky lg:top-24 lg:block">
            <WikiInfobox country={country} profile={profile} infoRows={infoRows} />
          </aside>
        </div>

        <nav aria-label="Adjacent Wiki articles" className="mt-5 grid grid-cols-2 gap-2">
          {previousCountry ? (
            <Link to="/wiki/$code" params={{ code: previousCountry.short_code }} className="min-w-0 rounded-2xl border border-border/65 bg-surface/35 p-3 text-left transition hover:bg-surface">
              <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">← Previous</span>
              <span className="mt-1 block truncate text-sm font-semibold">{previousCountry.name}</span>
            </Link>
          ) : <span />}
          {nextCountry ? (
            <Link to="/wiki/$code" params={{ code: nextCountry.short_code }} className="min-w-0 rounded-2xl border border-border/65 bg-surface/35 p-3 text-right transition hover:bg-surface">
              <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Next →</span>
              <span className="mt-1 block truncate text-sm font-semibold">{nextCountry.name}</span>
            </Link>
          ) : <span />}
        </nav>
      </div>
    </AppShell>
  );
}

function openArticleSection(id: string) {
  const section = document.getElementById(id);
  if (section instanceof HTMLDetailsElement) section.open = true;
  window.requestAnimationFrame(() => section?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function ArticleContents({ mobile = false }: { mobile?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) openArticleSection(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (mobile) {
    return (
      <>
        <div className="wiki-mobile-contents sticky top-[4.25rem] z-30 mb-3 xl:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/92 px-4 text-sm font-semibold shadow-lg backdrop-blur-xl"
          >
            <span className="inline-flex items-center gap-2"><ListTree className="size-4 text-primary" /> Article sections</span>
            <span className="text-xs text-muted-foreground">{ARTICLE_SECTIONS.length} sections</span>
          </button>
        </div>

        {open && (
          <div className="fixed inset-0 z-[120] xl:hidden">
            <button type="button" aria-label="Close article sections" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-[1.75rem] border-t border-border bg-background p-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
              <div className="mb-2 flex items-center justify-between px-2 py-1">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">Terra Solaris Wiki</p>
                  <h2 className="mt-1 font-display text-xl font-bold">Article sections</h2>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-xl border border-border bg-surface" aria-label="Close article sections"><X className="size-4" /></button>
              </div>
              <nav aria-label="Article contents" className="grid gap-1">
                {ARTICLE_SECTIONS.map(([id, label], index) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      setOpen(false);
                      window.setTimeout(() => openArticleSection(id), 0);
                    }}
                    className="grid min-h-12 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-3 text-sm font-semibold text-foreground transition hover:bg-surface"
                  >
                    <span className="numeric text-xs text-primary">{String(index + 1).padStart(2, "0")}</span>
                    <span>{label}</span>
                    <span className="text-primary">→</span>
                  </a>
                ))}
              </nav>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <aside className="hidden min-w-0 xl:block">
      <nav aria-label="Article contents" className="sticky top-24 rounded-2xl border border-border/60 bg-surface/35 p-2">
        <p className="px-2 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Contents</p>
        {ARTICLE_SECTIONS.map(([id, label], index) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(event) => {
              event.preventDefault();
              openArticleSection(id);
            }}
            className="grid min-h-10 grid-cols-[22px_minmax(0,1fr)] items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-muted-foreground transition hover:bg-surface hover:text-foreground"
          >
            <span className="numeric text-[10px] text-primary">{index + 1}</span>
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}

type WikiProfile = {
  motto?: string | null;
};

function WikiInfobox({
  country,
  profile,
  infoRows,
  mobile = false,
}: {
  country: Country;
  profile?: WikiProfile | null;
  infoRows: ReadonlyArray<readonly [string, string | number | null | undefined]>;
  mobile?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-center gap-3 border-b border-border/60 p-3 lg:block lg:p-4 lg:text-center">
        <div className="flex shrink-0 justify-center"><FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="lg" /></div>
        <div className="min-w-0 lg:mt-3">
          <p className="truncate font-display text-lg font-bold lg:text-xl">{country.name}</p>
          {country.native_name && country.native_name !== country.name && <p className="mt-0.5 truncate text-xs text-muted-foreground">{country.native_name}</p>}
          {profile?.motto && <p className="mt-1 hidden text-[11px] italic text-muted-foreground sm:block lg:mt-2">“{profile.motto}”</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border/45 lg:block lg:divide-y lg:divide-border/50 lg:bg-transparent lg:px-4">
        {infoRows.map(([label, value]) => value ? (
          <div key={label} className="min-w-0 bg-surface/45 px-3 py-2.5 lg:grid lg:grid-cols-[92px_minmax(0,1fr)] lg:gap-3 lg:bg-transparent lg:px-0 lg:py-3 lg:text-xs">
            <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground lg:text-xs lg:normal-case lg:tracking-normal">{label}</span>
            <span className="mt-1 block break-words text-xs text-foreground lg:mt-0 lg:text-right">{value}</span>
          </div>
        ) : null)}
      </div>
      <div className="border-t border-border/60 p-3 lg:p-4"><Link to="/countries/$code" params={{ code: country.short_code }} className="flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold">Open country dashboard →</Link></div>
    </>
  );

  if (mobile) {
    return (
      <details className="country-personality-card group overflow-hidden rounded-2xl border border-border/60 bg-surface/25">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
          <span>Quick facts about {country.name}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-border/60">{content}</div>
      </details>
    );
  }

  return (
    <div className="country-personality-card glass overflow-hidden">
      {content}
    </div>
  );
}

function WikiEntryRow({
  entry,
  edition,
  qualification,
}: {
  entry: Participant;
  edition?: Edition;
  qualification: QualificationStatus;
}) {
  const revealed = Boolean(entry.artist?.trim() || entry.song?.trim());
  const label = qualificationLabel(qualification);

  return (
    <div className="border-b border-border/50 px-3 py-3 last:border-b-0">
      <div className="grid min-w-0 grid-cols-[1fr_auto] gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{revealed ? `${entry.artist || "Artist TBC"} · ${entry.song || "Song TBC"}` : "Entry not revealed yet"}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{edition ? editionLabel(edition) : "Edition"}</p>
        </div>
        <div className="flex items-center gap-2">
          {label && <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${qualificationBadgeClass(qualification)}`}>{label}</span>}
          {edition ? <Link to="/editions/$slug" params={{ slug: edition.slug }} className="self-center text-[10px] font-semibold text-primary">View →</Link> : null}
        </div>
      </div>
      {revealed ? <EntryListenLinks entry={entry} compact className="mt-2" /> : null}
    </div>
  );
}

function WikiSection({ id, title, children, defaultOpen = false }: { id: string; title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details id={id} open={defaultOpen} className="wiki-article-section country-personality-card group min-w-0 scroll-mt-24 overflow-hidden border-y border-border/60 bg-surface/10 sm:rounded-2xl sm:border">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 font-display text-xl font-semibold marker:hidden sm:px-5 sm:text-2xl">
        <span>{title}</span>
        <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-border/60 p-4 text-sm leading-7 text-muted-foreground sm:p-5">{children}</div>
    </details>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return <div className="country-personality-inset rounded-xl bg-surface p-3"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-xl font-semibold text-foreground">{value}</p></div>;
}
