import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import "@/anniversary-deep.css";
import { getSolarisAnniversary } from "@/lib/anniversary";
import { useMyCountryAccount } from "@/lib/country-account";
import {
  type Country,
  type Edition,
  type Participant,
  type ResultRow,
  type Show,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";

type CountryAnniversaryStats = {
  country: Country;
  participations: number;
  finals: number;
  wins: number;
  top5s: number;
  finalPoints: number;
  debutEdition: number | null;
  latestEdition: number | null;
  bestRank: number | null;
  bestScore: number | null;
};

type ArchiveSnapshot = {
  publishedEditions: Edition[];
  publishedShows: Show[];
  baseParticipants: Participant[];
  finalResults: ResultRow[];
  countryStats: CountryAnniversaryStats[];
  largestEdition: { edition: Edition; entries: number } | null;
  closestFinal: { edition: Edition | null; winner: Country | null; runnerUp: Country | null; gap: number } | null;
  highestWinner: { edition: Edition | null; country: Country | null; points: number } | null;
  biggestSplit: { edition: Edition | null; country: Country | null; difference: number; jury: number; televote: number } | null;
  years: Array<{ year: number; editions: Edition[]; entries: number; champions: string[] }>;
  strongestJuryPair: { from: Country | null; to: Country | null; points: number } | null;
};

function isFinal(show: Show) {
  return show.kind === "grand-final" || show.kind === "final";
}

function buildSnapshot({
  editions,
  shows,
  participants,
  results,
  countries,
  juryVotes,
}: {
  editions: Edition[];
  shows: Show[];
  participants: Participant[];
  results: ResultRow[];
  countries: Country[];
  juryVotes: Array<{ edition_id: string; voter_country_id: string; receiving_country_id: string; points: number }>;
}): ArchiveSnapshot {
  const publishedEditions = editions
    .filter((edition) => edition.published)
    .sort((a, b) => (a.edition_number ?? 999) - (b.edition_number ?? 999));
  const editionIds = new Set(publishedEditions.map((edition) => edition.id));
  const publishedShows = shows.filter((show) => show.published && editionIds.has(show.edition_id));
  const finalShows = publishedShows.filter(isFinal);
  const finalShowIds = new Set(finalShows.map((show) => show.id));
  const baseParticipants = participants.filter((entry) => entry.show_id == null && editionIds.has(entry.edition_id));
  const finalResults = results.filter((result) => result.show_id && finalShowIds.has(result.show_id));

  const countryMap = new Map(countries.map((country) => [country.id, country]));
  const editionMap = new Map(publishedEditions.map((edition) => [edition.id, edition]));
  const showMap = new Map(publishedShows.map((show) => [show.id, show]));

  const participantEditions = new Map<string, Set<string>>();
  for (const entry of baseParticipants) {
    if (!entry.country_id) continue;
    const set = participantEditions.get(entry.country_id) ?? new Set<string>();
    set.add(entry.edition_id);
    participantEditions.set(entry.country_id, set);
  }

  const finalsByCountry = new Map<string, Set<string>>();
  const wins = new Map<string, number>();
  const top5s = new Map<string, number>();
  const finalPoints = new Map<string, number>();
  const bestRank = new Map<string, number>();
  const bestScore = new Map<string, number>();

  for (const result of finalResults) {
    const id = result.country_id;
    if (!id || !result.show_id) continue;
    const finals = finalsByCountry.get(id) ?? new Set<string>();
    finals.add(result.show_id);
    finalsByCountry.set(id, finals);
    finalPoints.set(id, (finalPoints.get(id) ?? 0) + (result.total_points ?? 0));
    if (result.final_rank != null) {
      bestRank.set(id, Math.min(bestRank.get(id) ?? 999, result.final_rank));
      if (result.final_rank <= 5) top5s.set(id, (top5s.get(id) ?? 0) + 1);
      if (result.final_rank === 1) wins.set(id, (wins.get(id) ?? 0) + 1);
    }
    bestScore.set(id, Math.max(bestScore.get(id) ?? 0, result.total_points ?? 0));
  }

  const countryStats = countries
    .map((country) => {
      const ids = [...(participantEditions.get(country.id) ?? [])];
      const editionNumbers = ids
        .map((id) => editionMap.get(id)?.edition_number ?? null)
        .filter((value): value is number => value != null);
      return {
        country,
        participations: ids.length,
        finals: finalsByCountry.get(country.id)?.size ?? 0,
        wins: wins.get(country.id) ?? 0,
        top5s: top5s.get(country.id) ?? 0,
        finalPoints: finalPoints.get(country.id) ?? 0,
        debutEdition: editionNumbers.length ? Math.min(...editionNumbers) : country.first_participation,
        latestEdition: editionNumbers.length ? Math.max(...editionNumbers) : null,
        bestRank: bestRank.has(country.id) ? bestRank.get(country.id)! : null,
        bestScore: bestScore.has(country.id) ? bestScore.get(country.id)! : null,
      } satisfies CountryAnniversaryStats;
    })
    .filter((item) => item.participations > 0 || item.finals > 0);

  const editionEntryCounts = new Map<string, number>();
  for (const edition of publishedEditions) {
    editionEntryCounts.set(
      edition.id,
      new Set(baseParticipants.filter((entry) => entry.edition_id === edition.id).map((entry) => entry.country_id)).size,
    );
  }
  const largestEdition = publishedEditions.reduce<ArchiveSnapshot["largestEdition"]>((best, edition) => {
    const entries = editionEntryCounts.get(edition.id) ?? 0;
    if (!best || entries > best.entries) return { edition, entries };
    return best;
  }, null);

  let closestFinal: ArchiveSnapshot["closestFinal"] = null;
  let highestWinner: ArchiveSnapshot["highestWinner"] = null;
  let biggestSplit: ArchiveSnapshot["biggestSplit"] = null;

  for (const show of finalShows) {
    const ranking = finalResults
      .filter((result) => result.show_id === show.id && result.final_rank != null)
      .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999));
    const winner = ranking[0];
    const runnerUp = ranking[1];
    if (winner?.final_rank === 1) {
      const edition = editionMap.get(show.edition_id) ?? null;
      if (!highestWinner || winner.total_points > highestWinner.points) {
        highestWinner = { edition, country: countryMap.get(winner.country_id) ?? null, points: winner.total_points };
      }
      if (runnerUp) {
        const gap = Math.max(0, winner.total_points - runnerUp.total_points);
        if (!closestFinal || gap < closestFinal.gap) {
          closestFinal = {
            edition,
            winner: countryMap.get(winner.country_id) ?? null,
            runnerUp: countryMap.get(runnerUp.country_id) ?? null,
            gap,
          };
        }
      }
    }
  }

  for (const result of finalResults) {
    const difference = Math.abs((result.jury_points ?? 0) - (result.televote_points ?? 0));
    if (!biggestSplit || difference > biggestSplit.difference) {
      const show = result.show_id ? showMap.get(result.show_id) : null;
      biggestSplit = {
        edition: show ? editionMap.get(show.edition_id) ?? null : editionMap.get(result.edition_id) ?? null,
        country: countryMap.get(result.country_id) ?? null,
        difference,
        jury: result.jury_points ?? 0,
        televote: result.televote_points ?? 0,
      };
    }
  }

  const years = [...new Set(publishedEditions.map((edition) => edition.year).filter((year): year is number => year != null))]
    .sort((a, b) => a - b)
    .map((year) => {
      const yearEditions = publishedEditions.filter((edition) => edition.year === year);
      const yearIds = new Set(yearEditions.map((edition) => edition.id));
      const entries = new Set(baseParticipants.filter((entry) => yearIds.has(entry.edition_id)).map((entry) => `${entry.edition_id}:${entry.country_id}`)).size;
      const champions = finalResults
        .filter((result) => result.final_rank === 1 && yearIds.has(result.edition_id))
        .map((result) => countryMap.get(result.country_id)?.name)
        .filter((name): name is string => Boolean(name));
      return { year, editions: yearEditions, entries, champions: [...new Set(champions)] };
    });

  const juryPairTotals = new Map<string, number>();
  for (const vote of juryVotes) {
    if (!editionIds.has(vote.edition_id)) continue;
    if (!vote.voter_country_id || !vote.receiving_country_id || vote.voter_country_id === vote.receiving_country_id) continue;
    const key = `${vote.voter_country_id}:${vote.receiving_country_id}`;
    juryPairTotals.set(key, (juryPairTotals.get(key) ?? 0) + vote.points);
  }
  let strongestJuryPair: ArchiveSnapshot["strongestJuryPair"] = null;
  for (const [key, points] of juryPairTotals) {
    if (!strongestJuryPair || points > strongestJuryPair.points) {
      const [from, to] = key.split(":");
      strongestJuryPair = { from: countryMap.get(from) ?? null, to: countryMap.get(to) ?? null, points };
    }
  }

  return {
    publishedEditions,
    publishedShows,
    baseParticipants,
    finalResults,
    countryStats,
    largestEdition,
    closestFinal,
    highestWinner,
    biggestSplit,
    years,
    strongestJuryPair,
  };
}

