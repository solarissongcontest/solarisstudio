import { createFileRoute } from "@tanstack/react-router";

import { WorldCountryGovernmentScreen } from "@/components/world/WorldCountryGovernment";
import { WorldPublicGate } from "@/components/world/WorldPublic";

/**
 * Path-unnested route: /world/countries/:code/government is independent of
 * the parallel TG3 International /world/countries/:code screen's layout.
 */
export const Route = createFileRoute("/world/countries/$code_/government")({
  head: ({ params }) => ({
    meta: [{ title: `Government · ${params.code.toUpperCase()} — Terra Solaris` }],
  }),
  component: GovernmentPage,
});

function GovernmentPage() {
  const { code } = Route.useParams();
  return <WorldPublicGate verifyOnMount><WorldCountryGovernmentScreen code={code} /></WorldPublicGate>;
}