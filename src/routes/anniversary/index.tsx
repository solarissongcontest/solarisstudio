import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import "@/anniversary-hub-extras.css";
import { AppShell } from "@/components/AppShell";
import { buildAnniversaryRecap, getSolarisAnniversary } from "@/lib/anniversary";
import { buildAnniversaryArchiveInsights } from "@/lib/anniversary-insights";
import {
  useAllJuryVotes,
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
  const { data: juryVotes } = useAllJuryVotes();

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

  const insights = useMemo(
    () =>
      buildAnniversaryArchiveInsights({
        anniversaryYear: anniversary.year,
        editions: editions ?? [],
        shows: shows ?? [],
        participants: participants ?? [],
        results: results ?? [],
        countries: countries ?? [],
        juryVotes: juryVotes ?? [],
      }),
    [anniversary.year, editions, shows, participants, results, countries, juryVotes],
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

  const editionsByYear = useMemo(() => {
    const map = new Map<number, typeof insights.editions>();
    for (const edition of insights.editions) {
      if (!edition.year) continue;
      const list = map.get(edition.year) ?? [];
      list.push(edition);
      map.set(edition.year, list);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [insights.editions]);

  const champions = insights.editions.filter((edition) => edition.winnerCountryId && edition.winnerName);
  const mutual = insights.strongestMutualRelationship;

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
            Solaris Song Contest began on 17 September 2022. This is the anniversary headquarters: every published chapter, the records that survived it, the champions who changed the history books, the delegations that shaped the archive and the tools that let you pull the whole thing apart again.
          </p>
          <div className="anniversary-hub-actions">
            <Link to="/editions" className="anniversary-hub-action primary" data-anniversary-action="major">
              Explore every edition →
            </Link>
            <Link to="/records" className="anniversary-hub-action">Open the record book</Link>
            <Link to="/archive-games" className="anniversary-hub-action">Play the anniversary challenge</Link>
            <Link to="/my-solaris" className="anniversary-hub-action">Open your Solaris story</Link>
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="all-time-heading">
          <div className="anniversary-hub-section-head">
            <div>
              <p>Since 2022</p>
              <h2 id="all-time-heading">{anniversary.age} years in numbers</h2>
            </div>
          </div>
          <div className="anniversary-hub-grid">
            <HubStat label="Published editions" value={publishedEditions.length} />
            <HubStat label="Public shows" value={allTimeShows.length} />
            <HubStat label="Countries in the archive" value={allTimeCountries} />
            <HubStat label="Championship chapters" value={champions.length} />
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="moments-heading">
          <div className="anniversary-hub-section-head">
            <div>
              <p>Four defining archive moments</p>
              <h2 id="moments-heading">Moments that shaped Solaris</h2>
            </div>
          </div>
          <div className="anniversary-hub-moment-grid">
            {insights.moments.map((moment) => (
              <article key={moment.id} className="anniversary-hub-moment">
                <small>{moment.kicker}</small>
                <h3>{moment.title}</h3>
                <p>{moment.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="timeline-heading">
          <div className="anniversary-hub-section-head">
            <div>
              <p>The full chronology</p>
              <h2 id="timeline-heading">Solaris through the years</h2>
            </div>
          </div>
          <div className="anniversary-hub-timeline">
            {editionsByYear.map(([year, yearEditions]) => (
              <div key={year} className="anniversary-hub-year-row">
                <strong>{year}</strong>
                <div className="anniversary-hub-year-editions">
                  {yearEditions.map((edition) => (
                    <Link key={edition.editionId} to="/editions/$slug" params={{ slug: edition.slug }}>
                      <span>SSC {edition.editionNumber}</span>
                      <small>{edition.winnerName ? `${edition.winnerName} won` : edition.name}</small>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="champions-heading">
          <div className="anniversary-hub-section-head">
            <div>
              <p>The winners' circle</p>
              <h2 id="champions-heading">Champions across the archive</h2>
            </div>
          </div>
          <div className="anniversary-hub-champions">
            {champions.map((edition) => (
              <Link key={edition.editionId} to="/editions/$slug" params={{ slug: edition.slug }} className="anniversary-hub-champion">
                <small>SSC {edition.editionNumber}</small>
                <strong>{edition.winnerName}</strong>
                <span>{edition.winnerPoints != null ? `${edition.winnerPoints} pts` : "Champion"}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="ranking-heading">
          <div className="anniversary-hub-section-head">
            <div>
              <p>Four delegations that shaped the archive</p>
              <h2 id="ranking-heading">Anniversary archive ranking</h2>
            </div>
          </div>
          <div className="anniversary-hub-ranking">
            {insights.topDelegations.map((country, index) => (
              <Link
                key={country.countryId}
                to="/countries/$code"
                params={{ code: country.shortCode }}
                className="anniversary-hub-ranking-row"
              >
                <small>Archive rank</small>
                <b>#{index + 1}</b>
                <strong>{country.name}</strong>
                <span>{country.wins} wins · {country.topFives} top fives · {country.finals} finals · {country.participations} editions</span>
              </Link>
            ))}
          </div>
          <p className="anniversary-hub-disclaimer">
            This is an anniversary editorial ranking, not a new official competition. Its index rewards wins most heavily, then top-five finishes, finals and participation so the archive can surface historically prominent delegations without quietly rewriting SSC rules.
          </p>
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
          <div className="anniversary-hub-story-grid mt-3">
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

        <section className="anniversary-hub-section" aria-labelledby="connections-heading">
          <div className="anniversary-hub-section-head">
            <div>
              <p>Voting history</p>
              <h2 id="connections-heading">Relationships accumulated over time</h2>
            </div>
          </div>
          <div className="anniversary-hub-story-grid">
            {mutual ? (
              <article className="anniversary-hub-card">
                <small>Strongest mutual jury relationship</small>
                <h3>{mutual.aName} ↔ {mutual.bName}</h3>
                <p>{mutual.aToB} published jury points one way and {mutual.bToA} back. This is descriptive history, not proof of motive or coordination.</p>
                <Link to="/relationships" className="anniversary-hub-card-link">Explore relationships →</Link>
              </article>
            ) : null}
            {insights.biggestJuryTelevoteSplit ? (
              <article className="anniversary-hub-card">
                <small>Largest jury–televote split</small>
                <h3>{insights.biggestJuryTelevoteSplit.countryName}</h3>
                <p>SSC {insights.biggestJuryTelevoteSplit.editionNumber}: {insights.biggestJuryTelevoteSplit.juryPoints} jury points vs {insights.biggestJuryTelevoteSplit.televotePoints} televote points.</p>
                <Link to="/analysis" className="anniversary-hub-card-link">Open analysis →</Link>
              </article>
            ) : null}
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
            <HubLink to="/editions" eyebrow="Chronology" title="Walk through every edition" copy="Browse the contest chapter by chapter, with anniversary milestones attached to the real edition pages." />
            <HubLink to="/records" eyebrow="Legacy" title="See the records that survived" copy="All-time marks, anniversary-year records and the oldest standing archive record." />
            <HubLink to="/archive-games" eyebrow="Anniversary challenge" title="Earn your Solaris knowledge rank" copy="Ten questions rotate through all five Archive Games formats and finish with an anniversary rank." />
            <HubLink to="/taste-dna" eyebrow="Personal analytics" title="Find your Solaris era" copy="Saved Taste DNA rankings can now be compared across contest years during Anniversary Mode." />
            <HubLink to="/result-lab" eyebrow="What-if archive" title="Load historic Result Lab presets" copy="Jump to the earliest or latest published chapter and test anniversary voting scenarios." />
            <HubLink to="/my-solaris" eyebrow="Personal history" title="Open your Solaris story" copy="See the linked country's editions, finals, wins, points, streak and share of published Solaris history." />
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="preview-heading">
          <div className="anniversary-hub-section-head">
            <div>
              <p>Testing controls</p>
              <h2 id="preview-heading">Anniversary preview lab</h2>
            </div>
          </div>
          <details className="anniversary-hub-preview">
            <summary>Preview another annual state</summary>
            <p className="anniversary-hub-disclaimer">
              Preview mode persists for this browser session while you move around Solaris Studio. Use “Exit preview” to return to the real calendar state.
            </p>
            <div className="anniversary-hub-preview-grid">
              <a href="/anniversary?anniversary=active">
                <small>17 September</small>
                <strong>Full Anniversary Day</strong>
                <span>Site-wide celebration</span>
              </a>
              <a href="/anniversary?anniversary=countdown">
                <small>Before the birthday</small>
                <strong>Countdown</strong>
                <span>Pre-anniversary state</span>
              </a>
              <a href="/anniversary?anniversary=after">
                <small>After the birthday</small>
                <strong>Afterglow</strong>
                <span>New Solaris year</span>
              </a>
              <a href="/anniversary?anniversary=off">
                <small>Real calendar</small>
                <strong>Exit preview</strong>
                <span>Clear session override</span>
              </a>
            </div>
          </details>
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

function HubLink({ to, eyebrow, title, copy }: { to: string; eyebrow: string; title: string; copy: string }) {
  return (
    <Link to={to as any} className="anniversary-hub-card group">
      <small>{eyebrow}</small>
      <h3>{title}</h3>
      <p>{copy}</p>
      <b>Open →</b>
    </Link>
  );
}