function editionLabel(edition?: Edition | null) {
  if (!edition) return "SSC";
  return edition.edition_number != null ? `SSC ${edition.edition_number}` : edition.name;
}

function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <article className="anniversary-deep-card">
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  );
}

function RankingList({ title, items, value }: { title: string; items: CountryAnniversaryStats[]; value: (item: CountryAnniversaryStats) => string | number }) {
  return (
    <div className="anniversary-deep-ranking">
      <h3>{title}</h3>
      <ol>
        {items.slice(0, 5).map((item, index) => (
          <li key={item.country.id}>
            <b>{index + 1}</b>
            <span>{item.country.name}</span>
            <strong>{value(item)}</strong>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AnniversaryDeepExperience() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [host, setHost] = useState<HTMLElement | null>(null);
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: countries } = useCountries();
  const { data: juryVotes } = useAllJuryVotes();

  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".app-main");
    if (!main) return;
    const mount = document.createElement("div");
    mount.className = "anniversary-deep-host";
    const header = main.querySelector(".page-header");
    if (header?.nextSibling) main.insertBefore(mount, header.nextSibling);
    else main.prepend(mount);
    setHost(mount);
    return () => {
      setHost(null);
      mount.remove();
    };
  }, [pathname]);

  const snapshot = useMemo(
    () =>
      buildSnapshot({
        editions: editions ?? [],
        shows: shows ?? [],
        participants: participants ?? [],
        results: results ?? [],
        countries: countries ?? [],
        juryVotes: juryVotes ?? [],
      }),
    [editions, shows, participants, results, countries, juryVotes],
  );

  if (!host || pathname === "/" || pathname.startsWith("/anniversary") || pathname.startsWith("/admin") || pathname.startsWith("/confirmations/admin") || pathname.startsWith("/televoting/admin")) {
    return null;
  }

  return createPortal(<AnniversaryRouteModule pathname={pathname} snapshot={snapshot} />, host);
}

