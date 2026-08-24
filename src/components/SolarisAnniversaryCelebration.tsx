import { useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import "@/anniversary-global.css";
import { getSolarisAnniversary } from "@/lib/anniversary";

const LEGACY_PREVIEW_KEY = "solaris:anniversary-preview";
const STAR_COLORS = ["#74e7ff", "#b7a4ff", "#ff8fc7", "#ffe36e", "#78f3d0", "#ffffff"];

const FALLING_STARS = Array.from({ length: 72 }, (_, index) => ({
  left: `${(index * 37 + 11) % 100}%`,
  size: `${14 + ((index * 19) % 34)}px`,
  color: STAR_COLORS[index % STAR_COLORS.length],
  opacity: 0.42 + ((index * 13) % 46) / 100,
  duration: `${7.2 + ((index * 23) % 72) / 10}s`,
  delay: `${-((index * 0.83) % 15)}s`,
  drift: `${-150 + ((index * 47) % 300)}px`,
  rotate: `${(index * 73) % 360}deg`,
  scale: 0.72 + ((index * 17) % 54) / 100,
}));

function createStarBurst(x: number, y: number) {
  const burst = document.createElement("span");
  burst.className = "solaris-anniversary-star-burst";
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;

  for (let index = 0; index < 26; index += 1) {
    const star = document.createElement("span");
    star.className = "solaris-anniversary-burst-star";
    star.style.setProperty("--burst-color", STAR_COLORS[index % STAR_COLORS.length]);
    star.style.setProperty("--burst-angle", `${(360 / 26) * index + ((index % 3) * 5)}deg`);
    star.style.setProperty("--burst-distance", `${54 + ((index * 19) % 105)}px`);
    star.style.setProperty("--burst-size", `${10 + ((index * 7) % 18)}px`);
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

  const preview = useMemo(
    () => new URLSearchParams(searchStr).get("anniversary") === "preview",
    [searchStr],
  );

  useEffect(() => {
    // Remove the old sticky preview flag from earlier builds. Preview mode is
    // deliberately URL-scoped now so Anniversary Day can never remain enabled
    // accidentally on an ordinary date.
    window.sessionStorage.removeItem(LEGACY_PREVIEW_KEY);

    // The anniversary state only changes at a date boundary. Checking once a
    // minute keeps the page accurate without re-rendering the application
    // every second on the other 364 days of the year.
    const tick = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  const anniversary = useMemo(() => getSolarisAnniversary(clock), [clock]);
  const active = anniversary.active || preview;

  useEffect(() => {
    if (!active) {
      document.body.classList.remove("solaris-anniversary-day");
      delete document.body.dataset.solarisAnniversary;
      return;
    }

    document.body.classList.add("solaris-anniversary-day");
    document.body.dataset.solarisAnniversary = String(anniversary.year);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href], button") : null;
      if (!target || reducedMotion.matches) return;

      createStarBurst(event.clientX, event.clientY);

      if (!(target instanceof HTMLAnchorElement)) return;
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (target.target === "_blank" || target.hasAttribute("download")) return;

      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      // Give the cannon burst enough time to be visible before the route swaps.
      event.preventDefault();
      event.stopPropagation();
      window.setTimeout(() => window.location.assign(url.href), 260);
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.body.classList.remove("solaris-anniversary-day");
      delete document.body.dataset.solarisAnniversary;
      document.removeEventListener("click", handleClick, true);
    };
  }, [active, anniversary.year]);

  if (!active) return null;

  return (
    <div className="solaris-anniversary-global" aria-hidden="true">
      <div className="solaris-anniversary-global-wash" />
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

      <div className="solaris-anniversary-global-badge">
        <span className="solaris-anniversary-badge-star" />
        <span>17 September</span>
        <span className="solaris-anniversary-badge-divider">·</span>
        <strong>{anniversary.age} years of Solaris</strong>
      </div>
    </div>
  );
}
