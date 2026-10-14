export type V3ApiCapability = {
  route: string;
  methods: readonly ("GET" | "POST" | "PUT" | "PATCH" | "DELETE")[];
  ownerDomain: string;
  audience: "public" | "authenticated" | "organizer" | "internal";
  mutation: boolean;
  requiredCapability: string | null;
  riskTier: 0 | 1 | 2 | 3 | 4;
  purpose: string;
  source: string;
};

/**
 * TanStack server/API route ownership.
 *
 * This is deliberately separate from domain RPC/command ownership. S1 uses it
 * to guarantee that adding a new /api route cannot create an unclassified
 * network surface. Consequential domain commands remain governed by the System
 * command registry introduced in S2.
 */
export const V3_API_CAPABILITY_REGISTRY = [
  {
    route: "/api/flag",
    methods: ["GET"],
    ownerDomain: "public-ux",
    audience: "public",
    mutation: false,
    requiredCapability: null,
    riskTier: 0,
    purpose: "Allowlisted cached proxy for canonical Solaris flag image assets.",
    source: "src/routes/api/flag.ts",
  },
] as const satisfies readonly V3ApiCapability[];
