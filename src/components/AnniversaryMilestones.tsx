import { useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useMyCountryAccount } from "@/lib/country-account";
import { useAllParticipants, useAllResults, useAllShows, useCountries, useEditions } from "@/lib/data";

type Milestone = {
  title: string;
  detail: string;
};

function buildMilestones({
  participations,
  publishedEditions,
  debut,
  wins,
  finals,
  top5s,
  latestEdition,
}: {
  participations: number;
  publishedEditions: number;
  debut: number | null;
  wins: number;
  finals: number;
  top5s: number;
  latestEdition: number | null;
}): Milestone[] {
  const milestones: Milestone[] = [];
  if (participations > 0 && participations === publishedEditions) {
    milestones.push({ title: "Present throughout the published archive", detail: `Participated in all ${publishedEditions} published editions.` });
  } else if (participations >= Math.max(3, Math.ceil(publishedEditions * 0.75))) {
    milestones.push({ title: "Solaris mainstay", detail: `Participated in ${participations} of ${publishedEditions} published editions.` });
  }
  if (debut != null && debut <= 3) milestones.push({ title: "Founding-era delegation", detail: `Debuted in SSC ${debut}.` });
  if (wins === 1) milestones.push({ title: "Solaris champion", detail: "Has one published Grand Final victory." });
  if (wins >= 2) milestones.push({ title: `${wins}-time Solaris champion`, detail: `Has won ${wins} published Grand Finals.` });
  if (finals >= 10) milestones.push({ title: "Ten-final club", detail: `${finals} published Grand Final appearances.` });
  else if (finals >= 5) milestones.push({ title: "Five-final club", detail: `${finals} published Grand Final appearances.` });
  if (top5s >= 5) milestones.push({ title: "Top-five regular", detail: `${top5s} published top-five Grand Final finishes.` });
  if (latestEdition != null && participations >= 2) milestones.push({ title: "Still writing the story", detail: `Most recent published appearance: SSC ${latestEdition}.` });
  return milestones.slice(0, 5);
}

export function AnniversaryMilestones() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [host, setHost] = useState<HTMLElement | null>(null);
  const { data: account } = useMyCountryAccount();
  const { data: countries = [] } = useCountries();
  const { data: editions = [] } = useEditions();
  const { data: shows = [] } = useAllShows();
  const { data: participants = [] } = useAllParticipants();
  const { data: results = [] } = useAllResults();

  const countryCode = pathname.match(/^\/(?:countries|wiki)\/([^/]+)/i)?.[1] ?? null;
  const routeCountry = countryCode
    ? countries.find((country) => country.short_code.toLowerCase() === decodeURIComponent(countryCode).toLowerCase()) ?? null
    : null;
  const personalRoute = pathname.startsWith("/my-solaris") || pathname.startsWith("/country-hub") || pathname.startsWith("/me");
  const country = routeCountry ?? (personalRoute ? account?.country ?? null : null);

  useEffect(() => {
    if (!country) {
      setHost(null);
      return;
    }
    const main = document.querySelector<HTMLElement>(".app-main");
    if (!main) return;
    const mount = document.createElement("div");
    mount.className = "anniversary-milestones-host";
    main.appendChild(mount);
    setHost(mount);
    return () => {
      setHost(null);
      mount.remove();
    };
  }, [pathname, country?.id]);

  const milestones = useMemo(() => {
    if (!country) return [];
    const published = editions.filter((edition) => edition.published);
    const editionMap = new Map(published.map((edition) => [edition.id, edition]));
    const countryEntries = participants.filter(
      (entry) => entry.country_id === country.id && entry.show_id == null && editionMap.has(entry.edition_id),
    );
    const editionNumbers = [...new Set(countryEntries.map((entry) => editionMap.get(entry.edition_id)?.edition_number).filter((value): value is number => value != null))];
    const finalShowIds = new Set(
      shows
        .filter((show) => show.published && (show.kind === "grand-final" || show.kind === "final"))
        .map((show) => show.id),
    );
    const finalResults = results.filter(
      (result) => result.country_id === country.id && result.show_id && finalShowIds.has(result.show_id),
    );
    return buildMilestones({
      participations: new Set(countryEntries.map((entry) => entry.edition_id)).size,
      publishedEditions: published.length,
      debut: editionNumbers.length ? Math.min(...editionNumbers) : country.first_participation,
      wins: finalResults.filter((result) => result.final_rank === 1).length,
      finals: new Set(finalResults.map((result) => result.show_id)).size,
      top5s: finalResults.filter((result) => result.final_rank != null && result.final_rank <= 5).length,
      latestEdition: editionNumbers.length ? Math.max(...editionNumbers) : null,
    });
  }, [country, editions, participants, results, shows]);

  if (!host || !country || !milestones.length) return null;

  return createPortal(
    <section className="anniversary-deep-block" aria-label={`${country.name} anniversary milestones`}>
      <div className="anniversary-deep-head">
        <p>✦ Automatic anniversary milestones</p>
        <h2>{country.name}'s place in Solaris history</h2>
        <span>Milestones are generated from published participation and result history, so they update as the archive grows.</span>
      </div>
      <div className="anniversary-deep-grid">
        {milestones.map((milestone) => (
          <article key={milestone.title} className="anniversary-deep-card">
            <p>Milestone</p>
            <strong>{milestone.title}</strong>
            <span>{milestone.detail}</span>
          </article>
        ))}
      </div>
    </section>,
    host,
  );
}
