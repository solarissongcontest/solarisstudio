import { Link } from "@tanstack/react-router";
import { ChevronDown, Info, ListTree, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { ArchiveDataError } from "@/components/ArchiveDataState";
import { BackgroundFlag } from "@/components/BackgroundFlag";
import { EntryListenLinks } from "@/components/EntryListenLinks";
import { FlagChip } from "@/components/FlagChip";
import {
  CountryCustomSectionContent,
  FormerCountryIdentities,
  buildCountryWikiCustomSections,
  groupFormerCountryIdentities,
} from "@/components/country/CountryCustomSections";
import { CountryNationalFinalsContent } from "@/components/country/CountryNationalFinals";
import { computeCanonicalCountryStats } from "@/lib/canonical-country-stats";
import { useCountryWorldProfile, type CountryMedia } from "@/lib/country-account";
import { buildCountryAutoSection, type CountryPageSection } from "@/lib/country-page-builder";
import { usePublicCountryIdentityHistory } from "@/lib/country-history";
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
import { useCountryNationalFinals } from "@/lib/national-finals";
import { buildPublicCountryArchive } from "@/lib/public-country-archive";
import {
  qualificationCountsAsQualified,
  qualificationLabel,
  resolveCountryEditionQualification,
  type QualificationStatus,
} from "@/lib/qualification";

type PublicArchive = ReturnType<typeof buildPublicCountryArchive>;
type CountryStats = ReturnType<typeof computeCanonicalCountryStats>;
type CountryForm = ReturnType<typeof computeCountryForm>;

type WikiNavItem = {
  id: string;
  label: string;
};

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

export function CountryWikiExperience({ code }: { code: string }) {
  const countriesQuery = useCountries();
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const participantsQuery = useAllParticipants();
  const resultsQuery = useAllResults();
  const juryQuery = useAllJuryVotes();
  const televoteQuery = useAllTelevotes();
  const country = (countriesQuery.data ?? []).find(
    (item) => item.short_code.toUpperCase() === code.toUpperCase(),
  );

  const opts = useMemo(
    () =>
      buildPublicCountryArchive({
        editions: editionsQuery.data ?? [],
        shows: showsQuery.data ?? [],
        participants: participantsQuery.data ?? [],
        results: resultsQuery.data ?? [],
        jury: juryQuery.data ?? [],
        televote: televoteQuery.data ?? [],
      }),
    [
      editionsQuery.data,
      showsQuery.data,
      participantsQuery.data,
      resultsQuery.data,
      juryQuery.data,
      televoteQuery.data,
    ],
  );

  const stats = useMemo(
    () => (country ? computeCanonicalCountryStats(country.id, opts) : null),
    [country, opts],
  );
  const form = useMemo(
    () => (country ? computeCountryForm(country.id, opts) : null),
    [country, opts],
  );
  const archivePending = [
    editionsQuery,
    showsQuery,
    participantsQuery,
    resultsQuery,
    juryQuery,
    televoteQuery,
  ].some((query) => query.isLoading);
  const archivePartial = [
    editionsQuery,
    showsQuery,
    participantsQuery,
    resultsQuery,
    juryQuery,
    televoteQuery,
  ].some((query) => query.isError);

  if (countriesQuery.isLoading) return <WikiPageSkeleton />;
  if (countriesQuery.isError) return <AppShell><ArchiveDataError /></AppShell>;

  if (!country) {
    return (
      <AppShell>
        <div className="glass p-6">
          <h1 className="font-display text-2xl font-bold">Country not found</h1>
          <Link to="/wiki" className="mt-4 inline-block text-sm text-primary">← Wiki library</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <CountryWikiArticle
      country={country}
      countries={countriesQuery.data ?? []}
      opts={opts}
      stats={stats}
      form={form}
      archivePending={archivePending}
      archivePartial={archivePartial}
    />
  );
}

function CountryWikiArticle({
  country,
  countries,
  opts,
  stats,
  form,
  archivePending,
  archivePartial,
}: {
  country: Country;
  countries: Country[];
  opts: PublicArchive;
  stats: CountryStats | null;
  form: CountryForm | null;
  archivePending: boolean;
  archivePartial: boolean;
}) {
  const world = useCountryWorldProfile(country.id);
  const identityHistory = usePublicCountryIdentityHistory(country.id);
  const nationalFinals = useCountryNationalFinals(country.id);
  const profile = world.data?.profile;
  const sections = useMemo(
    () => (world.data?.sections ?? []) as CountryPageSection[],
    [world.data?.sections],
  );
  const media = useMemo(
    () => [...(world.data?.media ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [world.data?.media],
  );
  const { funFactsOverride, contentSections } = useMemo(() => ({
    funFactsOverride: sections.find((section) => sectionSystemSlot(section) === "fun-facts") ?? null,
    contentSections: sections.filter((section) => sectionSystemSlot(section) !== "fun-facts"),
  }), [sections]);
  const customSections = useMemo(
    () => buildCountryWikiCustomSections(contentSections),
    [contentSections],
  );
  const formerIdentities = useMemo(
    () => groupFormerCountryIdentities(identityHistory.data ?? [], country),
    [country, identityHistory.data],
  );
  const character = buildCountryCharacter({ country, profile, stats, form, sections: contentSections });
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
  const generatedOverview = buildCountryAutoSection("overview", country, profile);
  const authoredOverview = profile?.summary?.trim() || country.description?.trim() || generatedOverview;

  const editionMap = new Map(opts.editions.map((edition) => [edition.id, edition]));
  const showMap = new Map(opts.shows.map((show) => [show.id, show]));
  // Wiki is archival: show every published canonical entry, with older rows
  // progressively disclosed instead of deleting them from the article.
  const latestEntries = canonicalEditionEntries(
    opts.participants.filter((entry) => entry.country_id === country.id),
  ).sort(
    (a, b) =>
      (editionMap.get(b.edition_id)?.edition_number ?? -1) -
      (editionMap.get(a.edition_id)?.edition_number ?? -1),
  );
  const timelineMap = new Map((stats?.timeline ?? []).map((point) => [point.editionId, point]));
  const allTimeScore = opts.results
    .filter((result) => {
      if (result.country_id !== country.id) return false;
      const kind = showMap.get(result.show_id ?? "")?.kind;
      return kind === "grand-final" || kind === "final";
    })
    .reduce((sum, result) => sum + result.total_points, 0);

  const articleSections = useMemo<WikiNavItem[]>(
    () => [
      { id: "introduction", label: "Introduction" },
      ...customSections.map((item) => ({ id: item.id, label: item.title })),
      ...(formerIdentities.length ? [{ id: "former-identities", label: "Former names and flags" }] : []),
      ...(media.length ? [{ id: "media-gallery", label: "Media gallery" }] : []),
      { id: "solaris-song-contest", label: "Solaris Song Contest" },
      ...((nationalFinals.isLoading || nationalFinals.isError || nationalFinals.data?.length)
        ? [{ id: "national-finals", label: "National finals" }]
        : []),
      { id: "solaris-character", label: "Solaris character" },
      ...(facts.length ? [{ id: "fun-facts", label: "Fun facts" }] : []),
    ],
    [customSections, formerIdentities.length, media.length, nationalFinals.isLoading, nationalFinals.isError, nationalFinals.data?.length, facts.length],
  );
  const { activeId, navigate } = useWikiArticleNavigation(articleSections);

  const sortedCountries = [...countries].sort((a, b) => a.name.localeCompare(b.name));
  const countryIndex = sortedCountries.findIndex((item) => item.id === country.id);
  const previousCountry = countryIndex > 0 ? sortedCountries[countryIndex - 1] : null;
  const nextCountry = countryIndex >= 0 && countryIndex < sortedCountries.length - 1
    ? sortedCountries[countryIndex + 1]
    : null;
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

  const qualificationFor = (editionId: string) =>
    resolveCountryEditionQualification(country.id, editionId, opts);
  const recentEntries = latestEntries.slice(0, 6);
  const earlierEntries = latestEntries.slice(6);

  return (
    <AppShell>
      <div className="wiki-canvas min-w-0">
        <nav className="wiki-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/wiki">Wiki</Link><span>/</span>
          <span aria-current="page">{country.name}</span>
        </nav>

        <CountryWikiHeader country={country} />

        <WikiMobileToolbar
          country={country}
          profile={profile}
          infoRows={infoRows}
          sections={articleSections}
          activeId={activeId}
          onNavigate={navigate}
        />

        <div className="wiki-medium-contents hidden lg:block xl:hidden">
          <WikiCompactContents sections={articleSections} activeId={activeId} onNavigate={navigate} />
        </div>

        <div className="wiki-reading-grid">
          <aside className="wiki-desktop-contents hidden xl:block">
            <WikiContentsNav sections={articleSections} activeId={activeId} onNavigate={navigate} />
          </aside>

          <article className="wiki-article-surface min-w-0" aria-label={`${country.name} Wiki article`}>
            <section id="introduction" className="wiki-introduction wiki-prose-section" tabIndex={-1}>
              <p className="wiki-section-kicker">Terra Solaris Wiki</p>
              <h2>Introduction</h2>
              <div className="wiki-heading-rule" />
              <p className="wiki-prose whitespace-pre-wrap">{authoredOverview}</p>
              {profile?.motto && <blockquote>“{profile.motto}”</blockquote>}
              {world.isError && (
                <p className="wiki-inline-notice">Some optional country information is temporarily unavailable.</p>
              )}
            </section>

            {customSections.map((item) => (
              <WikiArticleSection
                key={item.id}
                id={item.id}
                title={item.title}
                desktopOpen
              >
                <CountryCustomSectionContent
                  country={country}
                  profile={profile}
                  section={item.section}
                  surface="wiki"
                  article
                />
              </WikiArticleSection>
            ))}

            {formerIdentities.length > 0 && (
              <WikiArticleSection id="former-identities" title="Former names and flags" desktopOpen>
                <FormerCountryIdentities country={country} identities={formerIdentities} article />
              </WikiArticleSection>
            )}

            {media.length > 0 && (
              <WikiArticleSection id="media-gallery" title="Media gallery" desktopOpen>
                <WikiMediaGallery country={country} media={media} />
              </WikiArticleSection>
            )}

            <WikiArticleSection id="solaris-song-contest" title="Solaris Song Contest" desktopOpen>
              {archivePending ? (
                <p className="text-sm text-muted-foreground">Loading the published contest record…</p>
              ) : stats && stats.participations > 0 ? (
                <>
                  <p className="wiki-prose">
                    {country.name} has participated in {stats.participations} Solaris Song Contest edition{stats.participations === 1 ? "" : "s"}
                    {stats.wins > 0 ? ` and has won ${stats.wins} time${stats.wins === 1 ? "" : "s"}.` : "."}
                  </p>
                  <dl className="wiki-record-strip">
                    <WikiRecord label="Participations" value={stats.participations} />
                    <WikiRecord label="Wins" value={stats.wins} />
                    <WikiRecord label="Podiums" value={stats.podiums} />
                    <WikiRecord label="Best score" value={stats.highestScore ?? "—"} />
                    <WikiRecord label="All-time score" value={allTimeScore} />
                    <WikiRecord label="Average place" value={stats.avgCombinedPlacement != null ? stats.avgCombinedPlacement.toFixed(1) : "—"} />
                  </dl>
                  {archivePartial && (
                    <p className="wiki-inline-notice">Some archive sources could not be loaded, so this record may be incomplete.</p>
                  )}
                  {latestEntries.length > 0 && (
                    <div className="mt-7">
                      <h3 className="wiki-subheading">Participation history</h3>
                      <div className="wiki-entry-table" role="table" aria-label={`${country.name} participation history`}>
                        {recentEntries.map((entry) => (
                          <WikiEntryRow
                            key={entry.edition_id}
                            entry={entry}
                            edition={editionMap.get(entry.edition_id)}
                            qualification={qualificationFor(entry.edition_id)}
                            rank={timelineMap.get(entry.edition_id)?.rank ?? null}
                            points={timelineMap.get(entry.edition_id)?.total ?? null}
                          />
                        ))}
                      </div>
                      {earlierEntries.length > 0 && (
                        <details className="wiki-subarchive group">
                          <summary>
                            <span>Earlier entries</span>
                            <span>{earlierEntries.length} <ChevronDown aria-hidden="true" /></span>
                          </summary>
                          <div className="wiki-entry-table border-t border-border/55">
                            {earlierEntries.map((entry) => (
                              <WikiEntryRow
                                key={entry.edition_id}
                                entry={entry}
                                edition={editionMap.get(entry.edition_id)}
                                qualification={qualificationFor(entry.edition_id)}
                                rank={timelineMap.get(entry.edition_id)?.rank ?? null}
                                points={timelineMap.get(entry.edition_id)?.total ?? null}
                              />
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="wiki-prose">{country.name} has no published Solaris Song Contest history yet.</p>
              )}
            </WikiArticleSection>

            {(nationalFinals.isLoading || nationalFinals.isError || nationalFinals.data?.length) ? (
              <WikiArticleSection id="national-finals" title="National finals" desktopOpen>
                <CountryNationalFinalsContent
                  country={country}
                  finals={nationalFinals.data}
                  isLoading={nationalFinals.isLoading}
                  isError={nationalFinals.isError}
                  mode="wiki"
                />
              </WikiArticleSection>
            ) : null}

            <WikiArticleSection id="solaris-character" title="Solaris character" desktopOpen>
              <p className="wiki-section-kicker">Solaris character read</p>
              <h3 className="wiki-feature-title">{character.title}</h3>
              <p className="wiki-prose">{character.summary}</p>
              {character.tags.length > 0 && (
                <ul className="wiki-tag-list" aria-label="Country character tags">
                  {character.tags.map((tag) => <li key={tag}>{tag}</li>)}
                </ul>
              )}
            </WikiArticleSection>

            {facts.length > 0 && (
              <WikiArticleSection id="fun-facts" title="Fun facts" desktopOpen>
                <p className="wiki-prose">
                  {editedFacts.length
                    ? "These facts use the delegation's edited wording."
                    : `Notable details from ${country.name}'s national profile and published SSC history.`}
                </p>
                <ol className="wiki-facts-list">
                  {facts.map((fact, index) => (
                    <li key={`${index}-${fact}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{fact}</p></li>
                  ))}
                </ol>
              </WikiArticleSection>
            )}
          </article>

          <aside className="wiki-desktop-infobox hidden lg:block">
            <WikiInfobox country={country} profile={profile} infoRows={infoRows} />
          </aside>
        </div>

        <nav aria-label="Adjacent Wiki articles" className="wiki-adjacent-articles">
          {previousCountry ? (
            <Link to="/wiki/$code" params={{ code: previousCountry.short_code }}>
              <span>← Previous article</span><strong>{previousCountry.name}</strong>
            </Link>
          ) : <span />}
          {nextCountry ? (
            <Link to="/wiki/$code" params={{ code: nextCountry.short_code }}>
              <span>Next article →</span><strong>{nextCountry.name}</strong>
            </Link>
          ) : <span />}
        </nav>
      </div>
    </AppShell>
  );
}

function CountryWikiHeader({ country }: { country: Country }) {
  return (
    <header className="wiki-public-hero country-wiki-header glass relative overflow-hidden">
      <BackgroundFlag
        image={country.flag_image}
        className="country-hero-background-flag"
        opacity={0.13}
      />
      <div aria-hidden="true" className="country-personality-signature" />
      <div className="relative z-10 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        {country.flag_image && (
          <div
            aria-hidden="true"
            className="country-glass-panel-flag"
            style={{ backgroundImage: `url(${JSON.stringify(country.flag_image)})` }}
          />
        )}
        <div className="country-hero-identity flex min-w-0 items-center gap-4 sm:gap-5">
          <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="xl" />
          <div className="min-w-0">
            <p className="wiki-section-kicker">Terra Solaris Wiki</p>
            <h1 className="country-hero-title break-words font-display">{country.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[country.native_name && country.native_name !== country.name ? country.native_name : null, country.region].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <Link
          to="/countries/$code"
          params={{ code: country.short_code }}
          className="wiki-dashboard-link"
        >
          Open country dashboard →
        </Link>
      </div>
    </header>
  );
}

function useWikiArticleNavigation(sections: WikiNavItem[]) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "introduction");

  const navigate = useCallback((id: string, historyMode: "push" | "replace" = "push") => {
    const section = document.getElementById(id);
    if (!section) return;
    if (section instanceof HTMLDetailsElement) section.open = true;
    const url = `${window.location.pathname}${window.location.search}#${encodeURIComponent(id)}`;
    window.history[historyMode === "push" ? "pushState" : "replaceState"](null, "", url);
    section.classList.remove("wiki-target-highlight");
    window.requestAnimationFrame(() => {
      section.classList.add("wiki-target-highlight");
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      const focusTarget = section.querySelector<HTMLElement>("summary, h2");
      focusTarget?.focus({ preventScroll: true });
      window.setTimeout(() => section.classList.remove("wiki-target-highlight"), 1400);
    });
    setActiveId(id);
  }, []);

  useEffect(() => {
    const hashId = decodeURIComponent(window.location.hash.slice(1));
    if (hashId && sections.some((section) => section.id === hashId)) {
      window.setTimeout(() => navigate(hashId, "replace"), 80);
    }
    const handleHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (sections.some((section) => section.id === id)) navigate(id, "replace");
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [navigate, sections]);

  useEffect(() => {
    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => Boolean(element));
    if (!elements.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActiveId(visible.target.id);
      },
      { rootMargin: "-18% 0px -68% 0px", threshold: [0, 0.05, 0.2] },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [sections]);

  return { activeId, navigate };
}

function WikiContentsNav({
  sections,
  activeId,
  onNavigate,
}: {
  sections: WikiNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav aria-label="Article contents" className="wiki-contents-nav">
      <p>Contents</p>
      <ol>
        {sections.map((section, index) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={activeId === section.id ? "location" : undefined}
              onClick={(event) => { event.preventDefault(); onNavigate(section.id); }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {section.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function WikiCompactContents({
  sections,
  activeId,
  onNavigate,
}: {
  sections: WikiNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <details className="wiki-compact-contents group">
      <summary><span><ListTree aria-hidden="true" /> Article contents</span><strong>{sections.find((item) => item.id === activeId)?.label}</strong><ChevronDown aria-hidden="true" /></summary>
      <WikiContentsNav sections={sections} activeId={activeId} onNavigate={onNavigate} />
    </details>
  );
}

function WikiMobileToolbar({
  country,
  profile,
  infoRows,
  sections,
  activeId,
  onNavigate,
}: {
  country: Country;
  profile?: { motto?: string | null } | null;
  infoRows: ReadonlyArray<readonly [string, string | number | null | undefined]>;
  sections: WikiNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
}) {
  const [sheet, setSheet] = useState<"contents" | "facts" | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const openSheet = (next: "contents" | "facts", trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setSheet(next);
  };

  useEffect(() => {
    if (!sheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheet(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [sheet]);

  return (
    <div className="wiki-mobile-tools lg:hidden">
      <div className="wiki-mobile-toolbar">
        <button type="button" onClick={(event) => openSheet("contents", event.currentTarget)}><ListTree aria-hidden="true" />Contents</button>
        <button type="button" onClick={(event) => openSheet("facts", event.currentTarget)}><Info aria-hidden="true" />Quick facts</button>
      </div>
      {sheet && (
        <div className="wiki-sheet" role="dialog" aria-modal="true" aria-label={sheet === "contents" ? "Article contents" : `Quick facts about ${country.name}`}>
          <button className="wiki-sheet-backdrop" type="button" aria-label="Close" onClick={() => setSheet(null)} />
          <div className="wiki-sheet-panel">
            <header><div><p>Terra Solaris Wiki</p><h2>{sheet === "contents" ? "Article contents" : `Quick facts about ${country.name}`}</h2></div><button ref={closeRef} type="button" onClick={() => setSheet(null)} aria-label="Close"><X /></button></header>
            {sheet === "contents" ? (
              <WikiContentsNav sections={sections} activeId={activeId} onNavigate={(id) => { setSheet(null); window.setTimeout(() => onNavigate(id), 0); }} />
            ) : (
              <WikiInfobox country={country} profile={profile} infoRows={infoRows} mobile />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WikiInfobox({
  country,
  profile,
  infoRows,
  mobile = false,
}: {
  country: Country;
  profile?: { motto?: string | null } | null;
  infoRows: ReadonlyArray<readonly [string, string | number | null | undefined]>;
  mobile?: boolean;
}) {
  return (
    <section className={mobile ? "wiki-infobox wiki-infobox-mobile" : "wiki-infobox"} aria-label={`Quick facts about ${country.name}`}>
      <div className="wiki-infobox-identity">
        <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="lg" />
        <div><h2>{country.name}</h2>{country.native_name && country.native_name !== country.name && <p>{country.native_name}</p>}</div>
      </div>
      {profile?.motto && <blockquote>“{profile.motto}”</blockquote>}
      <dl>
        {infoRows.map(([label, value]) => value ? <div key={label}><dt>{label}</dt><dd>{value}</dd></div> : null)}
      </dl>
      <Link to="/countries/$code" params={{ code: country.short_code }}>Open country dashboard →</Link>
    </section>
  );
}

function WikiArticleSection({
  id,
  title,
  children,
  desktopOpen = false,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  desktopOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (desktopOpen && window.matchMedia("(min-width: 1024px)").matches) setOpen(true);
  }, [desktopOpen]);

  return (
    <details
      id={id}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="wiki-article-section scroll-mt-24"
    >
      <summary><h2 tabIndex={-1}>{title}</h2><ChevronDown aria-hidden="true" /></summary>
      <div className="wiki-article-section-body">{children}</div>
    </details>
  );
}

function WikiRecord({ label, value }: { label: string; value: string | number }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function WikiMediaGallery({ country, media }: { country: Country; media: CountryMedia[] }) {
  return (
    <div className="wiki-media-gallery">
      {media.map((item) => (
        <figure key={item.id}>
          <img
            src={item.public_url}
            alt={item.alt_text || item.caption || `${country.name} image`}
            loading="lazy"
            decoding="async"
          />
          {item.caption && <figcaption>{item.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

function WikiEntryRow({
  entry,
  edition,
  qualification,
  rank,
  points,
}: {
  entry: Participant;
  edition?: Edition;
  qualification: QualificationStatus;
  rank: number | null;
  points: number | null;
}) {
  const revealed = Boolean(entry.artist?.trim() || entry.song?.trim());
  const label = qualificationLabel(qualification);
  return (
    <div className="wiki-entry-row" role="row">
      <div role="cell"><strong>{edition ? editionLabel(edition) : "Edition"}</strong></div>
      <div className="min-w-0" role="cell"><strong>{revealed ? entry.artist || "Artist TBC" : "Entry not revealed"}</strong><span>{revealed ? entry.song || "Song TBC" : "Details will appear after release"}</span></div>
      <div role="cell">
        {rank != null ? <strong>#{rank}{points != null ? ` · ${points} pts` : ""}</strong> : label ? <span className={`wiki-result-badge ${qualificationBadgeClass(qualification)}`}>{label}</span> : <span>—</span>}
      </div>
      <div role="cell">{revealed ? <EntryListenLinks entry={entry} compact /> : null}</div>
    </div>
  );
}

function WikiPageSkeleton() {
  return (
    <AppShell>
      <div className="wiki-canvas wiki-loading" role="status" aria-label="Loading Wiki article">
        <div className="wiki-loading-header" />
        <div className="wiki-loading-grid"><div /><div><i /><i /><i /><i /></div><div /></div>
      </div>
    </AppShell>
  );
}
