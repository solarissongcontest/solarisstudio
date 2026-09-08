import { useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useAllResults, useAllShows, useEditions } from "@/lib/data";
import { useFanSession } from "@/lib/prediction-data";
import { rankingSimilarity } from "@/lib/taste-dna";
import { useTasteBallots } from "@/lib/taste-data";

type EraScore = {
  year: number;
  similarity: number;
  ballots: number;
};

export function AnniversaryTasteEra() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [host, setHost] = useState<HTMLElement | null>(null);
  const { data: user } = useFanSession();
  const { data: tasteData } = useTasteBallots(user?.id);
  const { data: editions = [] } = useEditions();
  const { data: shows = [] } = useAllShows();
  const { data: results = [] } = useAllResults();

  useEffect(() => {
    if (!pathname.startsWith("/taste-dna")) {
      setHost(null);
      return;
    }
    const main = document.querySelector<HTMLElement>(".app-main");
    if (!main) return;
    const mount = document.createElement("div");
    mount.className = "anniversary-taste-era-host";
    main.appendChild(mount);
    setHost(mount);
    return () => {
      setHost(null);
      mount.remove();
    };
  }, [pathname]);

  const eraScores = useMemo<EraScore[]>(() => {
    const ballots = tasteData?.ballots ?? [];
    if (!ballots.length) return [];

    const showMap = new Map(shows.map((show) => [show.id, show]));
    const editionMap = new Map(editions.map((edition) => [edition.id, edition]));
    const grouped = new Map<number, number[]>();

    for (const ballot of ballots) {
      const show = showMap.get(ballot.show_id);
      const edition = show ? editionMap.get(show.edition_id) : null;
      if (!show || !edition?.published || edition.year == null) continue;

      const showResults = results
        .filter((result) => result.show_id === show.id && Boolean(result.country_id))
        .sort((a, b) => {
          if (a.final_rank != null && b.final_rank != null) return a.final_rank - b.final_rank;
          if (a.final_rank != null) return -1;
          if (b.final_rank != null) return 1;
          return b.total_points - a.total_points;
        });
      const officialRanking = showResults.map((result) => result.country_id);
      if (officialRanking.length < 3) continue;

      const similarity = rankingSimilarity(ballot.ranking, officialRanking, officialRanking);
      const values = grouped.get(edition.year) ?? [];
      values.push(similarity);
      grouped.set(edition.year, values);
    }

    return [...grouped.entries()]
      .map(([year, values]) => ({
        year,
        similarity: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)),
        ballots: values.length,
      }))
      .sort((a, b) => b.similarity - a.similarity || b.ballots - a.ballots || b.year - a.year);
  }, [tasteData?.ballots, shows, editions, results]);

  if (!host) return null;

  const best = eraScores[0] ?? null;

  return createPortal(
    <section className="anniversary-deep-block anniversary-deep-block--personal" aria-label="Solaris anniversary taste era">
      <div className="anniversary-deep-head">
        <p>✦ Which Solaris era matches your taste?</p>
        <h2>{best ? `Your saved taste is closest to Solaris ${best.year}` : "Build your anniversary taste history"}</h2>
        <span>
          {best
            ? `Across ${best.ballots} saved ballot${best.ballots === 1 ? "" : "s"} from ${best.year}, your rankings average ${best.similarity}% similarity with the official results. This compares each saved Taste DNA ballot with its own published show, then groups the matches by year.`
            : "Save Taste DNA ballots from published shows across different years. Solaris will compare each ranking with its official result and identify the contest year that best matches your taste."}
        </span>
      </div>
      {eraScores.length ? (
        <div className="anniversary-deep-grid compact">
          {eraScores.slice(0, 4).map((era) => (
            <article key={era.year} className="anniversary-deep-card">
              <p>Solaris {era.year}</p>
              <strong>{era.similarity}%</strong>
              <span>{era.ballots} saved ballot{era.ballots === 1 ? "" : "s"}</span>
            </article>
          ))}
        </div>
      ) : null}
    </section>,
    host,
  );
}
