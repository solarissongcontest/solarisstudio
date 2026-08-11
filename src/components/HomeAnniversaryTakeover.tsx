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
    return () => document.body.classList.remove("solaris-anniversary-day");
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
