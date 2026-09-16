import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AppShell } from "@/components/AppShell";
import {
  buildAnniversaryRecap,
  finalRankingIsResolved,
  getSolarisAnniversary,
  showResultsArePublished,
} from "@/lib/anniversary";
import {
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

  const publishedEditions = useMemo(
    () =>
      (editions ?? [])
        .filter((edition) => edition.published)
        .sort((a, b) => (a.edition_number ?? 999) - (b.edition_number ?? 999)),
    [editions],
  );
  const publishedEditionIds = useMemo(
    () => new Set(publishedEditions.map((edition) => edition.id)),
    [publishedEditions],
  );
  const allTimeShows = useMemo(
    () => (shows ?? []).filter((show) => show.published && publishedEditionIds.has(show.edition_id)),
    [shows, publishedEditionIds],
  );
  const allTimeCountries = useMemo(() => {
    const realCountryIds = new Set((countries ?? []).map((country) => country.id));
    const ids = new Set(
      (participants ?? [])
        .filter(
          (entry) =>
            publishedEditionIds.has(entry.edition_id) &&
            realCountryIds.has(entry.country_id),
        )
        .map((entry) => entry.country_id),
    );
    return ids.size;
  }, [countries, participants, publishedEditionIds]);

  const anniversaryLegacy = useMemo(() => {
    const countryMap = new Map((countries ?? []).map((country) => [country.id, country]));
    const editionMap = new Map(publishedEditions.map((edition) => [edition.id, edition]));
    const finalShows = allTimeShows.filter(
      (show) =>
        (show.kind === "grand-final" || show.kind === "final") &&
        showResultsArePublished(show),
    );
    const resolvedFinalShows = finalShows.filter((show) => {
      const ranking = (results ?? [])
        .filter((result) => result.show_id === show.id && result.final_rank != null)
        .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999));
      return finalRankingIsResolved(ranking);
    });
    const finalIds = new Set(resolvedFinalShows.map((show) => show.id));
    const finalResults = (results ?? []).filter((result) => result.show_id && finalIds.has(result.show_id));
    const showMap = new Map(resolvedFinalShows.map((show) => [show.id, show]));

    let highest: typeof finalResults[number] | null = null;
    let closest: { gap: number; winner: typeof finalResults[number]; runnerUp: typeof finalResults[number] } | null = null;
    let latestWinner: typeof finalResults[number] | null = null;

    for (const show of resolvedFinalShows) {
      const ranking = finalResults
        .filter((result) => result.show_id === show.id && result.final_rank != null)
        .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999));
      const winner = ranking[0];
      const runnerUp = ranking[1];
      if (!winner || winner.final_rank !== 1) continue;
      if (!highest || winner.total_points > highest.total_points) highest = winner;
      if (runnerUp) {
        const gap = Math.max(0, winner.total_points - runnerUp.total_points);
        if (!closest || gap < closest.gap) closest = { gap, winner, runnerUp };
      }
      const currentEditionNo = editionMap.get(winner.edition_id)?.edition_number ?? -1;
      const latestEditionNo = latestWinner ? editionMap.get(latestWinner.edition_id)?.edition_number ?? -1 : -1;
      if (!latestWinner || currentEditionNo > latestEditionNo) latestWinner = winner;
    }

    const countryStats = new Map<string, { participations: Set<string>; finals: Set<string>; wins: number; points: number }>();
    for (const entry of participants ?? []) {
      if (!entry.country_id || !publishedEditionIds.has(entry.edition_id)) continue;
      const stat = countryStats.get(entry.country_id) ?? {
        participations: new Set<string>(),
        finals: new Set<string>(),
        wins: 0,
        points: 0,
      };
      stat.participations.add(entry.edition_id);
      countryStats.set(entry.country_id, stat);
    }
    for (const result of finalResults) {
      if (!result.country_id || !result.show_id) continue;
      const stat = countryStats.get(result.country_id) ?? {
        participations: new Set<string>(),
        finals: new Set<string>(),
        wins: 0,
        points: 0,
      };
      stat.finals.add(result.show_id);
      stat.points += result.total_points ?? 0;
      if (result.final_rank === 1) stat.wins += 1;
      countryStats.set(result.country_id, stat);
    }

    const delegations = [...countryStats.entries()]
      .map(([id, stat]) => ({
        country: countryMap.get(id),
        participations: stat.participations.size,
        finals: stat.finals.size,
        wins: stat.wins,
        points: stat.points,
        score: stat.wins * 100000 + stat.finals.size * 1000 + stat.participations.size * 100 + stat.points,
      }))
      .filter((item) => item.country)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    const describeResult = (result: typeof finalResults[number] | null) => {
      if (!result) return null;
      const show = result.show_id ? showMap.get(result.show_id) : null;
      const edition = show ? editionMap.get(show.edition_id) : editionMap.get(result.edition_id);
      return {
        country: countryMap.get(result.country_id)?.name ?? "Unknown country",
        edition: edition?.edition_number != null ? `SSC ${edition.edition_number}` : edition?.name ?? "SSC",
        points: result.total_points,
      };
    };

    return {
      highest: describeResult(highest),
      closest: closest
        ? {
            gap: closest.gap,
            winner: countryMap.get(closest.winner.country_id)?.name ?? "Winner",
            runnerUp: countryMap.get(closest.runnerUp.country_id)?.name ?? "Runner-up",
            edition: editionMap.get(closest.winner.edition_id)?.edition_number != null
              ? `SSC ${editionMap.get(closest.winner.edition_id)!.edition_number}`
              : editionMap.get(closest.winner.edition_id)?.name ?? "SSC",
          }
        : null,
      latestWinner: describeResult(latestWinner),
      delegations,
    };
  }, [countries, participants, results, publishedEditions, publishedEditionIds, allTimeShows]);

  const firstEdition = publishedEditions[0] ?? null;

  return (
    <AppShell>
      <div role="region" aria-label="Anniversary hub" className="anniversary-hub-shell">
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
            Solaris Song Contest began on 17 September 2022. Look back at the latest contest year, every champion, all-time records and every edition so far.
          </p>
          <div className="anniversary-hub-actions">
            <Link to="/editions" className="anniversary-hub-action primary" data-anniversary-action="major">
              Browse every edition →
            </Link>
            <Link to="/records" className="anniversary-hub-action">Open the record book</Link>
            <Link to="/archive-games" className="anniversary-hub-action">Play Archive Games</Link>
            <Link to="/countries" className="anniversary-hub-action">Explore delegations</Link>
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="all-time-heading">
          <div className="anniversary-hub-section-head">
            <div><p>Since 2022</p><h2 id="all-time-heading">{anniversary.age} years in numbers</h2></div>
          </div>
          <div className="anniversary-hub-grid">
            <HubStat label="Published editions" value={publishedEditions.length} />
            <HubStat label="Public shows" value={allTimeShows.length} />
            <HubStat label="Countries" value={allTimeCountries} />
            <HubStat label="Years of Solaris" value={anniversary.age} />
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="year-heading">
          <div className="anniversary-hub-section-head">
            <div><p>17 September {anniversary.previousYear} → today</p><h2 id="year-heading">The anniversary year</h2></div>
          </div>
          <div className="anniversary-hub-grid">
            <HubStat label="Editions" value={recap.editionCount} />
            <HubStat label="Public shows" value={recap.showCount} />
            <HubStat label="Participating countries" value={recap.countryCount} />
            <HubStat label="Entries" value={recap.entryCount} />
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="moments-heading">
          <div className="anniversary-hub-section-head">
            <div><p>Four moments</p><h2 id="moments-heading">Four moments from Solaris history</h2></div>
          </div>
          <div className="anniversary-hub-story-grid">
            <MomentCard
              number="01"
              title="Where Solaris began"
              detail={
                firstEdition
                  ? `${firstEdition.edition_number != null ? `SSC ${firstEdition.edition_number}` : firstEdition.name}${firstEdition.host_city ? ` · ${firstEdition.host_city}` : ""}`
                  : "Not available yet."
              }
            />
            <MomentCard
              number="02"
              title="The biggest winning total"
              detail={
                anniversaryLegacy.highest
                  ? `${anniversaryLegacy.highest.country} · ${anniversaryLegacy.highest.points} points · ${anniversaryLegacy.highest.edition}`
                  : "Not available yet."
              }
            />
            <article className="anniversary-hub-card">
              <small>03 · Closest final</small>
              <h3>
                {anniversaryLegacy.closest
                  ? `${anniversaryLegacy.closest.winner} vs ${anniversaryLegacy.closest.runnerUp}`
                  : "Not available yet"}
              </h3>
              <p>
                {anniversaryLegacy.closest
                  ? `${anniversaryLegacy.closest.edition} was decided by ${anniversaryLegacy.closest.gap} point${anniversaryLegacy.closest.gap === 1 ? "" : "s"}.`
                  : "No final to show yet."}
              </p>
            </article>
            <MomentCard
              number="04"
              title="The latest champion"
              detail={
                anniversaryLegacy.latestWinner
                  ? `${anniversaryLegacy.latestWinner.country} · ${anniversaryLegacy.latestWinner.edition} · ${anniversaryLegacy.latestWinner.points} points`
                  : "Not available yet."
              }
            />
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="delegations-heading">
          <div className="anniversary-hub-section-head">
            <div><p>From the record book</p><h2 id="delegations-heading">Four delegations from Solaris history</h2></div>
          </div>
          <div className="anniversary-hub-story-grid">
            {anniversaryLegacy.delegations.map((item) => (
              <article key={item.country!.id} className="anniversary-hub-card">
                <small>Solaris history</small>
                <h3>{item.country!.name}</h3>
                <p>
                  {item.participations} participations · {item.finals} finals · {item.wins} win{item.wins === 1 ? "" : "s"} · {item.points} final points
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="anniversary-hub-section" aria-labelledby="stories-heading">
          <div className="anniversary-hub-section-head">
            <div><p>The past year</p><h2 id="stories-heading">The anniversary year in review</h2></div>
          </div>
          <div className="anniversary-hub-story-grid">
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

        <section className="anniversary-hub-section" aria-labelledby="explore-heading">
          <div className="anniversary-hub-section-head">
            <div><p>Explore</p><h2 id="explore-heading">More Solaris history</h2></div>
          </div>
          <div className="anniversary-hub-story-grid">
            <HubLink to="/editions" eyebrow="Editions" title="Browse every edition" copy="Go from SSC 1 to the latest published edition." />
            <HubLink to="/records" eyebrow="Records" title="Open the record book" copy="Wins, point totals, streaks and all-time milestones." />
            <HubLink to="/archive-games" eyebrow="Archive Games" title="Test your Solaris knowledge" copy="Play with past placements, jury splits and results." />
            <HubLink to="/relationships" eyebrow="Voting history" title="Explore voting relationships" copy="See which countries have voted alike over the years." />
            <HubLink to="/broadcast-intelligence" eyebrow="Scoreboard replay" title="Relive the turning points" copy="Replay how jury and televote scores changed the final ranking." />
            <HubLink to="/my-solaris" eyebrow="Your history" title="Open your Solaris story" copy="See your country's participations, results and best moments." />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function HubStat({ label, value }: { label: string; value: string | number }) {
  return <div className="anniversary-hub-stat"><p>{label}</p><strong>{value}</strong></div>;
}

function MomentCard({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <article className="anniversary-hub-card">
      <small>{number} · Solaris history</small>
      <h3>{title}</h3>
      <p>{detail}</p>
    </article>
  );
}

function HubLink({
  to,
  eyebrow,
  title,
  copy,
}: {
  to: "/editions" | "/records" | "/archive-games" | "/relationships" | "/broadcast-intelligence" | "/my-solaris";
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <Link to={to} className="anniversary-hub-card group">
      <small>{eyebrow}</small>
      <h3>{title}</h3>
      <p>{copy}</p>
      <b>Open →</b>
    </Link>
  );
}
