import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { CountryPersonalityStyles } from "@/components/CountryPersonalityStyles";
import { CountryDesignV2Styles } from "@/components/country/CountryDesignV2Styles";
import { CountryWikiExperience } from "@/components/wiki/CountryWikiExperience";

export const Route = createFileRoute("/wiki/$code")({
  head: ({ params }) => {
    const code = params.code.toUpperCase();
    const url = `https://studio.solaris-song-contest.workers.dev/wiki/${encodeURIComponent(params.code)}`;
    return {
      meta: [
        { title: `${code} — Terra Solaris Wiki` },
        {
          name: "description",
          content: `Terra Solaris Wiki article and published contest history for ${code}.`,
        },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Wiki",
                item: "https://studio.solaris-song-contest.workers.dev/wiki",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: code,
                item: url,
              },
            ],
          }),
        },
      ],
    };
  },
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
      <CountryDesignV2Styles />
      {clientReady ? <CountryWikiExperience code={code} /> : <WikiHydrationSkeleton />}
    </>
  );
}

function WikiHydrationSkeleton() {
  return (
    <AppShell>
      <div className="wiki-canvas wiki-loading" role="status" aria-label="Loading Wiki article">
        <h1 className="sr-only">Loading Terra Solaris Wiki article</h1>
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
