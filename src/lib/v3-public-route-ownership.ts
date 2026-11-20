/**
 * Explicit legacy Public detail routes that are owned by an existing V3
 * capability. These are not new capabilities or canonical destinations.
 *
 * Keep this list narrow: broad prefixes can conceal genuinely new orphan
 * routes from S15 and the fast capability-registry guard.
 */
export type V3PublicRouteOwnership = {
  routePattern: string;
  ownerId: string;
  rationale: string;
};

export const V3_PUBLIC_ROUTE_OWNERSHIP = [
  {
    routePattern: "/broadcast/:showId",
    ownerId: "live-show",
    rationale: "Legacy per-show broadcast/replay is a Live experience detail, not an independent Public capability.",
  },
] as const satisfies readonly V3PublicRouteOwnership[];
