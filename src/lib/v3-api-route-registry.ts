export type V3ApiExposure = "public-read" | "authenticated" | "organizer" | "internal";

export type V3ApiRouteOwner = {
  routePattern: string;
  methods: readonly ("GET" | "POST" | "PUT" | "PATCH" | "DELETE")[];
  ownerDomain: string;
  exposure: V3ApiExposure;
  purpose: string;
  securityBoundary: string;
};

/**
 * Canonical ownership for TanStack server API routes under src/routes/api.
 * API routes are consequential capability surfaces even when they have no
 * navigation entry, so the V3 registry guard requires every route here.
 */
export const V3_API_ROUTE_REGISTRY = [
  {
    routePattern: "/api/flag",
    methods: ["GET"],
    ownerDomain: "country-profile",
    exposure: "public-read",
    purpose: "Compatibility proxy for canonical country flag assets still hosted on the legacy Lovable asset origin.",
    securityBoundary:
      "Read-only proxy; accepts only the fixed /__l5e/assets-v1/ upstream path prefix and never forwards arbitrary origins.",
  },
] as const satisfies readonly V3ApiRouteOwner[];