function AnniversaryRouteModule({ pathname, snapshot }: { pathname: string; snapshot: ArchiveSnapshot }) {
  const anniversary = getSolarisAnniversary();
  const countryCodeMatch = pathname.match(/^\/(?:countries|wiki)\/([^/]+)/i);
  const country = countryCodeMatch
    ? snapshot.countryStats.find((item) => item.country.short_code.toLowerCase() === decodeURIComponent(countryCodeMatch[1]).toLowerCase()) ?? null
    : null;

  if (pathname === "/editions" || pathname === "/editions/") {
    return (
      <section className="anniversary-deep-block anniversary-deep-block--timeline">
        <Header eyebrow="Four years, edition by edition" title="The Solaris timeline" text="The archive now reads as one continuous anniversary story rather than a pile of unrelated edition cards." />
        <div className="anniversary-deep-years">
          {snapshot.years.map((year) => (
            <div key={year.year} className="anniversary-deep-year">
              <strong>{year.year}</strong>
              <span>{year.editions.map((edition) => editionLabel(edition)).join(" · ") || "Archive year"}</span>
              <small>{year.entries} entries{year.champions.length ? ` · champions: ${year.champions.join(", ")}` : ""}</small>
            </div>
          ))}
        </div>
        <div className="anniversary-deep-grid compact">
          <StatCard label="First published chapter" value={editionLabel(snapshot.publishedEditions[0])} />
          <StatCard label="Latest published chapter" value={editionLabel(snapshot.publishedEditions.at(-1))} />
          <StatCard label="Largest edition" value={snapshot.largestEdition ? editionLabel(snapshot.largestEdition.edition) : "—"} detail={snapshot.largestEdition ? `${snapshot.largestEdition.entries} entries` : undefined} />
        </div>
      </section>
    );
  }

  if (pathname.startsWith("/editions/") && snapshot.publishedEditions.length) {
    const slug = pathname.split("/").filter(Boolean)[1];
    const edition = snapshot.publishedEditions.find((item) => item.slug === slug || String(item.edition_number) === slug) ?? null;
    if (!edition) return null;
    const entryCount = new Set(snapshot.baseParticipants.filter((entry) => entry.edition_id === edition.id).map((entry) => entry.country_id)).size;
    const final = snapshot.finalResults.filter((result) => result.edition_id === edition.id).sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999));
    const winner = final.find((result) => result.final_rank === 1);
    const winnerCountry = snapshot.countryStats.find((item) => item.country.id === winner?.country_id)?.country;
    return (
      <section className="anniversary-deep-block">
        <Header eyebrow="This edition in Solaris history" title={`${editionLabel(edition)} is chapter ${edition.edition_number ?? "?"} of the archive`} text="A compact anniversary snapshot places this edition inside the wider contest history." />
        <div className="anniversary-deep-grid compact">
          <StatCard label="Field" value={entryCount} detail="participating countries" />
          <StatCard label="Champion" value={winnerCountry?.name ?? "—"} detail={winner ? `${winner.total_points} points` : undefined} />
          <StatCard label="Year" value={edition.year ?? "—"} />
        </div>
      </section>
    );
  }

  if ((pathname === "/countries" || pathname === "/countries/") && snapshot.countryStats.length) {
    return (
      <section className="anniversary-deep-block">
        <Header eyebrow="Four years of delegations" title="The anniversary delegation table" text="The countries directory now shows who has accumulated the strongest historical footprint across published SSC history." />
        <div className="anniversary-deep-rankings">
          <RankingList title="Most participations" items={[...snapshot.countryStats].sort((a, b) => b.participations - a.participations)} value={(item) => item.participations} />
          <RankingList title="Most wins" items={[...snapshot.countryStats].sort((a, b) => b.wins - a.wins || b.top5s - a.top5s)} value={(item) => item.wins} />
          <RankingList title="Most finals" items={[...snapshot.countryStats].sort((a, b) => b.finals - a.finals)} value={(item) => item.finals} />
        </div>
      </section>
    );
  }

  if (country) {
    const percentage = snapshot.publishedEditions.length ? Math.round((country.participations / snapshot.publishedEditions.length) * 100) : 0;
    return (
      <section className="anniversary-deep-block anniversary-deep-block--country">
        <Header eyebrow={`${country.country.name} in the anniversary archive`} title={`${country.country.name} has been part of ${percentage}% of published Solaris history`} text="Debut, finals, wins and best results are calculated from the public archive rather than hard-coded anniversary copy." />
        <div className="anniversary-deep-grid">
          <StatCard label="Debut" value={country.debutEdition ? `SSC ${country.debutEdition}` : "—"} />
          <StatCard label="Participations" value={country.participations} />
          <StatCard label="Grand finals" value={country.finals} />
          <StatCard label="Wins" value={country.wins} />
          <StatCard label="Best result" value={country.bestRank ? `#${country.bestRank}` : "—"} />
          <StatCard label="Best score" value={country.bestScore ?? "—"} detail={country.bestScore != null ? "final points" : undefined} />
        </div>
      </section>
    );
  }

  if (pathname.startsWith("/records") || pathname.startsWith("/results") || pathname.startsWith("/shows")) {
    return (
      <section className="anniversary-deep-block">
        <Header eyebrow="Four years on the scoreboard" title="Historic result moments" text="Anniversary Day surfaces the results that still define the archive." />
        <div className="anniversary-deep-grid">
          <StatCard label="Closest final" value={snapshot.closestFinal ? `${snapshot.closestFinal.gap} pts` : "—"} detail={snapshot.closestFinal ? `${editionLabel(snapshot.closestFinal.edition)} · ${snapshot.closestFinal.winner?.name ?? "Winner"} vs ${snapshot.closestFinal.runnerUp?.name ?? "runner-up"}` : undefined} />
          <StatCard label="Highest winning score" value={snapshot.highestWinner?.points ?? "—"} detail={snapshot.highestWinner ? `${snapshot.highestWinner.country?.name ?? "Winner"} · ${editionLabel(snapshot.highestWinner.edition)}` : undefined} />
          <StatCard label="Largest jury/televote split" value={snapshot.biggestSplit?.difference ?? "—"} detail={snapshot.biggestSplit ? `${snapshot.biggestSplit.country?.name ?? "Entry"} · J ${snapshot.biggestSplit.jury} / T ${snapshot.biggestSplit.televote}` : undefined} />
        </div>
      </section>
    );
  }

  if (pathname.startsWith("/analysis")) {
    const first = snapshot.years[0];
    const latest = snapshot.years.at(-1);
    return (
      <section className="anniversary-deep-block">
        <Header eyebrow="How Solaris changed" title="First archive year vs latest archive year" text="A quick anniversary comparison shows how much the contest archive has expanded." />
        <div className="anniversary-deep-grid compact">
          <StatCard label={first ? `${first.year} entries` : "First year"} value={first?.entries ?? "—"} detail={first ? `${first.editions.length} edition${first.editions.length === 1 ? "" : "s"}` : undefined} />
          <StatCard label={latest ? `${latest.year} entries` : "Latest year"} value={latest?.entries ?? "—"} detail={latest ? `${latest.editions.length} edition${latest.editions.length === 1 ? "" : "s"}` : undefined} />
          <StatCard label="Published chapters" value={snapshot.publishedEditions.length} />
        </div>
      </section>
    );
  }

  if (pathname.startsWith("/relationships")) {
    return (
      <section className="anniversary-deep-block">
        <Header eyebrow="Four years of voting relationships" title="The strongest accumulated jury connection" text="This is a historical points relationship, not a misconduct finding. Humans can remain dramatic without the software accusing them of conspiracy." />
        <div className="anniversary-deep-grid compact">
          <StatCard label="Strongest one-way jury total" value={snapshot.strongestJuryPair?.points ?? "—"} detail={snapshot.strongestJuryPair ? `${snapshot.strongestJuryPair.from?.name ?? "Country"} → ${snapshot.strongestJuryPair.to?.name ?? "Country"}` : undefined} />
          <StatCard label="Countries in archive" value={snapshot.countryStats.length} />
          <StatCard label="Published finals" value={new Set(snapshot.finalResults.map((result) => result.show_id)).size} />
        </div>
      </section>
    );
  }

  if (pathname.startsWith("/pulse")) {
    return (
      <section className="anniversary-deep-block anniversary-deep-block--timeline">
        <Header eyebrow="On this anniversary" title="Solaris history by year" text="Pulse gains an anniversary history strip so the live feed sits beside the contest's longer memory." />
        <div className="anniversary-deep-years">
          {snapshot.years.map((year) => (
            <div key={year.year} className="anniversary-deep-year">
              <strong>{year.year}</strong>
              <span>{year.editions.length} edition{year.editions.length === 1 ? "" : "s"} · {year.entries} entries</span>
              <small>{year.champions.length ? `Champions: ${year.champions.join(", ")}` : "Archive chapter"}</small>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (pathname.startsWith("/archive-games")) {
    return (
      <section className="anniversary-deep-block anniversary-deep-block--play">
        <Header eyebrow={`${anniversary.age} Years Challenge`} title="Anniversary Archive Games" text="Use every game mode as one birthday challenge. Your session score earns an anniversary rank below." />
        <div className="anniversary-deep-rank-badges">
          <span>0–4 · Casual Viewer</span><span>5–9 · Delegation Intern</span><span>10–14 · Scoreboard Addict</span><span>15–19 · Solaris Historian</span><span>20+ · Living Archive</span>
        </div>
      </section>
    );
  }

  if (pathname.startsWith("/taste-dna")) {
    return <ToolAnniversary eyebrow="Which Solaris era matches your taste?" title="Anniversary Taste DNA" text="Compare your ranking against published shows from different Solaris years. The edition selector below becomes your era switcher: test one show from each year and see where your strongest Jury, Televote or Overall match appears." links={[{ to: "/editions", label: "Browse eras" }, { to: "/records", label: "Compare with records" }]} />;
  }

  if (pathname.startsWith("/result-lab")) {
    return <ToolAnniversary eyebrow="Anniversary scenarios" title="Replay history under different assumptions" text="Use Result Lab with historic finals: jury-only, televote-only and alternate weighting scenarios turn famous results into anniversary experiments." links={[{ to: "/results", label: "Choose a historic result" }, { to: "/anniversary", label: "Anniversary hub" }]} />;
  }

  if (pathname.startsWith("/broadcast-intelligence")) {
    return <ToolAnniversary eyebrow="Anniversary replay" title="Relive the scoreboard turning points" text="Start with the closest final or highest-scoring winner from the archive and replay how the final ranking formed." links={[{ to: "/records", label: "Open historic records" }, { to: "/results", label: "Choose a final" }]} />;
  }

  if (pathname.startsWith("/compare")) {
    const leaders = [...snapshot.countryStats].sort((a, b) => b.wins - a.wins || b.finalPoints - a.finalPoints).slice(0, 2);
    return <ToolAnniversary eyebrow="Across four years" title="Anniversary comparison preset" text={leaders.length === 2 ? `A natural anniversary comparison is ${leaders[0].country.name} vs ${leaders[1].country.name}, the leading historical pair by wins and final points.` : "Compare long-running delegations across their entire published history."} links={[{ to: "/countries", label: "Choose delegations" }]} />;
  }

  if (pathname.startsWith("/predictions")) {
    return <ToolAnniversary eyebrow="Year five begins here" title="The archive stops at today. Predictions start tomorrow." text="Use four years of historical patterns as context, then predict which delegation writes the next chapter." links={[{ to: "/analysis", label: "Review four-year trends" }, { to: "/records", label: "See records to beat" }]} />;
  }

  if (pathname.startsWith("/my-solaris") || pathname.startsWith("/country-hub") || pathname.startsWith("/me")) {
    return <PersonalAnniversaryStory snapshot={snapshot} />;
  }

  if (pathname.startsWith("/participate") || pathname.startsWith("/confirmations") || pathname.startsWith("/jury-voting") || pathname.startsWith("/televoting") || pathname.startsWith("/next-in-line")) {
    return (
      <section className="anniversary-deep-block anniversary-deep-block--restrained">
        <Header eyebrow="The next chapter" title={`Be part of Solaris year ${anniversary.age + 1}`} text="What you submit or vote today becomes tomorrow's archive. The anniversary treatment stays intentionally quiet here so the actual task remains obvious." />
      </section>
    );
  }

  return null;
}

function PersonalAnniversaryStory({ snapshot }: { snapshot: ArchiveSnapshot }) {
  const { data: account } = useMyCountryAccount();
  const country = snapshot.countryStats.find((item) => item.country.id === account?.country?.id) ?? null;
  if (!country) return null;
  const percentage = snapshot.publishedEditions.length ? Math.round((country.participations / snapshot.publishedEditions.length) * 100) : 0;
  return (
    <section className="anniversary-deep-block anniversary-deep-block--personal">
      <Header eyebrow="Your Solaris Story" title={`${country.country.name} has been part of ${percentage}% of published Solaris history`} text="Your anniversary recap is calculated from the country account and public archive." />
      <div className="anniversary-deep-grid">
        <StatCard label="First edition" value={country.debutEdition ? `SSC ${country.debutEdition}` : "—"} />
        <StatCard label="Participations" value={country.participations} />
        <StatCard label="Grand finals" value={country.finals} />
        <StatCard label="Wins" value={country.wins} />
        <StatCard label="Top 5s" value={country.top5s} />
        <StatCard label="Best score" value={country.bestScore ?? "—"} />
      </div>
      <div className="anniversary-deep-shareline">✦ {country.country.name} · {country.participations} participations · {country.wins} win{country.wins === 1 ? "" : "s"} · Solaris Anniversary</div>
    </section>
  );
}

function Header({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="anniversary-deep-head">
      <p>✦ {eyebrow}</p>
      <h2>{title}</h2>
      <span>{text}</span>
    </div>
  );
}

function ToolAnniversary({ eyebrow, title, text, links }: { eyebrow: string; title: string; text: string; links: Array<{ to: string; label: string }> }) {
  return (
    <section className="anniversary-deep-block anniversary-deep-block--tool">
      <Header eyebrow={eyebrow} title={title} text={text} />
      <div className="anniversary-deep-actions">
        {links.map((link) => <Link key={link.to} to={link.to as any}>{link.label} →</Link>)}
      </div>
    </section>
  );
}
