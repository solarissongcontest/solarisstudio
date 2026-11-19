import { Link } from "@tanstack/react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { usePublicLaunchAvailability } from "@/lib/public-launch-context";

/**
 * Quiet, readable Explore row for verified public destinations.
 * The link is only an affordance: canonical route permissions remain authoritative.
 */
export function V3ExploreEditorialLink({
  href,
  title,
  description,
  meta,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  meta?: string;
  icon: LucideIcon;
}) {
  const { allows } = usePublicLaunchAvailability();
  if (!allows(href)) return null;
  return (
    <Link to={href as any} className="v3-explore-editorial-link">
      <span className="v3-explore-editorial-link__icon" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <span className="v3-explore-editorial-link__copy">
        <span className="v3-explore-editorial-link__title">{title}</span>
        <span className="v3-explore-editorial-link__description">{description}</span>
      </span>
      {meta ? <span className="v3-explore-editorial-link__meta">{meta}</span> : null}
      <ChevronRight className="v3-explore-editorial-link__chevron size-4" aria-hidden="true" />
    </Link>
  );
}
