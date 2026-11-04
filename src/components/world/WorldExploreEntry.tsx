import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Globe2 } from "lucide-react";

import { fetchWorldPublicEnabled } from "@/lib/terra-world-public";
import { V3ActionCard, V3Section } from "@/components/v3/V3Foundation";

/**
 * The single, rollout-aware Explore entrance to Terra Solaris.
 * No public World queries run merely because Explore is opened; we only ask
 * the existing boolean flag RPC and reuse the same cache as WorldPublicGate.
 */
export function WorldExploreEntry({ variant }: { variant: "legacy" | "v3" }) {
  const rollout = useQuery({
    queryKey: ["world", "public", "rollout"],
    queryFn: fetchWorldPublicEnabled,
    staleTime: 60_000,
    retry: false,
  });

  // An unknown, disabled or failing rollout must never promise a live feature.
  if (rollout.data !== true) return null;

  if (variant === "v3") {
    return (
      <V3Section title="Terra Solaris" meta="Beyond the contest">
        <V3ActionCard
          title="Explore the world"
          description="GUARD, UNITY, international organizations and the countries of Terra Solaris"
          icon={Globe2}
          tone="neutral"
          to="/world"
        />
      </V3Section>
    );
  }

  return (
    <section className="public-hub-section" aria-labelledby="explore-world-heading">
      <div className="public-hub-section-heading">
        <p className="public-hub-eyebrow">Beyond the contest</p>
        <h2 id="explore-world-heading">Terra Solaris</h2>
      </div>
      <Link
        to="/world"
        className="group flex min-h-16 items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Globe2 className="size-6 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Explore the world</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Discover GUARD, UNITY, countries and international organizations
          </span>
        </span>
        <span aria-hidden="true" className="text-muted-foreground group-hover:text-foreground">›</span>
      </Link>
    </section>
  );
}
