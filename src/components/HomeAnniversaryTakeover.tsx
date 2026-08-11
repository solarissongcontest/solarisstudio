import { useEffect, useMemo } from "react";

import { AnniversaryTakeover } from "@/components/AnniversaryTakeover";
import {
  buildAnniversaryRecap,
  getSolarisAnniversary,
} from "@/lib/anniversary";
import {
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";

export function HomeAnniversaryTakeover() {
  const anniversary = useMemo(() => getSolarisAnniversary(), []);
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: countries } = useCountries();

  useEffect(() => {
    if (!anniversary.active) return;
    document.body.classList.add("solaris-anniversary-day");
    return () => document.body.classList.remove("solaris-anniversary-day");
  }, [anniversary.active]);

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

  if (!anniversary.active) return null;

  return <AnniversaryTakeover anniversary={anniversary} recap={recap} />;
}
