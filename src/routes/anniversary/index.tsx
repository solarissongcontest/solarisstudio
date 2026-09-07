import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AppShell } from "@/components/AppShell";
import { buildAnniversaryRecap, getSolarisAnniversary } from "@/lib/anniversary";
import {
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";

export const Route = createFileRoute("/anniversary/")({
  head: () => ({
    meta: [
      { title: "Anniversary — Solaris Studio" },
      {
        name: "description",
        content: "Celebrate the Solaris Song Contest anniversary with champions, records, milestones and archive highlights.",
      },
    ],
  }),
  component: AnniversaryPage,
});

function AnniversaryPage() {
  const anniversary = useMemo(() => getSolarisAnniversary(), []);
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: countries } = useCountries();

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

  const publishedEditions = useMemo(
    () => (editions ?? []).filter((edition) => edition.published),
    [editions],
  );
  const allTimeShows = useMemo(
    () => (shows ?? []).filter((show) => show.published),
    [shows],
  );
  const allTimeCountries = useMemo(() => {
    const ids = new Set((participants ?? []).map((entry) => entry.country_id).filter(Boolean));
    return ids.size;
  }, [participants]);

  return (
    <AppShell>
      <main className="anniversary-hub-shell">
        <section className="anniversary-hub-hero">
          <div className="anniversary-hub-number" aria-hidden="true">
            {String(anniversary.age).padStart(2, "0")}
          </div>
          <p className="anniversary-hub-kicker">17 September 2022 → 17 September {anniversary.year}</p>
          <h1 className="anniversary-hub-title">
            {anniversary.age} years
            <em>of Solaris</em>
          </h1>
          <p className="anniversary-hub-copy">
            Solaris Song Contest began on 17 September 2022. This is the anniversary archive: the latest contest year, the records that survived it, the champions who changed the history books and the routes back into four years of gloriously unnecessary scoreboard drama.
          </p>
          <div className="anniversary-hub-actions">
            <Link to="/editions" className="anniversary-hub-action primary" data-anniversary-action="major">
              Explore every edition →
            </Link>
            <Link to="/records" className="anniversary-hub-action">
              Open the record book
            </Link>
            <Link to="/archive-games" className="anniversary-hub-action">
              Play the archive
            </Link>
            <Link to="/countries" className="anniversary-hub-action">
              Explore delegations
            </Link>
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="all-time-heading">
          <div className="anniversary-hub-section-head">
            <div>
              <p>Since 2022</p>
              <h2 id="all-time-heading">Four years in numbers</h2>
            </div>
          </div>
          <div className="anniversary-hub-grid">
            <HubStat label="Published editions" value={publishedEditions.length} />
            <HubStat label="Public shows" value={allTimeShows.length} />
            <HubStat label="Countries in the archive" value={allTimeCountries} />
            <HubStat label="Anniversary age" value={`${anniversary.age} years`} />
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="year-heading">
          <div className="anniversary-hub-section-head">
            <div>
              <p>17 September {anniversary.previousYear} → today</p>
              <h2 id="year-heading">The anniversary year</h2>
            </div>
          </div>
          <div className="anniversary-hub-grid">
            <HubStat label="Contest chapters" value={recap.editionCount} />
            <HubStat label="Public shows" value={recap.showCount} />
            <HubStat label="Participating countries" value={recap.countryCount} />
            <HubStat label="Entries" value={recap.entryCount} />
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="stories-heading">
          <div className="anniversary-hub-section-head">
            <div>
              <p>Year four, in headlines</p>
              <h2 id="stories-heading">Moments that shaped the year</h2>
            </div>
          </div>
          <div className="anniversary-hub-story-grid">
            {recap.stories.map((story) => (
              <article key={story.id} className="anniversary-hub-card">
                <small>{story.kicker}</small>
                <h3>{story.headline}</h3>
                <p>{story.detail}</p>
                {story.value ? <b>{story.value}</b> : null}
              </article>
            ))}
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="explore-heading">
          <div className="anniversary-hub-section-head">
            <div>
              <p>The archive is the celebration</p>
              <h2 id="explore-heading">Keep exploring Solaris history</h2>
            </div>
          </div>
          <div className="anniversary-hub-story-grid">
            <HubLink
              to="/editions"
              eyebrow="Chronology"
              title="Walk through every edition"
              copy="Browse the contest chapter by chapter, from the earliest published editions to the latest result."
            />
            <HubLink
              to="/records"
              eyebrow="Legacy"
              title="See the records that survived"
              copy="Wins, point totals, streaks and all-time milestones gathered into one historical record book."
            />
            <HubLink
              to="/archive-games"
              eyebrow="Anniversary challenge"
              title="How well do you know Solaris?"
              copy="Turn past placements, jury splits and result history into interactive archive games."
            />
            <HubLink
              to="/relationships"
              eyebrow="Voting history"
              title="Follow four years of relationships"
              copy="Explore the countries that repeatedly voted alike and the patterns that accumulated over time."
            />
            <HubLink
              to="/broadcast-intelligence"
              eyebrow="Replay"
              title="Relive scoreboard turning points"
              copy="Watch published results change as jury and televote scores combine into the final ranking."
            />
            <HubLink
              to="/my-solaris"
              eyebrow="Personal history"
              title="Open your Solaris story"
              copy="See your own account and country activity inside the wider contest archive."
            />
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function HubStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="anniversary-hub-stat">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function HubLink({
  to,
  eyebrow,
  title,
  copy,
}: {
  to: "/editions" | "/records" | "/archive-games" | "/relationships" | "/broadcast-intelligence" | "/my-solaris";
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <Link to={to} className="anniversary-hub-card group">
      <small>{eyebrow}</small>
      <h3>{title}</h3>
      <p>{copy}</p>
      <b>Open →</b>
    </Link>
  );
}
