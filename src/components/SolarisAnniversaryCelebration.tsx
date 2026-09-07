import { useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import "@/anniversary-global.css";
import { SiteAnniversaryContext } from "@/components/SiteAnniversaryContext";
import {
  getSolarisAnniversarySeason,
  type AnniversaryPhase,
  type SolarisAnniversarySeason,
} from "@/lib/anniversary";

const LEGACY_PREVIEW_KEY = "solaris:anniversary-preview";
const INTRO_KEY_PREFIX = "solaris:anniversary-intro";
const STAR_COLORS = ["#74e7ff", "#b7a4ff", "#ff8fc7", "#ffe36e", "#78f3d0", "#ffffff"];

const FALLING_STARS = Array.from({ length: 48 }, (_, index) => ({
  left: `${(index * 37 + 11) % 100}%`,
  size: `${10 + ((index * 19) % 28)}px`,
  color: STAR_COLORS[index % STAR_COLORS.length],
  opacity: 0.24 + ((index * 13) % 38) / 100,
  duration: `${10 + ((index * 23) % 88) / 10}s`,
  delay: `${-((index * 0.83) % 18)}s`,
  drift: `${-180 + ((index * 47) % 360)}px`,
  rotate: `${(index * 73) % 360}deg`,
  scale: 0.62 + ((index * 17) % 44) / 100,
}));

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

function createStarBurst(x: number, y: number, count: number) {
  const burst = document.createElement("span");
  burst.className = "solaris-anniversary-star-burst";
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;

  for (let index = 0; index < count; index += 1) {
    const star = document.createElement("span");
    star.className = "solaris-anniversary-burst-star";
    star.style.setProperty("--burst-color", STAR_COLORS[index % STAR_COLORS.length]);
    star.style.setProperty("--burst-angle", `${(360 / count) * index + ((index % 3) * 5)}deg`);
    star.style.setProperty("--burst-distance", `${36 + ((index * 19) % (count > 10 ? 92 : 52))}px`);
    star.style.setProperty("--burst-size", `${7 + ((index * 7) % (count > 10 ? 14 : 9))}px`);
    star.style.setProperty("--burst-rotate", `${(index * 83) % 360}deg`);
    star.style.setProperty("--burst-delay", `${(index % 4) * 10}ms`);
    burst.appendChild(star);
  }

  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), 980);
}

export function SolarisAnniversaryCelebration() {
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

  useEffect(() => {
    if (season.phase === "dormant") {
      delete document.body.dataset.solarisAnniversaryPhase;
      delete document.body.dataset.solarisAnniversary;
      document.body.classList.remove("solaris-anniversary-day");
      return;
    }

    document.body.dataset.solarisAnniversaryPhase = season.phase;
    document.body.dataset.solarisAnniversary = String(season.year);
    document.body.classList.toggle("solaris-anniversary-day", active);

    return () => {
      delete document.body.dataset.solarisAnniversaryPhase;
      delete document.body.dataset.solarisAnniversary;
      document.body.classList.remove("solaris-anniversary-day");
    };
  }, [active, season.phase, season.year]);

  useEffect(() => {
    if (!active) {
      setShowIntro(false);
      return;
    }

    const key = `${INTRO_KEY_PREFIX}:${season.year}`;
    if (window.sessionStorage.getItem(key)) return;

    window.sessionStorage.setItem(key, "1");
    setShowIntro(true);
    const timeout = window.setTimeout(() => setShowIntro(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [active, season.year]);

  useEffect(() => {
    if (!active) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href], button") : null;
      if (!target || reducedMotion.matches) return;

      const major = Boolean(
        target.closest(
          ".anniversary-route-cta, .anniversary-hub-actions, .anniversary-nav-link, .anniversary-v2-actions",
        ),
      );
      createStarBurst(event.clientX, event.clientY, major ? 20 : 8);

      if (!(target instanceof HTMLAnchorElement)) return;
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (target.target === "_blank" || target.hasAttribute("download")) return;

      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (!major) return;

      event.preventDefault();
      event.stopPropagation();
      window.setTimeout(() => window.location.assign(url.href), 210);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [active]);

  const siteContext = <SiteAnniversaryContext />;
  if (season.phase === "dormant") return siteContext;

  const badge =
    season.phase === "countdown"
      ? season.daysUntil === 1
        ? "Anniversary tomorrow"
        : `${season.daysUntil} days to Anniversary Day`
      : season.phase === "after"
        ? `Solaris Year ${season.age + 1} begins`
        : `${season.age} years of Solaris`;

  return (
    <>
      {siteContext}
      {showIntro && (
        <div className="solaris-anniversary-intro" aria-hidden="true">
          <span className="solaris-anniversary-intro-orbit" />
          <strong>{String(season.age).padStart(2, "0")}</strong>
          <span>YEARS OF SOLARIS</span>
          <small>17 · 09 · 2022</small>
        </div>
      )}

      <div className={`solaris-anniversary-global phase-${season.phase}`} aria-hidden="true">
        {active && <div className="solaris-anniversary-global-wash" />}
        {active && (
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
        )}

        <div className="solaris-anniversary-global-badge">
          <span className="solaris-anniversary-badge-star" />
          <span>17 September</span>
          <span className="solaris-anniversary-badge-divider">·</span>
          <strong>{badge}</strong>
        </div>
      </div>
    </>
  );
}
