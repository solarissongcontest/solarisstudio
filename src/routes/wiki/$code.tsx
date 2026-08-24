import { createFileRoute } from "@tanstack/react-router";

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
  return (
    <>
      <CountryPersonalityStyles />
      <CountryWikiExperience code={code} />
    </>
  );
}
