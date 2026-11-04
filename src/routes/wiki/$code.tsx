import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { CountryPersonalityStyles } from "@/components/CountryPersonalityStyles";
import { CountryDesignV2Styles } from "@/components/country/CountryDesignV2Styles";
import { CountryWikiExperience } from "@/components/wiki/CountryWikiExperience";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";

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
  const { isAppMode } = useSolarisApp();
  const [clientReady, setClientReady] = useState(false);
  const referenceRollout = useQuery({
    queryKey: ["studio2-feature", "public_encyclopedia"],
    queryFn: () => isStudio2FeatureEnabled("public_encyclopedia"),
    enabled: isAppMode,
    staleTime: 30_000,
  });

  useEffect(() => {
    setClientReady(true);
  }, []);

  if (isAppMode && referenceRollout.isLoading) {
    return <WikiHydrationSkeleton code={code} label="Opening canonical country profile" />;
  }

  if (isAppMode && !referenceRollout.isError && referenceRollout.data === true) {
    return <Navigate to="/countries/$code" params={{ code }} replace />;
  }

  return (
    <>
      <CountryPersonalityStyles />
      <CountryDesignV2Styles />
      {clientReady ? <CountryWikiExperience code={code} /> : <WikiHydrationSkeleton code={code} />}
    </>
  );
}

function WikiHydrationSkeleton({
  code,
  label = "Loading Terra Solaris Wiki article",
}: {
  code: string;
  label?: string;
}) {
  return (
    <AppShell>
      <div className="wiki-canvas wiki-loading" role="status" aria-label={label} aria-live="polite">
        <h1 className="sr-only">{code.toUpperCase()} — Terra Solaris Wiki</h1>
        <span className="sr-only">{label}</span>
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
