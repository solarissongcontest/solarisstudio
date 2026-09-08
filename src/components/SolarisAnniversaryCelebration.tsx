import { Link, useLocation } from "@tanstack/react-router";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";

import "@/anniversary-global.css";
import "@/anniversary-sitewide.css";
import "@/anniversary-season.css";
import "@/anniversary-deep.css";
import { AnniversaryNavLink } from "@/components/AnniversaryNavLink";
import {
  getSolarisAnniversarySeason,
  ordinal,
  type AnniversaryPhase,
  type SolarisAnniversarySeason,
} from "@/lib/anniversary";
import { getAnniversaryPreviewPhase } from "@/lib/anniversary-preview";

const LazyDeepExperience = lazy(() =>
  import("@/components/AnniversaryDeepExperience").then((module) => ({ default: module.AnniversaryDeepExperience })),
);
const LazyMilestones = lazy(() =>
  import("@/components/AnniversaryMilestones").then((module) => ({ default: module.AnniversaryMilestones })),
);
const LazyShareCard = lazy(() =>
  import("@/components/AnniversaryShareCard").then((module) => ({ default: module.AnniversaryShareCard })),
);
const LazySubmissionMoment = lazy(() =>
  import("@/components/AnniversarySubmissionMoment").then((module) => ({ default: module.AnniversarySubmissionMoment })),
);
const LazyTasteEra = lazy(() =>
  import("@/components/AnniversaryTasteEra").then((module) => ({ default: module.AnniversaryTasteEra })),
);

const INTRO_SEEN_KEY = "solaris:anniversary-intro-seen";
const STAR_COLORS = ["#74e7ff", "#b7a4ff", "#ff8fc7", "#ffe36e", "#78f3d0", "#ffffff"];

const FALLING_STARS = Array.from({ length: 42 }, (_, index) => ({
  left: `${(index * 37 + 11) % 100}%`,
  size: `${9 + ((index * 19) % 25)}px`,
  color: STAR_COLORS[index % STAR_COLORS.length],
  opacity: 0.22 + ((index * 13) % 34) / 100,
  duration: `${10.5 + ((index * 23) % 90) / 10}s`,
  delay: `${-((index * 0.83) % 18)}s`,
  drift: `${-160 + ((index * 47) % 320)}px`,
  rotate: `${(index * 73) % 360}deg`,
  scale: 0.58 + ((index * 17) % 42) / 100,
}));

type AnniversaryRouteContext = {
  eyebrow: string;
  title: string;
  detail: string;
  tone: "archive" | "data" | "play" | "participate" | "personal" | "default";
};

function routeContext(pathname: string, age: number): AnniversaryRouteContext {
  if (pathname.startsWith("/editions")) return { eyebrow: `${age} years, edition by edition`, title: "Walk through Solaris history", detail: "The edition archive becomes a chronological anniversary story.", tone: "archive" };
  if (pathname.startsWith("/countries") || pathname.startsWith("/wiki")) return { eyebrow: "Across Terra Solaris", title: "Every delegation has a history", detail: "Debuts, finals, victories and milestones now sit inside the wider anniversary archive.", tone: "archive" };
  if (pathname.startsWith("/records")) return { eyebrow: `${age} years of records`, title: "Records made to be broken", detail: "Historic scores, streaks and surviving milestones are surfaced from the archive.", tone: "data" };
  if (pathname.startsWith("/results") || pathname.startsWith("/analysis") || pathname.startsWith("/relationships") || pathname.startsWith("/scorecharts") || pathname.startsWith("/broadcast-intelligence")) return { eyebrow: "Anniversary intelligence", title: `${age} years hidden in the numbers`, detail: "Results, voting relationships and scoreboard turning points get historical context.", tone: "data" };
  if (pathname.startsWith("/archive-games") || pathname.startsWith("/taste-dna") || pathname.startsWith("/result-lab") || pathname.startsWith("/compare") || pathname.startsWith("/predictions")) return { eyebrow: "Anniversary challenge", title: `Play with ${age} years of history`, detail: "Interactive tools use the archive as an anniversary playground.", tone: "play" };
  if (pathname.startsWith("/my-solaris") || pathname.startsWith("/country-hub") || pathname.startsWith("/me")) return { eyebrow: "Your Solaris story", title: "You are part of the archive", detail: "Your country history is calculated against the whole published contest archive.", tone: "personal" };
  if (pathname.startsWith("/participate") || pathname.startsWith("/confirmations") || pathname.startsWith("/jury-voting") || pathname.startsWith("/televoting") || pathname.startsWith("/next-in-line")) return { eyebrow: "The next chapter", title: `Be part of Solaris year ${age + 1}`, detail: "Anniversary styling stays restrained on task-focused voting and submission routes.", tone: "participate" };
  return { eyebrow: "Solaris anniversary day", title: `${age} years of Solaris`, detail: "17 September 2022 → today. The whole Studio is celebrating the archive.", tone: "default" };
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
    star.style.setProperty("--burst-distance", `${strong ? 56 + ((index * 19) % 82) : 24 + ((index * 13) % 34)}px`);
    star.style.setProperty("--burst-size", `${strong ? 8 + ((index * 7) % 13) : 5 + ((index * 5) % 7)}px`);
    star.style.setProperty("--burst-rotate", `${(index * 83) % 360}deg`);
    star.style.setProperty("--burst-delay", `${(index % 4) * 10}ms`);
    burst.appendChild(star);
  }
  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), 980);
}

