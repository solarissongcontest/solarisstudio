import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import "@/anniversary-global.css";
import "@/anniversary-sitewide.css";
import "@/anniversary-season.css";
import {
  getSolarisAnniversarySeason,
  type AnniversaryPhase,
  type SolarisAnniversarySeason,
} from "@/lib/anniversary";

const LEGACY_PREVIEW_KEY = "solaris:anniversary-preview";
const INTRO_SEEN_KEY = "solaris:anniversary-intro-seen";
const STAR_COLORS = ["#74e7ff", "#b7a4ff", "#ff8fc7", "#ffe36e", "#78f3d0", "#ffffff"];

const FALLING_STARS = Array.from({ length: 54 }, (_, index) => ({
  left: `${(index * 37 + 11) % 100}%`,
  size: `${10 + ((index * 19) % 30)}px`,
  color: STAR_COLORS[index % STAR_COLORS.length],
  opacity: 0.28 + ((index * 13) % 40) / 100,
  duration: `${9.2 + ((index * 23) % 86) / 10}s`,
  delay: `${-((index * 0.83) % 18)}s`,
  drift: `${-190 + ((index * 47) % 380)}px`,
  rotate: `${(index * 73) % 360}deg`,
  scale: 0.62 + ((index * 17) % 48) / 100,
}));

type AnniversaryRouteContext = {
  eyebrow: string;
  title: string;
  detail: string;
  tone: "archive" | "data" | "play" | "participate" | "personal" | "default";
};

function routeContext(pathname: string, age: number): AnniversaryRouteContext {
  if (pathname === "/anniversary" || pathname.startsWith("/anniversary/")) {
    return {
      eyebrow: "Anniversary headquarters",
      title: `${age} years of Solaris`,
      detail: "Champions, records, turning points and the contest year that brought Solaris here.",
      tone: "archive",
    };
  }
  if (pathname.startsWith("/editions")) {
    return {
      eyebrow: `${age} years, edition by edition`,
      title: "Walk through Solaris history",
      detail: "Every published edition is another chapter in the archive that began on 17 September 2022.",
      tone: "archive",
    };
  }
  if (pathname.startsWith("/countries") || pathname.startsWith("/wiki")) {
    return {
      eyebrow: "Across Terra Solaris",
      title: "Every delegation has a history",
      detail: `Debuts, returns, finals and victories have shaped ${age} years of country stories.`,
      tone: "archive",
    };
  }
  if (pathname.startsWith("/records")) {
    return {
      eyebrow: `${age} years of records`,
      title: "Records made to be broken",
      detail: "Revisit the scores, streaks and milestones that survived another year of increasingly unreasonable scoreboard emotions.",
      tone: "data",
    };
  }
  if (
    pathname.startsWith("/results") ||
    pathname.startsWith("/analysis") ||
    pathname.startsWith("/relationships") ||
    pathname.startsWith("/scorecharts") ||
    pathname.startsWith("/broadcast-intelligence")
  ) {
    return {
      eyebrow: "Anniversary intelligence",
      title: `${age} years hidden in the numbers`,
      detail: "Explore the results, voting relationships and scoreboard moments that built the Solaris archive.",
      tone: "data",
    };
  }
  if (pathname.startsWith("/archive-games") || pathname.startsWith("/taste-dna") || pathname.startsWith("/result-lab") || pathname.startsWith("/compare")) {
    return {
      eyebrow: "Anniversary challenge",
      title: `Play with ${age} years of history`,
      detail: "Use the archive rather than merely staring at it respectfully like a museum exhibit.",
      tone: "play",
    };
  }
  if (pathname.startsWith("/my-solaris") || pathname.startsWith("/country-hub") || pathname.startsWith("/me")) {
    return {
      eyebrow: "Your Solaris story",
      title: "You are part of the archive",
      detail: "Your country, participation and contest history sit inside a story that started in 2022.",
      tone: "personal",
    };
  }
  if (
    pathname.startsWith("/participate") ||
    pathname.startsWith("/confirmations") ||
    pathname.startsWith("/jury-voting") ||
    pathname.startsWith("/televoting") ||
    pathname.startsWith("/next-in-line")
  ) {
    return {
      eyebrow: "The next chapter",
      title: `Be part of Solaris year ${age + 1}`,
      detail: "Anniversary styling stays deliberately restrained here so the actual voting and submission tools remain usable.",
      tone: "participate",
    };
  }
  if (pathname.startsWith("/predictions")) {
    return {
      eyebrow: `${age} years behind us`,
      title: "What happens next?",
      detail: "The archive is written. The next result, naturally, is where everyone begins arguing again.",
      tone: "play",
    };
  }
  return {
    eyebrow: "Solaris anniversary day",
    title: `${age} years of Solaris`,
    detail: "17 September 2022 → today. The whole Studio is celebrating the contest archive.",
    tone: "default",
  };
}

