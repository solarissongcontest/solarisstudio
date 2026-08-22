import { useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

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

export function HomeAnniversaryTakeover() {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const [clock, setClock] = useState(() => new Date());

  const preview = useMemo(
    () => new URLSearchParams(searchStr).get("anniversary") === "preview",
    [searchStr],
  );

  useEffect(() => {
    const tick = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const baseAnniversary = useMemo(() => getSolarisAnniversary(clock), [clock]);
  const active = baseAnniversary.active || preview;

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
