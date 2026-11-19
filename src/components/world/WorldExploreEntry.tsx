import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Globe2, ChevronRight } from "lucide-react";

import { usePublicLaunchAvailability } from "@/lib/public-launch-context";
import { fetchWorldPublicEnabled } from "@/lib/terra-world-public";
import { V3ExploreEditorialLink } from "@/components/v3/V3ExploreEditorialLink";
import { V3Section } from "@/components/v3/V3Foundation";

/**
 * Ordinary-web discovery entrance. Require BOTH the centrally available public
 * path and a fresh, successful World rollout query. No world entity data is read.
 */
export function WorldExploreEntry() {
  const { allowsReleased } = usePublicLaunchAvailability();
  const routeAllowed = allowsReleased("/world");
  const rollout = useQuery({
    queryKey: ["world", "public", "rollout"],
    queryFn: fetchWorldPublicEnabled,
    enabled: routeAllowed,
    staleTime: 45_000,
    refetchOnMount: "always",
    retry: false,
  });

  if (
    !routeAllowed || !rollout.isSuccess || rollout.isFetching ||
    rollout.isRefetchError || rollout.data !== true
  ) return null;

  return (
    <section className="public-hub-section" aria-labelledby="explore-world-heading">
      <div className="public-hub-section-heading">
        <p className="public-hub-eyebrow">Beyond the contest</p>
        <h2 id="explore-world-heading">Terra Solaris World</h2>
      </div>
      <Link
        to="/world"
        className="group flex min-h-20 items-center gap-4 border-y border-border/70 py-4 text-foreground"
      >
        <Globe2 className="size-6 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Explore Terra Solaris</span>
          <span className="mt-1 block text-sm leading-5 text-muted-foreground">
            GUARD, UNITY, international institutions and country history
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </section>
  );
}

/** Installed V3 is presentation-only: the parent route owns rollout evidence. */
export function WorldV3ExploreEntry({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <V3Section title="Terra Solaris World" meta="Beyond the contest">
      <div className="v3-explore-editorial-list">
        <V3ExploreEditorialLink
          href="/world"
          title="Explore the world"
          description="GUARD, UNITY, international institutions and country history"
          icon={Globe2}
        />
      </div>
    </V3Section>
  );
}
