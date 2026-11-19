import { Link } from "@tanstack/react-router";
import { usePublicLaunchAvailability } from "@/lib/public-launch-context";
import {
  ArrowRight, Archive, BookOpen, CalendarDays, Compass, Flag, Gamepad2,
  LayoutGrid, Music2, Newspaper, RadioTower, ScrollText, Search, Sparkles, Trophy,
  type LucideIcon,
} from "lucide-react";

import { V3ExploreEditorialLink } from "./V3ExploreEditorialLink";
import { WorldV3ExploreEntry } from "@/components/world/WorldExploreEntry";
import "@/styles/v3-explore-editorial.css";

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
  showWorld?: boolean;
};

const COLLECTION_DESCRIPTIONS: Record<V3ExploreCollection["key"], string> = {
  countries: "Delegations, current entries and participation histories",
  "songs-and-artists": "Published song and artist labels in their Entry and Edition context",
  shows: "Shows, running orders and public show context",
  stories: "Editorial stories and important Solaris moments",
};

const DISCOVERY_ICONS: Record<V3ExploreCollection["key"], LucideIcon> = {
  countries: Flag,
  "songs-and-artists": Music2,
  shows: RadioTower,
  stories: Newspaper,
};

const DESTINATION_ICONS: Record<string, LucideIcon> = {
  editions: CalendarDays,
  reference: BookOpen,
  rules: ScrollText,
  results: Trophy,
  live: RadioTower,
  "archive-games": Gamepad2,
  "advanced-discovery": LayoutGrid,
  predictions: Sparkles,
};

const MORE_DESCRIPTIONS: Record<string, string> = {
  live: "Follow the current public show in Live Mode",
  results: "Open official Results, records and deeper result tools",
  rules: "Official rules, guidance, interpretations and rule history",
  "archive-games": "Play public experiences built from Solaris archive history",
  "advanced-discovery": "Browse the site directory and specialist public discovery tools",
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
  const { allows } = usePublicLaunchAvailability();

  return (
    <article className="v3-explore-feature" data-has-artwork={edition.artworkUrl ? "true" : "false"}>
      <div className="v3-explore-feature__visual">
        <div className="v3-explore-feature__media" aria-hidden="true">
          {edition.artworkUrl ? (
            <img src={edition.artworkUrl} alt="" decoding="async" loading="eager" fetchPriority="high" />
          ) : (
            <span className="v3-explore-feature__fallback" />
          )}
        </div>
        <div className="v3-explore-feature__fade" aria-hidden="true" />
        <div className="v3-explore-feature__content">
          <div className="v3-explore-feature__eyebrow">
            <span>Current edition</span>
            <V3StatusChip tone={status.tone}>{status.label}</V3StatusChip>
          </div>
          <h2>{edition.name}</h2>
          {meta ? <p className="v3-explore-feature__meta">{meta}</p> : null}
          {allows(edition.href) ? (
            <Link to={edition.href as any} className="v3-explore-feature__primary">
              Discover edition <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>

      {edition.experience === "live" && edition.liveHref ? (
        <div className="v3-explore-feature__related" data-v3-explore-live-action="">
          <V3ActionCard
            title="Open Live Mode"
            description="Follow the current public show as it happens"
            tone="urgent"
            to={edition.liveHref}
          />
        </div>
      ) : null}

      {edition.nextEvent ? (
        <div className="v3-explore-feature__related">
          <V3ActionCard
            title={edition.nextEvent.title}
            description={edition.nextEvent.startsAt ?? "Time to be announced"}
            tone="neutral"
            to={edition.nextEvent.href}
          />
        </div>
      ) : null}
    </article>
  );
}

function ArchiveEditionCard({ edition }: { edition: V3ExploreEditionCard }) {
  const meta = editionMeta(edition);
  return (
    <V3ExploreEditorialLink
      href={edition.href}
      title={edition.name}
      description={[meta, edition.resultsAvailable ? "Official results available" : "Explore edition"].filter(Boolean).join(" · ")}
      icon={Archive}
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
export function V3ExploreScreen({ projection, onOpenSearch, showWorld = false }: V3ExploreScreenProps) {
  return (
    <V3Screen>
      <div className="v3-explore-editorial">
      <V3ScreenHeader
        kicker="Explore Solaris"
        title="Discover the contest"
        description="Browse editions, delegations, published entries, shows and stories. Rankings and score analysis stay in Results."
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
        <div className="v3-explore-editorial-list">
          {projection.discover.map((collection) => (
            <V3ExploreEditorialLink
              key={collection.key}
              title={collection.label}
              description={COLLECTION_DESCRIPTIONS[collection.key]}
              icon={DISCOVERY_ICONS[collection.key]}
              meta={itemCountLabel(collection.publicItemCount)}
              href={collection.href}
            />
          ))}
        </div>
      </V3Section>

      <WorldV3ExploreEntry enabled={showWorld} />

      <V3Section
        title="Archive"
        meta={projection.archive.editions.length ? `${projection.archive.editions.length} editions` : undefined}
      >
        <div className="v3-explore-editorial-list">
          {projection.archive.links.map((link) => (
            <V3ExploreEditorialLink
              key={link.key}
              title={link.label}
              description={
                link.key === "editions"
                  ? "Browse the Solaris edition archive"
                  : `Open the Solaris ${link.label.toLowerCase()}`
              }
              icon={DESTINATION_ICONS[link.key] ?? BookOpen}
              href={link.href}
            />
          ))}
        </div>

        {projection.archive.editions.length ? (
          <div className="v3-explore-editorial-list mt-5">
            {projection.archive.editions.slice(0, 4).map((edition) => (
              <ArchiveEditionCard key={edition.id} edition={edition} />
            ))}
          </div>
        ) : null}
      </V3Section>

      {projection.more.length ? (
        <V3Section title="More Solaris">
          <div className="v3-explore-editorial-list">
            {projection.more.map((link) => (
              <V3ExploreEditorialLink
                key={link.key}
                title={link.label}
                description={
                  MORE_DESCRIPTIONS[link.key] ?? "Open an additional Solaris discovery experience"
                }
                icon={DESTINATION_ICONS[link.key] ?? Compass}
                href={link.href}
              />
            ))}
          </div>
        </V3Section>
      ) : null}
      </div>
    </V3Screen>
  );
}
