import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import "@/anniversary-redesign.css";
import type { AnniversaryRecap, SolarisAnniversary } from "@/lib/anniversary";

const STAR_COLORS = ["#79e7ff", "#b9a4ff", "#ff8fc7", "#ffe36e", "#7cf6d4", "#ffffff"];

const ANNIVERSARY_STARS = Array.from({ length: 34 }, (_, index) => ({
  left: `${(index * 29 + 7) % 100}%`,
  top: `${(index * 43 + 5) % 94}%`,
  size: `${18 + ((index * 17) % 34)}px`,
  color: STAR_COLORS[index % STAR_COLORS.length],
  opacity: 0.16 + ((index * 11) % 36) / 100,
  rotate: `${(index * 47) % 360}deg`,
  duration: `${6.5 + ((index * 13) % 42) / 10}s`,
  delay: `${-((index * 0.31) % 7.5)}s`,
  drift: `${-18 + ((index * 19) % 36)}px`,
}));

export function AnniversaryTakeover({
  anniversary,
  recap,
}: {
  anniversary: SolarisAnniversary;
  recap: AnniversaryRecap;
}) {
  if (!anniversary.active) return null;

  return (
    <section className="solaris-anniversary-v2 -mx-3 -mt-5 min-w-0 px-4 sm:-mx-5 sm:-mt-7 sm:px-6 lg:-mx-6 lg:-mt-8 lg:px-8">
      <div className="anniversary-v2-stars" aria-hidden="true">
        {ANNIVERSARY_STARS.map((star, index) => (
          <span
            key={index}
            className="anniversary-v2-star"
            style={
              {
                left: star.left,
                top: star.top,
                "--star-size": star.size,
                "--star-color": star.color,
                "--star-opacity": star.opacity,
                "--star-rotate": star.rotate,
                "--star-duration": star.duration,
                "--star-delay": star.delay,
                "--star-drift": star.drift,
              } as CSSProperties
            }
          />
        ))}
      </div>

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
            <h2 className="anniversary-v2-title">
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
            <h3 className="anniversary-v2-section-title">One year of Solaris, in headlines</h3>
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
              <h4 className="anniversary-v2-story-title">{story.headline}</h4>
              <p className="anniversary-v2-story-copy">{story.detail}</p>
            </article>
          ))}
        </div>

        <div className="anniversary-v2-divider" />

        <div className="anniversary-v2-section-head">
          <div>
            <p className="anniversary-v2-eyebrow">Keep exploring</p>
            <h3 className="anniversary-v2-section-title">The archive is the celebration</h3>
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
            text="Revisit the wins, point totals, streaks and all-time marks that defined Solaris before another year begins."
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
      <p className="anniversary-v2-stat-value">{value}</p>
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
      <h4 className="anniversary-v2-feature-title">{title}</h4>
      <p className="anniversary-v2-feature-copy">{text}</p>
      <p className="anniversary-v2-feature-cta">{cta} →</p>
    </Link>
  );
}
