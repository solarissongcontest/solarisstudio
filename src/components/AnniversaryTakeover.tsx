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
            <span>TSBC</span>
          </div>

          <div className="anniversary-editorial-grid">
            <div className="anniversary-editorial-copy">
              <p className="anniversary-editorial-eyebrow">Solaris Song Contest · Anniversary Day</p>
              <h1 className="anniversary-editorial-title font-display">
                <span className="anniversary-title-years">{anniversary.age} years</span>
                <span className="anniversary-title-lockup">
                  <span className="anniversary-title-of">of</span>
                  <strong className="anniversary-title-solaris">Solaris</strong>
                </span>
              </h1>
              <p className="anniversary-editorial-deck">
                {anniversary.age} years of champions, close finishes, memorable scores and new stories from across Terra Solaris.
              </p>
              <div className="anniversary-editorial-actions">
                <Link to="/anniversary" className="anniversary-editorial-action primary" data-anniversary-action="major">
                  Anniversary hub →
                </Link>
                <Link to="/editions" className="anniversary-editorial-action">Browse every edition</Link>
              </div>
              <div className="anniversary-editorial-signature" aria-label="Solaris anniversary dates">
                <span className="anniversary-editorial-signature-name">{anniversary.age} years of Solaris</span>
                <span className="anniversary-editorial-signature-dates">17·09·2022 → 17·09·{anniversary.year}</span>
              </div>
            </div>

            <div className="anniversary-editorial-art" aria-hidden="true">
              <span>{String(anniversary.age).padStart(2, "0")}</span>
            </div>
          </div>

          <div className="anniversary-editorial-facts" aria-label="Solaris anniversary highlights">
            <EditorialFact
              label="This anniversary year"
              value={`${recap.editionCount} chapters`}
              detail={`${recap.countryCount} countries · ${recap.entryCount} entries since the previous birthday`}
            />
            <EditorialFact
              label="Closest finish"
              value={closest ? `${closest.gap} pts` : "—"}
              detail={closest ? `${closest.winner} over ${closest.runnerUp} · ${closest.edition}` : "Not available yet"}
            />
            <EditorialFact
              label="Biggest winning score"
              value={biggest ? `${biggest.points}` : "—"}
              detail={biggest ? `${biggest.name} · ${biggest.edition}` : "Not available yet"}
            />
            <EditorialFact
              label="Latest champion"
              value={latestWinner?.name ?? "—"}
              detail={latestWinner ? `${latestWinner.edition} · ${latestWinner.points} points` : leadStory?.headline ?? "Not available yet"}
            />
          </div>
        </header>

        <div className="anniversary-v2-divider" />

        <div className="anniversary-v2-section-head">
          <div>
            <p className="anniversary-v2-eyebrow">Since the last anniversary</p>
            <h2 className="anniversary-v2-section-title font-display">The year in review</h2>
          </div>
          <p className="anniversary-v2-section-copy">
            The editions, results and moments from 17 September {anniversary.previousYear} to today.
          </p>
        </div>

        <div className="anniversary-v2-story-grid">
          {recap.stories.map((story, index) => (
            <article
              key={story.id}
              className={`anniversary-v2-story${index === 0 ? " is-lead" : ""}`}
              data-anniversary-story={index === 0 ? "lead" : "standard"}
            >
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
            <p className="anniversary-v2-eyebrow">Explore Solaris</p>
            <h2 className="anniversary-v2-section-title font-display">{anniversary.age} years to look back on</h2>
          </div>
          <p className="anniversary-v2-section-copy">
            Browse every edition, try the archive games or open the record book.
          </p>
        </div>

        <div className="anniversary-v2-feature-grid">
          <BirthdayFeature
            eyebrow="17 September 2022"
            title="Every edition"
            text="Browse the contest from SSC 1 to the latest published edition."
            to="/editions"
            cta="Browse editions"
          />
          <BirthdayFeature
            eyebrow="Archive Games"
            title="Test your Solaris knowledge"
            text="Placements, jury splits and past results turned into quick games."
            to="/archive-games"
            cta="Play Archive Games"
          />
          <BirthdayFeature
            eyebrow="Record book"
            title="All-time records"
            text="Wins, points, streaks and other records from across Solaris history."
            to="/records"
            cta="Open records"
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
