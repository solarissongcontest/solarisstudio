import { Link } from "@tanstack/react-router";
import { ChevronLeft, MoreHorizontal } from "lucide-react";

import { PublicCommandPalette } from "@/components/public/PublicCommandPalette";
import { SheetTrigger } from "@/components/ui/sheet";
import type { AccountAccess } from "@/lib/country-account";
import { publicAreaForPath, publicDestinationForPath } from "@/lib/public-navigation";

type ToolbarContext = {
  title: string;
  parent?: { label: string; to: string };
};

function contextForPath(pathname: string): ToolbarContext {
  const entity = pathname.match(/^\/(countries|editions|shows|wiki)\/[^/]+/);
  if (entity) {
    const section = entity[1]!;
    return {
      title:
        section === "countries"
          ? "Country"
          : section === "editions"
            ? "Edition"
            : section === "shows"
              ? "Show"
              : "Wiki",
      parent: {
        label:
          section === "countries"
            ? "Countries"
            : section === "editions"
              ? "Editions"
              : section === "shows"
                ? "Shows"
                : "Wiki",
        to: `/${section}`,
      },
    };
  }

  if (pathname.startsWith("/my-solaris/")) {
    return { title: "MySolaris", parent: { label: "Me", to: "/my-solaris" } };
  }

  if (/^\/(confirmations|jury-voting|televoting|next-in-line)(\/|$)/.test(pathname)) {
    return { title: "Participate", parent: { label: "Participate", to: "/participate" } };
  }

  const destination = publicDestinationForPath(pathname);
  if (destination) {
    if (destination.to === "/") return { title: "Solaris Studio" };
    return { title: destination.label };
  }

  const area = publicAreaForPath(pathname);
  return {
    title:
      area === "home"
        ? "Solaris Studio"
        : area === "me"
          ? "Me"
          : area === "help"
            ? "More"
            : area.charAt(0).toUpperCase() + area.slice(1),
  };
}

export function AppToolbar({
  pathname,
  access,
}: {
  pathname: string;
  access: AccountAccess;
}) {
  const context = contextForPath(pathname);
  const rootDestination =
    pathname === "/" ||
    pathname === "/explore" ||
    pathname === "/explore/" ||
    pathname === "/participate" ||
    pathname === "/participate/" ||
    pathname === "/results" ||
    pathname === "/results/" ||
    pathname === "/me" ||
    pathname === "/me/";

  return (
    <header className="solaris-app-toolbar">
      <div className="solaris-app-toolbar-inner">
        <div className="min-w-0 flex-1">
          {context.parent ? (
            <Link
              to={context.parent.to as any}
              className="solaris-app-back"
              aria-label={`Back to ${context.parent.label}`}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
              <span>{context.parent.label}</span>
            </Link>
          ) : rootDestination ? (
            <h1 className="solaris-app-toolbar-title">{context.title}</h1>
          ) : (
            <span className="solaris-app-toolbar-title">{context.title}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <PublicCommandPalette compact access={access} />
          <SheetTrigger asChild>
            <button type="button" className="solaris-app-toolbar-button" aria-label="More">
              <MoreHorizontal className="size-5" aria-hidden="true" />
            </button>
          </SheetTrigger>
        </div>
      </div>
    </header>
  );
}
