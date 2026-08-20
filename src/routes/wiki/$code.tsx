import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AppShell } from "@/components/AppShell";
import { BackgroundFlag } from "@/components/BackgroundFlag";
import { EntryListenLinks } from "@/components/EntryListenLinks";
import { FlagChip } from "@/components/FlagChip";
import { CountryCustomSections } from "@/components/country/CountryCustomSections";
import { computeCanonicalCountryStats } from "@/lib/canonical-country-stats";
import { useCountryWorldProfile } from "@/lib/country-account";
import { buildCountryCharacter, buildCountryFunFacts } from "@/lib/country-wiki";
import {
  editionLabel,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useCountries,
  useEditions,
} from "@/lib/data";
import { canonicalEditionEntries } from "@/lib/entry-utils";
import { computeCountryForm } from "@/lib/form";

export const Route = createFileRoute("/wiki/$code")({
  head: ({ params }) => ({
    meta: [{ title: `${params.code} — Terra Solaris Wiki` }],
  }),
  component: CountryWikiPage,
});

function CountryWikiPage() {
  const { code } = Route.useParams();
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: jury } = useAllJuryVotes();
  const { data: televote } = useAllTelevotes();

  const country = (countries ?? []).find(
    (item) => item.short_code.toUpperCase() === code.toUpperCase(),
  );
  const world = useCountryWorldProfile(country?.id);

  const opts = useMemo(
    () => ({
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
  const sections = world.data?.sections ?? [];
  const media = world.data?.media ?? [];
  const character = buildCountryCharacter({ country, profile, stats, form, sections });
  const facts = buildCountryFunFacts({
    country,
    profile,
    stats,
    form,
    sections,
    mediaCount: media.length,
  });

  const editionMap = new Map((editions ?? []).map((edition) => [edition.id, edition]));
  const countryParticipants = (participants ?? []).filter((entry) => entry.country_id === country.id);
  const latestEntries = canonicalEditionEntries(countryParticipants)
    .sort(
      (a, b) =>
        (editionMap.get(b.edition_id)?.edition_number ?? -1) -
        (editionMap.get(a.edition_id)?.edition_number ?? -1),
    )
    .slice(0, 8);

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

        <section className="wiki-public-hero glass relative mb-5 overflow-hidden px-5 py-6 sm:px-7 sm:py-8">
          <BackgroundFlag
            image={country.flag_image}
            className="country-hero-background-flag -right-20 -top-24 h-80 w-80"
            opacity={0.1}
          />
          <div aria-hidden="true" className="country-personality-signature" />
          <div className="relative z-10 max-w-3xl">
            {country.flag_image && (
              <div
                aria-hidden="true"
                className="country-glass-panel-flag"
                style={{ backgroundImage: `url(${JSON.stringify(country.flag_image)})` }}
              />
            )}
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Terra Solaris Wiki</p>
            <h1 className="country-hero-title mt-2 break-words font-display text-3xl font-bold sm:text-5xl">{country.name}</h1>
            {country.native_name && country.native_name !== country.name && <p className="mt-1 text-sm text-muted-foreground">{country.native_name}</p>}
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
              {profile?.summary || country.description || `${country.name} is a country in Terra Solaris and a participant in Solaris Song Contest.`}
            </p>
          </div>
        </section>

        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-start">
          <article className="min-w-0 space-y-6">
            <WikiSection title="Overview">
              <p>
                {country.name} is part of {country.region || "Terra Solaris"}.
                {profile?.capital ? ` Its capital is ${profile.capital}.` : ""}
                {profile?.government_type ? ` It is ${articleFor(profile.government_type)} ${profile.government_type.toLowerCase()}.` : ""}
                {profile?.leader_name || profile?.leader_title
                  ? ` It is led by ${[profile?.leader_title, profile?.leader_name].filter(Boolean).join(" ")}.`
                  : ""}
              </p>
              {profile?.motto && <blockquote className="mt-4 border-l-2 border-primary/50 pl-4 font-display italic text-foreground">“{profile.motto}”</blockquote>}
            </WikiSection>

            <CountryCustomSections
              country={country}
              profile={profile}
              sections={sections}
              media={media}
              surface="wiki"
            />

            <WikiSection title="Solaris Song Contest">
              {stats && stats.participations > 0 ? (
                <>
                  <p>
                    {country.name} has {stats.participations} SSC participation{stats.participations === 1 ? "" : "s"},
                    {stats.wins > 0 ? ` including ${stats.wins} win${stats.wins === 1 ? "" : "s"}` : " with no overall win yet"}.
                    {stats.podiums > 0 ? ` It has reached the podium ${stats.podiums} time${stats.podiums === 1 ? "" : "s"}.` : ""}
                    {stats.qualificationPct != null ? ` Its qualification rate is ${stats.qualificationPct.toFixed(0)}%.` : ""}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <MiniStat label="Participations" value={stats.participations} />
                    <MiniStat label="Wins" value={stats.wins} />
                    <MiniStat label="Podiums" value={stats.podiums} />
                    <MiniStat label="Best score" value={stats.highestScore ?? "—"} />
                  </div>
                  {latestEntries.length > 0 && (
                    <div className="mt-5 overflow-hidden rounded-xl border border-border/70">
                      {latestEntries.map((entry) => {
                        const edition = editionMap.get(entry.edition_id);
                        return (
                          <div key={entry.edition_id} className="border-b border-border/50 px-3 py-3 last:border-b-0">
                            <div className="grid min-w-0 grid-cols-[1fr_auto] gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{entry.artist || "Artist TBC"} · {entry.song || "Song TBC"}</p>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">{edition ? editionLabel(edition) : "Edition"}</p>
                              </div>
                              {edition ? <Link to="/editions/$slug" params={{ slug: edition.slug }} className="self-center text-[10px] font-semibold text-primary">View →</Link> : null}
                            </div>
                            <EntryListenLinks entry={entry} compact className="mt-2" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : <p>{country.name} has no published Solaris Song Contest history yet.</p>}
            </WikiSection>

            {media.length > 0 && (
              <WikiSection title="Gallery">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {media.map((item) => (
                    <figure key={item.id} className="overflow-hidden rounded-xl bg-surface">
                      <img src={item.public_url} alt={item.alt_text || item.caption || `${country.name} gallery image`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                      {item.caption && <figcaption className="p-3 text-[10px] leading-relaxed text-muted-foreground">{item.caption}</figcaption>}
                    </figure>
                  ))}
                </div>
              </WikiSection>
            )}

            <section className="country-personality-card glass overflow-hidden p-5 sm:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Solaris character read</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">{character.title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{character.summary}</p>
              {character.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{character.tags.map((tag) => <span key={tag} className="rounded-full border border-border bg-surface px-3 py-1.5 text-[10px] font-semibold">{tag}</span>)}</div>}
            </section>

            {facts.length > 0 && (
              <section className="country-personality-card glass p-5 sm:p-6">
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">From the national record</p>
                  <h2 className="mt-1 font-display text-xl font-semibold">Fun facts</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Solaris automatically highlights notable facts from the country's national profile and SSC history.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">{facts.map((fact, index) => <div key={`${index}-${fact}`} className="rounded-xl bg-surface p-4"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">Fact {String(index + 1).padStart(2, "0")}</p><p className="mt-2 text-sm leading-6">{fact}</p></div>)}</div>
              </section>
            )}
          </article>

          <aside className="min-w-0 lg:sticky lg:top-24">
            <div className="country-personality-card glass overflow-hidden">
              <div className="border-b border-border/60 p-4 text-center">
                <div className="mx-auto flex justify-center"><FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="xl" /></div>
                <p className="mt-3 font-display text-xl font-bold">{country.name}</p>
                {country.native_name && country.native_name !== country.name && <p className="mt-1 text-xs text-muted-foreground">{country.native_name}</p>}
                {profile?.motto && <p className="mt-2 text-[11px] italic text-muted-foreground">“{profile.motto}”</p>}
              </div>
              <div className="divide-y divide-border/50 px-4">
                {infoRows.map(([label, value]) => value ? <div key={label} className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 py-3 text-xs"><span className="font-semibold text-muted-foreground">{label}</span><span className="break-words text-right">{value}</span></div> : null)}
              </div>
              <div className="border-t border-border/60 p-4"><Link to="/countries/$code" params={{ code: country.short_code }} className="flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold">← Country overview</Link></div>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function WikiSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="country-personality-card min-w-0 border-b border-border/60 p-4 sm:p-5">
      <h2 className="border-b border-border/60 pb-2 font-display text-xl font-semibold sm:text-2xl">{title}</h2>
      <div className="mt-4 text-sm leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return <div className="country-personality-inset rounded-xl bg-surface p-3"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-xl font-semibold text-foreground">{value}</p></div>;
}

function articleFor(value: string) {
  return /^[aeiou]/i.test(value.trim()) ? "an" : "a";
}
