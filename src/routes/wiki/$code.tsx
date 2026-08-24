import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { CountryPersonalityStyles } from "@/components/CountryPersonalityStyles";
import { CountryWikiExperience } from "@/components/wiki/CountryWikiExperience";

export const Route = createFileRoute("/wiki/$code")({
  head: ({ params }) => ({
    meta: [{ title: `${params.code} — Terra Solaris Wiki` }],
  }),
  component: CountryWikiRoute,
});

function CountryWikiRoute() {
  const { code } = Route.useParams();
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    setClientReady(true);
  }, []);

  return (
    <>
      <CountryPersonalityStyles />
      {clientReady ? <CountryWikiExperience code={code} /> : <WikiHydrationSkeleton />}
    </>
  );
}

function WikiHydrationSkeleton() {
  return (
    <AppShell>
      <div className="wiki-canvas wiki-loading" role="status" aria-label="Loading Wiki article">
        <div className="wiki-loading-header" />
        <div className="wiki-loading-grid">
          <div />
          <div><i /><i /><i /><i /></div>
          <div />
        </div>
      </div>
    </AppShell>
  );
}