function previewPhase(searchStr: string): AnniversaryPhase | null {
  const preview = new URLSearchParams(searchStr).get("anniversary");
  if (preview === "preview" || preview === "active") return "active";
  if (preview === "countdown") return "countdown";
  if (preview === "after") return "after";
  return null;
}

function withPreview(season: SolarisAnniversarySeason, phase: AnniversaryPhase | null): SolarisAnniversarySeason {
  if (!phase) return season;
  if (phase === "active") return { ...season, active: true, phase, daysUntil: 0, daysSince: 0 };
  if (phase === "countdown") return { ...season, active: false, phase, daysUntil: 1, daysSince: null };
  if (phase === "after") return { ...season, active: false, phase, daysUntil: null, daysSince: 1 };
  return season;
}

function createStarBurst(x: number, y: number, strong: boolean) {
  const burst = document.createElement("span");
  burst.className = "solaris-anniversary-star-burst";
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;

  const count = strong ? 22 : 8;
  for (let index = 0; index < count; index += 1) {
    const star = document.createElement("span");
    star.className = "solaris-anniversary-burst-star";
    star.style.setProperty("--burst-color", STAR_COLORS[index % STAR_COLORS.length]);
    star.style.setProperty("--burst-angle", `${(360 / count) * index + ((index % 3) * 5)}deg`);
    star.style.setProperty("--burst-distance", `${strong ? 62 + ((index * 19) % 96) : 28 + ((index * 13) % 42)}px`);
    star.style.setProperty("--burst-size", `${strong ? 9 + ((index * 7) % 15) : 6 + ((index * 5) % 8)}px`);
    star.style.setProperty("--burst-rotate", `${(index * 83) % 360}deg`);
    star.style.setProperty("--burst-delay", `${(index % 4) * 10}ms`);
    burst.appendChild(star);
  }

  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), 980);
}

