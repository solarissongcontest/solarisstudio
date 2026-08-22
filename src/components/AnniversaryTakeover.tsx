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

  return (
    <section className="solaris-anniversary-v2">
      <div className="relative z-10 mx-auto max-w-[1240px]">
        <div className="anniversary-v2-hero">
          <div className="min-w-0">
            <div className="anniversary-v2-kicker">
              <span className="anniversary-v2-chip">17 · 09 · 2022</span>
              <span className="anniversary-v2-chip">Anniversary Day</span>
              <span className="anniversary-v2-chip">TSBC Special</span>
            </div>

            <p className="mt-7 text-[10px] font-black uppercase tracking-[0.32em] text-white/50 sm:text-xs">
              Solaris Song Contest birthday
            </p>
            <h2 className="anniversary-v2-title font-display">
              <span className="accent">{anniversary.age} YEARS</span>
              <br />
              OF SOLARIS
            </h2>
            <p className="anniversary-v2-lede">
              On 17 September 2022, Solaris Song Contest began. Today marks its {anniversary.ordinal} anniversary, with the front page turning into a live archive of champions, records, rivalries and the year that brought us here.
            </p>

            <div className="anniversary-v2-actions">
              <Link to="/editions" className="anniversary-v2-action primary">
                Explore every edition →
              </Link>
              <Link to="/records" className="anniversary-v2-action">
                Open the record book
              </Link>
              <Link to="/archive-games" className="anniversary-v2-action">
                Play the archive
              </Link>
            </div>
          </div>

          <div className="anniversary-v2-panel">
            <div className="anniversary-v2-panel-head">
              <div>
                <p className="anniversary-v2-panel-label">Anniversary year in numbers</p>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/55">
                  The contest year from 17 September {anniversary.previousYear} to today, captured through its editions, shows, countries and entries.
                </p>
              </div>
              <div className="anniversary-v2-orbit" aria-hidden="true" />
            </div>

            <div className="anniversary-v2-stats">
              <BirthdayStat label="Contest chapters" value={recap.editionCount} />
              <BirthdayStat label="Public shows" value={recap.showCount} />
              <BirthdayStat label="Countries" value={recap.countryCount} />
              <BirthdayStat label="Entries" value={recap.entryCount} />
            </div>
          </div>
        </div>

        <div className="anniversary-v2-divider" />

        <div className="anniversary-v2-section-head">
          <div>
            <p className="anniversary-v2-eyebrow">The birthday edition</p>
            <h3 className="anniversary-v2-section-title font-display">One year of Solaris, in headlines</h3>
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
              <h4 className="anniversary-v2-story-title font-display">{story.headline}</h4>
              <p className="anniversary-v2-story-copy">{story.detail}</p>
            </article>
          ))}
        </div>

        <div className="anniversary-v2-divider" />

        <div className="anniversary-v2-section-head">
          <div>
            <p className="anniversary-v2-eyebrow">Keep exploring</p>
            <h3 className="anniversary-v2-section-title font-display">The archive is the celebration</h3>
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

function BirthdayStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="anniversary-v2-stat">
      <p className="anniversary-v2-stat-label">{label}</p>
      <p className="anniversary-v2-stat-value font-display">{value}</p>
    </div>
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
      <h4 className="anniversary-v2-feature-title font-display">{title}</h4>
      <p className="anniversary-v2-feature-copy">{text}</p>
      <p className="anniversary-v2-feature-cta">{cta} →</p>
    </Link>
  );
}
