import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { TerraWorldCountryInternationalView } from "@/components/world/TerraWorldCountryInternationalView";

export const Route = createFileRoute("/world/countries/$code")({
  head: () => ({
    meta: [
      { title: "Country International — Terra Solaris" },
      { name: "description", content: "Official public Terra Solaris country governance identity and international membership history." },
    ],
  }),
  component: WorldCountryInternationalPage,
});

function WorldCountryInternationalPage() {
  const { code } = Route.useParams();
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl pb-12 pt-4">
        <Link to="/world/countries/" className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Terra Solaris countries
        </Link>
        <TerraWorldCountryInternationalView code={code} />
      </div>
    </AppShell>
  );
}
