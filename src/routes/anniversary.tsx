import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AppShell } from "@/components/AppShell";
import {
  ArchiveDataError,
  ArchiveDataLoading,
  archiveHasError,
  archiveIsLoading,
} from "@/components/ArchiveDataState";
import { buildAnniversaryRecap, getSolarisAnniversary } from "@/lib/anniversary";
import {
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";

export const Route = createFileRoute("/anniversary")({
  head: () => ({
    meta: [
      { title: "SSC Anniversary — Solaris Studio" },
      {
        name: "description",
        content: "Celebrate Solaris Song Contest history from 17 September 2022 to today.",
      },
    ],
  }),
  component: AnniversaryPage,
});

function AnniversaryPage() {
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const participantsQuery = useAllParticipants();
  const resultsQuery = useAllResults();
  const countriesQuery = useCountries();

  const { data: editions } = editionsQuery;
  const { data: shows } = showsQuery;
  const { data: participants } = participantsQuery;
  const { data: results } = resultsQuery;
  const { data: countries } = countriesQuery;
  const anniversary = useMemo(() => getSolarisAnniversary(), []);

  const recap = useMemo(
    () =>
      buildAnniversaryRecap({
        anniversaryYear: anniversary.year,
        editions: editions ?? [],
        shows: shows ?? [],
        participants: participants ?? [],
        results: results ?? [],
        countries: countries ?? [],
      }),
    [anniversary.year, editions, shows, participants, results, countries],
  );

  const allTime = useMemo(() => {
    const publishedEditions = (editions ?? []).filter((edition) => edition.published);
    const editionIds = new Set(publishedEditions.map((edition) => edition.id));
    const publishedShows = (shows ?? []).filter((show) => show.published && editionIds.has(show.edition_id));
    const showIds = new Set(publishedShows.map((show) => show.id));
    const archiveParticipants = (participants ?? []).filter((entry) => editionIds.has(entry.edition_id));
    const archiveResults = (results ?? []).filter(
      (result) => editionIds.has(result.edition_id) && (!result.show_id || showIds.has(result.show_id)),
    );
    const countryIds = new Set(archiveParticipants.map((entry) => entry.country_id).filter(Boolean));
    const finals = publishedShows.filter((show) => show.kind === "grand-final" || show.kind === "final");
    const finalIds = new Set(finals.map((show) => show.id));
    const champions = archiveResults.filter(
      (result) => result.show_id && finalIds.has(result.show_id) && result.final_rank === 1,
    );

    const years = new Map<number, number[]>();
    for (const edition of publishedEditions) {
      const year = edition.year ?? 0;
      if (!year) continue;
      const list = years.get(year) ?? [];
      if (edition.edition_number != null) list.push(edition.edition_number);
      years.set(year, list);
    }

    return {
      editions: publishedEditions.length,
      shows: publishedShows.length,
      entries: archiveParticipants.length,
      countries: countryIds.size,
      champions: champions.length,
      years: [...years.entries()]
        .sort(([a], [b]) => a - b)
        .map(([year, editionNumbers]) => ({
          year,
          editionNumbers: [...editionNumbers].sort((a, b) => a - b),
        })),
    };
  }, [editions, shows, participants, results]);

  const archiveQueries = [editionsQuery, showsQuery, participantsQuery, resultsQuery, countriesQuery];

  if (archiveIsLoading(...archiveQueries)) {
    return (
      <AppShell>
        <ArchiveDataLoading label="Preparing four years of Solaris history…" />
      </AppShell>
    );
  }

  if (archiveHasError(...archiveQueries)) {
    return (
      <AppShell>
        <ArchiveDataError />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="anniversary-hub">
        <section className="anniversary-hub-hero">
          <p className="anniversary-hub-date">17 September 2022 → 17 September {anniversary.year}</p>
          <h1 className="anniversary-hub-title">
            <span className="number">{String(anniversary.age).padStart(2, "0")}</span>
            <br />
            YEARS OF
            <br />
            SOLARIS
          </h1>
          <p className="anniversary-hub-lede">
            Solaris Song Contest began on 17 September 2022. This anniversary hub brings the contest archive together as one story: editions, countries, champions, records, close finishes and the year that carried Solaris into its {anniversary.ordinal} anniversary.
          </p>
          <div className="anniversary-hub-actions">
            <Link to="/editions">Explore every edition →</Link>
            <Link to="/records">Open the record book</Link>
            <Link to="/archive-games">Play the archive</Link>
            <Link to="/countries">Explore countries</Link>
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="all-time-title">
          <div className="anniversary-hub-section-head">
            <div>
              <p>Since 17 September 2022</p>
              <h2 id="all-time-title">Four years in numbers</h2>
            </div>
          </div>
          <div className="anniversary-hub-grid">
            <HubStat label="Published editions" value={allTime.editions} />
            <HubStat label="Public shows" value={allTime.shows} />
            <HubStat label="Countries" value={allTime.countries} />
            <HubStat label="Archived entries" value={allTime.entries} />
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="year-title">
          <div className="anniversary-hub-section-head">
            <div>
              <p>17 September {anniversary.previousYear} → today</p>
              <h2 id="year-title">The anniversary year</h2>
            </div>
          </div>
          <div className="anniversary-hub-grid">
            <HubStat label="Contest chapters" value={recap.editionCount} />
            <HubStat label="Public shows" value={recap.showCount} />
            <HubStat label="Countries" value={recap.countryCount} />
            <HubStat label="Entries" value={recap.entryCount} />
          </div>
          <div className="anniversary-hub-stories mt-3">
            {recap.stories.map((story) => (
              <article key={story.id} className="anniversary-hub-story">
                <small>{story.kicker}{story.value ? ` · ${story.value}` : ""}</small>
                <h3>{story.headline}</h3>
                <p>{story.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="timeline-title">
          <div className="anniversary-hub-section-head">
            <div>
              <p>The growing archive</p>
              <h2 id="timeline-title">Solaris through the years</h2>
            </div>
          </div>
          <div>
            {allTime.years.map(({ year, editionNumbers }) => (
              <div key={year} className="anniversary-hub-year">
                <strong>{year}</strong>
                <p>
                  {editionNumbers.length
                    ? `${editionNumbers.length} published edition${editionNumbers.length === 1 ? "" : "s"}: ${editionNumbers.map((number) => `SSC ${number}`).join(" · ")}`
                    : "A chapter of Solaris history preserved in the archive."}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="explore-title">
          <div className="anniversary-hub-section-head">
            <div>
              <p>The archive is the celebration</p>
              <h2 id="explore-title">Keep exploring</h2>
            </div>
          </div>
          <div className="anniversary-hub-stories">
            <HubLink to="/editions" eyebrow="Contest history" title="Walk through every edition" text="Open the published SSC archive and follow hosts, fields and winners from one contest chapter to the next." />
            <HubLink to="/records" eyebrow="History books" title="Records made to be broken" text="Revisit the wins, points, streaks and all-time marks that survived long enough to reach another birthday." />
            <HubLink to="/archive-games" eyebrow="Anniversary challenge" title="How well do you know Solaris?" text="Turn old placements, jury splits and archive facts into a playable birthday challenge." />
            <HubLink to="/analysis" eyebrow="Four years of patterns" title="See how the contest changed" text="Move beyond the scoreboard into the trends and voting patterns that accumulated across the archive." />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function HubStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="anniversary-hub-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function HubLink({
  to,
  eyebrow,
  title,
  text,
}: {
  to: "/editions" | "/records" | "/archive-games" | "/analysis";
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <Link to={to} className="anniversary-hub-card">
      <small>{eyebrow}</small>
      <h3>{title}</h3>
      <p>{text}</p>
    </Link>
  );
}
