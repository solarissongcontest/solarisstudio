import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { TerraWorldCountryDirectory } from "@/components/world/TerraWorldCountryDirectory";

export const Route = createFileRoute("/world/countries/")({
  head: () => ({
    meta: [
      { title: "Countries of Terra Solaris — Solaris Studio" },
      { name: "description", content: "Browse countries of Terra Solaris and their official international memberships." },
    ],
  }),
  component: WorldCountriesPage,
});

function WorldCountriesPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl pb-12 pt-4">
        <Link to="/countries" className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Contest country directory
        </Link>
        <TerraWorldCountryDirectory />
      </div>
    </AppShell>
  );
}
