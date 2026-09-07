import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import "@/anniversary-deep-dive.css";
import {
  anniversaryCountrySnapshot,
  anniversaryEditionSnapshot,
  buildAnniversaryArchiveInsights,
  type AnniversaryArchiveInsights,
  type AnniversaryCountrySnapshot,
} from "@/lib/anniversary-insights";
import { useMyCountryAccount } from "@/lib/country-account";
import {
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";

type Props = {
  anniversaryYear: number;
  age: number;
};

function countryCodeFromPath(pathname: string) {
  const match = pathname.match(/^\/(?:countries|wiki)\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : null;
}

function editionSlugFromPath(pathname: string) {
  const match = pathname.match(/^\/editions\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="anniv-deep-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function RankList({
  title,
  rows,
  value,
}: {
  title: string;
  rows: AnniversaryCountrySnapshot[];
  value: (row: AnniversaryCountrySnapshot) => ReactNode;
}) {
  return (
    <article className="anniv-deep-card">
      <p className="anniv-deep-kicker">{title}</p>
      <div className="anniv-deep-rank-list">
        {rows.slice(0, 4).map((row, index) => (
          <Link
            key={row.countryId}
            to="/countries/$code"
            params={{ code: row.shortCode }}
            className="anniv-deep-rank-row"
          >
            <span className="anniv-deep-rank-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="anniv-deep-rank-name">{row.name}</span>
            <strong>{value(row)}</strong>
          </Link>
        ))}
      </div>
    </article>
  );
}

function SectionShell({
  eyebrow,
  title,
  description,
  children,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`anniv-deep ${compact ? "anniv-deep--compact" : ""}`} aria-label={title}>
      <div className="anniv-deep-head">
        <div>
          <p>{eyebrow}</p>
          <h2>{title}</h2>
          <span>{description}</span>
        </div>
        <Link to="/anniversary" className="anniv-deep-hub-link" data-anniversary-action="major">
          Anniversary hub →
        </Link>
      </div>
      {children}
    </section>
  );
}

function EditionTimeline({ insights }: { insights: AnniversaryArchiveInsights }) {
  const byYear = new Map<number, typeof insights.editions>();
  for (const edition of insights.editions) {
    if (!edition.year) continue;
    const list = byYear.get(edition.year) ?? [];
    list.push(edition);
    byYear.set(edition.year, list);
  }

  return (
    <SectionShell
      eyebrow="Four years of contest chapters"
      title="Solaris through the years"
      description="A live timeline built from every published edition in the archive."
    >
      <div className="anniv-deep-timeline">
        {[...byYear.entries()].sort(([a], [b]) => a - b).map(([year, editions]) => (
          <div key={year} className="anniv-deep-year">
            <strong>{year}</strong>
            <div>
              {editions.map((edition) => (
                <Link key={edition.editionId} to="/editions/$slug" params={{ slug: edition.slug }}>
                  <span>SSC {edition.editionNumber}</span>
                  <small>{edition.winnerName ? `${edition.winnerName} won` : edition.name}</small>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="anniv-deep-moment-grid">
        {insights.moments.map((moment) => (
          <article key={moment.id} className="anniv-deep-card">
            <p className="anniv-deep-kicker">{moment.kicker}</p>
            <h3>{moment.title}</h3>
            <span>{moment.detail}</span>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}

function EditionHistory({ insights, slug }: { insights: AnniversaryArchiveInsights; slug: string }) {
  const edition = anniversaryEditionSnapshot(insights, slug);
  if (!edition) return null;
  const index = insights.editions.findIndex((item) => item.editionId === edition.editionId);
  const largest = [...insights.editions].sort((a, b) => b.fieldSize - a.fieldSize)[0];
  const closest = [...insights.editions]
    .filter((item) => item.winningMargin != null)
    .sort((a, b) => (a.winningMargin ?? Infinity) - (b.winningMargin ?? Infinity))[0];
  const highest = [...insights.editions]
    .filter((item) => item.winnerPoints != null)
    .sort((a, b) => (b.winnerPoints ?? 0) - (a.winnerPoints ?? 0))[0];

  const badges = [
    edition.editionId === largest?.editionId ? "Largest published field" : null,
    edition.editionId === closest?.editionId ? "Closest published final" : null,
    edition.editionId === highest?.editionId ? "Highest winning score" : null,
    index === 0 ? "First published chapter" : null,
    index === insights.editions.length - 1 ? "Latest published chapter" : null,
  ].filter(Boolean);

  return (
    <SectionShell
      eyebrow="This edition in Solaris history"
      title={`SSC ${edition.editionNumber} · chapter ${index + 1} of ${insights.totalEditions}`}
      description="The anniversary puts this edition back into the full published archive."
      compact
    >
      <div className="anniv-deep-stats">
        <Stat label="Field" value={edition.fieldSize} detail="countries" />
        <Stat label="Winner" value={edition.winnerName ?? "—"} detail={edition.winnerPoints != null ? `${edition.winnerPoints} pts` : undefined} />
        <Stat label="Winning margin" value={edition.winningMargin != null ? `${edition.winningMargin} pts` : "—"} />
        <Stat label="Archive year" value={edition.year ?? "—"} detail={edition.hostCity ?? undefined} />
      </div>
      {badges.length ? (
        <div className="anniv-deep-badges">
          {badges.map((badge) => <span key={badge}>{badge}</span>)}
        </div>
      ) : null}
    </SectionShell>
  );
}

function CountriesAnniversary({ insights }: { insights: AnniversaryArchiveInsights }) {
  const byWins = [...insights.countries].sort((a, b) => b.wins - a.wins || b.topFives - a.topFives || b.finals - a.finals);
  const byParticipations = [...insights.countries].sort((a, b) => b.participations - a.participations || b.activeStreak - a.activeStreak);
  const byStreak = [...insights.countries].sort((a, b) => b.activeStreak - a.activeStreak || b.participations - a.participations);
  const byPoints = [...insights.countries].sort((a, b) => b.totalFinalPoints - a.totalFinalPoints || b.wins - a.wins);

  return (
    <SectionShell
      eyebrow="Four years of delegations"
      title="The anniversary leaderboard"
      description="These are archive facts, not a new official championship table. The anniversary index simply helps surface the delegations that shaped the published history."
    >
      <div className="anniv-deep-leader-grid">
        <RankList title="Most wins" rows={byWins} value={(row) => `${row.wins} win${row.wins === 1 ? "" : "s"}`} />
        <RankList title="Most participations" rows={byParticipations} value={(row) => row.participations} />
        <RankList title="Longest current streak" rows={byStreak} value={(row) => `${row.activeStreak} editions`} />
        <RankList title="Most final points" rows={byPoints} value={(row) => row.totalFinalPoints.toLocaleString()} />
      </div>
    </SectionShell>
  );
}

function CountryStory({
  insights,
  code,
  age,
}: {
  insights: AnniversaryArchiveInsights;
  code: string;
  age: number;
}) {
  const country = insights.countries.find((row) => row.shortCode.toLowerCase() === code.toLowerCase());
  if (!country) return null;

  return (
    <SectionShell
      eyebrow="Your place in Solaris history"
      title={`${country.name} · ${country.participationShare}% of the published archive`}
      description={`${country.name} has been present for ${country.participations} of ${insights.totalEditions} published editions across ${age} years of Solaris.`}
      compact
    >
      <div className="anniv-deep-stats">
        <Stat label="Debut" value={country.debutEdition ? `SSC ${country.debutEdition}` : "—"} />
        <Stat label="Participations" value={country.participations} detail={`${country.participationShare}% of archive`} />
        <Stat label="Grand finals" value={country.finals} detail={country.bestRank ? `best: #${country.bestRank}` : undefined} />
        <Stat label="Wins" value={country.wins} detail={`${country.topFives} top-five finish${country.topFives === 1 ? "" : "es"}`} />
        <Stat label="Final points" value={country.totalFinalPoints.toLocaleString()} />
        <Stat label="Current streak" value={country.activeStreak} detail="published editions" />
      </div>
      <div className="anniv-deep-share-card">
        <small>SSC ANNIVERSARY · {country.name.toUpperCase()}</small>
        <strong>{country.participations} editions · {country.wins} wins · {country.finals} finals</strong>
        <span>Part of {country.participationShare}% of the published Solaris archive.</span>
        <ShareButton
          text={`${country.name} at the Solaris anniversary: ${country.participations} editions, ${country.wins} wins, ${country.finals} finals, part of ${country.participationShare}% of the published SSC archive.`}
        />
      </div>
    </SectionShell>
  );
}

function ResultsHistory({ insights }: { insights: AnniversaryArchiveInsights }) {
  const closest = [...insights.editions]
    .filter((edition) => edition.winningMargin != null)
    .sort((a, b) => (a.winningMargin ?? Infinity) - (b.winningMargin ?? Infinity))[0];
  const highest = [...insights.editions]
    .filter((edition) => edition.winnerPoints != null)
    .sort((a, b) => (b.winnerPoints ?? 0) - (a.winnerPoints ?? 0))[0];

  return (
    <SectionShell
      eyebrow="Greatest scoreboard moments"
      title="Four years on the scoreboard"
      description="The result archive gets its own anniversary cut: tight finishes, huge totals and the biggest jury–televote swings."
    >
      <div className="anniv-deep-moment-grid">
        {closest ? <Moment kicker="Closest final" title={`${closest.winningMargin} points · SSC ${closest.editionNumber}`} detail={`${closest.winnerName ?? "The winner"} over ${closest.runnerUpName ?? "the runner-up"}.`} /> : null}
        {highest ? <Moment kicker="Highest winning score" title={`${highest.winnerPoints} points`} detail={`${highest.winnerName ?? "Winner"} · SSC ${highest.editionNumber}.`} /> : null}
        {insights.biggestJuryTelevoteSplit ? (
          <Moment
            kicker="Biggest jury–televote split"
            title={`${insights.biggestJuryTelevoteSplit.gap} points apart`}
            detail={`${insights.biggestJuryTelevoteSplit.countryName} · SSC ${insights.biggestJuryTelevoteSplit.editionNumber}: ${insights.biggestJuryTelevoteSplit.juryPoints} jury vs ${insights.biggestJuryTelevoteSplit.televotePoints} televote.`}
          />
        ) : null}
        {insights.biggestTelevoteLift ? (
          <Moment
            kicker="Biggest televote lift"
            title={`${insights.biggestTelevoteLift.places} places`}
            detail={`${insights.biggestTelevoteLift.countryName} moved from #${insights.biggestTelevoteLift.juryRank} in the jury ranking to #${insights.biggestTelevoteLift.televoteRank} with the televote in SSC ${insights.biggestTelevoteLift.editionNumber}.`}
          />
        ) : null}
      </div>
    </SectionShell>
  );
}

function RecordsAnniversary({ insights }: { insights: AnniversaryArchiveInsights }) {
  const yearSet = new Set(insights.anniversaryYearEditionIds);
  const yearEditions = insights.editions.filter((edition) => yearSet.has(edition.editionId));
  const yearHighest = [...yearEditions]
    .filter((edition) => edition.winnerPoints != null)
    .sort((a, b) => (b.winnerPoints ?? 0) - (a.winnerPoints ?? 0))[0];
  const yearClosest = [...yearEditions]
    .filter((edition) => edition.winningMargin != null)
    .sort((a, b) => (a.winningMargin ?? Infinity) - (b.winningMargin ?? Infinity))[0];

  return (
    <SectionShell
      eyebrow="Four years of records"
      title="The history book, split three ways"
      description="All-time leaders, records set in the latest anniversary year, and the old marks that somehow survived another cycle."
    >
      <div className="anniv-deep-three-grid">
        <article className="anniv-deep-card">
          <p className="anniv-deep-kicker">All four years</p>
          <h3>{insights.topDelegations[0]?.name ?? "Solaris"}</h3>
          <span>{insights.topDelegations[0] ? `${insights.topDelegations[0].wins} wins · ${insights.topDelegations[0].topFives} top fives · ${insights.topDelegations[0].finals} finals` : "The archive is still being built."}</span>
        </article>
        <article className="anniv-deep-card">
          <p className="anniv-deep-kicker">This anniversary year</p>
          <h3>{yearHighest ? `${yearHighest.winnerPoints} winning points` : "Latest records"}</h3>
          <span>{yearHighest ? `${yearHighest.winnerName ?? "Winner"} · SSC ${yearHighest.editionNumber}${yearClosest ? ` · tightest margin ${yearClosest.winningMargin} pts` : ""}` : "Published anniversary-year results will appear here automatically."}</span>
        </article>
        <article className="anniv-deep-card">
          <p className="anniv-deep-kicker">Oldest standing mark</p>
          <h3>{insights.oldestStandingRecord?.title ?? "No standing record yet"}</h3>
          <span>{insights.oldestStandingRecord?.detail ?? "More published editions are needed before an old record can survive anything."}</span>
        </article>
      </div>
    </SectionShell>
  );
}

function AnalysisAnniversary({ insights }: { insights: AnniversaryArchiveInsights }) {
  const first = insights.eras[0];
  const latest = insights.eras.at(-1);
  if (!first || !latest) return null;
  const fieldDelta = latest.averageFieldSize - first.averageFieldSize;
  const scoreDelta = latest.averageWinnerScore != null && first.averageWinnerScore != null
    ? latest.averageWinnerScore - first.averageWinnerScore
    : null;

  return (
    <SectionShell
      eyebrow="How Solaris changed"
      title={`${first.year} → ${latest.year}`}
      description="A deliberately simple anniversary comparison of the earliest and latest published years."
      compact
    >
      <div className="anniv-deep-era-compare">
        <EraCard era={first} />
        <div className="anniv-deep-era-arrow">→</div>
        <EraCard era={latest} />
      </div>
      <div className="anniv-deep-badges">
        <span>Average field {fieldDelta >= 0 ? "+" : ""}{fieldDelta.toFixed(1)}</span>
        {scoreDelta != null ? <span>Average winner score {scoreDelta >= 0 ? "+" : ""}{scoreDelta.toFixed(1)}</span> : null}
        <span>{latest.uniqueWinners} unique winner{latest.uniqueWinners === 1 ? "" : "s"} in {latest.year}</span>
      </div>
    </SectionShell>
  );
}

function EraCard({ era }: { era: AnniversaryArchiveInsights["eras"][number] }) {
  return (
    <article className="anniv-deep-era-card">
      <strong>{era.year}</strong>
      <span>{era.editions} edition{era.editions === 1 ? "" : "s"}</span>
      <small>{era.averageFieldSize} avg. countries</small>
      <small>{era.averageWinnerScore != null ? `${era.averageWinnerScore} avg. winning pts` : "No winning score data"}</small>
      <small>{era.averageWinningMargin != null ? `${era.averageWinningMargin} avg. winning margin` : "No margin data"}</small>
    </article>
  );
}

function RelationshipsAnniversary({
  baseInsights,
  anniversaryYear,
}: {
  baseInsights: AnniversaryArchiveInsights;
  anniversaryYear: number;
}) {
  const { data: juryVotes } = useAllJuryVotes();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: countries } = useCountries();

  const insights = useMemo(
    () =>
      buildAnniversaryArchiveInsights({
        anniversaryYear,
        editions: editions ?? [],
        shows: shows ?? [],
        participants: participants ?? [],
        results: results ?? [],
        countries: countries ?? [],
        juryVotes: juryVotes ?? [],
      }),
    [anniversaryYear, editions, shows, participants, results, countries, juryVotes],
  );

  const mutual = insights.strongestMutualRelationship;
  const directional = insights.strongestDirectionalRelationship;
  if (!mutual && !directional) return <AnalysisAnniversary insights={baseInsights} />;

  return (
    <SectionShell
      eyebrow="Four years of voting relationships"
      title="The strongest connections in the published jury archive"
      description="These are cumulative voting patterns, not claims about motive. Human beings are quite capable of making statistics weird without a conspiracy."
      compact
    >
      <div className="anniv-deep-three-grid">
        {mutual ? (
          <article className="anniv-deep-card">
            <p className="anniv-deep-kicker">Strongest mutual relationship</p>
            <h3>{mutual.aName} ↔ {mutual.bName}</h3>
            <span>{mutual.aToB} points one way · {mutual.bToA} back · mutual floor {mutual.mutualScore}.</span>
          </article>
        ) : null}
        {directional ? (
          <article className="anniv-deep-card">
            <p className="anniv-deep-kicker">Strongest one-way total</p>
            <h3>{directional.fromName} → {directional.toName}</h3>
            <span>{directional.points} cumulative published jury points.</span>
          </article>
        ) : null}
        <article className="anniv-deep-card">
          <p className="anniv-deep-kicker">Read it properly</p>
          <h3>Pattern ≠ intent</h3>
          <span>Historical similarity and reciprocity are descriptive archive signals. They do not prove coordination.</span>
        </article>
      </div>
    </SectionShell>
  );
}

function PulseAnniversary({ insights, age }: { insights: AnniversaryArchiveInsights; age: number }) {
  return (
    <SectionShell
      eyebrow="On this anniversary"
      title="The archive remembers"
      description={`A compact birthday feed from ${age} years of published Solaris history.`}
    >
      <div className="anniv-deep-moment-grid">
        {insights.moments.map((moment) => (
          <article key={moment.id} className="anniv-deep-card">
            <p className="anniv-deep-kicker">{moment.kicker}</p>
            <h3>{moment.title}</h3>
            <span>{moment.detail}</span>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}

function CompareAnniversary({ insights }: { insights: AnniversaryArchiveInsights }) {
  const rows = insights.topDelegations;
  const presets = [
    rows[0] && rows[1] ? [rows[0], rows[1], "Top two anniversary powers"] as const : null,
    rows[0] && rows[2] ? [rows[0], rows[2], "Champion vs challenger"] as const : null,
    rows[1] && rows[3] ? [rows[1], rows[3], "Two long-term contenders"] as const : null,
  ].filter(Boolean) as Array<readonly [AnniversaryCountrySnapshot, AnniversaryCountrySnapshot, string]>;

  return (
    <SectionShell
      eyebrow="Across four years"
      title="Anniversary comparison presets"
      description="Open a real country-vs-country comparison using the archive leaders as shortcuts."
      compact
    >
      <div className="anniv-deep-preset-row">
        {presets.map(([a, b, label]) => (
          <Link key={`${a.countryId}-${b.countryId}`} to="/compare" search={{ a: a.shortCode, b: b.shortCode }}>
            <small>{label}</small>
            <strong>{a.name} ↔ {b.name}</strong>
            <span>Compare →</span>
          </Link>
        ))}
      </div>
    </SectionShell>
  );
}

function ArchiveChallenge({ age }: { age: number }) {
  return (
    <SectionShell
      eyebrow={`${age} Years Challenge`}
      title="Prove you actually remember the archive"
      description="Anniversary Day adds a ten-question challenge score and historian rank to Archive Games."
      compact
    >
      <div className="anniv-deep-badges">
        <span>0–3 · Casual Viewer</span>
        <span>4–5 · Delegation Intern</span>
        <span>6–7 · Scoreboard Addict</span>
        <span>8–9 · Solaris Historian</span>
        <span>10 · Living Archive</span>
      </div>
    </SectionShell>
  );
}

function BroadcastAnniversary({ insights }: { insights: AnniversaryArchiveInsights }) {
  return (
    <SectionShell
      eyebrow="Anniversary replays"
      title="Legendary scoreboard moments"
      description="Use Broadcast Intelligence to replay the published editions that still own the anniversary records."
      compact
    >
      <div className="anniv-deep-preset-row">
        {insights.moments.filter((moment) => moment.editionNumber != null).map((moment) => {
          const edition = insights.editions.find((item) => item.editionNumber === moment.editionNumber);
          return edition ? (
            <Link key={moment.id} to="/editions/$slug" params={{ slug: edition.slug }}>
              <small>{moment.kicker}</small>
              <strong>{moment.title}</strong>
              <span>Open SSC {edition.editionNumber} →</span>
            </Link>
          ) : null;
        })}
      </div>
    </SectionShell>
  );
}

function PredictionsAnniversary({ age }: { age: number }) {
  return (
    <SectionShell
      eyebrow={`${age} years behind us`}
      title={`Year ${age + 1} begins here`}
      description="Everything above is archive. Predictions is where the next chapter starts making fools of everyone in advance."
      compact
    >
      <div className="anniv-deep-share-card">
        <small>SOLARIS YEAR {age + 1}</small>
        <strong>The history book is open again.</strong>
        <span>Build a prediction now, then come back when the next result ruins it.</span>
      </div>
    </SectionShell>
  );
}

function ParticipationAnniversary({ age }: { age: number }) {
  return (
    <SectionShell
      eyebrow="The next chapter"
      title={`Be part of Solaris year ${age + 1}`}
      description="The anniversary layer stays restrained around voting and submissions. The work matters more than the confetti."
      compact
    >
      <div className="anniv-deep-badges">
        <span>Your submission joins the archive</span>
        <span>Your ballot becomes part of Solaris history</span>
        <span>Voting controls remain animation-light</span>
      </div>
    </SectionShell>
  );
}

function MySolarisStory({ insights, age }: { insights: AnniversaryArchiveInsights; age: number }) {
  const { data: account } = useMyCountryAccount();
  const snapshot = anniversaryCountrySnapshot(insights, account?.country?.id);
  if (!account?.country || !snapshot) return null;

  return (
    <SectionShell
      eyebrow="Your Solaris Story"
      title={`${account.country.name} has been part of ${snapshot.participationShare}% of the published archive`}
      description={`A personal anniversary recap built from the country linked to this MySolaris account.`}
    >
      <div className="anniv-deep-stats">
        <Stat label="First edition" value={snapshot.debutEdition ? `SSC ${snapshot.debutEdition}` : "—"} />
        <Stat label="Participations" value={snapshot.participations} detail={`of ${insights.totalEditions} published editions`} />
        <Stat label="Grand finals" value={snapshot.finals} detail={snapshot.bestRank ? `best: #${snapshot.bestRank}` : undefined} />
        <Stat label="Wins" value={snapshot.wins} />
        <Stat label="Final points" value={snapshot.totalFinalPoints.toLocaleString()} />
        <Stat label="Active streak" value={snapshot.activeStreak} detail="editions" />
      </div>
      <div className="anniv-deep-share-card anniv-deep-share-card--personal">
        <small>MY SOLARIS STORY · {age} YEARS</small>
        <strong>{account.country.name}</strong>
        <span>{snapshot.participations} editions · {snapshot.finals} finals · {snapshot.wins} wins · {snapshot.participationShare}% of published Solaris history.</span>
        <ShareButton
          text={`My Solaris Story: ${account.country.name} has taken part in ${snapshot.participations} editions, reached ${snapshot.finals} finals and won ${snapshot.wins} times across ${snapshot.participationShare}% of the published SSC archive.`}
        />
      </div>
    </SectionShell>
  );
}

function ShareButton({ text }: { text: string }) {
  const [state, setState] = useState("Share recap");
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Solaris anniversary", text });
        setState("Shared");
      } else {
        await navigator.clipboard.writeText(text);
        setState("Copied");
      }
    } catch {
      setState("Share recap");
    }
  };
  return <button type="button" onClick={share}>{state}</button>;
}

function Moment({ kicker, title, detail }: { kicker: string; title: string; detail: string }) {
  return (
    <article className="anniv-deep-card">
      <p className="anniv-deep-kicker">{kicker}</p>
      <h3>{title}</h3>
      <span>{detail}</span>
    </article>
  );
}

export function AnniversaryDeepDive({ anniversaryYear, age }: Props) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [host, setHost] = useState<HTMLElement | null>(null);
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: countries } = useCountries();

  const insights = useMemo(
    () =>
      buildAnniversaryArchiveInsights({
        anniversaryYear,
        editions: editions ?? [],
        shows: shows ?? [],
        participants: participants ?? [],
        results: results ?? [],
        countries: countries ?? [],
      }),
    [anniversaryYear, editions, shows, participants, results, countries],
  );

  useEffect(() => {
    if (pathname === "/" || pathname.startsWith("/anniversary") || pathname.startsWith("/admin")) {
      setHost(null);
      return;
    }

    const timer = window.setTimeout(() => {
      const main = document.querySelector<HTMLElement>(".app-main");
      if (!main) return;
      const mount = document.createElement("div");
      mount.className = "anniv-deep-host";

      const header = main.querySelector<HTMLElement>(".page-header");
      if (header?.parentElement) header.insertAdjacentElement("afterend", mount);
      else {
        const content = main.querySelector<HTMLElement>(".desktop-context-content") ?? main;
        content.prepend(mount);
      }
      setHost(mount);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      setHost((current) => {
        current?.remove();
        return null;
      });
    };
  }, [pathname]);

  if (!host || !insights.totalEditions) return null;

  let module: ReactNode = null;
  const countryCode = countryCodeFromPath(pathname);
  const editionSlug = editionSlugFromPath(pathname);

  if (pathname === "/editions" || pathname === "/editions/") module = <EditionTimeline insights={insights} />;
  else if (editionSlug) module = <EditionHistory insights={insights} slug={editionSlug} />;
  else if (pathname === "/countries" || pathname === "/countries/") module = <CountriesAnniversary insights={insights} />;
  else if (countryCode) module = <CountryStory insights={insights} code={countryCode} age={age} />;
  else if (pathname.startsWith("/records")) module = <RecordsAnniversary insights={insights} />;
  else if (pathname.startsWith("/results") || pathname.startsWith("/shows") || pathname.startsWith("/scorecharts")) module = <ResultsHistory insights={insights} />;
  else if (pathname.startsWith("/analysis")) module = <AnalysisAnniversary insights={insights} />;
  else if (pathname.startsWith("/relationships")) module = <RelationshipsAnniversary baseInsights={insights} anniversaryYear={anniversaryYear} />;
  else if (pathname.startsWith("/pulse")) module = <PulseAnniversary insights={insights} age={age} />;
  else if (pathname.startsWith("/compare")) module = <CompareAnniversary insights={insights} />;
  else if (pathname.startsWith("/archive-games")) module = <ArchiveChallenge age={age} />;
  else if (pathname.startsWith("/broadcast-intelligence")) module = <BroadcastAnniversary insights={insights} />;
  else if (pathname.startsWith("/predictions")) module = <PredictionsAnniversary age={age} />;
  else if (pathname.startsWith("/my-solaris")) module = <MySolarisStory insights={insights} age={age} />;
  else if (
    pathname.startsWith("/participate") ||
    pathname.startsWith("/confirmations") ||
    pathname.startsWith("/jury-voting") ||
    pathname.startsWith("/televoting") ||
    pathname.startsWith("/next-in-line")
  ) module = <ParticipationAnniversary age={age} />;

  return module ? createPortal(module, host) : null;
}
