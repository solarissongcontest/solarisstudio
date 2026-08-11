import { Link } from "@tanstack/react-router";

import type { AnniversaryRecap, SolarisAnniversary } from "@/lib/anniversary";

const CONFETTI = Array.from({ length: 42 }, (_, index) => ({
  left: `${(index * 37) % 100}%`,
  delay: `${-((index * 0.19) % 4.6)}s`,
  duration: `${3.6 + ((index * 17) % 24) / 10}s`,
  rotate: `${(index * 71) % 360}deg`,
  size: `${6 + ((index * 13) % 8)}px`,
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
    <section className="solaris-birthday relative isolate -mx-4 -mt-2 min-w-0 overflow-hidden border-y border-white/15 px-4 py-8 sm:-mx-6 sm:px-6 sm:py-12 lg:-mx-8 lg:px-8">
      <div className="solaris-birthday-orb solaris-birthday-orb-a" aria-hidden="true" />
      <div className="solaris-birthday-orb solaris-birthday-orb-b" aria-hidden="true" />
      <div className="solaris-birthday-orb solaris-birthday-orb-c" aria-hidden="true" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {CONFETTI.map((piece, index) => (
          <span
            key={index}
            className={`solaris-confetti solaris-confetti-${index % 5}`}
            style={
              {
                left: piece.left,
                animationDelay: piece.delay,
                animationDuration: piece.duration,
                width: piece.size,
                height: `calc(${piece.size} * 1.8)`,
                "--confetti-rotate": piece.rotate,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto max-w-[1240px]">
        <div className="grid min-w-0 gap-7 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)] xl:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="solaris-birthday-pill">17 · 09 · 2022</span>
              <span className="solaris-birthday-pill">Anniversary Day</span>
              <span className="solaris-birthday-pill">TSBC Special</span>
            </div>

            <p className="mt-7 text-[10px] font-black uppercase tracking-[0.32em] text-white/65 sm:text-xs">
              Solaris Song Contest birthday
            </p>
            <h2 className="mt-2 max-w-5xl break-words font-display text-[clamp(3.4rem,11vw,8.5rem)] font-black leading-[0.82] tracking-[-0.075em] text-white">
              {anniversary.age} YEARS OF SOLARIS
            </h2>
            <p className="mt-5 max-w-3xl text-base font-medium leading-relaxed text-white/78 sm:text-xl">
              On 17 September 2022, Solaris Song Contest began. Today marks its {anniversary.ordinal} anniversary, and the newsroom is handing the entire front page over to the contest's history, champions, chaos and the year that brought us here.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              <Link to="/editions" className="solaris-birthday-action solaris-birthday-action-primary">
                Explore every edition →
              </Link>
              <Link to="/records" className="solaris-birthday-action">
                Open the record book
              </Link>
              <Link to="/archive-games" className="solaris-birthday-action">
                Play the archive
              </Link>
            </div>
          </div>

          <div className="min-w-0 rounded-[2rem] border border-white/20 bg-black/20 p-5 backdrop-blur-xl sm:p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/55">
              Anniversary year in numbers
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <BirthdayStat label="Contest chapters" value={recap.editionCount} />
              <BirthdayStat label="Public shows" value={recap.showCount} />
              <BirthdayStat label="Countries" value={recap.countryCount} />
              <BirthdayStat label="Entries" value={recap.entryCount} />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-white/55">
              A look back at the contest chapters spanning the period from 17 September {anniversary.previousYear} to this anniversary.
            </p>
          </div>
        </div>

        <div className="mt-10 border-t border-white/18 pt-6">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/55">The birthday edition</p>
              <h3 className="mt-1 font-display text-2xl font-black text-white sm:text-4xl">
                One year of Solaris, in headlines
              </h3>
            </div>
            <p className="max-w-lg text-xs leading-relaxed text-white/55 sm:text-right">
              From the previous birthday to today, these are the numbers and moments that shaped another year of the contest.
            </p>
          </div>

          <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recap.stories.map((story, index) => (
              <article key={story.id} className={`solaris-birthday-story solaris-birthday-story-${index % 3}`}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/55">{story.kicker}</p>
                  {story.value && <span className="shrink-0 text-xs font-black text-white">{story.value}</span>}
                </div>
                <h4 className="mt-4 break-words font-display text-xl font-black leading-tight text-white sm:text-2xl">
                  {story.headline}
                </h4>
                <p className="mt-3 break-words text-xs leading-relaxed text-white/62 sm:text-sm">{story.detail}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-9 grid min-w-0 gap-3 md:grid-cols-3">
          <BirthdayFeature
            eyebrow="Born 17 September 2022"
            title="The archive becomes the party"
            text="Every published edition, winner and scoreboard remains part of a single growing history. Anniversary Day turns that archive into the centre of the site."
            to="/editions"
            cta="Walk through the years"
          />
          <BirthdayFeature
            eyebrow="Anniversary challenge"
            title="How well do you actually know Solaris?"
            text="Archive Games turns old placements, jury splits and editions into a birthday trivia marathon. Your dignity remains optional."
            to="/archive-games"
            cta="Start playing"
          />
          <BirthdayFeature
            eyebrow="The numbers survived"
            title="Records made to be broken"
            text="Revisit the wins, point totals, streaks and all-time marks that defined Solaris before another year starts trying to destroy them."
            to="/records"
            cta="See the records"
          />
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/18 pt-5 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>Solaris Song Contest · Established 17 September 2022</p>
          <p>{anniversary.dateLabel} · {anniversary.ordinal} anniversary</p>
        </div>
      </div>
    </section>
  );
}

function BirthdayStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.07] p-4">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/50">{label}</p>
      <p className="mt-1 font-display text-3xl font-black tabular-nums text-white">{value}</p>
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
    <Link to={to} className="group rounded-[1.7rem] border border-white/15 bg-white/[0.065] p-5 backdrop-blur-lg transition-transform hover:-translate-y-1 sm:p-6">
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/48">{eyebrow}</p>
      <h4 className="mt-3 font-display text-xl font-black leading-tight text-white">{title}</h4>
      <p className="mt-3 text-xs leading-relaxed text-white/58">{text}</p>
      <p className="mt-5 text-xs font-black text-white">{cta} →</p>
    </Link>
  );
}
