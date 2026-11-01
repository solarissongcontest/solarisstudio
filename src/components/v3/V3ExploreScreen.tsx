import { Link } from "@tanstack/react-router";
import { Archive, ChevronRight, Compass, Search, Sparkles, type LucideIcon } from "lucide-react";

import type {
  V3EditionExperience,
  V3ExploreCollection,
  V3ExploreEditionCard,
  V3ExploreRootProjection,
} from "@/lib/v3-explore";
import { V3Screen, V3Section, V3StatusChip, type V3StatusTone } from "./V3Foundation";

export type V3ExploreScreenProps = {
  projection: V3ExploreRootProjection;
  onOpenSearch: () => void;
};

const COLLECTION_DESCRIPTIONS: Record<V3ExploreCollection["key"], string> = {
  countries: "Delegations, current entries and participation histories",
  "songs-and-artists": "Published song and artist labels in their Entry and Edition context",
  shows: "Shows, running orders and public show context",
  stories: "Editorial stories and important Solaris moments",
};

const MORE_DESCRIPTIONS: Record<string, string> = {
  live: "Follow the current public show in Live Mode",
  results: "Open official Results, records and deeper result tools",
  rules: "Official rules, guidance, interpretations and rule history",
  "archive-games": "Play public experiences built from Solaris archive history",
  "advanced-discovery": "Browse the site directory and specialist public discovery tools",
};

function experiencePresentation(experience: V3EditionExperience): { label: string; tone: V3StatusTone } {
  switch (experience) {
    case "live": return { label: "Live", tone: "live" };
    case "results": return { label: "Results", tone: "success" };
    case "post-edition": return { label: "Complete", tone: "success" };
    case "archived": return { label: "Archive", tone: "neutral" };
    case "show-day": return { label: "Show day", tone: "warning" };
    case "pre-show": return { label: "Pre-show", tone: "progress" };
    case "upcoming": return { label: "Upcoming", tone: "progress" };
  }
}

function editionMeta(edition: V3ExploreEditionCard): string {
  return [edition.hostLabel, edition.year?.toString()].filter(Boolean).join(" · ");
}

function itemCountLabel(count: number): string {
  return `${count.toLocaleString()} public item${count === 1 ? "" : "s"}`;
}

function ExploreRow({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to as any}
      className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      <span className="grid size-9 shrink-0 place-items-center text-[var(--v3-accent-strong)]" aria-hidden="true">
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-white/45">{description}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-white/24" aria-hidden="true" />
    </Link>
  );
}

function CurrentEdition({ edition }: { edition: V3ExploreEditionCard }) {
  const status = experiencePresentation(edition.experience);
  const meta = editionMeta(edition);

  return (
    <article className="overflow-hidden border-y border-white/[0.08]" data-v3-explore-current-edition="">
      {edition.artworkUrl ? (
        <div className="relative aspect-[16/6] overflow-hidden bg-white/[0.025]">
          <img src={edition.artworkUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--v3-bg-base)] via-transparent to-transparent" aria-hidden="true" />
        </div>
      ) : null}
      <div className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="v3-kicker">Current edition</p>
            <h2 className="mt-2 text-[1.6rem] font-semibold leading-[1.02] tracking-[-0.045em]">{edition.name}</h2>
            {meta ? <p className="mt-2 text-xs leading-5 text-white/48">{meta}</p> : null}
          </div>
          <V3StatusChip tone={status.tone}>{status.label}</V3StatusChip>
        </div>
        <div className="mt-4 divide-y divide-white/[0.065] border-t border-white/[0.07]">
          {edition.experience === "live" && edition.liveHref ? (
            <ExploreRow to={edition.liveHref} icon={Sparkles} title="Open Live Mode" description="Follow the current public show as it happens" />
          ) : null}
          <ExploreRow to={edition.href} icon={Compass} title="Open edition" description="Participants, songs, schedule, stories and public results" />
          {edition.nextEvent ? (
            <ExploreRow to={edition.nextEvent.href} icon={Compass} title={edition.nextEvent.title} description={edition.nextEvent.startsAt ?? "Time to be announced"} />
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function V3ExploreScreen({ projection, onOpenSearch }: V3ExploreScreenProps) {
  return (
    <V3Screen>
      <header className="mb-5" data-v3-explore-header="">
        <p className="v3-kicker">Explore Solaris</p>
        <h1 className="mt-2 max-w-[16ch] text-[clamp(1.9rem,8vw,2.7rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
          Discover the contest
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
          Editions, delegations, songs, artists, shows and stories. Outcomes and score analysis stay in Results.
        </p>
      </header>

      <button
        type="button"
        onClick={onOpenSearch}
        className="flex min-h-14 w-full items-center gap-3 border-y border-white/[0.08] py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        data-v3-explore-search=""
      >
        <Search className="size-5 shrink-0 text-[var(--v3-accent-strong)]" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Search Solaris</span>
          <span className="mt-0.5 block text-xs text-white/44">Find any public edition, country, entry, show or story</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-white/24" aria-hidden="true" />
      </button>

      <V3Section title="Current edition">
        {projection.currentEdition ? (
          <CurrentEdition edition={projection.currentEdition} />
        ) : (
          <p className="border-y border-white/[0.07] py-4 text-sm text-white/48">No current edition is public. The archive remains available below.</p>
        )}
      </V3Section>

      <V3Section title="Discover" meta={`${projection.discover.length} collections`}>
        <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]" data-v3-explore-collections="">
          {projection.discover.map((collection) => (
            <ExploreRow
              key={collection.key}
              to={collection.href}
              icon={Compass}
              title={collection.label}
              description={`${COLLECTION_DESCRIPTIONS[collection.key]} · ${itemCountLabel(collection.publicItemCount)}`}
            />
          ))}
        </div>
      </V3Section>

      <V3Section title="Archive" meta={projection.archive.editions.length ? `${projection.archive.editions.length} editions` : undefined}>
        <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]">
          {projection.archive.links.map((link) => (
            <ExploreRow
              key={link.key}
              to={link.href}
              icon={Archive}
              title={link.label}
              description={link.key === "editions" ? "Browse the Solaris edition archive" : `Open the Solaris ${link.label.toLowerCase()}`}
            />
          ))}
          {projection.archive.editions.slice(0, 4).map((edition) => (
            <ExploreRow
              key={edition.id}
              to={edition.href}
              icon={Archive}
              title={edition.name}
              description={[editionMeta(edition), edition.resultsAvailable ? "Official results available" : "Explore edition"].filter(Boolean).join(" · ")}
            />
          ))}
        </div>
      </V3Section>

      {projection.more.length ? (
        <V3Section title="More Solaris">
          <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]">
            {projection.more.map((link) => (
              <ExploreRow
                key={link.key}
                to={link.href}
                icon={Sparkles}
                title={link.label}
                description={MORE_DESCRIPTIONS[link.key] ?? "Open an additional Solaris discovery experience"}
              />
            ))}
          </div>
        </V3Section>
      ) : null}
    </V3Screen>
  );
}
