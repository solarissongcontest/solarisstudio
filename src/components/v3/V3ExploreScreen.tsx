import { Archive, Compass, Search, Sparkles } from "lucide-react";

import type {
  V3EditionExperience,
  V3ExploreCollection,
  V3ExploreEditionCard,
  V3ExploreRootProjection,
} from "@/lib/v3-explore";
import {
  V3ActionCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
  type V3StatusTone,
} from "./V3Foundation";

export type V3ExploreScreenProps = {
  projection: V3ExploreRootProjection;
  onOpenSearch: () => void;
};

const COLLECTION_DESCRIPTIONS: Record<V3ExploreCollection["key"], string> = {
  countries: "Delegations, current entries and participation histories",
  "songs-and-artists": "The songs and artists in the public Solaris catalogue",
  shows: "Shows, running orders and public show context",
  stories: "Editorial stories and important Solaris moments",
};

function experiencePresentation(experience: V3EditionExperience): {
  label: string;
  tone: V3StatusTone;
} {
  switch (experience) {
    case "live":
      return { label: "Live", tone: "live" };
    case "results":
      return { label: "Results", tone: "success" };
    case "post-edition":
      return { label: "Complete", tone: "success" };
    case "archived":
      return { label: "Archive", tone: "neutral" };
    case "show-day":
      return { label: "Show day", tone: "warning" };
    case "pre-show":
      return { label: "Pre-show", tone: "progress" };
    case "upcoming":
      return { label: "Upcoming", tone: "progress" };
  }
}

function editionMeta(edition: V3ExploreEditionCard): string {
  return [edition.hostLabel, edition.year?.toString()].filter(Boolean).join(" · ");
}

function itemCountLabel(count: number): string {
  return `${count.toLocaleString()} public item${count === 1 ? "" : "s"}`;
}

function CurrentEditionCard({ edition }: { edition: V3ExploreEditionCard }) {
  const status = experiencePresentation(edition.experience);
  const meta = editionMeta(edition);

  return (
    <V3Surface level="raised" className="overflow-hidden">
      {edition.artworkUrl ? (
        <div className="relative aspect-[16/7] overflow-hidden border-b border-white/[0.06] bg-white/[0.025]">
          <img
            src={edition.artworkUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent"
            aria-hidden="true"
          />
        </div>
      ) : null}

      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="v3-kicker">Current edition</p>
            <h2 className="mt-2 text-[1.65rem] font-bold leading-[1.02] tracking-[-0.045em]">
              {edition.name}
            </h2>
            {meta ? <p className="mt-2 text-xs leading-5 text-white/52">{meta}</p> : null}
          </div>
          <V3StatusChip tone={status.tone}>{status.label}</V3StatusChip>
        </div>

        <div className="mt-4">
          <V3ActionCard
            title="Open edition"
            description="Participants, songs, schedule, stories and official result availability"
            tone="neutral"
            to={edition.href}
          />
        </div>

        {edition.nextEvent ? (
          <div className="mt-3">
            <V3ActionCard
              title={edition.nextEvent.title}
              description={edition.nextEvent.startsAt ?? "Time to be announced"}
              tone="neutral"
              to={edition.nextEvent.href}
            />
          </div>
        ) : null}
      </div>
    </V3Surface>
  );
}

function ArchiveEditionCard({ edition }: { edition: V3ExploreEditionCard }) {
  const meta = editionMeta(edition);
  const resultLabel = edition.resultsAvailable ? "Official results available" : "Explore edition";

  return (
    <V3ActionCard
      title={edition.name}
      description={[meta, resultLabel].filter(Boolean).join(" · ")}
      tone="neutral"
      to={edition.href}
    />
  );
}

/**
 * Presentation-only Explore composition.
 *
 * The caller owns the canonical data source and the existing global Search
 * interaction. This screen only renders V3 Explore projections and therefore
 * cannot become a second data, Search or Results authority.
 */
export function V3ExploreScreen({ projection, onOpenSearch }: V3ExploreScreenProps) {
  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Explore Solaris"
        title="Discover the contest"
        description="Browse editions, delegations, songs, shows and stories. Rankings and score analysis stay in Results."
        editorial
      />

      <V3Section title="Search" meta="Global Solaris search">
        <V3ActionCard
          title="Search Solaris"
          description="Find public editions, countries, entries, shows and stories"
          icon={Search}
          tone="neutral"
          onClick={onOpenSearch}
        />
      </V3Section>

      <V3Section title="Current edition">
        {projection.currentEdition ? (
          <CurrentEditionCard edition={projection.currentEdition} />
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">No public current edition</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Explore remains available through the public archive and discovery collections.
            </p>
          </V3Surface>
        )}
      </V3Section>

      <V3Section title="Discover" meta={`${projection.discover.length} collections`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {projection.discover.map((collection) => (
            <V3ActionCard
              key={collection.key}
              title={collection.label}
              description={`${COLLECTION_DESCRIPTIONS[collection.key]} · ${itemCountLabel(collection.publicItemCount)}`}
              icon={Compass}
              tone="neutral"
              to={collection.href}
            />
          ))}
        </div>
      </V3Section>

      <V3Section
        title="Archive"
        meta={projection.archive.editions.length ? `${projection.archive.editions.length} editions` : undefined}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {projection.archive.links.map((link) => (
            <V3ActionCard
              key={link.key}
              title={link.label}
              description={
                link.key === "editions"
                  ? "Browse the Solaris edition archive"
                  : `Open the Solaris ${link.label.toLowerCase()}`
              }
              icon={Archive}
              tone="neutral"
              to={link.href}
            />
          ))}
        </div>

        {projection.archive.editions.length ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {projection.archive.editions.slice(0, 4).map((edition) => (
              <ArchiveEditionCard key={edition.id} edition={edition} />
            ))}
          </div>
        ) : null}
      </V3Section>

      {projection.more.length ? (
        <V3Section title="More">
          <div className="grid gap-3 sm:grid-cols-2">
            {projection.more.map((link) => (
              <V3ActionCard
                key={link.key}
                title={link.label}
                description="Open an additional Solaris discovery experience"
                icon={Sparkles}
                tone="neutral"
                to={link.href}
              />
            ))}
          </div>
        </V3Section>
      ) : null}
    </V3Screen>
  );
}
