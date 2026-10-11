import { Search } from "lucide-react";

import {
  V3ActionCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

export type V3ExploreEdition = {
  title: string;
  subtitle: string;
  status: string;
  to?: string;
};

export type V3ExploreItem = {
  id: string;
  title: string;
  description: string;
  to?: string;
};

export type V3ExploreScreenProps = {
  currentEdition?: V3ExploreEdition | null;
  discover?: readonly V3ExploreItem[];
  stories?: readonly V3ExploreItem[];
  archive?: readonly V3ExploreItem[];
};

/**
 * Explore is the entity/story world of Solaris. Results analysis intentionally
 * lives elsewhere so users do not have to guess whether an outcome belongs in
 * Explore or Results.
 */
export function V3ExploreScreen({
  currentEdition,
  discover = [],
  stories = [],
  archive = [],
}: V3ExploreScreenProps) {
  return (
    <V3Screen>
      <V3ScreenHeader
        title="Explore Solaris"
        description="Discover the current edition, countries, songs, shows, stories and the archive."
        editorial
      />

      <V3Section title="Search">
        <V3ActionCard
          title="Search Solaris"
          description="Countries, editions, artists, songs, shows, stories and rules"
          icon={Search}
          tone="neutral"
          to="/search"
        />
      </V3Section>

      <V3Section
        title="Current edition"
        meta={currentEdition ? <V3StatusChip tone="progress">{currentEdition.status}</V3StatusChip> : undefined}
      >
        {currentEdition ? (
          <V3ActionCard
            title={currentEdition.title}
            description={currentEdition.subtitle}
            tone="neutral"
            to={currentEdition.to}
          />
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">No public edition right now</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              The archive remains available while the next Solaris edition is prepared.
            </p>
          </V3Surface>
        )}
      </V3Section>

      <V3Section title="Discover">
        <div className="v3-preview-grid">
          {discover.slice(0, 6).map((item) => (
            <V3ActionCard
              key={item.id}
              title={item.title}
              description={item.description}
              tone="neutral"
              to={item.to}
            />
          ))}
        </div>
      </V3Section>

      {stories.length ? (
        <V3Section title="Stories" meta="Editorial">
          <div className="v3-preview-grid">
            {stories.slice(0, 4).map((item) => (
              <V3ActionCard
                key={item.id}
                title={item.title}
                description={item.description}
                tone="neutral"
                to={item.to}
              />
            ))}
          </div>
        </V3Section>
      ) : null}

      <V3Section title="Archive">
        {archive.length ? (
          <div className="v3-preview-grid">
            {archive.slice(0, 6).map((item) => (
              <V3ActionCard
                key={item.id}
                title={item.title}
                description={item.description}
                tone="neutral"
                to={item.to}
              />
            ))}
          </div>
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">Archive</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Editions, countries, shows, Wiki and encyclopedia content belong here.
            </p>
          </V3Surface>
        )}
      </V3Section>
    </V3Screen>
  );
}