export function SolarisAnniversaryCelebration() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const [clock, setClock] = useState(() => new Date());
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    window.sessionStorage.removeItem(LEGACY_PREVIEW_KEY);
    const tick = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  const season = useMemo(
    () => withPreview(getSolarisAnniversarySeason(clock), previewPhase(searchStr)),
    [clock, searchStr],
  );
  const active = season.phase === "active";
  const context = useMemo(() => routeContext(pathname, season.age), [pathname, season.age]);
  const isAdmin =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/confirmations/admin") ||
    pathname.startsWith("/televoting/admin");

  useEffect(() => {
    if (!active) {
      setShowIntro(false);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const key = `${INTRO_SEEN_KEY}:${season.year}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    setShowIntro(true);
    const timeout = window.setTimeout(() => setShowIntro(false), 1900);
    return () => window.clearTimeout(timeout);
  }, [active, season.year]);

  useEffect(() => {
    document.body.classList.toggle("solaris-anniversary-day", active);

    if (season.phase === "dormant") {
      delete document.body.dataset.solarisAnniversary;
      delete document.body.dataset.solarisAnniversaryTone;
      delete document.body.dataset.solarisAnniversaryPhase;
      return;
    }

    document.body.dataset.solarisAnniversary = String(season.year);
    document.body.dataset.solarisAnniversaryPhase = season.phase;

    if (active) document.body.dataset.solarisAnniversaryTone = context.tone;
    else delete document.body.dataset.solarisAnniversaryTone;

    return () => {
      document.body.classList.remove("solaris-anniversary-day");
      delete document.body.dataset.solarisAnniversary;
      delete document.body.dataset.solarisAnniversaryTone;
      delete document.body.dataset.solarisAnniversaryPhase;
    };
  }, [active, context.tone, season.phase, season.year]);

  useEffect(() => {
    if (!active) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href], button") : null;
      if (!target || reducedMotion.matches) return;

      const strong = Boolean(target.closest("[data-anniversary-action='major']"));
      createStarBurst(event.clientX, event.clientY, strong);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [active]);

  if (season.phase === "dormant") return null;

  if (!active) {
    const countdown = season.phase === "countdown";
    const title = countdown
      ? season.daysUntil === 1
        ? "Anniversary Day is tomorrow"
        : `${season.daysUntil} days until Anniversary Day`
      : `Solaris year ${season.age + 1} has begun`;
    const detail = countdown
      ? `The ${season.ordinal} anniversary arrives on 17 September. The full Studio takeover unlocks on Anniversary Day.`
      : `The anniversary celebration is still glowing for a few days while Solaris moves into its ${ordinalYear(season.age + 1)} year.`;

    return isAdmin ? null : (
      <>
        <div className="solaris-anniversary-global-badge" aria-label="Solaris anniversary season">
          <span className="solaris-anniversary-badge-star" aria-hidden="true" />
          <span>17 September</span>
          <span className="solaris-anniversary-badge-divider">·</span>
          <strong>{countdown ? title : `Year ${season.age + 1} begins`}</strong>
        </div>

        <aside
          className={`solaris-anniversary-season-notice ${countdown ? "solaris-anniversary-season-notice--countdown" : "solaris-anniversary-season-notice--after"}`}
        >
          <div className="solaris-anniversary-season-mark" aria-hidden="true">
            <span>{countdown ? season.daysUntil : String(season.age + 1).padStart(2, "0")}</span>
          </div>
          <div className="solaris-anniversary-season-copy">
            <p>{countdown ? "Anniversary countdown" : "The anniversary afterglow"}</p>
            <strong>{title}</strong>
            <span>{detail}</span>
          </div>
          <Link to="/anniversary" className="solaris-anniversary-season-action">
            {countdown ? "Preview the anniversary" : "Revisit the anniversary"} <span aria-hidden="true">→</span>
          </Link>
        </aside>
      </>
    );
  }

  return (
    <>
      <div className="solaris-anniversary-global" aria-hidden="true">
        <div className="solaris-anniversary-global-wash" />
        <div className="solaris-anniversary-orbits">
          <span />
          <span />
          <span />
        </div>
        <div className="solaris-anniversary-global-stars">
          {FALLING_STARS.map((star, index) => (
            <span
              key={index}
              className="solaris-anniversary-falling-star"
              style={
                {
                  left: star.left,
                  "--star-size": star.size,
                  "--star-color": star.color,
                  "--star-opacity": star.opacity,
                  "--star-duration": star.duration,
                  "--star-delay": star.delay,
                  "--star-drift": star.drift,
                  "--star-rotate": star.rotate,
                  "--star-scale": star.scale,
                } as CSSProperties
              }
            />
          ))}
        </div>
      </div>

      <div className="solaris-anniversary-global-badge" aria-label={`${season.ordinal} Solaris anniversary`}>
        <span className="solaris-anniversary-badge-star" aria-hidden="true" />
        <span>17 September</span>
        <span className="solaris-anniversary-badge-divider">·</span>
        <strong>{season.age} years of Solaris</strong>
      </div>

      {pathname !== "/" && !isAdmin && (
        <aside className={`solaris-anniversary-context solaris-anniversary-context--${context.tone}`}>
          <div className="solaris-anniversary-context-mark" aria-hidden="true">
            <span>{String(season.age).padStart(2, "0")}</span>
          </div>
          <div className="solaris-anniversary-context-copy">
            <p>{context.eyebrow}</p>
            <strong>{context.title}</strong>
            <span>{context.detail}</span>
          </div>
          <Link
            to="/anniversary"
            className="solaris-anniversary-context-action"
            data-anniversary-action="major"
          >
            Anniversary hub <span aria-hidden="true">→</span>
          </Link>
        </aside>
      )}

      {showIntro && (
        <div className="solaris-anniversary-intro" role="status" aria-live="polite">
          <div className="solaris-anniversary-intro-orbit" aria-hidden="true" />
          <p>17 · 09 · 2022</p>
          <strong>{season.age} YEARS OF SOLARIS</strong>
          <span>Anniversary Day</span>
        </div>
      )}
    </>
  );
}

function ordinalYear(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}
