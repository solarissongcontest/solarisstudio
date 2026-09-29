import { Link } from "@tanstack/react-router";
import {
  CircleHelp,
  FolderSearch2,
  LogOut,
  Scale,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { SheetClose } from "@/components/ui/sheet";
import type { AccountAccess } from "@/lib/country-account";
import {
  publicAreaForPath,
  publicDestinationsForArea,
  type PublicArea,
} from "@/lib/public-navigation";

const LINKS = [
  { to: "/site-directory", label: "All Solaris pages", icon: FolderSearch2 },
  { to: "/guide", label: "Help", icon: CircleHelp },
  { to: "/rules", label: "Rules", icon: Scale },
  { to: "/integrity", label: "Trust & Integrity", icon: ShieldCheck },
] as const;

function contextualDestinations(pathname: string) {
  const area = publicAreaForPath(pathname);
  if (!new Set<PublicArea>(["explore", "participate", "results"]).has(area)) return [];

  return publicDestinationsForArea(area)
    .filter((item) => item.to !== `/${area}`)
    .filter((item) => item.visibility === "primary" || item.visibility === "secondary")
    .slice(0, 7);
}

function areaLabel(pathname: string) {
  const area = publicAreaForPath(pathname);
  return area === "explore"
    ? "Explore"
    : area === "participate"
      ? "Participate"
      : area === "results"
        ? "Results"
        : null;
}

export function AppMoreNavigation({
  pathname,
  signedIn,
  access,
  onSignOut,
}: {
  pathname: string;
  signedIn: boolean;
  access: AccountAccess;
  onSignOut: () => void;
}) {
  const section = contextualDestinations(pathname);
  const sectionLabel = areaLabel(pathname);

  return (
    <div className="solaris-app-more">
      <div>
        <p className="solaris-app-more-eyebrow">Solaris Studio</p>
        <h2 className="text-xl font-semibold">More</h2>
      </div>

      {sectionLabel && section.length ? (
        <section className="mt-5" aria-labelledby="solaris-app-section-links">
          <p
            id="solaris-app-section-links"
            className="mb-2 px-1 text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground"
          >
            In {sectionLabel}
          </p>
          <nav className="grid gap-1.5" aria-label={`${sectionLabel} destinations`}>
            {section.map((item) => (
              <SheetClose asChild key={item.id}>
                <Link to={item.to as any} className="solaris-app-more-link">
                  <span className="min-w-0">
                    <span className="block truncate">{item.label}</span>
                    <span className="mt-0.5 block line-clamp-1 text-[11px] font-normal text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </Link>
              </SheetClose>
            ))}
          </nav>
        </section>
      ) : null}

      <nav
        className="mt-5 grid gap-2 border-t border-border/70 pt-4"
        aria-label="More Solaris Studio destinations"
      >
        {LINKS.map(({ to, label, icon: Icon }) => (
          <SheetClose asChild key={to}>
            <Link to={to as any} className="solaris-app-more-link">
              <Icon className="size-4" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          </SheetClose>
        ))}

        {access.isOrganizer ? (
          <SheetClose asChild>
            <Link to="/admin" className="solaris-app-more-link">
              <UserRound className="size-4" aria-hidden="true" />
              <span>Organizer</span>
            </Link>
          </SheetClose>
        ) : null}
      </nav>

      <div className="mt-5 border-t border-border/70 pt-4">
        {signedIn ? (
          <button type="button" onClick={onSignOut} className="solaris-app-more-link w-full">
            <LogOut className="size-4" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        ) : (
          <SheetClose asChild>
            <Link to="/auth" className="solaris-app-more-primary">
              Sign in to Solaris
            </Link>
          </SheetClose>
        )}
      </div>
    </div>
  );
}
