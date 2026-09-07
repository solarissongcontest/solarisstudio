import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import "@/anniversary-interactive.css";
import { useFanSession } from "@/lib/prediction-data";
import { useTasteBallots } from "@/lib/taste-data";
import { rankingSimilarity } from "@/lib/taste-dna";
import { useAllResults, useAllShows, useEditions } from "@/lib/data";

export function AnniversaryTasteEra() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const { data: user } = useFanSession();
  const { data: tasteData } = useTasteBallots(user?.id);
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: results } = useAllResults();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const main = document.querySelector<HTMLElement>(".app-main");
      if (!main) return;
      const mount = document.createElement("div");
      mount.className = "anniv-deep-host anniv-taste-era-host";
      const header = main.querySelector<HTMLElement>(".page-header");
      if (header?.parentElement) header.insertAdjacentElement("afterend", mount);
      else main.prepend(mount);
      setHost(mount);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      setHost((current) => {
        current?.remove();
        return null;
      });
    };
  }, []);

  const eras = useMemo(() => {
    const editionMap = new Map((editions ?? []).map((edition) => [edition.id, edition]));
    const showMap = new Map((shows ?? []).map((show) => [show.id, show]));
    const resultMap = new Map<string, typeof results>();
    for (const row of results ?? []) {
      if (!row.show_id) continue;
      const list = resultMap.get(row.show_id) ?? [];
      list.push(row);
      resultMap.set(row.show_id, list);
    }

    const yearValues = new Map<number, number[]>();
    for (const ballot of tasteData?.ballots ?? []) {
      const show = showMap.get(ballot.show_id);
      const edition = show ? editionMap.get(show.edition_id) : null;
      if (!edition?.year) continue;
      const official = [...(resultMap.get(ballot.show_id) ?? [])]
        .filter((row) => row.final_rank != null)
        .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999))
        .map((row) => row.country_id);
      if (official.length < 3 || ballot.ranking.length < 3) continue;
      const similarity = rankingSimilarity(ballot.ranking, official, official);
      const values = yearValues.get(edition.year) ?? [];
      values.push(similarity);
      yearValues.set(edition.year, values);
    }

    return [...yearValues.entries()]
      .map(([year, values]) => ({
        year,
        similarity: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10,
        ballots: values.length,
      }))
      .sort((a, b) => b.similarity - a.similarity || b.year - a.year);
  }, [editions, shows, results, tasteData?.ballots]);

  if (!host) return null;

  const content = (
    <section className="anniv-deep anniv-deep--compact" aria-label="Which Solaris era matches your taste">
      <div className="anniv-deep-head">
        <div>
          <p>Anniversary Taste DNA</p>
          <h2>Which Solaris era matches your taste?</h2>
          <span>
            This compares your privately saved Taste DNA rankings with the official result from each corresponding show, then groups the matches by contest year.
          </span>
        </div>
      </div>

      {eras.length ? (
        <>
          <div className="anniv-taste-winner">
            <small>Your closest era</small>
            <strong>Solaris {eras[0].year}</strong>
            <span>{eras[0].similarity}% average official-result match across {eras[0].ballots} saved ballot{eras[0].ballots === 1 ? "" : "s"}.</span>
          </div>
          <div className="anniv-taste-bars">
            {eras.slice(0, 5).map((era) => (
              <div key={era.year}>
                <div className="anniv-taste-label">
                  <span>{era.year}</span>
                  <strong>{era.similarity}%</strong>
                </div>
                <div className="anniv-taste-track"><span style={{ width: `${Math.max(4, Math.min(100, era.similarity))}%` }} /></div>
                <small>{era.ballots} saved ballot{era.ballots === 1 ? "" : "s"}</small>
              </div>
            ))}
          </div>
          {eras.length < 2 ? (
            <p className="anniv-taste-note">Save Taste DNA rankings from another contest year to unlock a real cross-era comparison.</p>
          ) : null}
        </>
      ) : (
        <div className="anniv-taste-empty">
          <strong>Your era is waiting for data</strong>
          <span>Save Taste DNA rankings from published shows. Anniversary Mode will compare those private rankings across years automatically.</span>
        </div>
      )}
    </section>
  );

  return createPortal(content, host);
}
