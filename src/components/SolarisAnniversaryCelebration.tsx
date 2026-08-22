import { useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import "@/anniversary-global.css";
import { getSolarisAnniversary } from "@/lib/anniversary";

const STAR_COLORS = ["#74e7ff", "#b7a4ff", "#ff8fc7", "#ffe36e", "#78f3d0", "#ffffff"];
const PREVIEW_KEY = "solaris:anniversary-preview";

const FALLING_STARS = Array.from({ length: 64 }, (_, index) => ({
  left: `${(index * 37 + 11) % 100}%`,
  size: `${13 + ((index * 19) % 31)}px`,
  color: STAR_COLORS[index % STAR_COLORS.length],
  opacity: 0.32 + ((index * 13) % 48) / 100,
  duration: `${8.5 + ((index * 23) % 78) / 10}s`,
  delay: `${-((index * 0.83) % 16)}s`,
  drift: `${-120 + ((index * 47) % 240)}px`,
  rotate: `${(index * 73) % 360}deg`,
  scale: 0.72 + ((index * 17) % 48) / 100,
}));

function createStarBurst(x: number, y: number) {
  const burst = document.createElement("span");
  burst.className = "solaris-anniversary-star-burst";
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;

  for (let index = 0; index < 14; index += 1) {
    const star = document.createElement("span");
    star.className = "solaris-anniversary-burst-star";
    star.style.setProperty("--burst-color", STAR_COLORS[index % STAR_COLORS.length]);
    star.style.setProperty("--burst-angle", `${(360 / 14) * index + ((index % 2) * 9)}deg`);
    star.style.setProperty("--burst-distance", `${40 + ((index * 17) % 58)}px`);
    star.style.setProperty("--burst-size", `${9 + ((index * 7) % 13)}px`);
    star.style.setProperty("--burst-rotate", `${(index * 83) % 360}deg`);
    burst.appendChild(star);
  }

  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), 820);
}

export function SolarisAnniversaryCelebration() {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const [clock, setClock] = useState(() => new Date());
  const [previewSticky, setPreviewSticky] = useState(false);

  const previewParam = useMemo(
    () => new URLSearchParams(searchStr).get("anniversary"),
    [searchStr],
  );

  useEffect(() => {
    const tick = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (previewParam === "preview") {
      window.sessionStorage.setItem(PREVIEW_KEY, "1");
      setPreviewSticky(true);
      return;
    }
    if (previewParam === "off") {
      window.sessionStorage.removeItem(PREVIEW_KEY);
      setPreviewSticky(false);
      return;
    }
    setPreviewSticky(window.sessionStorage.getItem(PREVIEW_KEY) === "1");
  }, [previewParam]);

  const anniversary = useMemo(() => getSolarisAnniversary(clock), [clock]);
  const active = anniversary.active || previewParam === "preview" || previewSticky;

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
      if (reducedMotion.matches) return;
      const target = event.target instanceof Element ? event.target.closest("a[href], button") : null;
      if (!target) return;
      createStarBurst(event.clientX, event.clientY);
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
