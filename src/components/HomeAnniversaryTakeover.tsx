import { useLocation } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { AnniversaryTakeover } from "@/components/AnniversaryTakeover";
import {
  buildAnniversaryRecap,
  getSolarisAnniversary,
  type SolarisAnniversary,
} from "@/lib/anniversary";
import {
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";

function createGlitterBurst(x: number, y: number) {
  const burst = document.createElement("span");
  burst.className = "solaris-click-glitter";
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;

  for (let index = 0; index < 18; index += 1) {
    const spark = document.createElement("span");
    spark.className = `solaris-click-glitter-spark solaris-click-glitter-${index % 6}`;
    spark.style.setProperty("--spark-angle", `${(360 / 18) * index}deg`);
    spark.style.setProperty("--spark-distance", `${38 + ((index * 17) % 54)}px`);
    spark.style.setProperty("--spark-delay", `${(index % 4) * 12}ms`);
    burst.appendChild(spark);
  }

  document.body.appendChild(burst);
  window.setTimeout(() => burst.remove(), 850);
}

export function HomeAnniversaryTakeover() {
  const baseAnniversary = useMemo(() => getSolarisAnniversary(), []);
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const preview = useMemo(
    () => new URLSearchParams(searchStr).get("anniversary") === "preview",
    [searchStr],
  );
  const active = baseAnniversary.active || preview;

  useEffect(() => {
    if (!active) return;

    document.body.classList.add("solaris-anniversary-day");

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href], button") : null;
      if (!target) return;

      if (!reducedMotion.matches) {
        createGlitterBurst(event.clientX, event.clientY);
        document.documentElement.classList.remove("solaris-anniversary-impact");
        void document.documentElement.offsetWidth;
        document.documentElement.classList.add("solaris-anniversary-impact");
        window.setTimeout(
          () => document.documentElement.classList.remove("solaris-anniversary-impact"),
          360,
        );
      }

      if (!(target instanceof HTMLAnchorElement)) return;
      if (reducedMotion.matches) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (target.target === "_blank" || target.hasAttribute("download")) return;

      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      event.preventDefault();
      event.stopPropagation();
      window.setTimeout(() => window.location.assign(url.href), 330);
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.body.classList.remove("solaris-anniversary-day");
      document.documentElement.classList.remove("solaris-anniversary-impact");
      document.removeEventListener("click", handleClick, true);
    };
  }, [active]);

  if (!active) return null;

  const anniversary: SolarisAnniversary = {
    ...baseAnniversary,
    active: true,
  };

  return <AnniversaryData anniversary={anniversary} />;
}

function AnniversaryData({ anniversary }: { anniversary: SolarisAnniversary }) {
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: countries } = useCountries();

  const recap = useMemo(
    () =>
      buildAnniversaryRecap({
        anniversaryYear: anniversary.year,
        editions: editions ?? [],
        shows: shows ?? [],
        participants: participants ?? [],
        results: results ?? [],
        countries: countries ?? [],
      }),
    [anniversary.year, editions, shows, participants, results, countries],
  );

  return <AnniversaryTakeover anniversary={anniversary} recap={recap} />;
}
