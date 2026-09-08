import { useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { getSolarisAnniversary } from "@/lib/anniversary";
import {
  type Country,
  type Edition,
  type ResultRow,
  type Show,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";

type CountryStanding = {
  country: Country;
  participations: number;
  finals: number;
  wins: number;
  runnerUps: number;
  top5s: number;
  finalPoints: number;
  score: number;
};

type FinalMoment = {
  show: Show;
  edition: Edition | null;
  winner: ResultRow;
  runnerUp: ResultRow | null;
  margin: number | null;
};

type YearMetrics = {
  year: number;
  editions: number;
  entries: number;
  countries: number;
  finals: number;
  averageWinnerScore: number | null;
  averageMargin: number | null;
  champions: number;
};

function editionLabel(edition?: Edition | null) {
  if (!edition) return "SSC";
  return edition.edition_number != null ? `SSC ${edition.edition_number}` : edition.name;
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
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

function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <article className="anniversary-deep-card">
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  );
}

export function AnniversaryCompletionExperience() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [host, setHost] = useState<HTMLElement | null>(null);
  const { data: editions = [] } = useEditions();
  const { data: shows = [] } = useAllShows();
  const { data: participants = [] } = useAllParticipants();
  const { data: results = [] } = useAllResults();
  const { data: countries = [] } = useCountries();
  const { data: juryVotes = [] } = useAllJuryVotes();
  const anniversary = useMemo(() => getSolarisAnniversary(), []);

  const relevant =
    pathname.startsWith("/records") ||
    pathname.startsWith("/analysis") ||
    pathname.startsWith("/relationships") ||
    pathname === "/countries" ||
    pathname === "/countries/" ||
    pathname.startsWith("/shows/");

  useEffect(() => {
    if (!relevant) {
      setHost(null);
      return;
    }
    const main = document.querySelector<HTMLElement>(".app-main");
    if (!main) return;
    const mount = document.createElement("div");
    mount.className = "anniversary-completion-host";
    main.appendChild(mount);
    setHost(mount);
    return () => {
      setHost(null);
      mount.remove();
    };
  }, [pathname, relevant]);

  const model = useMemo(() => {
    const publishedEditions = editions
      .filter((edition) => edition.published)
      .sort((a, b) => (a.edition_number ?? 999) - (b.edition_number ?? 999));
    const editionMap = new Map(publishedEditions.map((edition) => [edition.id, edition]));
    const countryMap = new Map(countries.map((country) => [country.id, country]));
    const publishedShows = shows.filter((show) => show.published && editionMap.has(show.edition_id));
    const finalShows = publishedShows.filter((show) => show.kind === "grand-final" || show.kind === "final");
    const finalShowIds = new Set(finalShows.map((show) => show.id));
    const showMap = new Map(finalShows.map((show) => [show.id, show]));
    const finalResults = results.filter((result) => result.show_id && finalShowIds.has(result.show_id));
    const baseParticipants = participants.filter((entry) => entry.show_id == null && editionMap.has(entry.edition_id));

    const finalMoments: FinalMoment[] = [];
    for (const show of finalShows) {
      const ranking = finalResults
        .filter((result) => result.show_id === show.id && result.final_rank != null)
        .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999));
      const winner = ranking.find((result) => result.final_rank === 1);
      if (!winner) continue;
      const runnerUp = ranking.find((result) => result.final_rank === 2) ?? null;
      finalMoments.push({
        show,
        edition: editionMap.get(show.edition_id) ?? null,
        winner,
        runnerUp,
        margin: runnerUp ? Math.max(0, (winner.total_points ?? 0) - (runnerUp.total_points ?? 0)) : null,
      });
    }

    const highestWinner = [...finalMoments].sort(
      (a, b) => (b.winner.total_points ?? 0) - (a.winner.total_points ?? 0),
    )[0] ?? null;
    const closestFinal = finalMoments
      .filter((moment) => moment.margin != null)
      .sort((a, b) => (a.margin ?? 999999) - (b.margin ?? 999999))[0] ?? null;
    const largestMargin = finalMoments
      .filter((moment) => moment.margin != null)
      .sort((a, b) => (b.margin ?? -1) - (a.margin ?? -1))[0] ?? null;

    const editionFields = publishedEditions.map((edition) => ({
      edition,
      entries: new Set(
        baseParticipants.filter((entry) => entry.edition_id === edition.id).map((entry) => entry.country_id),
      ).size,
    }));
    const largestField = [...editionFields].sort((a, b) => b.entries - a.entries)[0] ?? null;

    const currentRecordCandidates = [
      highestWinner
        ? {
            label: "Highest winning score",
            edition: highestWinner.edition,
            value: `${highestWinner.winner.total_points ?? 0} pts`,
          }
        : null,
      largestMargin
        ? {
            label: "Largest winning margin",
            edition: largestMargin.edition,
            value: `${largestMargin.margin ?? 0} pts`,
          }
        : null,
      largestField
        ? {
            label: "Largest edition field",
            edition: largestField.edition,
            value: `${largestField.entries} entries`,
          }
        : null,
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));
    const oldestStanding = [...currentRecordCandidates].sort(
      (a, b) => (a.edition?.edition_number ?? 999) - (b.edition?.edition_number ?? 999),
    )[0] ?? null;

    const latestArchiveYear = Math.max(
      ...publishedEditions.map((edition) => edition.year ?? 0).filter((year) => year > 0),
      0,
    );
    const latestYearIds = new Set(
      publishedEditions.filter((edition) => edition.year === latestArchiveYear).map((edition) => edition.id),
    );
    const latestYearMoments = finalMoments.filter((moment) => latestYearIds.has(moment.show.edition_id));
    const latestYearHighest = [...latestYearMoments].sort(
      (a, b) => (b.winner.total_points ?? 0) - (a.winner.total_points ?? 0),
    )[0] ?? null;
    const latestYearClosest = latestYearMoments
      .filter((moment) => moment.margin != null)
      .sort((a, b) => (a.margin ?? 999999) - (b.margin ?? 999999))[0] ?? null;

    const standingByCountry = new Map<
      string,
      { participations: Set<string>; finals: Set<string>; wins: number; runnerUps: number; top5s: number; points: number }
    >();
    for (const entry of baseParticipants) {
      if (!entry.country_id) continue;
      const stat = standingByCountry.get(entry.country_id) ?? {
        participations: new Set<string>(),
        finals: new Set<string>(),
        wins: 0,
        runnerUps: 0,
        top5s: 0,
        points: 0,
      };
      stat.participations.add(entry.edition_id);
      standingByCountry.set(entry.country_id, stat);
    }
    for (const result of finalResults) {
      if (!result.country_id || !result.show_id) continue;
      const stat = standingByCountry.get(result.country_id) ?? {
        participations: new Set<string>(),
        finals: new Set<string>(),
        wins: 0,
        runnerUps: 0,
        top5s: 0,
        points: 0,
      };
      stat.finals.add(result.show_id);
      stat.points += result.total_points ?? 0;
      if (result.final_rank === 1) stat.wins += 1;
      if (result.final_rank === 2) stat.runnerUps += 1;
      if (result.final_rank != null && result.final_rank <= 5) stat.top5s += 1;
      standingByCountry.set(result.country_id, stat);
    }
    const standings: CountryStanding[] = [...standingByCountry.entries()]
      .map(([countryId, stat]) => {
        const country = countryMap.get(countryId);
        if (!country) return null;
        const participations = stat.participations.size;
        const finals = stat.finals.size;
        const score =
          stat.wins * 100 +
          stat.runnerUps * 40 +
          stat.top5s * 15 +
          finals * 5 +
          participations;
        return {
          country,
          participations,
          finals,
          wins: stat.wins,
          runnerUps: stat.runnerUps,
          top5s: stat.top5s,
          finalPoints: stat.points,
          score,
        };
      })
      .filter((item): item is CountryStanding => Boolean(item))
      .sort((a, b) => b.score - a.score || b.finalPoints - a.finalPoints || a.country.name.localeCompare(b.country.name));

    const years = [...new Set(publishedEditions.map((edition) => edition.year).filter((year): year is number => year != null))]
      .sort((a, b) => a - b);
    const metricsByYear: YearMetrics[] = years.map((year) => {
      const yearEditions = publishedEditions.filter((edition) => edition.year === year);
      const yearIds = new Set(yearEditions.map((edition) => edition.id));
      const yearEntries = baseParticipants.filter((entry) => yearIds.has(entry.edition_id));
      const moments = finalMoments.filter((moment) => yearIds.has(moment.show.edition_id));
      return {
        year,
        editions: yearEditions.length,
        entries: new Set(yearEntries.map((entry) => `${entry.edition_id}:${entry.country_id}`)).size,
        countries: new Set(yearEntries.map((entry) => entry.country_id).filter(Boolean)).size,
        finals: moments.length,
        averageWinnerScore: average(moments.map((moment) => moment.winner.total_points ?? 0)),
        averageMargin: average(moments.map((moment) => moment.margin).filter((value): value is number => value != null)),
        champions: new Set(moments.map((moment) => moment.winner.country_id)).size,
      };
    });

    const oneWay = new Map<string, number>();
    for (const vote of juryVotes) {
      if (!vote.voter_country_id || !vote.receiving_country_id || vote.voter_country_id === vote.receiving_country_id) continue;
      const key = `${vote.voter_country_id}:${vote.receiving_country_id}`;
      oneWay.set(key, (oneWay.get(key) ?? 0) + vote.points);
    }
    const strongestOneWay = [...oneWay.entries()]
      .map(([key, points]) => {
        const [from, to] = key.split(":");
        return { from, to, points };
      })
      .sort((a, b) => b.points - a.points)[0] ?? null;

    const unorderedPairs = new Map<string, { a: string; b: string; ab: number; ba: number }>();
    for (const [key, points] of oneWay) {
      const [from, to] = key.split(":");
      const [a, b] = [from, to].sort();
      const pairKey = `${a}:${b}`;
      const pair = unorderedPairs.get(pairKey) ?? { a, b, ab: 0, ba: 0 };
      if (from === a) pair.ab += points;
      else pair.ba += points;
      unorderedPairs.set(pairKey, pair);
    }
    const strongestMutual = [...unorderedPairs.values()]
      .filter((pair) => pair.ab > 0 && pair.ba > 0)
      .sort((a, b) => (b.ab + b.ba) - (a.ab + a.ba))[0] ?? null;
    const mostOneSided = [...unorderedPairs.values()]
      .sort((a, b) => Math.abs(b.ab - b.ba) - Math.abs(a.ab - a.ba))[0] ?? null;

    return {
      countryMap,
      showMap,
      highestWinner,
      closestFinal,
      largestMargin,
      oldestStanding,
      latestArchiveYear,
      latestYearHighest,
      latestYearClosest,
      standings,
      metricsByYear,
      strongestOneWay,
      strongestMutual,
      mostOneSided,
    };
  }, [countries, editions, juryVotes, participants, results, shows]);

  if (!host) return null;

  let content: React.ReactNode = null;

  if (pathname.startsWith("/records")) {
    content = (
      <>
        <section className="anniversary-deep-block">
          <Header
            eyebrow="All-time / latest year / still standing"
            title="The anniversary record book, properly separated"
            text="All-time marks, the latest archive year and the oldest surviving headline record are shown separately instead of being mashed into one decorative card row."
          />
          <div className="anniversary-deep-grid">
            <StatCard
              label="All-time winning score"
              value={model.highestWinner?.winner.total_points ?? "—"}
              detail={model.highestWinner ? `${model.countryMap.get(model.highestWinner.winner.country_id)?.name ?? "Winner"} · ${editionLabel(model.highestWinner.edition)}` : undefined}
            />
            <StatCard
              label="All-time closest final"
              value={model.closestFinal?.margin != null ? `${model.closestFinal.margin} pts` : "—"}
              detail={model.closestFinal ? editionLabel(model.closestFinal.edition) : undefined}
            />
            <StatCard
              label="All-time largest margin"
              value={model.largestMargin?.margin != null ? `${model.largestMargin.margin} pts` : "—"}
              detail={model.largestMargin ? editionLabel(model.largestMargin.edition) : undefined}
            />
            <StatCard
              label={`Solaris ${model.latestArchiveYear} winning score`}
              value={model.latestYearHighest?.winner.total_points ?? "—"}
              detail={model.latestYearHighest ? `${model.countryMap.get(model.latestYearHighest.winner.country_id)?.name ?? "Winner"} · ${editionLabel(model.latestYearHighest.edition)}` : undefined}
            />
            <StatCard
              label={`Solaris ${model.latestArchiveYear} closest final`}
              value={model.latestYearClosest?.margin != null ? `${model.latestYearClosest.margin} pts` : "—"}
              detail={model.latestYearClosest ? editionLabel(model.latestYearClosest.edition) : undefined}
            />
            <StatCard
              label="Oldest standing headline record"
              value={model.oldestStanding?.value ?? "—"}
              detail={model.oldestStanding ? `${model.oldestStanding.label} · ${editionLabel(model.oldestStanding.edition)}` : undefined}
            />
          </div>
        </section>
      </>
    );
  } else if (pathname === "/countries" || pathname === "/countries/") {
    content = (
      <section className="anniversary-deep-block">
        <Header
          eyebrow="Anniversary all-time table"
          title="Solaris historical ranking"
          text="An anniversary-only historical index. It is deliberately labelled as a derived ranking, not an official contest championship."
        />
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.025]">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="border-b border-white/10 text-[10px] uppercase tracking-[0.12em] text-white/45">
              <tr>
                <th className="px-3 py-3">#</th><th className="px-3 py-3">Delegation</th><th className="px-3 py-3">Wins</th><th className="px-3 py-3">Runner-up</th><th className="px-3 py-3">Top 5</th><th className="px-3 py-3">Finals</th><th className="px-3 py-3">Apps</th><th className="px-3 py-3">Index</th>
              </tr>
            </thead>
            <tbody>
              {model.standings.slice(0, 10).map((item, index) => (
                <tr key={item.country.id} className="border-b border-white/[0.06] last:border-0">
                  <td className="px-3 py-3 font-black text-amber-100">{index + 1}</td>
                  <td className="px-3 py-3 font-semibold text-white">{item.country.name}</td>
                  <td className="px-3 py-3">{item.wins}</td>
                  <td className="px-3 py-3">{item.runnerUps}</td>
                  <td className="px-3 py-3">{item.top5s}</td>
                  <td className="px-3 py-3">{item.finals}</td>
                  <td className="px-3 py-3">{item.participations}</td>
                  <td className="px-3 py-3 font-bold">{item.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-white/35">Index: win 100 · runner-up 40 · top-five finish 15 · final 5 · participation 1. This is an anniversary exploration metric only.</p>
      </section>
    );
  } else if (pathname.startsWith("/analysis")) {
    const first = model.metricsByYear[0] ?? null;
    const latest = model.metricsByYear.at(-1) ?? null;
    content = (
      <section className="anniversary-deep-block">
        <Header
          eyebrow="How Solaris changed"
          title={first && latest ? `${first.year} vs ${latest.year}` : "First archive year vs latest"}
          text="The comparison now covers competitiveness and participation, not just a single entry-count number."
        />
        <div className="anniversary-deep-grid">
          <StatCard label="Entries" value={first && latest ? `${first.entries} → ${latest.entries}` : "—"} />
          <StatCard label="Countries" value={first && latest ? `${first.countries} → ${latest.countries}` : "—"} />
          <StatCard label="Finals" value={first && latest ? `${first.finals} → ${latest.finals}` : "—"} />
          <StatCard label="Average winning score" value={first && latest ? `${first.averageWinnerScore ?? "—"} → ${latest.averageWinnerScore ?? "—"}` : "—"} />
          <StatCard label="Average winning margin" value={first && latest ? `${first.averageMargin ?? "—"} → ${latest.averageMargin ?? "—"}` : "—"} />
          <StatCard label="Unique champions" value={first && latest ? `${first.champions} → ${latest.champions}` : "—"} />
        </div>
      </section>
    );
  } else if (pathname.startsWith("/relationships")) {
    const mutual = model.strongestMutual;
    const oneSided = model.mostOneSided;
    content = (
      <section className="anniversary-deep-block">
        <Header
          eyebrow={`${anniversary.age} years of relationships`}
          title="Mutual, one-way and one-sided historical connections"
          text="These are accumulated published jury-point relationships, not fraud labels or misconduct findings. The software can count without becoming a tabloid."
        />
        <div className="anniversary-deep-grid">
          <StatCard
            label="Strongest one-way total"
            value={model.strongestOneWay?.points ?? "—"}
            detail={model.strongestOneWay ? `${model.countryMap.get(model.strongestOneWay.from)?.name ?? "Country"} → ${model.countryMap.get(model.strongestOneWay.to)?.name ?? "Country"}` : undefined}
          />
          <StatCard
            label="Strongest mutual pair"
            value={mutual ? mutual.ab + mutual.ba : "—"}
            detail={mutual ? `${model.countryMap.get(mutual.a)?.name ?? "Country"} ↔ ${model.countryMap.get(mutual.b)?.name ?? "Country"}` : undefined}
          />
          <StatCard
            label="Most one-sided pair"
            value={oneSided ? Math.abs(oneSided.ab - oneSided.ba) : "—"}
            detail={oneSided ? `${model.countryMap.get(oneSided.a)?.name ?? "Country"} ${oneSided.ab} · ${model.countryMap.get(oneSided.b)?.name ?? "Country"} ${oneSided.ba}` : undefined}
          />
        </div>
      </section>
    );
  } else if (pathname.startsWith("/shows/")) {
    const token = decodeURIComponent(pathname.split("/").filter(Boolean)[1] ?? "");
    const show = model.showMap.get(token) ?? null;
    if (show) {
      const badges: string[] = [];
      if (model.highestWinner?.show.id === show.id) badges.push("Highest-scoring final");
      if (model.closestFinal?.show.id === show.id) badges.push("Closest final");
      if (model.largestMargin?.show.id === show.id) badges.push("Largest winning margin");
      content = badges.length ? (
        <section className="anniversary-deep-block">
          <Header eyebrow="Historic show" title="This broadcast holds an anniversary record" text="Historically significant finals are marked directly on their show page." />
          <div className="anniversary-deep-rank-badges">{badges.map((badge) => <span key={badge}>{badge}</span>)}</div>
        </section>
      ) : null;
    }
  }

  return content ? createPortal(content, host) : null;
}
