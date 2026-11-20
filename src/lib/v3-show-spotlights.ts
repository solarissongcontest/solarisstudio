import type { ShowDiscovery, ShowDiscoveryItem } from "./v3-discovery-entities";

export type ShowSpotlight = {
  id: string;
  eyebrow: string;
  title: string;
  emphasis: "normal" | "live";
  items: ShowDiscoveryItem[];
};

/**
 * Curate the Shows page without duplicating an event across spotlight sections.
 *
 * The full, filterable archive is separate and remains unchanged. All inputs
 * are already publication-filtered by buildShowDiscovery; no new visibility
 * or release authority is introduced here.
 */
export function buildShowSpotlights(
  discovery: ShowDiscovery,
  currentEditionLabel: string,
  mode: "curated-web" | "legacy-app" = "curated-web",
): ShowSpotlight[] {
  const seen = new Set<string>();
  const sources: Array<ShowSpotlight & { limit: number }> = [
    {
      id: "shows-live-now",
      eyebrow: "Live now",
      title: "On air",
      items: discovery.liveNow,
      limit: Number.POSITIVE_INFINITY,
      emphasis: "live",
    },
    {
      id: "shows-up-next",
      eyebrow: "Up next",
      title: "Coming shows",
      items: discovery.upNext,
      limit: 4,
      emphasis: "normal",
    },
    {
      id: "shows-recent",
      eyebrow: "Recent",
      title: "Latest completed",
      items: discovery.recent,
      limit: 4,
      emphasis: "normal",
    },
    {
      id: "shows-current-edition",
      eyebrow: "Current edition",
      title: currentEditionLabel,
      items: discovery.currentEdition ? discovery.currentEditionShows : [],
      limit: 4,
      emphasis: "normal",
    },
  ];

  if (mode === "legacy-app") {
    return sources.flatMap(({ limit, ...source }) => {
      const items = source.id === "shows-up-next" ? source.items.slice(0, 4) : source.items;
      return items.length ? [{ ...source, items }] : [];
    });
  }

  return sources.flatMap(({ limit, ...source }) => {
    const items: ShowDiscoveryItem[] = [];
    for (const item of source.items) {
      if (seen.has(item.show.id)) continue;
      items.push(item);
      seen.add(item.show.id);
      if (items.length >= limit) break;
    }
    return items.length ? [{ ...source, items }] : [];
  });
}
