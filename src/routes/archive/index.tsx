import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Flag,
  Gamepad2,
  Newspaper,
  Tv2,
  type LucideIcon,
} from "lucide-react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen } from "@/components/v3/V3Foundation";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/archive/")({
  head: () => ({
    meta: [
      { title: "Archive — Solaris Studio" },
      {
        name: "description",
        content:
          "Explore published Solaris history across editions, countries, shows, stories, reference material and archive games.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://studio.solaris-song-contest.workers.dev/archive",
      },
    ],
  }),
  component: ArchiveRootPage,
});

type ArchiveDestination = {
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
};

const ARCHIVE_DESTINATIONS: readonly ArchiveDestination[] = [
  {
    title: "Editions",
    description: "Browse contest editions and their published historical context.",
    to: "/editions",
    icon: CalendarDays,
  },
  {
    title: "Countries",
    description: "Follow country identities, entries, results and participation history.",
    to: "/countries",
    icon: Flag,
  },
  {
    title: "Shows",
    description: "Open published semi-finals, finals and other historical show records.",
    to: "/shows",
    icon: Tv2,
  },
  {
    title: "Stories",
    description: "Read current and historical stories already released to the public.",
    to: "/stories",
    icon: Newspaper,
  },
  {
    title: "Reference",
    description: "Search publication-safe Solaris history across connected public entities.",
    to: "/encyclopedia",
    icon: BookOpen,
  },
  {
    title: "Archive Games",
    description: "Play retained historical games without changing official contest truth.",
    to: "/archive-games",
    icon: Gamepad2,
  },
] as const;

function ArchiveRootPage() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);
  const v3Available =
    isAppMode &&
    platformResolved &&
    (rollout.isLoading ||
      (rollout.isSuccess && rollout.data.enabled === true && rollout.data.exploreEnabled === true));

  if (v3Available) {
    return (
      <V3AppShell editionLabel="Solaris Studio" phaseLabel="Archive" activeArea="explore">
        <V3ArchiveRoot />
      </V3AppShell>
    );
  }

  return <LegacyArchiveRoot />;
}

function V3ArchiveRoot() {
  return (
    <V3Screen>
      <header className="mb-7 max-w-3xl" data-v3-archive-header="">
        <p className="v3-kicker">Archive</p>
        <h1 className="mt-2 max-w-[11ch] text-[clamp(2rem,9vw,3.3rem)] font-semibold leading-[0.96] tracking-[-0.055em]">
          Solaris history, in context
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[0.95rem]">
          Browse published editions, countries, shows and stories without pulling today&apos;s contest state into the past.
        </p>
      </header>

      <aside className="mb-8 border-l-2 border-[var(--v3-accent)] pl-4" aria-labelledby="archive-context-heading">
        <div className="flex items-center gap-2 text-primary">
          <Archive className="size-4" aria-hidden="true" />
          <p className="v3-kicker">Historical context</p>
        </div>
        <h2 id="archive-context-heading" className="mt-2 text-base font-semibold tracking-[-0.025em]">
          Records stay with their edition
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-white/45">
          Current participation responsibilities belong in Participate. Archive destinations only expose material their source already treats as public.
        </p>
      </aside>

      <section aria-labelledby="archive-browse-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="v3-kicker">Explore history</p>
            <h2 id="archive-browse-heading" className="mt-1 text-xl font-semibold tracking-[-0.035em]">
              Browse the archive
            </h2>
          </div>
          <span className="text-xs text-white/36">{ARCHIVE_DESTINATIONS.length} collections</span>
        </div>

        <nav aria-label="Archive collections" className="divide-y divide-white/[0.065] border-y border-white/[0.07]" data-v3-archive-list="">
          {ARCHIVE_DESTINATIONS.map((destination) => {
            const Icon = destination.icon;
            return (
              <Link
                key={destination.title}
                to={destination.to as any}
                className="group flex min-h-20 items-center gap-3 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <span className="flex size-9 shrink-0 items-center justify-center text-primary" aria-hidden="true">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold tracking-[-0.015em]">{destination.title}</span>
                  <span className="mt-1 block max-w-2xl text-xs leading-5 text-white/45">
                    {destination.description}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-white/24 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            );
          })}
        </nav>
      </section>

      <p className="mt-6 max-w-2xl text-[0.7rem] leading-5 text-white/34">
        Missing or unpublished historical material remains unavailable rather than being inferred from current contest state.
      </p>
    </V3Screen>
  );
}

function LegacyArchiveRoot() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Explore Solaris"
        title="Archive"
        description="Published Solaris history, kept in its original contest context."
      />

      <section
        className="rounded-2xl border border-border bg-surface/55 p-4 sm:p-5"
        aria-labelledby="archive-context-heading-legacy"
      >
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Archive className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id="archive-context-heading-legacy" className="font-display text-lg font-bold">
              Historical context stays historical
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Archive destinations show published records from their own edition and time context.
              Current participation responsibilities belong in Participate, not in historical
              browsing.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="archive-browse-heading-legacy">
        <div className="mb-3 border-b border-border/60 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            Historical Solaris
          </p>
          <h2 id="archive-browse-heading-legacy" className="mt-1 font-display text-xl font-bold sm:text-2xl">
            Browse the archive
          </h2>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ARCHIVE_DESTINATIONS.map((destination) => {
            const Icon = destination.icon;
            return (
              <Link
                key={destination.title}
                to={destination.to as any}
                className="group flex min-h-32 items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <span
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-background/70 text-primary"
                  aria-hidden="true"
                >
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{destination.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {destination.description}
                  </span>
                  <span className="mt-3 inline-block text-xs font-semibold text-primary transition-transform group-hover:translate-x-0.5">
                    Open →
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        Archive surfaces only expose information their destination already treats as public.
        Missing or unpublished historical material remains unavailable rather than being inferred
        from current contest state.
      </p>
    </AppShell>
  );
}
