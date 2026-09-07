import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import "@/anniversary-global.css";
import "@/anniversary-sitewide.css";
import { getSolarisAnniversary } from "@/lib/anniversary";

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
      eyebrow: "Four years, edition by edition",
      title: "Walk through Solaris history",
      detail: "Every published edition is another chapter in the archive that began on 17 September 2022.",
      tone: "archive",
    };
  }
  if (pathname.startsWith("/countries") || pathname.startsWith("/wiki")) {
    return {
      eyebrow: "Across Terra Solaris",
      title: "Every delegation has a history",
      detail: "Debuts, returns, finals and victories have shaped four years of country stories.",
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
      title: "Four years hidden in the numbers",
      detail: "Explore the results, voting relationships and scoreboard moments that built the Solaris archive.",
      tone: "data",
    };
  }
  if (pathname.startsWith("/archive-games") || pathname.startsWith("/taste-dna") || pathname.startsWith("/result-lab") || pathname.startsWith("/compare")) {
    return {
      eyebrow: "Anniversary challenge",
      title: "Play with four years of history",
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
      title: "Be part of Solaris year five",
      detail: "Anniversary styling stays deliberately restrained here so the actual voting and submission tools remain usable.",
      tone: "participate",
    };
  }
  if (pathname.startsWith("/predictions")) {
    return {
      eyebrow: "Four years behind us",
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

  const preview = useMemo(
    () => new URLSearchParams(searchStr).get("anniversary") === "preview",
    [searchStr],
  );

  useEffect(() => {
    window.sessionStorage.removeItem(LEGACY_PREVIEW_KEY);
    const tick = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  const anniversary = useMemo(() => getSolarisAnniversary(clock), [clock]);
  const active = anniversary.active || preview;
  const context = useMemo(() => routeContext(pathname, anniversary.age), [pathname, anniversary.age]);

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const key = `${INTRO_SEEN_KEY}:${anniversary.year}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    setShowIntro(true);
    const timeout = window.setTimeout(() => setShowIntro(false), 1900);
    return () => window.clearTimeout(timeout);
  }, [active, anniversary.year]);

  useEffect(() => {
    if (!active) {
      document.body.classList.remove("solaris-anniversary-day");
      delete document.body.dataset.solarisAnniversary;
      delete document.body.dataset.solarisAnniversaryTone;
      return;
    }

    document.body.classList.add("solaris-anniversary-day");
    document.body.dataset.solarisAnniversary = String(anniversary.year);
    document.body.dataset.solarisAnniversaryTone = context.tone;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href], button") : null;
      if (!target || reducedMotion.matches) return;

      const strong = Boolean(target.closest("[data-anniversary-action='major']"));
      createStarBurst(event.clientX, event.clientY, strong);
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.body.classList.remove("solaris-anniversary-day");
      delete document.body.dataset.solarisAnniversary;
      delete document.body.dataset.solarisAnniversaryTone;
      document.removeEventListener("click", handleClick, true);
    };
  }, [active, anniversary.year, context.tone]);

  if (!active) return null;

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

      <div className="solaris-anniversary-global-badge" aria-label={`${anniversary.ordinal} Solaris anniversary`}>
        <span className="solaris-anniversary-badge-star" aria-hidden="true" />
        <span>17 September</span>
        <span className="solaris-anniversary-badge-divider">·</span>
        <strong>{anniversary.age} years of Solaris</strong>
      </div>

      {pathname !== "/" && (
        <aside className={`solaris-anniversary-context solaris-anniversary-context--${context.tone}`}>
          <div className="solaris-anniversary-context-mark" aria-hidden="true">
            <span>{String(anniversary.age).padStart(2, "0")}</span>
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
          <strong>{anniversary.age} YEARS OF SOLARIS</strong>
          <span>Anniversary Day</span>
        </div>
      )}
    </>
  );
}
