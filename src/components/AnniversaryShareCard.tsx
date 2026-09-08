import { useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { getSolarisAnniversary } from "@/lib/anniversary";
import { useMyCountryAccount } from "@/lib/country-account";
import { useAllParticipants, useAllResults, useAllShows, useEditions } from "@/lib/data";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function downloadSvg(filename: string, svg: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AnniversaryShareCard() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [host, setHost] = useState<HTMLElement | null>(null);
  const { data: account } = useMyCountryAccount();
  const { data: editions = [] } = useEditions();
  const { data: shows = [] } = useAllShows();
  const { data: participants = [] } = useAllParticipants();
  const { data: results = [] } = useAllResults();
  const country = account?.country ?? null;
  const anniversary = useMemo(() => getSolarisAnniversary(), []);

  useEffect(() => {
    const matches = pathname.startsWith("/my-solaris") || pathname.startsWith("/country-hub") || pathname.startsWith("/me");
    if (!matches) {
      setHost(null);
      return;
    }
    const main = document.querySelector<HTMLElement>(".app-main");
    if (!main) return;
    const mount = document.createElement("div");
    mount.className = "anniversary-share-card-host";
    main.appendChild(mount);
    setHost(mount);
    return () => {
      setHost(null);
      mount.remove();
    };
  }, [pathname]);

  const stats = useMemo(() => {
    if (!country) return null;
    const published = editions.filter((edition) => edition.published);
    const editionIds = new Set(published.map((edition) => edition.id));
    const entries = participants.filter(
      (entry) => entry.country_id === country.id && entry.show_id == null && editionIds.has(entry.edition_id),
    );
    const finalShowIds = new Set(
      shows
        .filter((show) => show.published && (show.kind === "grand-final" || show.kind === "final"))
        .map((show) => show.id),
    );
    const finalResults = results.filter(
      (result) => result.country_id === country.id && result.show_id && finalShowIds.has(result.show_id),
    );
    const wins = finalResults.filter((result) => result.final_rank === 1).length;
    const finals = new Set(finalResults.map((result) => result.show_id)).size;
    const bestRank = finalResults
      .map((result) => result.final_rank)
      .filter((rank): rank is number => rank != null)
      .sort((a, b) => a - b)[0] ?? null;
    const bestScore = finalResults.reduce((best, result) => Math.max(best, result.total_points ?? 0), 0);
    const editionNumbers = entries
      .map((entry) => published.find((edition) => edition.id === entry.edition_id)?.edition_number)
      .filter((value): value is number => value != null);
    const debut = editionNumbers.length ? Math.min(...editionNumbers) : country.first_participation;
    const share = published.length
      ? Math.round((new Set(entries.map((entry) => entry.edition_id)).size / published.length) * 100)
      : 0;
    return {
      participations: new Set(entries.map((entry) => entry.edition_id)).size,
      finals,
      wins,
      bestRank,
      bestScore,
      debut,
      share,
    };
  }, [country, editions, participants, results, shows]);

  if (!host || !country || !stats) return null;

  const makeCard = () => {
    const name = escapeXml(country.name.toUpperCase());
    const subtitle = escapeXml(
      `${stats.participations} participations · ${stats.wins} win${stats.wins === 1 ? "" : "s"} · ${stats.finals} finals`,
    );
    const debut = escapeXml(stats.debut ? `SSC ${stats.debut}` : "—");
    const rank = escapeXml(stats.bestRank ? `#${stats.bestRank}` : "—");
    const score = escapeXml(stats.bestScore ? String(stats.bestScore) : "—");
    const age = String(anniversary.age).padStart(2, "0");
    const ordinalLabel = escapeXml(anniversary.ordinal.toUpperCase());
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071026"/><stop offset=".52" stop-color="#13244a"/><stop offset="1" stop-color="#27163f"/></linearGradient>
  <radialGradient id="glow"><stop stop-color="#74e7ff" stop-opacity=".28"/><stop offset="1" stop-color="#74e7ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#fff6c7"/><stop offset=".5" stop-color="#ffe36e"/><stop offset="1" stop-color="#c7a7ff"/></linearGradient>
</defs>
<rect width="1200" height="1500" rx="70" fill="url(#bg)"/>
<circle cx="1040" cy="230" r="430" fill="url(#glow)"/>
<circle cx="130" cy="1180" r="360" fill="#ff8fc7" opacity=".07"/>
<g fill="none" stroke="#ffffff" stroke-opacity=".08"><circle cx="980" cy="320" r="220"/><circle cx="980" cy="320" r="310"/><circle cx="170" cy="1130" r="260"/></g>
<text x="90" y="105" fill="#ffe36e" font-family="Arial,sans-serif" font-size="28" font-weight="700" letter-spacing="8">SOLARIS ${ordinalLabel} ANNIVERSARY</text>
<text x="90" y="250" fill="url(#gold)" font-family="Arial,sans-serif" font-size="178" font-weight="900">${age}</text>
<text x="90" y="330" fill="#ffffff" font-family="Arial,sans-serif" font-size="45" font-weight="800" letter-spacing="10">YEARS OF SOLARIS</text>
<text x="90" y="520" fill="#ffffff" font-family="Arial,sans-serif" font-size="96" font-weight="900">${name}</text>
<text x="90" y="580" fill="#ffffff" fill-opacity=".62" font-family="Arial,sans-serif" font-size="30">${subtitle}</text>
<line x1="90" y1="665" x2="1110" y2="665" stroke="#ffffff" stroke-opacity=".14"/>
<g font-family="Arial,sans-serif">
  <text x="90" y="755" fill="#ffffff" fill-opacity=".45" font-size="24" letter-spacing="5">DEBUT</text><text x="90" y="825" fill="#ffffff" font-size="62" font-weight="800">${debut}</text>
  <text x="420" y="755" fill="#ffffff" fill-opacity=".45" font-size="24" letter-spacing="5">BEST RESULT</text><text x="420" y="825" fill="#ffffff" font-size="62" font-weight="800">${rank}</text>
  <text x="790" y="755" fill="#ffffff" fill-opacity=".45" font-size="24" letter-spacing="5">BEST SCORE</text><text x="790" y="825" fill="#ffffff" font-size="62" font-weight="800">${score}</text>
</g>
<rect x="90" y="950" width="1020" height="210" rx="34" fill="#ffffff" fill-opacity=".045" stroke="#ffffff" stroke-opacity=".10"/>
<text x="140" y="1030" fill="#ffe36e" font-family="Arial,sans-serif" font-size="24" font-weight="700" letter-spacing="5">PART OF SOLARIS HISTORY</text>
<text x="140" y="1110" fill="#ffffff" font-family="Arial,sans-serif" font-size="76" font-weight="900">${stats.share}%</text>
<text x="340" y="1105" fill="#ffffff" fill-opacity=".6" font-family="Arial,sans-serif" font-size="30">of published editions</text>
<text x="90" y="1380" fill="#ffffff" fill-opacity=".4" font-family="Arial,sans-serif" font-size="24" letter-spacing="4">17 SEPTEMBER 2022 → ${anniversary.year} · SOLARIS STUDIO</text>
</svg>`;
    downloadSvg(`${country.short_code.toLowerCase()}-solaris-anniversary-${anniversary.year}.svg`, svg);
  };

  return createPortal(
    <section className="anniversary-deep-block anniversary-deep-block--personal" aria-label="Anniversary share card">
      <div className="anniversary-deep-head">
        <p>✦ Share your Solaris story</p>
        <h2>Make a visual anniversary card for {country.name}</h2>
        <span>
          The card uses the published archive to show debut, participations, finals, wins, best result, best score and how much of Solaris history the country has been part of.
        </span>
      </div>
      <div className="anniversary-deep-actions">
        <button
          type="button"
          onClick={makeCard}
          className="inline-flex min-h-10 items-center rounded-full border border-amber-200/25 bg-amber-200/[0.07] px-4 text-xs font-bold text-amber-50 transition hover:border-amber-200/45 hover:bg-amber-200/[0.12]"
        >
          Download anniversary card ↓
        </button>
      </div>
    </section>,
    host,
  );
}
