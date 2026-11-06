import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Globe2 } from "lucide-react";

import { fetchWorldPublicEnabled } from "@/lib/terra-world-public";
import { worldPublicQueryVerified } from "@/lib/terra-world-unified-search";
import { V3ActionCard, V3Section } from "@/components/v3/V3Foundation";

/**
 * Legacy/web Explore entrance. A failed, pending, or disabled server decision
 * never advertises a World surface which may not yet be migrated.
 * This shares the boolean rollout cache with the actual World route gate.
 */
export function WorldExploreEntry() {
  const rollout = useQuery({
    queryKey: ["world", "public", "rollout"],
    queryFn: fetchWorldPublicEnabled,
    staleTime: 45_000,
    refetchOnMount: "always",
    retry: false,
  });

  // A cached yes can no longer advertise a public section after its
  // authoritative rollout recheck fails or is still running.
  if (!worldPublicQueryVerified(rollout) || rollout.data !== true) return null;

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

/** Pure V3 presentation, deliberately safe for the static TerraOS preview. */
export function WorldV3ExploreEntry({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
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
