import { Link, useLocation, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import "@/anniversary-sitewide.css";
import "@/anniversary-sitewide-enhancements.css";
import {
  getSolarisAnniversarySeason,
  type AnniversaryPhase,
  type SolarisAnniversarySeason,
} from "@/lib/anniversary";

type AnniversaryContext = {
  kicker: string;
  title: string;
  description: string;
  cta?: string;
};

const CONTEXTS: Array<{ match: (pathname: string) => boolean; content: AnniversaryContext }> = [
  {
    match: (pathname) => pathname.startsWith("/editions"),
    content: {
      kicker: "Four years of contest chapters",
      title: "Every edition is part of the anniversary story",
      description: "Trace Solaris from its first edition to the latest hosts, winners and scoreboards.",
      cta: "Explore the anniversary timeline",
    },
  },
  {
    match: (pathname) => pathname.startsWith("/countries") || pathname.startsWith("/wiki"),
    content: {
      kicker: "Across Terra Solaris",
      title: "Four years of delegations, debuts and milestones",
      description: "Country histories now sit inside the wider story that began on 17 September 2022.",
      cta: "See four years of Solaris",
    },
  },
  {
    match: (pathname) => pathname.startsWith("/results") || pathname.startsWith("/shows"),
    content: {
      kicker: "Four years on the scoreboard",
      title: "Every result became part of the archive",
      description: "Revisit the finals, winning margins and scoreboard moments that shaped Solaris history.",
      cta: "Open the anniversary archive",
    },
  },
  {
    match: (pathname) => pathname.startsWith("/records"),
    content: {
      kicker: "Four years of records",
      title: "Records survived. Others very much did not.",
      description: "Put today’s milestones in context with the wins, scores and streaks built since 2022.",
      cta: "See the anniversary highlights",
    },
  },
  {
    match: (pathname) => pathname.startsWith("/analysis") || pathname.startsWith("/relationships"),
    content: {
      kicker: "Four years of patterns",
      title: "See how Solaris changed",
      description: "Use the archive to read the voting patterns, relationships and competitive shifts behind four years of results.",
      cta: "Explore the anniversary year",
    },
  },
  {
    match: (pathname) => pathname.startsWith("/archive-games"),
    content: {
      kicker: "Anniversary challenge",
      title: "How well do you actually know four years of SSC?",
      description: "Archive Games turns old results, entries and jury–televote splits into the birthday challenge.",
      cta: "See the anniversary hub",
    },
  },
  {
    match: (pathname) =>
      pathname.startsWith("/compare") ||
      pathname.startsWith("/result-lab") ||
      pathname.startsWith("/taste-dna") ||
      pathname.startsWith("/broadcast-intelligence") ||
      pathname.startsWith("/tools"),
    content: {
      kicker: "Anniversary archive tools",
      title: "Put four years of Solaris history to work",
      description: "Compare, replay and experiment with published contest history while Anniversary Mode is active.",
      cta: "Open the anniversary hub",
    },
  },
  {
    match: (pathname) => pathname.startsWith("/predictions"),
    content: {
      kicker: "Four years behind us",
      title: "Now predict what the next Solaris year does to the history books",
      description: "The anniversary looks backward. Predictions, mercifully, get to worry about what happens next.",
      cta: "Review the anniversary year",
    },
  },
  {
    match: (pathname) => pathname.startsWith("/my-solaris") || pathname.startsWith("/country-hub"),
    content: {
      kicker: "Your Solaris story",
      title: "Your activity is part of the contest archive too",
      description: "Anniversary Day connects personal and country activity with the wider Solaris story.",
      cta: "See the four-year celebration",
    },
  },
  {
    match: (pathname) =>
      pathname.startsWith("/participate") ||
      pathname.startsWith("/confirmations") ||
      pathname.startsWith("/jury-voting") ||
      pathname.startsWith("/televoting") ||
      pathname.startsWith("/next-in-line"),
    content: {
      kicker: "The next chapter",
      title: "What you submit today becomes tomorrow’s archive",
      description: "Anniversary styling stays deliberately restrained here so voting and submissions remain clear and usable.",
      cta: "Visit the anniversary hub",
    },
  },
  {
    match: () => true,
    content: {
      kicker: "SSC Anniversary Day",
      title: "Solaris Studio is celebrating site-wide",
      description: "Explore four years of editions, countries, champions, records and increasingly unreasonable scoreboard emotions.",
      cta: "Open the anniversary hub",
    },
  },
];

function previewPhase(searchStr: string): AnniversaryPhase | null {
  const preview = new URLSearchParams(searchStr).get("anniversary");
  if (preview === "preview" || preview === "active") return "active";
  if (preview === "countdown") return "countdown";
  if (preview === "after") return "after";
  return null;
}

function withPreview(season: SolarisAnniversarySeason, phase: AnniversaryPhase | null) {
  if (!phase) return season;
  if (phase === "active") return { ...season, active: true, phase, daysUntil: 0, daysSince: 0 };
  if (phase === "countdown") return { ...season, active: false, phase, daysUntil: 1, daysSince: null };
  if (phase === "after") return { ...season, active: false, phase, daysUntil: null, daysSince: 1 };
  return season;
}

export function SiteAnniversaryContext() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const [clock, setClock] = useState(() => new Date());
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const tick = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".app-main");
    if (!main) {
      setHost(null);
      return;
    }

    const mount = document.createElement("div");
    mount.className = "anniversary-site-context-host";
    main.prepend(mount);
    setHost(mount);

    return () => {
      setHost(null);
      mount.remove();
    };
  }, [pathname]);

  const season = useMemo(
    () => withPreview(getSolarisAnniversarySeason(clock), previewPhase(searchStr)),
    [clock, searchStr],
  );

  if (
    !host ||
    pathname === "/" ||
    pathname.startsWith("/anniversary") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/confirmations/admin") ||
    pathname.startsWith("/televoting/admin")
  ) {
    return null;
  }

  if (season.phase === "dormant") return null;

  let content;

  if (season.phase === "countdown") {
    content = (
      <section className="anniversary-season-strip is-countdown" aria-label="Solaris anniversary countdown">
        <span className="anniversary-season-orbit" aria-hidden="true" />
        <div className="min-w-0">
          <p className="anniversary-season-kicker">17 September · Solaris anniversary</p>
          <p className="anniversary-season-title">
            {season.daysUntil === 1 ? "Anniversary Day is tomorrow" : `${season.daysUntil} days until Anniversary Day`}
          </p>
        </div>
        <Link to={"/anniversary" as any} className="anniversary-season-link">
          Preview the celebration →
        </Link>
      </section>
    );
  } else if (season.phase === "after") {
    content = (
      <section className="anniversary-season-strip is-after" aria-label="Solaris anniversary thank you">
        <span className="anniversary-season-orbit" aria-hidden="true" />
        <div className="min-w-0">
          <p className="anniversary-season-kicker">The anniversary afterglow</p>
          <p className="anniversary-season-title">Solaris Year {season.age + 1} has begun</p>
        </div>
        <Link to={"/anniversary" as any} className="anniversary-season-link">
          Revisit the anniversary →
        </Link>
      </section>
    );
  } else {
    const context = CONTEXTS.find((item) => item.match(pathname))?.content ?? CONTEXTS[CONTEXTS.length - 1].content;
    content = (
      <section className="anniversary-route-context" aria-label="SSC anniversary context">
        <div className="anniversary-route-number" aria-hidden="true">
          <span>{String(season.age).padStart(2, "0")}</span>
          <small>YEARS</small>
        </div>
        <div className="anniversary-route-copy">
          <p className="anniversary-route-kicker">✦ {context.kicker}</p>
          <h2>{context.title}</h2>
          <p>{context.description}</p>
        </div>
        <Link to={"/anniversary" as any} className="anniversary-route-cta">
          {context.cta ?? "Open anniversary"} →
        </Link>
      </section>
    );
  }

  return createPortal(content, host);
}
