import { Link } from "@tanstack/react-router";

import "@/anniversary-redesign.css";
import type { AnniversaryRecap, SolarisAnniversary } from "@/lib/anniversary";

export function AnniversaryTakeover({
  anniversary,
  recap,
}: {
  anniversary: SolarisAnniversary;
  recap: AnniversaryRecap;
}) {
  if (!anniversary.active) return null;

  const leadStory = recap.stories[0] ?? null;
  const closest = recap.closestFinal;
  const biggest = recap.biggestWinner;
  const latestWinner = recap.winners.at(-1) ?? null;

  return (
    <section className="solaris-anniversary-v2 solaris-anniversary-editorial">
      <div className="relative z-10 mx-auto max-w-[1240px]">
        <header className="anniversary-editorial-hero">
          <div className="anniversary-editorial-meta" aria-label="Anniversary metadata">
            <span>17 September 2022 → {anniversary.year}</span>
            <span>{anniversary.ordinal} anniversary</span>
            <span>TSBC anniversary edition</span>
          </div>

          <div className="anniversary-editorial-grid">
            <div className="anniversary-editorial-number" aria-hidden="true">
              {String(anniversary.age).padStart(2, "0")}
            </div>

            <div className="anniversary-editorial-copy">
              <p className="anniversary-editorial-eyebrow">Solaris Song Contest · Anniversary Day</p>
              <h1 className="anniversary-editorial-title font-display">
                <span>{anniversary.age} years</span>
                <strong>of Solaris</strong>
              </h1>
              <p className="anniversary-editorial-deck">
                Four years of champions, near misses, voting chaos and countries writing themselves into Solaris history. Today the Studio becomes the archive.
              </p>
              <div className="anniversary-editorial-actions">
                <Link to="/anniversary" className="anniversary-editorial-action primary" data-anniversary-action="major">
                  Enter the anniversary archive →
                </Link>
                <Link to="/editions" className="anniversary-editorial-action">Explore every edition</Link>
              </div>
            </div>
          </div>

          <div className="anniversary-editorial-facts" aria-label="Solaris anniversary highlights">
            <EditorialFact
              label="The archive"
              value={`${recap.editionCount} chapters`}
              detail={`${recap.countryCount} countries · ${recap.entryCount} entries in the anniversary year`}
            />
            <EditorialFact
              label="Closest finish"
              value={closest ? `${closest.gap} pts` : "—"}
              detail={closest ? `${closest.winner} over ${closest.runnerUp} · ${closest.edition}` : "Waiting for a published final"}
            />
            <EditorialFact
              label="Biggest winning score"
              value={biggest ? `${biggest.points}` : "—"}
              detail={biggest ? `${biggest.name} · ${biggest.edition}` : "Waiting for a published final"}
            />
            <EditorialFact
              label="Latest champion"
              value={latestWinner?.name ?? "—"}
              detail={latestWinner ? `${latestWinner.edition} · ${latestWinner.points} points` : leadStory?.headline ?? "The archive is still growing"}
            />
          </div>

          <div className="anniversary-editorial-scrollcue" aria-hidden="true">
            <span />
            The story so far
          </div>
        </header>

        <div className="anniversary-v2-divider" />

        <div className="anniversary-v2-section-head">
          <div>
            <p className="anniversary-v2-eyebrow">The birthday edition</p>
            <h2 className="anniversary-v2-section-title font-display">One year of Solaris, in headlines</h2>
          </div>
          <p className="anniversary-v2-section-copy">
            From the previous birthday to today, these are the numbers and moments that shaped another year of the contest.
          </p>
        </div>

        <div className="anniversary-v2-story-grid">
          {recap.stories.map((story) => (
            <article key={story.id} className="anniversary-v2-story">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <p className="anniversary-v2-story-kicker">{story.kicker}</p>
                {story.value && <span className="anniversary-v2-story-value">{story.value}</span>}
              </div>
              <h3 className="anniversary-v2-story-title font-display">{story.headline}</h3>
              <p className="anniversary-v2-story-copy">{story.detail}</p>
            </article>
          ))}
        </div>

        <div className="anniversary-v2-divider" />

        <div className="anniversary-v2-section-head">
          <div>
            <p className="anniversary-v2-eyebrow">Keep exploring</p>
            <h2 className="anniversary-v2-section-title font-display">The archive is the celebration</h2>
          </div>
          <p className="anniversary-v2-section-copy">
            Anniversary Day brings Solaris history, records and interactive archive features together in one place.
          </p>
        </div>

        <div className="anniversary-v2-feature-grid">
          <BirthdayFeature
            eyebrow="Born 17 September 2022"
            title="Walk through the years"
            text="Every published edition, winner and scoreboard remains part of one growing contest history."
            to="/editions"
            cta="Open the archive"
          />
          <BirthdayFeature
            eyebrow="Anniversary challenge"
            title="How well do you know Solaris?"
            text="Archive Games turns old placements, jury splits and edition history into a birthday challenge."
            to="/archive-games"
            cta="Start playing"
          />
          <BirthdayFeature
            eyebrow="The numbers survived"
            title="Records made to be broken"
            text="Revisit the wins, point totals, streaks and all-time marks that defined Solaris before another year begins trying to destroy them."
            to="/records"
            cta="See the records"
          />
        </div>

        <div className="anniversary-v2-footer">
          <p>Solaris Song Contest · Established 17 September 2022</p>
          <p>{anniversary.dateLabel} · {anniversary.ordinal} anniversary</p>
        </div>
      </div>
    </section>
  );
}

function EditorialFact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="anniversary-editorial-fact">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function BirthdayFeature({
  eyebrow,
  title,
  text,
  to,
  cta,
}: {
  eyebrow: string;
  title: string;
  text: string;
  to: "/editions" | "/archive-games" | "/records";
  cta: string;
}) {
  return (
    <Link to={to} className="anniversary-v2-feature group">
      <p className="anniversary-v2-eyebrow">{eyebrow}</p>
      <h3 className="anniversary-v2-feature-title font-display">{title}</h3>
      <p className="anniversary-v2-feature-copy">{text}</p>
      <p className="anniversary-v2-feature-cta">{cta} →</p>
    </Link>
  );
}
