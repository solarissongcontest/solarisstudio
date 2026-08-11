import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import type { AnniversaryRecap, SolarisAnniversary } from "@/lib/anniversary";

const CONFETTI = Array.from({ length: 96 }, (_, index) => ({
  left: `${(index * 41) % 100}%`,
  delay: `${-((index * 0.17) % 6.8)}s`,
  duration: `${4.2 + ((index * 19) % 34) / 10}s`,
  rotate: `${(index * 73) % 360}deg`,
  size: `${5 + ((index * 11) % 9)}px`,
}));

const FIREWORKS = [
  { x: "12%", y: "18%", delay: "-0.4s", scale: 0.9 },
  { x: "82%", y: "13%", delay: "-1.9s", scale: 1.1 },
  { x: "67%", y: "34%", delay: "-3.2s", scale: 0.8 },
  { x: "25%", y: "43%", delay: "-4.8s", scale: 1.05 },
  { x: "91%", y: "54%", delay: "-6.2s", scale: 0.72 },
  { x: "46%", y: "11%", delay: "-7.1s", scale: 0.68 },
];

const FIREWORK_COLORS = ["#ffffff", "#67e8f9", "#f9a8d4", "#fde047", "#c4b5fd", "#5eead4"];

export function AnniversaryTakeover({
  anniversary,
  recap,
}: {
  anniversary: SolarisAnniversary;
  recap: AnniversaryRecap;
}) {
  if (!anniversary.active) return null;

  return (
    <section className="solaris-birthday relative isolate -mx-3 -mt-5 min-w-0 overflow-hidden sm:-mx-5 sm:-mt-7 lg:-mx-6 lg:-mt-8">
      <div className="solaris-anniversary-sky pointer-events-none fixed inset-0 z-[35] overflow-hidden" aria-hidden="true">
        {FIREWORKS.map((firework, fireworkIndex) => (
          <span
            key={fireworkIndex}
            className="solaris-firework"
            style={
              {
                left: firework.x,
                top: firework.y,
                animationDelay: firework.delay,
                "--firework-scale": firework.scale,
              } as CSSProperties
            }
          >
            {Array.from({ length: 18 }, (_, sparkIndex) => (
              <i
                key={sparkIndex}
                className="solaris-firework-spark"
                style={
                  {
                    "--spark-angle": `${sparkIndex * 20}deg`,
                    "--spark-color": FIREWORK_COLORS[(sparkIndex + fireworkIndex) % FIREWORK_COLORS.length],
                  } as CSSProperties
                }
              />
            ))}
          </span>
        ))}

        {CONFETTI.map((piece, index) => (
          <span
            key={index}
            className={`solaris-confetti solaris-confetti-${index % 6}`}
            style={
              {
                left: piece.left,
                animationDelay: piece.delay,
                animationDuration: piece.duration,
                width: piece.size,
                height: `calc(${piece.size} * 1.75)`,
                "--confetti-rotate": piece.rotate,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="solaris-birthday-orb solaris-birthday-orb-a" aria-hidden="true" />
      <div className="solaris-birthday-orb solaris-birthday-orb-b" aria-hidden="true" />
      <div className="solaris-birthday-orb solaris-birthday-orb-c" aria-hidden="true" />
      <div className="solaris-birthday-rays" aria-hidden="true" />
      <div className="solaris-birthday-stars" aria-hidden="true" />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14 lg:px-8 lg:pb-20 lg:pt-16">
        <div className="solaris-anniversary-ribbon mb-8">
          <span>✦ ANNIVERSARY DAY ✦</span>
          <span>SOLARIS SONG CONTEST</span>
          <span>EST. 17 SEPTEMBER 2022</span>
          <span>✦ TSBC SPECIAL ✦</span>
        </div>

        <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,.85fr)] xl:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="solaris-birthday-pill">17 · 09 · 2022</span>
              <span className="solaris-birthday-pill">{anniversary.ordinal} anniversary</span>
              <span className="solaris-birthday-pill">TSBC celebration broadcast</span>
            </div>

            <div className="mt-7 flex min-w-0 items-end gap-3 sm:gap-5">
              <div className="solaris-anniversary-number" aria-label={`${anniversary.age} years`}>
                {anniversary.age}
              </div>
              <div className="min-w-0 pb-2 sm:pb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.32em] text-white/65 sm:text-xs">
                  years of
                </p>
                <h2 className="solaris-anniversary-word break-words font-display font-black text-white">
                  SOLARIS
                </h2>
              </div>
            </div>

            <p className="mt-5 max-w-3xl text-base font-semibold leading-relaxed text-white/82 sm:text-xl">
              Solaris Song Contest was born on 17 September 2022. Today the entire front page becomes a celebration of the champions, shocks, rivalries, absurd scoreboard moments and history that built it.
            </p>

            <div className="mt-7 grid min-w-0 gap-2 sm:flex sm:flex-wrap">
              <Link to="/editions" className="solaris-birthday-action solaris-birthday-action-primary">
                Explore every edition <span>✦</span>
              </Link>
              <Link to="/records" className="solaris-birthday-action">
                Open the record book <span>↗</span>
              </Link>
              <Link to="/archive-games" className="solaris-birthday-action">
                Play the archive <span>★</span>
              </Link>
            </div>
          </div>

          <div className="solaris-anniversary-medallion-wrap min-w-0">
            <div className="solaris-anniversary-medallion">
              <div className="solaris-anniversary-medallion-ring" />
              <div className="solaris-anniversary-medallion-inner">
                <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/55">Solaris Song Contest</p>
                <p className="mt-1 font-display text-[5.7rem] font-black leading-none tracking-[-0.08em] text-white sm:text-[7rem]">
                  {anniversary.age}
                </p>
                <p className="-mt-1 font-display text-xl font-black uppercase tracking-[0.16em] text-white">years</p>
                <div className="mx-auto my-4 h-px w-24 bg-white/25" />
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">2022 — {anniversary.year}</p>
              </div>
            </div>
            <div className="solaris-anniversary-medallion-caption">A whole fictional continent took this very seriously.</div>
          </div>
        </div>

        <div className="mt-12 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <BirthdayStat label="Contest chapters" value={recap.editionCount} icon="◆" />
          <BirthdayStat label="Public shows" value={recap.showCount} icon="✦" />
          <BirthdayStat label="Countries" value={recap.countryCount} icon="◉" />
          <BirthdayStat label="Entries" value={recap.entryCount} icon="★" />
        </div>

        <div className="mt-14 border-t border-white/18 pt-7">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/75">The anniversary newspaper</p>
              <h3 className="mt-1 max-w-3xl font-display text-3xl font-black leading-tight text-white sm:text-5xl">
                THE YEAR THAT MADE SOLARIS LOUDER
              </h3>
            </div>
            <p className="max-w-lg text-xs leading-relaxed text-white/58 sm:text-right">
              From 17 September {anniversary.previousYear} to today, these were the numbers and moments that defined another year of SSC history.
            </p>
          </div>

          <div className="mt-6 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recap.stories.map((story, index) => (
              <article key={story.id} className={`solaris-birthday-story solaris-birthday-story-${index % 3}`}>
                <div className="solaris-story-spark" aria-hidden="true">✦</div>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/65">{story.kicker}</p>
                  {story.value && <span className="solaris-story-value shrink-0">{story.value}</span>}
                </div>
                <h4 className="mt-5 break-words font-display text-xl font-black leading-tight text-white sm:text-2xl">
                  {story.headline}
                </h4>
                <p className="mt-3 break-words text-xs leading-relaxed text-white/64 sm:text-sm">{story.detail}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-12 grid min-w-0 gap-3 md:grid-cols-3">
          <BirthdayFeature
            eyebrow="The whole history"
            title="The archive becomes the party"
            text="Every edition, winner and scoreboard remains part of one continuously growing Solaris story."
            to="/editions"
            cta="Walk through the years"
            symbol="✦"
          />
          <BirthdayFeature
            eyebrow="Anniversary challenge"
            title="How well do you actually know Solaris?"
            text="Archive Games turns placements, jury splits and old editions into a birthday trivia marathon."
            to="/archive-games"
            cta="Start playing"
            symbol="★"
          />
          <BirthdayFeature
            eyebrow="The record vault"
            title="Records made to be broken"
            text="Revisit the wins, streaks and all-time marks that defined Solaris before another year tries to destroy them."
            to="/records"
            cta="See the records"
            symbol="◆"
          />
        </div>

        <div className="solaris-anniversary-final mt-12 overflow-hidden rounded-[2rem] border border-white/15 p-6 text-center sm:p-9">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/50">One more year begins now</p>
          <p className="mx-auto mt-3 max-w-4xl font-display text-3xl font-black leading-tight text-white sm:text-5xl">
            HAPPY BIRTHDAY, SOLARIS.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-white/62">
            Established 17 September 2022 · celebrating the {anniversary.ordinal} anniversary on {anniversary.dateLabel}.
          </p>
        </div>
      </div>
    </section>
  );
}

function BirthdayStat({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="solaris-birthday-stat min-w-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-white/50">{label}</p>
        <span className="text-lg text-cyan-200/80">{icon}</span>
      </div>
      <p className="mt-2 font-display text-4xl font-black tabular-nums text-white sm:text-5xl">{value}</p>
    </div>
  );
}

function BirthdayFeature({
  eyebrow,
  title,
  text,
  to,
  cta,
  symbol,
}: {
  eyebrow: string;
  title: string;
  text: string;
  to: "/editions" | "/archive-games" | "/records";
  cta: string;
  symbol: string;
}) {
  return (
    <Link to={to} className="solaris-birthday-feature group">
      <span className="solaris-birthday-feature-symbol">{symbol}</span>
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/48">{eyebrow}</p>
      <h4 className="mt-3 font-display text-xl font-black leading-tight text-white sm:text-2xl">{title}</h4>
      <p className="mt-3 text-xs leading-relaxed text-white/60">{text}</p>
      <p className="mt-6 text-xs font-black uppercase tracking-[0.12em] text-cyan-100">{cta} →</p>
    </Link>
  );
}
