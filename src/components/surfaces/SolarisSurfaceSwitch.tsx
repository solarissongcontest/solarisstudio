import { Link } from "@tanstack/react-router";
import { Activity, Eye, Settings2, UserRound } from "lucide-react";

import {
  resolveSolarisV6SurfacePath,
  type SolarisV6Perspective,
} from "@/lib/solaris-v6-surface-registry";
import { cn } from "@/lib/utils";

export type SolarisSurfaceSwitchLink = {
  perspective: SolarisV6Perspective;
  label: string;
  href: string;
  current?: boolean;
};

const ICONS = {
  public: Eye,
  participant: UserRound,
  organizer: Settings2,
  moderation: Settings2,
  diagnostic: Activity,
} as const;

export function SolarisSurfaceSwitch({
  links,
  className,
  label = "Feature perspectives",
}: {
  links: readonly SolarisSurfaceSwitchLink[];
  className?: string;
  label?: string;
}) {
  if (!links.length) return null;

  return (
    <nav
      aria-label={label}
      data-solaris-surface-switch=""
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/65 bg-surface/45 p-1.5",
        className,
      )}
    >
      {links.map((link) => {
        const Icon = ICONS[link.perspective];
        return (
          <Link
            key={`${link.perspective}:${link.href}`}
            to={link.href as any}
            aria-current={link.current ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold",
              "transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
              "motion-reduce:active:scale-100",
              link.current
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface-strong hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function countrySurfaceLinks({
  countryId,
  countryCode,
  current,
  includeOrganizer = true,
  includeDiagnostics = false,
}: {
  countryId: string;
  countryCode: string;
  current: "public" | "participant" | "organizer";
  includeOrganizer?: boolean;
  includeDiagnostics?: boolean;
}): SolarisSurfaceSwitchLink[] {
  const publicPath = resolveSolarisV6SurfacePath("country-profile", "public", {
    country: countryCode,
  });
  const participantBase = resolveSolarisV6SurfacePath(
    "participant-view",
    "participant",
  );
  const organizerPath = resolveSolarisV6SurfacePath(
    "participant-view",
    "organizer",
    { countryId },
  );
  const diagnosticPath = resolveSolarisV6SurfacePath(
    "participant-view",
    "diagnostic",
  );

  const links: SolarisSurfaceSwitchLink[] = [];
  if (participantBase) {
    links.push({
      perspective: "participant",
      label: "Participant view",
      href: `${participantBase}/tasks?country=${encodeURIComponent(countryId)}`,
      current: current === "participant",
    });
  }
  if (publicPath) {
    links.push({
      perspective: "public",
      label: "Public page",
      href: publicPath,
      current: current === "public",
    });
  }
  if (includeOrganizer && organizerPath) {
    links.push({
      perspective: "organizer",
      label: "Manage",
      href: organizerPath,
      current: current === "organizer",
    });
  }
  if (includeDiagnostics && diagnosticPath) {
    links.push({
      perspective: "diagnostic",
      label: "Diagnostics",
      href: diagnosticPath,
    });
  }
  return links;
}