function isDeepRoute(pathname: string) {
  return [
    "/editions",
    "/countries",
    "/wiki",
    "/records",
    "/results",
    "/shows",
    "/analysis",
    "/relationships",
    "/pulse",
    "/archive-games",
    "/taste-dna",
    "/result-lab",
    "/broadcast-intelligence",
    "/compare",
    "/predictions",
    "/my-solaris",
    "/country-hub",
    "/me",
    "/participate",
    "/confirmations",
    "/jury-voting",
    "/televoting",
    "/next-in-line",
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function SolarisAnniversaryCelebration() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const [clock, setClock] = useState(() => new Date());
  const [showIntro, setShowIntro] = useState(false);
  const [badgeExpanded, setBadgeExpanded] = useState(false);

  useEffect(() => {
    const tick = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    setBadgeExpanded(false);
  }, [pathname]);

  useEffect(() => {
    if (!badgeExpanded) return;
    const timeout = window.setTimeout(() => setBadgeExpanded(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [badgeExpanded]);

  const previewPhase = useMemo(() => getAnniversaryPreviewPhase(searchStr), [searchStr, pathname]);
  const season = useMemo(() => withPreview(getSolarisAnniversarySeason(clock), previewPhase), [clock, previewPhase]);
  const active = season.phase === "active";
  const context = useMemo(() => routeContext(pathname, season.age), [pathname, season.age]);
  const isAdmin = pathname.startsWith("/admin") || pathname.startsWith("/confirmations/admin") || pathname.startsWith("/televoting/admin");
  const personalRoute = pathname.startsWith("/my-solaris") || pathname.startsWith("/country-hub") || pathname.startsWith("/me");
  const countryRoute = pathname.startsWith("/countries/") || pathname.startsWith("/wiki/");
  const submissionRoute = pathname.startsWith("/confirmations") || pathname.startsWith("/televoting") || pathname.startsWith("/jury-voting") || pathname.startsWith("/next-in-line");

  const handleBadgeClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 639px)").matches) return;
    if (!badgeExpanded) {
      event.preventDefault();
      setBadgeExpanded(true);
    }
  };

  const badgeClassName = `solaris-anniversary-global-badge ${badgeExpanded ? "is-expanded" : "is-collapsed"}`;

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
    const timeout = window.setTimeout(() => setShowIntro(false), 1600);
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
      createStarBurst(event.clientX, event.clientY, Boolean(target.closest("[data-anniversary-action='major']")));
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [active]);

  if (season.phase === "dormant") return null;

  if (!active) {
    if (isAdmin) return null;
    const countdown = season.phase === "countdown";
    const title = countdown
      ? season.daysUntil === 1 ? "Anniversary Day is tomorrow" : `${season.daysUntil} days until Anniversary Day`
      : `Solaris year ${season.age + 1} has begun`;
    const detail = countdown
      ? `The ${season.ordinal} anniversary arrives on 17 September. The full Studio takeover unlocks on Anniversary Day.`
      : `The celebration stays visible for a few days while Solaris moves into its ${ordinal(season.age + 1)} year.`;
    return (
      <>
        <Link
          to="/anniversary"
          className={badgeClassName}
          aria-label={badgeExpanded ? "Open the Solaris anniversary hub" : "Show anniversary status"}
          aria-expanded={badgeExpanded}
          onClick={handleBadgeClick}
        >
          <span className="solaris-anniversary-badge-star" aria-hidden="true" />
          <span className="solaris-anniversary-badge-copy">
            <span>17 September</span><span className="solaris-anniversary-badge-divider">·</span>
            <strong>{countdown ? title : `Year ${season.age + 1} begins`}</strong>
          </span>
        </Link>
        <aside className={`solaris-anniversary-season-notice ${countdown ? "solaris-anniversary-season-notice--countdown" : "solaris-anniversary-season-notice--after"}`}>
          <div className="solaris-anniversary-season-mark" aria-hidden="true"><span>{countdown ? season.daysUntil : String(season.age + 1).padStart(2, "0")}</span></div>
          <div className="solaris-anniversary-season-copy"><p>{countdown ? "Anniversary countdown" : "The anniversary afterglow"}</p><strong>{title}</strong><span>{detail}</span></div>
          <Link to="/anniversary" className="solaris-anniversary-season-action">{countdown ? "Preview the anniversary" : "Revisit the anniversary"} <span aria-hidden="true">→</span></Link>
        </aside>
      </>
    );
  }

  return (
    <>
      {!isAdmin && <AnniversaryNavLink />}
      {!isAdmin && (
        <Suspense fallback={null}>
          {isDeepRoute(pathname) ? <LazyDeepExperience /> : null}
          {countryRoute || personalRoute ? <LazyMilestones /> : null}
          {pathname.startsWith("/taste-dna") ? <LazyTasteEra /> : null}
          {personalRoute ? <LazyShareCard /> : null}
          {submissionRoute ? <LazySubmissionMoment /> : null}
        </Suspense>
      )}
      <div className="solaris-anniversary-global" aria-hidden="true">
        <div className="solaris-anniversary-global-wash" />
        <div className="solaris-anniversary-orbits"><span /><span /><span /></div>
        <div className="solaris-anniversary-global-stars">
          {FALLING_STARS.map((star, index) => (
            <span key={index} className="solaris-anniversary-falling-star" style={{ left: star.left, "--star-size": star.size, "--star-color": star.color, "--star-opacity": star.opacity, "--star-duration": star.duration, "--star-delay": star.delay, "--star-drift": star.drift, "--star-rotate": star.rotate, "--star-scale": star.scale } as CSSProperties} />
          ))}
        </div>
      </div>
      <Link
        to="/anniversary"
        className={badgeClassName}
        aria-label={badgeExpanded ? `Open the ${season.ordinal} Solaris anniversary hub` : "Show anniversary status"}
        aria-expanded={badgeExpanded}
        data-anniversary-action="major"
        onClick={handleBadgeClick}
      >
        <span className="solaris-anniversary-badge-star" aria-hidden="true" />
        <span className="solaris-anniversary-badge-copy">
          <span>17 September</span><span className="solaris-anniversary-badge-divider">·</span><strong>{season.age} years of Solaris</strong>
        </span>
      </Link>
      {pathname !== "/" && !isAdmin && (
        <aside className={`solaris-anniversary-context solaris-anniversary-context--${context.tone}`}>
          <div className="solaris-anniversary-context-mark" aria-hidden="true"><span>{String(season.age).padStart(2, "0")}</span></div>
          <div className="solaris-anniversary-context-copy"><p>{context.eyebrow}</p><strong>{context.title}</strong><span>{context.detail}</span></div>
          <Link to="/anniversary" className="solaris-anniversary-context-action" data-anniversary-action="major">Anniversary hub <span aria-hidden="true">→</span></Link>
        </aside>
      )}
      {showIntro && (
        <div className="solaris-anniversary-intro" role="status" aria-live="polite">
          <div className="solaris-anniversary-intro-orbit" aria-hidden="true" /><p>17 · 09 · 2022</p><strong>{season.age} YEARS OF SOLARIS</strong><span>Anniversary Day</span>
        </div>
      )}
    </>
  );
}