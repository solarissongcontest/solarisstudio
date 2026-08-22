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

const PREVIEW_KEY = "solaris:anniversary-preview";

export function HomeAnniversaryTakeover() {
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

  const baseAnniversary = useMemo(() => getSolarisAnniversary(clock), [clock]);
  const active = baseAnniversary.active || previewParam === "preview" || previewSticky;

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
