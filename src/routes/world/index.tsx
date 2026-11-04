import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Globe2, Landmark } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { TerraWorldDirectory } from "@/components/world/TerraWorldDirectory";

export const Route = createFileRoute("/world/")({
  head: () => ({ meta: [
    { title: "Terra Solaris World — Solaris Studio" },
    { name: "description", content: "Discover Terra Solaris international institutions, public leadership and country memberships." },
  ] }),
  component: TerraWorldPage,
});

function TerraWorldPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-12 pb-10">
        <header className="border-b border-border/60 pb-8 pt-4 sm:pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Solaris Studio · World</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">Terra Solaris, beyond the contest.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Discover the nations and institutions shaping the wider Solaris world. Leadership, membership and institutional facts are shown only when confirmed in the public governance record.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/world/organizations/" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">Explore institutions <ArrowRight aria-hidden="true" className="size-4" /></Link>
            <Link to="/countries" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-5 text-sm font-semibold">Browse countries</Link>
          </div>
        </header>
        <TerraWorldDirectory featured />
        <section aria-labelledby="world-discover-more" className="border-t border-border/60 pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Continue exploring</p>
          <h2 id="world-discover-more" className="mt-2 text-2xl font-semibold">One world, many stories</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link to="/countries" className="group flex min-h-24 items-center gap-4 rounded-2xl border border-border p-5 hover:border-primary/40">
              <Globe2 aria-hidden="true" className="size-6 shrink-0 text-primary" />
              <span className="flex-1"><span className="block font-semibold">Countries</span><span className="mt-1 block text-sm text-muted-foreground">Explore the states of Terra Solaris.</span></span>
              <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
            </Link>
            <Link to="/world/organizations/" className="group flex min-h-24 items-center gap-4 rounded-2xl border border-border p-5 hover:border-primary/40">
              <Landmark aria-hidden="true" className="size-6 shrink-0 text-primary" />
              <span className="flex-1"><span className="block font-semibold">International institutions</span><span className="mt-1 block text-sm text-muted-foreground">Read public organizations and their current structures.</span></span>
              <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
