import { Link, useLocation } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";

import "@/anniversary-global.css";
import "@/anniversary-sitewide.css";
import "@/anniversary-season.css";
import {
  getSolarisAnniversarySeason,
  ordinal,
  type AnniversaryPhase,
  type SolarisAnniversarySeason,
} from "@/lib/anniversary";

const LazyAnniversaryDeepDive = lazy(() =>
  import("@/components/AnniversaryDeepDive").then((module) => ({
    default: module.AnniversaryDeepDive,
  })),
);

const LEGACY_PREVIEW_KEY = "solaris:anniversary-preview";
const INTRO_SEEN_KEY = "solaris:anniversary-intro-seen";
const STAR_COLORS = ["#74e7ff", "#b7a4ff", "#ff8fc7", "#ffe36e", "#78f3d0", "#ffffff"];

const FALLING_STARS = Array.from({ length: 42 }, (_, index) => ({
  left: `${(index * 37 + 11) % 100}%`,
  size: `${9 + ((index * 19) % 26)}px`,
  color: STAR_COLORS[index % STAR_COLORS.length],
  opacity: 0.2 + ((index * 13) % 34) / 100,
  duration: `${10.4 + ((index * 23) % 92) / 10}s`,
  delay: `${-((index * 0.83) % 18)}s`,
  drift: `${-170 + ((index * 47) % 340)}px`,
  rotate: `${(index * 73) % 360}deg`,
  scale: 0.6 + ((index * 17) % 44) / 100,
}));

function anniversaryTone(pathname: string) {
  if (pathname.startsWith("/editions") || pathname.startsWith("/countries") || pathname.startsWith("/wiki")) return "archive";
  if (
    pathname.startsWith("/results") ||
    pathname.startsWith("/analysis") ||
    pathname.startsWith("/relationships") ||
    pathname.startsWith("/records") ||
    pathname.startsWith("/scorecharts") ||
    pathname.startsWith("/broadcast-intelligence")
  ) return "data";
  if (
    pathname.startsWith("/archive-games") ||
    pathname.startsWith("/taste-dna") ||
    pathname.startsWith("/result-lab") ||
    pathname.startsWith("/compare") ||
    pathname.startsWith("/predictions")
  ) return "play";
  if (pathname.startsWith("/my-solaris") || pathname.startsWith("/country-hub") || pathname.startsWith("/me")) return "personal";
  if (
    pathname.startsWith("/participate") ||
    pathname.startsWith("/confirmations") ||
    pathname.startsWith("/jury-voting") ||
    pathname.startsWith("/televoting") ||
    pathname.startsWith("/next-in-line")
  ) return "participate";
  return "default";
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

  const count = strong ? 18 : 6;
  for (let index = 0; index < count; index += 1) {
    const star = document.createElement("span");
    star.className = "solaris-anniversary-burst-star";
    star.style.setProperty("--burst-color", STAR_COLORS[index % STAR_COLORS.length]);
    star.style.setProperty("--burst-angle", `${(360 / count) * index + ((index % 3) * 5)}deg`);
    star.style.setProperty("--burst-distance", `${strong ? 54 + ((index * 19) % 78) : 24 + ((index * 13) % 34)}px`);
    star.style.setProperty("--burst-size", `${strong ? 8 + ((index * 7) % 13) : 5 + ((index * 5) % 7)}px`);
    star.style.setProperty("--burst-rotate", `${(index * 83) % 360}deg`);
    star.style.setProperty("--burst-delay", `${(index % 4) * 10}ms`);
    burst.appendChild(star);
  }

  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), 900);
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
  const tone = useMemo(() => anniversaryTone(pathname), [pathname]);
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
    const timeout = window.setTimeout(() => setShowIntro(false), 1650);
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
    if (active) document.body.dataset.solarisAnniversaryTone = tone;
    else delete document.body.dataset.solarisAnniversaryTone;

    return () => {
      document.body.classList.remove("solaris-anniversary-day");
      delete document.body.dataset.solarisAnniversary;
      delete document.body.dataset.solarisAnniversaryTone;
      delete document.body.dataset.solarisAnniversaryPhase;
    };
  }, [active, season.phase, season.year, tone]);

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
      : `The celebration stays visible for a few days while Solaris moves into its ${ordinal(season.age + 1)} year.`;

    return isAdmin ? null : (
      <>
        <Link to="/anniversary" className="solaris-anniversary-global-badge" aria-label="Open the Solaris anniversary hub">
          <span className="solaris-anniversary-badge-star" aria-hidden="true" />
          <span>17 September</span>
          <span className="solaris-anniversary-badge-divider">·</span>
          <strong>{countdown ? title : `Year ${season.age + 1} begins`}</strong>
        </Link>

        <aside className={`solaris-anniversary-season-notice ${countdown ? "solaris-anniversary-season-notice--countdown" : "solaris-anniversary-season-notice--after"}`}>
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

      <Link
        to="/anniversary"
        className="solaris-anniversary-global-badge"
        aria-label={`Open the ${season.ordinal} Solaris anniversary hub`}
        data-anniversary-action="major"
      >
        <span className="solaris-anniversary-badge-star" aria-hidden="true" />
        <span>17 September</span>
        <span className="solaris-anniversary-badge-divider">·</span>
        <strong>{season.age} years of Solaris</strong>
      </Link>

      {!isAdmin && pathname !== "/" && !pathname.startsWith("/anniversary") ? (
        <Suspense fallback={null}>
          <LazyAnniversaryDeepDive anniversaryYear={season.year} age={season.age} />
        </Suspense>
      ) : null}

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
